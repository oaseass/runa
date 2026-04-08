import { db } from "./db";
import { findStoredAuthAccountById, renameStoredAuthUsername } from "./auth-account-store";

export type UserPreferences = {
  notifyDailyReading: boolean;
  notifyAnalysisDone: boolean;
};

type DbPrefsRow = {
  notify_daily_reading: number;
  notify_analysis_done: number;
};

const DEFAULT_PREFS: UserPreferences = {
  notifyDailyReading: true,
  notifyAnalysisDone: true,
};

export function getUserPreferences(userId: string): UserPreferences {
  const row = db
    .prepare("SELECT notify_daily_reading, notify_analysis_done FROM user_preferences WHERE user_id = @userId")
    .get({ userId }) as DbPrefsRow | undefined;

  if (!row) return { ...DEFAULT_PREFS };

  return {
    notifyDailyReading: row.notify_daily_reading === 1,
    notifyAnalysisDone: row.notify_analysis_done === 1,
  };
}

export function upsertUserPreferences(
  userId: string,
  prefs: Partial<UserPreferences>,
): void {
  const now = new Date().toISOString();

  // Read current or defaults
  const current = getUserPreferences(userId);
  const next: UserPreferences = { ...current, ...prefs };

  db.prepare(`
    INSERT INTO user_preferences (user_id, notify_daily_reading, notify_analysis_done, updated_at)
    VALUES (@userId, @notifyDailyReading, @notifyAnalysisDone, @now)
    ON CONFLICT(user_id) DO UPDATE SET
      notify_daily_reading = @notifyDailyReading,
      notify_analysis_done = @notifyAnalysisDone,
      updated_at = @now
  `).run({
    userId,
    notifyDailyReading: next.notifyDailyReading ? 1 : 0,
    notifyAnalysisDone: next.notifyAnalysisDone ? 1 : 0,
    now,
  });
}

/** Returns the user's join date from the users table, or null. */
export async function getUserCreatedAt(userId: string): Promise<string | null> {
  const account = await findStoredAuthAccountById(userId);
  return account?.createdAt ?? null;
}

/** Returns the user's phone number from the users table, or null. */
export async function getUserPhoneNumber(userId: string): Promise<string | null> {
  const account = await findStoredAuthAccountById(userId);
  return account?.phoneNumber ?? null;
}

/**
 * Update username. Returns "ok" or an error code.
 * Does NOT re-issue the session token — that's the caller's responsibility.
 */
export async function changeUsername(
  userId: string,
  newUsername: string,
): Promise<"ok" | "taken" | "invalid" | "not-found"> {
  return renameStoredAuthUsername(userId, newUsername);
}
