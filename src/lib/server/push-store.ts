import crypto from "node:crypto";
import { db } from "./db";

export type PushPermissionState = "granted" | "denied" | "prompt" | "prompt-with-rationale" | "unknown";

export type PushCampaign = "daily_reading" | "analysis_done" | "test";

type PushDeviceRow = {
  id: string;
  user_id: string;
  platform: string;
  token: string;
  timezone: string | null;
  locale: string | null;
  permission_state: string;
  notifications_enabled: number;
  last_seen_at: string | null;
  last_registered_at: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

type PushDailyTargetRow = {
  device_id: string;
  user_id: string;
  token: string;
  timezone: string | null;
  locale: string | null;
};

type PushUserTargetRow = {
  device_id: string;
  token: string;
  platform: string;
  timezone: string | null;
  locale: string | null;
};

export type PushDevice = {
  id: string;
  userId: string;
  platform: string;
  token: string;
  timezone: string | null;
  locale: string | null;
  permissionState: PushPermissionState;
  notificationsEnabled: boolean;
  lastSeenAt: string | null;
  lastRegisteredAt: string;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PushDailyTarget = {
  deviceId: string;
  userId: string;
  token: string;
  timezone: string;
  locale: string | null;
};

export type PushUserTarget = {
  deviceId: string;
  token: string;
  platform: string;
  timezone: string;
  locale: string | null;
};

function mapPushDevice(row: PushDeviceRow): PushDevice {
  return {
    id: row.id,
    userId: row.user_id,
    platform: row.platform,
    token: row.token,
    timezone: row.timezone,
    locale: row.locale,
    permissionState: (row.permission_state as PushPermissionState) || "unknown",
    notificationsEnabled: row.notifications_enabled === 1,
    lastSeenAt: row.last_seen_at,
    lastRegisteredAt: row.last_registered_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizePermissionState(value: string | null | undefined): PushPermissionState {
  switch (value) {
    case "granted":
    case "denied":
    case "prompt":
    case "prompt-with-rationale":
      return value;
    default:
      return "unknown";
  }
}

function normalizeTimezone(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "Asia/Seoul";
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).format(new Date());
    return trimmed;
  } catch {
    return "Asia/Seoul";
  }
}

function normalizeLocale(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 64) : null;
}

export function upsertPushDevice(input: {
  userId: string;
  platform: string;
  token: string;
  timezone?: string | null;
  locale?: string | null;
  permissionState?: string | null;
}): PushDevice {
  const now = new Date().toISOString();
  const normalizedToken = input.token.trim();
  const permissionState = normalizePermissionState(input.permissionState);
  const notificationsEnabled = permissionState === "granted" ? 1 : 0;

  db.prepare(`
    INSERT INTO push_devices
      (id, user_id, platform, token, timezone, locale, permission_state, notifications_enabled, last_seen_at, last_registered_at, last_error, created_at, updated_at)
    VALUES
      (@id, @userId, @platform, @token, @timezone, @locale, @permissionState, @notificationsEnabled, @now, @now, NULL, @now, @now)
    ON CONFLICT(token) DO UPDATE SET
      user_id = excluded.user_id,
      platform = excluded.platform,
      timezone = excluded.timezone,
      locale = excluded.locale,
      permission_state = excluded.permission_state,
      notifications_enabled = excluded.notifications_enabled,
      last_seen_at = excluded.last_seen_at,
      last_registered_at = excluded.last_registered_at,
      last_error = NULL,
      updated_at = excluded.updated_at
  `).run({
    id: crypto.randomUUID(),
    userId: input.userId,
    platform: input.platform.trim().slice(0, 20) || "android",
    token: normalizedToken,
    timezone: normalizeTimezone(input.timezone),
    locale: normalizeLocale(input.locale),
    permissionState,
    notificationsEnabled,
    now,
  });

  const row = db.prepare(`
    SELECT id, user_id, platform, token, timezone, locale, permission_state, notifications_enabled,
           last_seen_at, last_registered_at, last_error, created_at, updated_at
    FROM push_devices
    WHERE token = @token
  `).get({ token: normalizedToken }) as PushDeviceRow;

  return mapPushDevice(row);
}

export function listDailyReadingPushTargets(activeSince: string): PushDailyTarget[] {
  const rows = db.prepare(`
    SELECT d.id AS device_id, d.user_id, d.token, d.timezone, d.locale
    FROM push_devices d
    LEFT JOIN user_preferences p ON p.user_id = d.user_id
    WHERE d.permission_state = 'granted'
      AND d.notifications_enabled = 1
      AND d.updated_at >= @activeSince
      AND COALESCE(p.notify_daily_reading, 1) = 1
  `).all({ activeSince }) as PushDailyTargetRow[];

  return rows.map((row) => ({
    deviceId: row.device_id,
    userId: row.user_id,
    token: row.token,
    timezone: normalizeTimezone(row.timezone),
    locale: normalizeLocale(row.locale),
  }));
}

export function listAnalysisDonePushTargets(userId: string): PushUserTarget[] {
  const rows = db.prepare(`
    SELECT d.id AS device_id, d.token, d.platform, d.timezone, d.locale
    FROM push_devices d
    LEFT JOIN user_preferences p ON p.user_id = d.user_id
    WHERE d.user_id = @userId
      AND d.permission_state = 'granted'
      AND d.notifications_enabled = 1
      AND COALESCE(p.notify_analysis_done, 1) = 1
  `).all({ userId }) as PushUserTargetRow[];

  return rows.map((row) => ({
    deviceId: row.device_id,
    token: row.token,
    platform: row.platform,
    timezone: normalizeTimezone(row.timezone),
    locale: normalizeLocale(row.locale),
  }));
}

export function listEnabledPushTargets(userId: string): PushUserTarget[] {
  const rows = db.prepare(`
    SELECT d.id AS device_id, d.token, d.platform, d.timezone, d.locale
    FROM push_devices d
    WHERE d.user_id = @userId
      AND d.permission_state = 'granted'
      AND d.notifications_enabled = 1
  `).all({ userId }) as PushUserTargetRow[];

  return rows.map((row) => ({
    deviceId: row.device_id,
    token: row.token,
    platform: row.platform,
    timezone: normalizeTimezone(row.timezone),
    locale: normalizeLocale(row.locale),
  }));
}

export function claimPushDelivery(input: {
  deviceId: string;
  userId: string;
  campaign: PushCampaign;
  dedupeKey: string;
}): string | null {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO push_delivery_log
        (id, device_id, user_id, campaign, dedupe_key, title, body, deep_link, status, response_code, response_body, created_at, sent_at)
      VALUES
        (@id, @deviceId, @userId, @campaign, @dedupeKey, NULL, NULL, NULL, 'pending', NULL, NULL, @now, NULL)
    `).run({
      id,
      deviceId: input.deviceId,
      userId: input.userId,
      campaign: input.campaign,
      dedupeKey: input.dedupeKey,
      now,
    });
    return id;
  } catch {
    return null;
  }
}

export function markPushDeliveryResult(input: {
  id: string;
  title: string;
  body: string;
  deepLink: string;
  status: string;
  responseCode?: number | null;
  responseBody?: string | null;
}): void {
  const sentAt = input.status === "sent" ? new Date().toISOString() : null;

  db.prepare(`
    UPDATE push_delivery_log
    SET title = @title,
        body = @body,
        deep_link = @deepLink,
        status = @status,
        response_code = @responseCode,
        response_body = @responseBody,
        sent_at = @sentAt
    WHERE id = @id
  `).run({
    id: input.id,
    title: input.title,
    body: input.body,
    deepLink: input.deepLink,
    status: input.status,
    responseCode: input.responseCode ?? null,
    responseBody: input.responseBody ?? null,
    sentAt,
  });
}

export function disablePushDevice(deviceId: string, errorMessage: string): void {
  db.prepare(`
    UPDATE push_devices
    SET notifications_enabled = 0,
        last_error = @errorMessage,
        updated_at = @now
    WHERE id = @deviceId
  `).run({
    deviceId,
    errorMessage: errorMessage.slice(0, 500),
    now: new Date().toISOString(),
  });
}