import { db } from "./db";

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
export function getUserCreatedAt(userId: string): string | null {
  const row = db
    .prepare("SELECT created_at FROM users WHERE id = @userId")
    .get({ userId }) as { created_at: string } | undefined;
  return row?.created_at ?? null;
}

/** Returns the user's phone number from the users table, or null. */
export function getUserPhoneNumber(userId: string): string | null {
  const row = db
    .prepare("SELECT phone_number FROM users WHERE id = @userId")
    .get({ userId }) as { phone_number: string } | undefined;
  return row?.phone_number ?? null;
}

/**
 * Update username. Returns "ok" or an error code.
 * Does NOT re-issue the session token — that's the caller's responsibility.
 */
export function changeUsername(
  userId: string,
  newUsername: string,
): "ok" | "taken" | "invalid" {
  const trimmed = newUsername.trim();
  if (!trimmed || trimmed.length < 2 || trimmed.length > 24) return "invalid";
  if (!/^[a-zA-Z0-9_가-힣]+$/.test(trimmed)) return "invalid";

  // Check uniqueness (case-insensitive, excluding this user)
  const existing = db
    .prepare("SELECT id FROM users WHERE lower(username) = lower(@username) AND id != @userId")
    .get({ username: trimmed, userId }) as { id: string } | undefined;

  if (existing) return "taken";

  db.prepare("UPDATE users SET username = @username, updated_at = @now WHERE id = @userId")
    .run({ username: trimmed, now: new Date().toISOString(), userId });

  return "ok";
}
