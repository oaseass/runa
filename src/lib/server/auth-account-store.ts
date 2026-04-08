import "server-only";
import { localBirthToUtc } from "@/lib/astrology/calculate";
import {
  authUserByPhoneKey,
  authUserByUsernameKey,
  authUserKey,
  getExternalAuthStorage,
  normalizeAuthUsername,
  type StoredAuthAccount,
  type StoredBirthPlaceProfile,
  type StoredBirthTimeProfile,
  type StoredOnboardingProfile,
} from "@/lib/server/auth-storage";

const USERNAME_REGEX = /^[a-z0-9._\u3131-\u314e\u314f-\u3163\uac00-\ud7a3]{2,20}$/;

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

export type PublicAuthAccount = {
  id: string;
  username: string;
  phoneNumber: string;
  createdAt: string;
};

export type AuthBirthDataPatch = {
  birthDate?: string | null;
  hour?: number | null;
  minute?: number | null;
  formatted?: string | null;
  placeId?: string | null;
  fullText?: string | null;
  mainText?: string | null;
  secondaryText?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string | null;
};

async function getLocalDb() {
  const { db } = await import("@/lib/server/db");
  return db;
}

function mapLocalAuthRow(row: LocalAuthRow): StoredAuthAccount {
  const birthTime: StoredBirthTimeProfile | null =
    row.birth_date !== null || row.birth_hour !== null || row.birth_minute !== null || row.birth_time_text !== null
      ? {
          birthDate: row.birth_date,
          hour: row.birth_hour,
          minute: row.birth_minute,
          formatted: row.birth_time_text,
        }
      : null;

  const birthPlace: StoredBirthPlaceProfile | null =
    row.birth_place_id !== null ||
    row.birth_place_full_text !== null ||
    row.birth_place_main_text !== null ||
    row.birth_place_secondary_text !== null ||
    row.birth_latitude !== null ||
    row.birth_longitude !== null ||
    row.birth_timezone !== null
      ? {
          placeId: row.birth_place_id,
          fullText: row.birth_place_full_text,
          mainText: row.birth_place_main_text,
          secondaryText: row.birth_place_secondary_text,
          latitude: row.birth_latitude,
          longitude: row.birth_longitude,
          timezone: row.birth_timezone,
        }
      : null;

  return {
    id: row.id,
    username: row.username,
    phoneNumber: row.phone_number,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    createdAt: row.created_at,
    onboardingProfile: birthTime || birthPlace ? { birthTime, birthPlace } : null,
  };
}

async function getLocalStoredAuthAccount(whereClause: string, value: string) {
  const db = await getLocalDb();
  const row = db
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
      WHERE ${whereClause}
      LIMIT 1
      `,
    )
    .get(value) as LocalAuthRow | undefined;

  return row ? mapLocalAuthRow(row) : null;
}

async function getLocalStoredAuthAccountById(userId: string) {
  return getLocalStoredAuthAccount("u.id = ?", userId);
}

function hasBirthPatchValue(value: unknown) {
  return value !== undefined;
}

function mergeBirthTimeProfile(current: StoredBirthTimeProfile | null | undefined, patch: AuthBirthDataPatch) {
  if (
    !hasBirthPatchValue(patch.birthDate) &&
    !hasBirthPatchValue(patch.hour) &&
    !hasBirthPatchValue(patch.minute) &&
    !hasBirthPatchValue(patch.formatted)
  ) {
    return current ?? null;
  }

  const next: StoredBirthTimeProfile = {
    birthDate: patch.birthDate !== undefined ? patch.birthDate : current?.birthDate ?? null,
    hour: patch.hour !== undefined ? patch.hour : current?.hour ?? null,
    minute: patch.minute !== undefined ? patch.minute : current?.minute ?? null,
    formatted: patch.formatted !== undefined ? patch.formatted : current?.formatted ?? null,
  };

  if (next.birthDate === null && next.hour === null && next.minute === null && !next.formatted) {
    return null;
  }

  return next;
}

function mergeBirthPlaceProfile(current: StoredBirthPlaceProfile | null | undefined, patch: AuthBirthDataPatch) {
  if (
    !hasBirthPatchValue(patch.placeId) &&
    !hasBirthPatchValue(patch.fullText) &&
    !hasBirthPatchValue(patch.mainText) &&
    !hasBirthPatchValue(patch.secondaryText) &&
    !hasBirthPatchValue(patch.latitude) &&
    !hasBirthPatchValue(patch.longitude) &&
    !hasBirthPatchValue(patch.timezone)
  ) {
    return current ?? null;
  }

  const next: StoredBirthPlaceProfile = {
    placeId: patch.placeId !== undefined ? patch.placeId : current?.placeId ?? null,
    fullText: patch.fullText !== undefined ? patch.fullText : current?.fullText ?? null,
    mainText: patch.mainText !== undefined ? patch.mainText : current?.mainText ?? null,
    secondaryText: patch.secondaryText !== undefined ? patch.secondaryText : current?.secondaryText ?? null,
    latitude: patch.latitude !== undefined ? patch.latitude : current?.latitude ?? null,
    longitude: patch.longitude !== undefined ? patch.longitude : current?.longitude ?? null,
    timezone: patch.timezone !== undefined ? patch.timezone : current?.timezone ?? null,
  };

  if (
    !next.placeId &&
    !next.fullText &&
    !next.mainText &&
    !next.secondaryText &&
    next.latitude === null &&
    next.longitude === null &&
    !next.timezone
  ) {
    return null;
  }

  return next;
}

function mergeOnboardingProfile(current: StoredOnboardingProfile | null | undefined, patch: AuthBirthDataPatch) {
  const birthTime = mergeBirthTimeProfile(current?.birthTime, patch);
  const birthPlace = mergeBirthPlaceProfile(current?.birthPlace, patch);

  if (!birthTime && !birthPlace) {
    return null;
  }

  return { birthTime, birthPlace };
}

async function syncLocalBirthUtc(userId: string) {
  const db = await getLocalDb();
  const fullProfile = db.prepare(
    `
    SELECT birth_date, birth_hour, birth_minute, birth_timezone
    FROM onboarding_profiles
    WHERE user_id = ?
    `,
  ).get(userId) as {
    birth_date: string | null;
    birth_hour: number | null;
    birth_minute: number | null;
    birth_timezone: string | null;
  } | undefined;

  let birthUtc: string | null = null;

  if (
    fullProfile?.birth_date &&
    fullProfile.birth_hour != null &&
    fullProfile.birth_minute != null &&
    fullProfile.birth_timezone
  ) {
    const [year, month, day] = fullProfile.birth_date.split("-").map(Number);
    birthUtc = localBirthToUtc(
      year,
      month,
      day,
      fullProfile.birth_hour,
      fullProfile.birth_minute,
      fullProfile.birth_timezone,
    ).toISOString();
  }

  db.prepare(
    "UPDATE onboarding_profiles SET birth_utc_datetime = @birthUtc WHERE user_id = @userId",
  ).run({ birthUtc, userId });
}

export function toPublicAuthAccount(account: Pick<StoredAuthAccount, "id" | "username" | "phoneNumber" | "createdAt">): PublicAuthAccount {
  return {
    id: account.id,
    username: account.username,
    phoneNumber: account.phoneNumber,
    createdAt: account.createdAt,
  };
}

export async function findStoredAuthAccountById(userId: string) {
  const redis = getExternalAuthStorage();
  if (redis) {
    return (await redis.get<StoredAuthAccount>(authUserKey(userId))) ?? null;
  }

  return getLocalStoredAuthAccountById(userId);
}

export async function findStoredAuthAccountByUsername(username: string) {
  const redis = getExternalAuthStorage();
  if (redis) {
    const userId = await redis.get<string>(authUserByUsernameKey(username));
    if (!userId) {
      return null;
    }

    return findStoredAuthAccountById(userId);
  }

  return getLocalStoredAuthAccount("lower(u.username) = lower(?)", username);
}

export async function findStoredAuthAccountByPhone(phoneNumber: string) {
  const redis = getExternalAuthStorage();
  if (redis) {
    const userId = await redis.get<string>(authUserByPhoneKey(phoneNumber));
    if (!userId) {
      return null;
    }

    return findStoredAuthAccountById(userId);
  }

  return getLocalStoredAuthAccount("u.phone_number = ?", phoneNumber);
}

export async function updateStoredAuthPassword(userId: string, passwordHash: string, passwordSalt: string) {
  const redis = getExternalAuthStorage();
  if (redis) {
    const account = await findStoredAuthAccountById(userId);
    if (!account) {
      return null;
    }

    const updatedAccount: StoredAuthAccount = {
      ...account,
      passwordHash,
      passwordSalt,
    };

    await redis.set(authUserKey(userId), updatedAccount);
    return updatedAccount;
  }

  const db = await getLocalDb();
  const result = db.prepare(
    `
    UPDATE users
    SET password_hash = @passwordHash,
        password_salt = @passwordSalt,
        updated_at = @updatedAt
    WHERE id = @userId
    `,
  ).run({
    passwordHash,
    passwordSalt,
    updatedAt: new Date().toISOString(),
    userId,
  });

  if (result.changes === 0) {
    return null;
  }

  return getLocalStoredAuthAccountById(userId);
}

export async function renameStoredAuthUsername(userId: string, newUsername: string) {
  const trimmed = newUsername.trim();
  if (!USERNAME_REGEX.test(trimmed)) {
    return "invalid" as const;
  }

  const redis = getExternalAuthStorage();
  if (redis) {
    const account = await findStoredAuthAccountById(userId);
    if (!account) {
      return "not-found" as const;
    }

    const oldKey = authUserByUsernameKey(account.username);
    const newKey = authUserByUsernameKey(trimmed);

    if (normalizeAuthUsername(account.username) === normalizeAuthUsername(trimmed)) {
      await redis.set(authUserKey(userId), {
        ...account,
        username: trimmed,
      });
      return "ok" as const;
    }

    const claimed = await redis.setnx(newKey, userId);
    if (claimed !== 1) {
      return "taken" as const;
    }

    try {
      await redis.set(authUserKey(userId), {
        ...account,
        username: trimmed,
      });
      await redis.del(oldKey);
      return "ok" as const;
    } catch (error) {
      await redis.del(newKey);
      throw error;
    }
  }

  const db = await getLocalDb();
  const existing = db
    .prepare("SELECT id FROM users WHERE lower(username) = lower(@username) AND id != @userId")
    .get({ username: trimmed, userId }) as { id: string } | undefined;

  if (existing) {
    return "taken" as const;
  }

  const result = db.prepare(
    "UPDATE users SET username = @username, updated_at = @updatedAt WHERE id = @userId",
  ).run({ username: trimmed, updatedAt: new Date().toISOString(), userId });

  if (result.changes === 0) {
    return "not-found" as const;
  }

  return "ok" as const;
}

export async function updateStoredAuthBirthData(userId: string, patch: AuthBirthDataPatch) {
  const hasPatch = [
    patch.birthDate,
    patch.hour,
    patch.minute,
    patch.formatted,
    patch.placeId,
    patch.fullText,
    patch.mainText,
    patch.secondaryText,
    patch.latitude,
    patch.longitude,
    patch.timezone,
  ].some((value) => value !== undefined);

  if (!hasPatch) {
    return findStoredAuthAccountById(userId);
  }

  const redis = getExternalAuthStorage();
  if (redis) {
    const account = await findStoredAuthAccountById(userId);
    if (!account) {
      return null;
    }

    const updatedAccount: StoredAuthAccount = {
      ...account,
      onboardingProfile: mergeOnboardingProfile(account.onboardingProfile, patch),
    };

    await redis.set(authUserKey(userId), updatedAccount);
    return updatedAccount;
  }

  const db = await getLocalDb();
  const now = new Date().toISOString();
  const setClauses: string[] = ["updated_at = @updatedAt"];
  const params: Record<string, unknown> = { userId, updatedAt: now };

  if (patch.birthDate !== undefined) {
    setClauses.push("birth_date = @birthDate");
    params.birthDate = patch.birthDate;
  }
  if (patch.hour !== undefined) {
    setClauses.push("birth_hour = @birthHour");
    params.birthHour = patch.hour;
  }
  if (patch.minute !== undefined) {
    setClauses.push("birth_minute = @birthMinute");
    params.birthMinute = patch.minute;
  }
  if (patch.formatted !== undefined) {
    setClauses.push("birth_time_text = @birthTimeText");
    params.birthTimeText = patch.formatted;
  }
  if (patch.placeId !== undefined) {
    setClauses.push("birth_place_id = @birthPlaceId");
    params.birthPlaceId = patch.placeId;
  }
  if (patch.fullText !== undefined) {
    setClauses.push("birth_place_full_text = @birthPlaceFullText");
    params.birthPlaceFullText = patch.fullText;
  }
  if (patch.mainText !== undefined) {
    setClauses.push("birth_place_main_text = @birthPlaceMainText");
    params.birthPlaceMainText = patch.mainText;
  }
  if (patch.secondaryText !== undefined) {
    setClauses.push("birth_place_secondary_text = @birthPlaceSecondaryText");
    params.birthPlaceSecondaryText = patch.secondaryText;
  }
  if (patch.latitude !== undefined) {
    setClauses.push("birth_latitude = @birthLatitude");
    params.birthLatitude = patch.latitude;
  }
  if (patch.longitude !== undefined) {
    setClauses.push("birth_longitude = @birthLongitude");
    params.birthLongitude = patch.longitude;
  }
  if (patch.timezone !== undefined) {
    setClauses.push("birth_timezone = @birthTimezone");
    params.birthTimezone = patch.timezone;
  }

  db.prepare(
    `
    INSERT INTO onboarding_profiles (user_id, updated_at)
    VALUES (@userId, @updatedAt)
    ON CONFLICT(user_id) DO UPDATE SET ${setClauses.join(", ")}
    `,
  ).run(params);

  db.prepare("DELETE FROM natal_charts WHERE user_id = @userId").run({ userId });
  await syncLocalBirthUtc(userId);

  return getLocalStoredAuthAccountById(userId);
}