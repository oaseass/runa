/**
 * helpers.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared utilities for all E2E Playwright specs.
 *
 * Usage:
 *   import { loginAs, fetchStatus, mutate } from "./helpers";
 */

import { type BrowserContext } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// ── Load .env.local once ──────────────────────────────────────────────────────

function loadEnvLocal() {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#=\r\n][^=]*)=(.*)/);
      if (m) {
        const key = m[1].trim();
        const val = m[2].trim().replace(/\r$/, "");
        if (!(key in process.env)) process.env[key] = val;
      }
    }
  } catch { /* no .env.local — use defaults */ }
}

loadEnvLocal();

export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
export const SKIP_PAYMENT =
  process.env.SKIP_PAYMENT === "true" || process.env.NEXT_PUBLIC_SKIP_PAYMENT === "true";

const SESSION_SECRET =
  process.env.AUTH_SESSION_SECRET?.trim() ?? "luna-dev-session-secret-change-me";
const SESSION_TTL = 60 * 60 * 24 * 30;

// ── User info ─────────────────────────────────────────────────────────────────

export interface TestUserInfo {
  userId: string;
  username: string;
  phoneNumber: string;
}

export async function fetchTestUserInfo(username: string): Promise<TestUserInfo> {
  const resp = await fetch(`${BASE_URL}/api/test/user-info?username=${username}`);
  if (!resp.ok) throw new Error(`user-info ${resp.status} for "${username}"`);
  return resp.json() as Promise<TestUserInfo>;
}

// ── Cookie injection ──────────────────────────────────────────────────────────

export async function injectSessionCookie(
  context: BrowserContext,
  info: TestUserInfo,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    userId: info.userId,
    username: info.username,
    phoneNumber: info.phoneNumber,
    loginMethod: "phone" as const,
    iat: now,
    exp: now + SESSION_TTL,
  };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const sig     = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  const token   = `${payload}.${sig}`;

  await context.addCookies([{
    name:    "luna_auth",
    value:   token,
    domain:  "localhost",
    path:    "/",
    httpOnly: true,
    sameSite: "Lax",
    expires: now + SESSION_TTL,
  }]);
}

/** Login as the given test username (fetches userId + injects cookie). */
export async function loginAs(context: BrowserContext, username: string): Promise<TestUserInfo> {
  const info = await fetchTestUserInfo(username);
  await injectSessionCookie(context, info);
  return info;
}

// ── Status API ────────────────────────────────────────────────────────────────

export interface UserStatus {
  isPro:             boolean;
  isVip:             boolean;
  username:          string | null;
  voidCredits:       number;
  annualReportOwned: boolean;
  areaReportsOwned:  boolean;
}

export async function fetchStatus(context: BrowserContext): Promise<UserStatus> {
  const resp = await context.request.get("/api/user/status");
  return resp.json() as Promise<UserStatus>;
}

// ── Entitlement mutation ──────────────────────────────────────────────────────

type MutateAction =
  | "expire_vip"
  | "set_grace_period"
  | "grant_vip"
  | "revoke_vip"
  | "use_void_credit"
  | "add_void_credit"
  | "set_void_credits";

export async function mutate(
  context: BrowserContext,
  username: string,
  action: MutateAction,
  value?: number,
  vipSource?: "vip_monthly" | "vip_yearly",
): Promise<{ ok: boolean }> {
  const resp = await context.request.post("/api/test/mutate-entitlement", {
    data: { username, action, value, vipSource },
  });
  if (!resp.ok()) {
    const body = await resp.text();
    throw new Error(`mutate failed (${resp.status()}): ${body}`);
  }
  return resp.json() as Promise<{ ok: boolean }>;
}

// ── Admin metrics ─────────────────────────────────────────────────────────────

export interface EntitlementStats {
  totalVip:           number;
  vipMonthly:         number;
  vipYearly:          number;
  activeGrace:        number;
  expired:            number;
  annualReportOwners: number;
  areaReadingOwners:  number;
  voidPackBuyers:     number;
  totalVoidCredits:   number;
}

export interface RevenueMetrics {
  totalRevenue:      number;
  revenueThisMonth:  number;
  arppu:             number;
  vipConversion:     number;
  annualAttachRate:  number;
  areaAttachRate:    number;
  voidPackAttachRate: number;
  subscriberChurn:   number;
}

export async function fetchMetrics(context: BrowserContext): Promise<{
  stats: EntitlementStats;
  metrics: RevenueMetrics;
}> {
  const resp = await context.request.get("/api/test/entitlement-metrics");
  if (!resp.ok()) throw new Error(`metrics endpoint returned ${resp.status()}`);
  return resp.json() as Promise<{ stats: EntitlementStats; metrics: RevenueMetrics }>;
}
