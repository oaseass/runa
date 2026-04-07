import crypto from "node:crypto";
import {
  authUserByPhoneKey,
  authUserByUsernameKey,
  authUserKey,
  getExternalAuthStorage,
  type StoredAuthAccount,
} from "@/lib/server/auth-storage";

type AccountDraft = {
  id: string;
  username: string;
  phoneNumber: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
};

type OnboardingProfileInput = {
  birthTime?: {
    /** YYYY-MM-DD */
    birthDate: string | null;
    /** 0-23 */
    hour: number;
    minute: number;
    formatted: string;
  } | null;
  birthPlace?: {
    placeId: string;
    fullText: string;
    mainText: string;
    secondaryText: string;
    latitude: number | null;
    longitude: number | null;
    timezone: string | null;
  } | null;
};

type PublicAccount = {
  id: string;
  username: string;
  phoneNumber: string;
  createdAt: string;
};

export class AccountStoreError extends Error {
  code: "USERNAME_EXISTS" | "PHONE_EXISTS";

  constructor(code: "USERNAME_EXISTS" | "PHONE_EXISTS") {
    super(code);
    this.code = code;
  }
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function mapUserRow(row: {
  id: string;
  username: string;
  phone_number: string;
  created_at: string;
}): PublicAccount {
  return {
    id: row.id,
    username: row.username,
    phoneNumber: row.phone_number,
    createdAt: row.created_at,
  };
}

function toPublicAccount(account: {
  id: string;
  username: string;
  phoneNumber: string;
  createdAt: string;
}): PublicAccount {
  return {
    id: account.id,
    username: account.username,
    phoneNumber: account.phoneNumber,
    createdAt: account.createdAt,
  };
}

async function getLocalDb() {
  const { db } = await import("@/lib/server/db");
  return db;
}

async function getRedisAccountById(userId: string) {
  const redis = getExternalAuthStorage();
  if (!redis) return null;
  return (await redis.get<StoredAuthAccount>(authUserKey(userId))) ?? null;
}

async function getRedisAccountByUsername(username: string) {
  const redis = getExternalAuthStorage();
  if (!redis) return null;

  const userId = await redis.get<string>(authUserByUsernameKey(username));
  if (!userId) return null;

  return getRedisAccountById(userId);
}

async function getRedisAccountByPhone(phoneNumber: string) {
  const redis = getExternalAuthStorage();
  if (!redis) return null;

  const userId = await redis.get<string>(authUserByPhoneKey(phoneNumber));
  if (!userId) return null;

  return getRedisAccountById(userId);
}

export async function createAccountDraft(input: {
  username: string;
  phoneNumber: string;
  password: string;
  onboardingProfile?: OnboardingProfileInput;
}) {
  const draftId = crypto.randomUUID();
  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = hashPassword(input.password, salt);
  const now = new Date().toISOString();
  const redis = getExternalAuthStorage();

  if (redis) {
    const usernameCreated = await redis.setnx(authUserByUsernameKey(input.username), draftId);
    if (usernameCreated !== 1) {
      throw new AccountStoreError("USERNAME_EXISTS");
    }

    const phoneCreated = await redis.setnx(authUserByPhoneKey(input.phoneNumber), draftId);
    if (phoneCreated !== 1) {
      await redis.del(authUserByUsernameKey(input.username));
      throw new AccountStoreError("PHONE_EXISTS");
    }

    const draft: StoredAuthAccount = {
      id: draftId,
      username: input.username,
      phoneNumber: input.phoneNumber,
      passwordHash,
      passwordSalt: salt,
      createdAt: now,
      onboardingProfile: input.onboardingProfile ?? null,
    };

    try {
      await redis.set(authUserKey(draftId), draft);
    } catch (error) {
      await redis.del(authUserByUsernameKey(input.username));
      await redis.del(authUserByPhoneKey(input.phoneNumber));
      throw error;
    }

    return toPublicAccount(draft);
  }

  const db = await getLocalDb();
  const existsByUsername = db
    .prepare("SELECT id FROM users WHERE lower(username) = lower(?)")
    .get(input.username) as { id: string } | undefined;

  if (existsByUsername) {
    throw new AccountStoreError("USERNAME_EXISTS");
  }

  const existsByPhone = db
    .prepare("SELECT id FROM users WHERE phone_number = ?")
    .get(input.phoneNumber) as { id: string } | undefined;

  if (existsByPhone) {
    throw new AccountStoreError("PHONE_EXISTS");
  }

  const draft: AccountDraft = {
    id: draftId,
    username: input.username,
    phoneNumber: input.phoneNumber,
    passwordHash,
    passwordSalt: salt,
    createdAt: now,
  };

  const tx = db.transaction(() => {
    db.prepare(
      `
      INSERT INTO users (id, username, phone_number, password_hash, password_salt, created_at, updated_at)
      VALUES (@id, @username, @phoneNumber, @passwordHash, @passwordSalt, @createdAt, @updatedAt)
      `,
    ).run({
      id: draft.id,
      username: draft.username,
      phoneNumber: draft.phoneNumber,
      passwordHash: draft.passwordHash,
      passwordSalt: draft.passwordSalt,
      createdAt: draft.createdAt,
      updatedAt: draft.createdAt,
    });

    const birthTime = input.onboardingProfile?.birthTime ?? null;
    const birthPlace = input.onboardingProfile?.birthPlace ?? null;

    db.prepare(
      `
      INSERT INTO onboarding_profiles (
        user_id,
        birth_date,
        birth_hour,
        birth_minute,
        birth_time_text,
        birth_place_id,
        birth_place_full_text,
        birth_place_main_text,
        birth_place_secondary_text,
        birth_latitude,
        birth_longitude,
        birth_timezone,
        updated_at
      )
      VALUES (
        @userId,
        @birthDate,
        @birthHour,
        @birthMinute,
        @birthTimeText,
        @birthPlaceId,
        @birthPlaceFullText,
        @birthPlaceMainText,
        @birthPlaceSecondaryText,
        @birthLatitude,
        @birthLongitude,
        @birthTimezone,
        @updatedAt
      )
      `,
    ).run({
      userId: draft.id,
      birthDate: birthTime?.birthDate ?? null,
      birthHour: birthTime?.hour ?? null,
      birthMinute: birthTime?.minute ?? null,
      birthTimeText: birthTime?.formatted ?? null,
      birthPlaceId: birthPlace?.placeId ?? null,
      birthPlaceFullText: birthPlace?.fullText ?? null,
      birthPlaceMainText: birthPlace?.mainText ?? null,
      birthPlaceSecondaryText: birthPlace?.secondaryText ?? null,
      birthLatitude: birthPlace?.latitude ?? null,
      birthLongitude: birthPlace?.longitude ?? null,
      birthTimezone: birthPlace?.timezone ?? null,
      updatedAt: now,
    });
  });

  tx();

  return toPublicAccount(draft);
}

export async function getAccountDraft(id: string) {
  const redisAccount = await getRedisAccountById(id);
  if (getExternalAuthStorage()) {
    return redisAccount ? toPublicAccount(redisAccount) : null;
  }

  const db = await getLocalDb();
  const row = db
    .prepare("SELECT id, username, phone_number, created_at FROM users WHERE id = ?")
    .get(id) as
    | {
        id: string;
        username: string;
        phone_number: string;
        created_at: string;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return mapUserRow(row);
}

export async function hasAccountDraftByPhoneNumber(phoneNumber: string) {
  const redisAccount = await getRedisAccountByPhone(phoneNumber);
  if (getExternalAuthStorage()) {
    return Boolean(redisAccount);
  }

  const db = await getLocalDb();
  const row = db
    .prepare("SELECT id FROM users WHERE phone_number = ?")
    .get(phoneNumber) as { id: string } | undefined;

  return Boolean(row);
}

export async function findAccountDraftByPhoneNumber(phoneNumber: string) {
  const redisAccount = await getRedisAccountByPhone(phoneNumber);
  if (getExternalAuthStorage()) {
    return redisAccount ? toPublicAccount(redisAccount) : null;
  }

  const db = await getLocalDb();
  const row = db
    .prepare("SELECT id, username, phone_number, created_at FROM users WHERE phone_number = ?")
    .get(phoneNumber) as
    | {
        id: string;
        username: string;
        phone_number: string;
        created_at: string;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return mapUserRow(row);
}

export async function findAccountDraftByUsername(username: string) {
  const redisAccount = await getRedisAccountByUsername(username);
  if (getExternalAuthStorage()) {
    return redisAccount
      ? {
        id: redisAccount.id,
        username: redisAccount.username,
        phoneNumber: redisAccount.phoneNumber,
        passwordHash: redisAccount.passwordHash,
        passwordSalt: redisAccount.passwordSalt,
        createdAt: redisAccount.createdAt,
      }
      : null;
  }

  const db = await getLocalDb();
  const row = db
    .prepare(
      "SELECT id, username, phone_number, password_hash, password_salt, created_at FROM users WHERE lower(username) = lower(?)",
    )
    .get(username) as
    | {
        id: string;
        username: string;
        phone_number: string;
        password_hash: string;
        password_salt: string;
        created_at: string;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    phoneNumber: row.phone_number,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    createdAt: row.created_at,
  };
}

export async function verifyAccountDraftPassword(username: string, password: string) {
  const account = await findAccountDraftByUsername(username);

  if (!account) {
    return null;
  }

  const computedHash = hashPassword(password, account.passwordSalt);

  if (computedHash !== account.passwordHash) {
    return null;
  }

  return {
    id: account.id,
    username: account.username,
    phoneNumber: account.phoneNumber,
    createdAt: account.createdAt,
  };
}
