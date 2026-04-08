import "server-only";
import { db } from "@/lib/server/db";
import {
  AuthStorageConfigurationError,
  authUserByPhoneKey,
  authUserByUsernameKey,
  authUserKey,
  getExternalAuthStorage,
  type StoredAuthAccount,
} from "@/lib/server/auth-storage";

type LocalAuthRow = {
  id: string;
  username: string;
  phone_number: string;
  password_hash: string;
  password_salt: string;
  created_at: string;
  birth_date: string | null;
  birth_hour: number | null;
  birth_minute: number | null;
  birth_time_text: string | null;
  birth_place_id: string | null;
  birth_place_full_text: string | null;
  birth_place_main_text: string | null;
  birth_place_secondary_text: string | null;
  birth_latitude: number | null;
  birth_longitude: number | null;
  birth_timezone: string | null;
};

type AuthSyncIssue = "conflict" | "repairable";

export type AuthSyncPreview = {
  id: string;
  username: string;
  phoneNumber: string;
  createdAt: string;
  issue: AuthSyncIssue;
  detail: string;
};

export type AuthStorageSyncStatus = {
  localUsers: number;
  externalUsers: number;
  syncedUsers: number;
  repairableUsers: number;
  conflictUsers: number;
  repairablePreview: AuthSyncPreview[];
  conflictPreview: AuthSyncPreview[];
};

export type AuthStorageBackfillReport = {
  localUsers: number;
  externalUsersBefore: number;
  syncedUsers: number;
  repairedUsers: number;
  conflictUsers: number;
  repairedPreview: AuthSyncPreview[];
  conflictPreview: AuthSyncPreview[];
};

type SyncInspection = {
  state: "synced" | "repairable" | "conflict";
  preview?: AuthSyncPreview;
};

function getRequiredAuthStorage() {
  const redis = getExternalAuthStorage();

  if (!redis) {
    throw new AuthStorageConfigurationError();
  }

  return redis;
}

function readLocalAuthRows(): LocalAuthRow[] {
  return db
    .prepare(
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
    )
    .all() as LocalAuthRow[];
}

function mapStoredAuthAccount(row: LocalAuthRow): StoredAuthAccount {
  const hasBirthTime =
    Boolean(row.birth_date) || row.birth_hour !== null || row.birth_minute !== null || Boolean(row.birth_time_text);
  const hasBirthPlace =
    Boolean(row.birth_place_id) ||
    Boolean(row.birth_place_full_text) ||
    Boolean(row.birth_place_main_text) ||
    Boolean(row.birth_place_secondary_text) ||
    row.birth_latitude !== null ||
    row.birth_longitude !== null ||
    Boolean(row.birth_timezone);

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
                hour: row.birth_hour ?? 0,
                minute: row.birth_minute ?? 0,
                formatted: row.birth_time_text ?? "",
              }
            : null,
          birthPlace: hasBirthPlace
            ? {
                placeId: row.birth_place_id ?? "",
                fullText: row.birth_place_full_text ?? "",
                mainText: row.birth_place_main_text ?? "",
                secondaryText: row.birth_place_secondary_text ?? "",
                latitude: row.birth_latitude,
                longitude: row.birth_longitude,
                timezone: row.birth_timezone,
              }
            : null,
        }
      : null,
  };
}

async function scanKeys(match: string) {
  const redis = getRequiredAuthStorage();
  const keys: string[] = [];
  let cursor = 0;

  do {
    const result = await redis.scan(cursor, { match, count: 1000 }) as [number | string, string[]] | { cursor?: number | string; keys?: string[] };
    const nextCursor = Array.isArray(result) ? Number(result[0]) : Number(result.cursor ?? 0);
    const batch = Array.isArray(result) ? result[1] : (result.keys ?? []);
    keys.push(...batch);
    cursor = nextCursor;
  } while (cursor !== 0);

  return keys;
}

async function inspectAccount(account: StoredAuthAccount): Promise<SyncInspection> {
  const redis = getRequiredAuthStorage();
  const [existingUser, usernameOwner, phoneOwner] = await Promise.all([
    redis.get<StoredAuthAccount>(authUserKey(account.id)),
    redis.get<string>(authUserByUsernameKey(account.username)),
    redis.get<string>(authUserByPhoneKey(account.phoneNumber)),
  ]);

  if ((usernameOwner && usernameOwner !== account.id) || (phoneOwner && phoneOwner !== account.id)) {
    const details = [
      usernameOwner && usernameOwner !== account.id ? `아이디 키가 다른 사용자(${usernameOwner})를 가리킴` : null,
      phoneOwner && phoneOwner !== account.id ? `전화번호 키가 다른 사용자(${phoneOwner})를 가리킴` : null,
    ].filter(Boolean).join(" / ");

    return {
      state: "conflict",
      preview: {
        id: account.id,
        username: account.username,
        phoneNumber: account.phoneNumber,
        createdAt: account.createdAt,
        issue: "conflict",
        detail: details || "키 충돌",
      },
    };
  }

  if (existingUser && usernameOwner === account.id && phoneOwner === account.id) {
    return { state: "synced" };
  }

  const missingParts = [
    existingUser ? null : "계정 본문 없음",
    usernameOwner === account.id ? null : "아이디 키 누락",
    phoneOwner === account.id ? null : "전화번호 키 누락",
  ].filter(Boolean).join(" / ");

  return {
    state: "repairable",
    preview: {
      id: account.id,
      username: account.username,
      phoneNumber: account.phoneNumber,
      createdAt: account.createdAt,
      issue: "repairable",
      detail: missingParts || "재동기화 필요",
    },
  };
}

export async function getAuthStorageSyncStatus(): Promise<AuthStorageSyncStatus> {
  const localAccounts = readLocalAuthRows().map(mapStoredAuthAccount);
  const externalUserKeys = await scanKeys("luna:auth:v1:user:id:*");

  let syncedUsers = 0;
  const repairablePreview: AuthSyncPreview[] = [];
  const conflictPreview: AuthSyncPreview[] = [];

  for (const account of localAccounts) {
    const inspection = await inspectAccount(account);

    if (inspection.state === "synced") {
      syncedUsers += 1;
      continue;
    }

    if (!inspection.preview) {
      continue;
    }

    if (inspection.state === "repairable") {
      if (repairablePreview.length < 12) {
        repairablePreview.push(inspection.preview);
      }
      continue;
    }

    if (conflictPreview.length < 12) {
      conflictPreview.push(inspection.preview);
    }
  }

  return {
    localUsers: localAccounts.length,
    externalUsers: externalUserKeys.length,
    syncedUsers,
    repairableUsers: localAccounts.length - syncedUsers - conflictPreview.length,
    conflictUsers: conflictPreview.length,
    repairablePreview,
    conflictPreview,
  };
}

export async function backfillAuthStorageFromLocal(): Promise<AuthStorageBackfillReport> {
  const redis = getRequiredAuthStorage();
  const localAccounts = readLocalAuthRows().map(mapStoredAuthAccount);
  const externalUserKeys = await scanKeys("luna:auth:v1:user:id:*");

  let syncedUsers = 0;
  let repairedUsers = 0;
  let conflictUsers = 0;
  const repairedPreview: AuthSyncPreview[] = [];
  const conflictPreview: AuthSyncPreview[] = [];

  for (const account of localAccounts) {
    const inspection = await inspectAccount(account);

    if (inspection.state === "synced") {
      syncedUsers += 1;
      continue;
    }

    if (inspection.state === "conflict") {
      conflictUsers += 1;
      if (inspection.preview && conflictPreview.length < 12) {
        conflictPreview.push(inspection.preview);
      }
      continue;
    }

    await redis.set(authUserKey(account.id), account);
    await redis.set(authUserByUsernameKey(account.username), account.id);
    await redis.set(authUserByPhoneKey(account.phoneNumber), account.id);

    repairedUsers += 1;
    if (inspection.preview && repairedPreview.length < 12) {
      repairedPreview.push(inspection.preview);
    }
  }

  return {
    localUsers: localAccounts.length,
    externalUsersBefore: externalUserKeys.length,
    syncedUsers,
    repairedUsers,
    conflictUsers,
    repairedPreview,
    conflictPreview,
  };
}