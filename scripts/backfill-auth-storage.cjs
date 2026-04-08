const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { Redis } = require('@upstash/redis');

const AUTH_KEY_PREFIX = 'luna:auth:v1';

function loadEnvFile(envPath) {
  const env = {};

  if (!fs.existsSync(envPath)) {
    return env;
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function getConfig() {
  const repoRoot = path.join(__dirname, '..');
  const env = {
    ...loadEnvFile(path.join(repoRoot, '.env.local')),
    ...process.env,
  };

  const redisUrl = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL || env.KV_REST_URL;
  const redisToken = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  const dbPath = path.normalize((env.LUNA_DB_PATH || path.join(repoRoot, 'data', 'luna.db')).replace(/\\\\/g, '\\'));

  if (!redisUrl || !redisToken) {
    throw new Error('Missing KV_REST_API_URL/KV_REST_API_TOKEN for Upstash auth storage backfill.');
  }

  return {
    dbPath,
    redisUrl,
    redisToken,
  };
}

function authUserKey(userId) {
  return `${AUTH_KEY_PREFIX}:user:id:${userId}`;
}

function authUserByUsernameKey(username) {
  return `${AUTH_KEY_PREFIX}:user:username:${username.trim().toLowerCase()}`;
}

function authUserByPhoneKey(phoneNumber) {
  return `${AUTH_KEY_PREFIX}:user:phone:${phoneNumber.trim()}`;
}

function readLocalUsers(db) {
  return db.prepare(
    `
    SELECT
      u.id,
      u.username,
      u.phone_number,
      u.password_hash,
      u.password_salt,
      u.created_at,
      o.birth_date,
      o.birth_hour,
      o.birth_minute,
      o.birth_time_text,
      o.birth_place_id,
      o.birth_place_full_text,
      o.birth_place_main_text,
      o.birth_place_secondary_text,
      o.birth_latitude,
      o.birth_longitude,
      o.birth_timezone
    FROM users u
    LEFT JOIN onboarding_profiles o ON o.user_id = u.id
    ORDER BY u.created_at ASC
    `,
  ).all();
}

function mapStoredAccount(row) {
  const hasBirthTime = row.birth_date || row.birth_hour !== null || row.birth_minute !== null || row.birth_time_text;
  const hasBirthPlace =
    row.birth_place_id ||
    row.birth_place_full_text ||
    row.birth_place_main_text ||
    row.birth_place_secondary_text ||
    row.birth_latitude !== null ||
    row.birth_longitude !== null ||
    row.birth_timezone;

  return {
    id: row.id,
    username: row.username,
    phoneNumber: row.phone_number,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    createdAt: row.created_at,
    onboardingProfile: hasBirthTime || hasBirthPlace
      ? {
          birthTime: hasBirthTime
            ? {
                birthDate: row.birth_date,
                hour: row.birth_hour,
                minute: row.birth_minute,
                formatted: row.birth_time_text,
              }
            : null,
          birthPlace: hasBirthPlace
            ? {
                placeId: row.birth_place_id,
                fullText: row.birth_place_full_text,
                mainText: row.birth_place_main_text,
                secondaryText: row.birth_place_secondary_text,
                latitude: row.birth_latitude,
                longitude: row.birth_longitude,
                timezone: row.birth_timezone,
              }
            : null,
        }
      : null,
  };
}

async function main() {
  const { dbPath, redisUrl, redisToken } = getConfig();
  const db = new Database(dbPath, { readonly: true });
  const redis = new Redis({ url: redisUrl, token: redisToken });
  const localUsers = readLocalUsers(db);

  const stats = {
    localUsers: localUsers.length,
    created: 0,
    skippedExisting: 0,
    skippedConflicts: 0,
    conflicts: [],
  };

  for (const row of localUsers) {
    const storedAccount = mapStoredAccount(row);
    const [existingUser, usernameOwner, phoneOwner] = await Promise.all([
      redis.get(authUserKey(storedAccount.id)),
      redis.get(authUserByUsernameKey(storedAccount.username)),
      redis.get(authUserByPhoneKey(storedAccount.phoneNumber)),
    ]);

    if (existingUser || usernameOwner === storedAccount.id || phoneOwner === storedAccount.id) {
      stats.skippedExisting += 1;
      continue;
    }

    if ((usernameOwner && usernameOwner !== storedAccount.id) || (phoneOwner && phoneOwner !== storedAccount.id)) {
      stats.skippedConflicts += 1;
      stats.conflicts.push({
        username: storedAccount.username,
        phoneNumber: storedAccount.phoneNumber,
        usernameOwner: usernameOwner || null,
        phoneOwner: phoneOwner || null,
      });
      continue;
    }

    await redis.set(authUserKey(storedAccount.id), storedAccount);
    await redis.set(authUserByUsernameKey(storedAccount.username), storedAccount.id);
    await redis.set(authUserByPhoneKey(storedAccount.phoneNumber), storedAccount.id);

    stats.created += 1;
  }

  console.log(JSON.stringify(stats, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});