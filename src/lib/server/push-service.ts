import crypto from "node:crypto";
import { getTodayInterpretationForUser } from "./chart-runtime";
import {
  claimPushDelivery,
  disablePushDevice,
  listAnalysisDonePushTargets,
  listDailyReadingPushTargets,
  markPushDeliveryResult,
  type PushCampaign,
} from "./push-store";

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id?: string;
};

type PushMessageInput = {
  token: string;
  title: string;
  body: string;
  deepLink: string;
  campaign: PushCampaign;
};

type PushSendResult = {
  ok: boolean;
  status: number;
  body: string;
  invalidToken: boolean;
};

type DailyPushStats = {
  ok: boolean;
  considered: number;
  matchedHour: number;
  alreadyClaimed: number;
  sent: number;
  failed: number;
  invalidated: number;
  skippedHour: number;
  targetHour: number;
};

type TokenCache = {
  accessToken: string;
  expiresAt: number;
  cacheKey: string;
};

const FIREBASE_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
let tokenCache: TokenCache | null = null;

function readJsonEnv(value: string | undefined): ServiceAccount | null {
  const raw = value?.trim();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as ServiceAccount;
  } catch {
    try {
      return JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as ServiceAccount;
    } catch {
      return null;
    }
  }
}

function getFirebaseCredentials(): { serviceAccount: ServiceAccount; projectId: string } | null {
  const serviceAccount =
    readJsonEnv(process.env.FCM_SERVICE_ACCOUNT_JSON) ??
    readJsonEnv(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

  const projectId =
    process.env.FCM_PROJECT_ID?.trim() ||
    serviceAccount?.project_id?.trim() ||
    "";

  if (!serviceAccount?.client_email || !serviceAccount.private_key || !projectId) {
    return null;
  }

  return { serviceAccount, projectId };
}

async function getFirebaseAccessToken(): Promise<{ accessToken: string; projectId: string } | null> {
  const credentials = getFirebaseCredentials();
  if (!credentials) {
    return null;
  }

  const cacheKey = `${credentials.serviceAccount.client_email}:${credentials.projectId}`;
  if (tokenCache && tokenCache.cacheKey === cacheKey && tokenCache.expiresAt > Date.now() + 60_000) {
    return { accessToken: tokenCache.accessToken, projectId: credentials.projectId };
  }

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: credentials.serviceAccount.client_email,
    scope: FIREBASE_SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })).toString("base64url");

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const signature = signer.sign(credentials.serviceAccount.private_key, "base64url");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${payload}.${signature}`,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    return null;
  }

  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + Math.max(300, data.expires_in ?? 3600) * 1000,
    cacheKey,
  };

  return { accessToken: data.access_token, projectId: credentials.projectId };
}

function compactText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 1).trim()}…`;
}

function getTimeZoneParts(date: Date, timeZone: string): { dateKey: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    dateKey: `${lookup.year}-${lookup.month}-${lookup.day}`,
    hour: Number(lookup.hour ?? "0"),
  };
}

function isInvalidTokenResponse(body: string): boolean {
  return /UNREGISTERED|registration-token-not-registered|Requested entity was not found|INVALID_ARGUMENT/i.test(body);
}

async function sendFcmMessage(input: PushMessageInput): Promise<PushSendResult> {
  const token = await getFirebaseAccessToken();
  if (!token) {
    return {
      ok: false,
      status: 503,
      body: "FCM credentials are missing or invalid",
      invalidToken: false,
    };
  }

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${token.projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: input.token,
          notification: {
            title: input.title,
            body: input.body,
          },
          data: {
            campaign: input.campaign,
            deepLink: input.deepLink,
          },
          android: {
            priority: "HIGH",
            notification: {
              channelId: "luna-daily",
              clickAction: "OPEN_LUNA_PUSH",
            },
          },
        },
      }),
      cache: "no-store",
    },
  );

  const body = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    body,
    invalidToken: !response.ok && isInvalidTokenResponse(body),
  };
}

async function buildDailyReadingMessage(userId: string): Promise<{ title: string; body: string; deepLink: string }> {
  try {
    const interpretation = await getTodayInterpretationForUser(userId);
    if (interpretation) {
      return {
        title: compactText(interpretation.headline || "오늘의 흐름이 도착했어요", 56),
        body: compactText(interpretation.keyPhrase || interpretation.lede || "지금 열면 오늘의 리듬을 바로 읽을 수 있어요.", 110),
        deepLink: "/home?campaign=daily_reading",
      };
    }
  } catch {
  }

  return {
    title: "오늘의 흐름이 도착했어요",
    body: "지금 열면 오늘의 리듬을 바로 읽을 수 있어요.",
    deepLink: "/home?campaign=daily_reading",
  };
}

function getTargetHour(): number {
  const parsed = Number(process.env.PUSH_DAILY_TARGET_HOUR?.trim() || "10");
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 23) {
    return 10;
  }

  return Math.floor(parsed);
}

function getActiveWindowDays(): number {
  const parsed = Number(process.env.PUSH_DEVICE_ACTIVE_DAYS?.trim() || "45");
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 45;
  }

  return Math.floor(parsed);
}

export async function sendDailyReadingPushes(now = new Date()): Promise<DailyPushStats> {
  const activeSince = new Date(now.getTime() - getActiveWindowDays() * 24 * 60 * 60 * 1000).toISOString();
  const targetHour = getTargetHour();
  const targets = listDailyReadingPushTargets(activeSince);

  const stats: DailyPushStats = {
    ok: true,
    considered: targets.length,
    matchedHour: 0,
    alreadyClaimed: 0,
    sent: 0,
    failed: 0,
    invalidated: 0,
    skippedHour: 0,
    targetHour,
  };

  for (const target of targets) {
    const local = getTimeZoneParts(now, target.timezone);
    if (local.hour !== targetHour) {
      stats.skippedHour += 1;
      continue;
    }

    stats.matchedHour += 1;
    const claimId = claimPushDelivery({
      deviceId: target.deviceId,
      userId: target.userId,
      campaign: "daily_reading",
      dedupeKey: local.dateKey,
    });

    if (!claimId) {
      stats.alreadyClaimed += 1;
      continue;
    }

    const content = await buildDailyReadingMessage(target.userId);
    const result = await sendFcmMessage({
      token: target.token,
      title: content.title,
      body: content.body,
      deepLink: content.deepLink,
      campaign: "daily_reading",
    });

    markPushDeliveryResult({
      id: claimId,
      title: content.title,
      body: content.body,
      deepLink: content.deepLink,
      status: result.ok ? "sent" : result.invalidToken ? "invalid_token" : "error",
      responseCode: result.status,
      responseBody: result.body,
    });

    if (result.ok) {
      stats.sent += 1;
      continue;
    }

    stats.failed += 1;
    if (result.invalidToken) {
      disablePushDevice(target.deviceId, result.body);
      stats.invalidated += 1;
    }
  }

  stats.ok = stats.failed === 0;
  return stats;
}

export async function sendAnalysisDonePush(input: {
  userId: string;
  title?: string;
  body: string;
  deepLink: string;
  dedupeKey: string;
}): Promise<{ sent: number; failed: number; alreadyClaimed: number }> {
  const title = compactText(input.title || "분석이 완료됐어요", 56);
  const body = compactText(input.body, 110);
  let sent = 0;
  let failed = 0;
  let alreadyClaimed = 0;

  for (const target of listAnalysisDonePushTargets(input.userId)) {
    const claimId = claimPushDelivery({
      deviceId: target.deviceId,
      userId: input.userId,
      campaign: "analysis_done",
      dedupeKey: input.dedupeKey,
    });

    if (!claimId) {
      alreadyClaimed += 1;
      continue;
    }

    const result = await sendFcmMessage({
      token: target.token,
      title,
      body,
      deepLink: input.deepLink,
      campaign: "analysis_done",
    });

    markPushDeliveryResult({
      id: claimId,
      title,
      body,
      deepLink: input.deepLink,
      status: result.ok ? "sent" : result.invalidToken ? "invalid_token" : "error",
      responseCode: result.status,
      responseBody: result.body,
    });

    if (result.ok) {
      sent += 1;
      continue;
    }

    failed += 1;
    if (result.invalidToken) {
      disablePushDevice(target.deviceId, result.body);
    }
  }

  return { sent, failed, alreadyClaimed };
}