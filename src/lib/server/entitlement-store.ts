/**
 * entitlement-store.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side entitlement management.
 *
 * The entitlements table is the single source of truth for access rights.
 * The iap_receipts / orders tables are the purchase ledger.
 *
 * Rules:
 * - VIP is active if is_vip=1 AND (vip_expires_at IS NULL OR
 *   vip_expires_at > now() OR vip_grace_until > now())
 * - void_credits decremented on use; never go below 0
 * - annual_report_owned / area_reports_owned are counters (>0 = has access)
 */

import crypto from "node:crypto";
import { db } from "./db";
import type { SkuId, SubscriptionSkuId } from "@/lib/products";
import { calcVipExpiry, calcGraceUntil, isVipSku, ANNUAL_REPORT, AREA_READING, VOID_PACK_3, VOID_PACK_10 } from "@/lib/products";

// ── Types ─────────────────────────────────────────────────────────────────────

export type Entitlement = {
  userId:              string;
  isVip:               boolean;
  vipSource:           string | null;
  vipExpiresAt:        string | null;
  vipGraceUntil:       string | null;
  annualReportOwned:   number;
  areaReportsOwned:    number;
  voidCredits:         number;
  updatedAt:           string;
};

type EntitlementRow = {
  user_id:              string;
  is_vip:               number;
  vip_source:           string | null;
  vip_expires_at:       string | null;
  vip_grace_until:      string | null;
  annual_report_owned:  number;
  area_reports_owned:   number;
  void_credits:         number;
  updated_at:           string;
};

function mapRow(row: EntitlementRow): Entitlement {
  return {
    userId:            row.user_id,
    isVip:             row.is_vip === 1,
    vipSource:         row.vip_source,
    vipExpiresAt:      row.vip_expires_at,
    vipGraceUntil:     row.vip_grace_until,
    annualReportOwned: row.annual_report_owned,
    areaReportsOwned:  row.area_reports_owned,
    voidCredits:       row.void_credits,
    updatedAt:         row.updated_at,
  };
}

const EMPTY_ENTITLEMENT = (userId: string): Entitlement => ({
  userId,
  isVip:            false,
  vipSource:        null,
  vipExpiresAt:     null,
  vipGraceUntil:    null,
  annualReportOwned: 0,
  areaReportsOwned:  0,
  voidCredits:       0,
  updatedAt:         new Date().toISOString(),
});

// ── Read ──────────────────────────────────────────────────────────────────────

export function getEntitlement(userId: string): Entitlement {
  const row = db
    .prepare("SELECT * FROM entitlements WHERE user_id = @userId")
    .get({ userId }) as EntitlementRow | undefined;
  return row ? mapRow(row) : EMPTY_ENTITLEMENT(userId);
}

/**
 * Check VIP considering expiry and grace period.
 * Returns true if the user has an active or grace-period VIP subscription.
 */
export function checkVip(userId: string): boolean {
  const row = db.prepare(`
    SELECT is_vip, vip_expires_at, vip_grace_until
    FROM entitlements
    WHERE user_id = @userId
  `).get({ userId }) as Pick<EntitlementRow, "is_vip" | "vip_expires_at" | "vip_grace_until"> | undefined;

  if (!row || row.is_vip === 0) return false;

  // Admin-granted indefinite VIP
  if (!row.vip_expires_at) return true;

  const now = new Date();
  // Active subscription
  if (new Date(row.vip_expires_at) > now) return true;
  // Grace period
  if (row.vip_grace_until && new Date(row.vip_grace_until) > now) return true;

  return false;
}

// ── VIP Mutations ─────────────────────────────────────────────────────────────

/**
 * Grant VIP subscription. Upserts the entitlement row.
 * - source: SKU that was purchased ('vip_monthly' | 'vip_yearly' | 'admin')
 * - purchasedAt: when the subscription purchase occurred
 * - expiresAt: if provided, overrides the calculated expiry (e.g. from Apple/Google receipt)
 */
export function grantVip(
  userId: string,
  source: SubscriptionSkuId | "admin",
  purchasedAt: Date = new Date(),
  overrideExpiresAt?: Date,
): void {
  let expiresAt: string | null = null;
  let graceUntil: string | null = null;

  if (source !== "admin") {
    const exp = overrideExpiresAt ?? calcVipExpiry(source, purchasedAt);
    expiresAt  = exp.toISOString();
    graceUntil = calcGraceUntil(exp).toISOString();
  }

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO entitlements
      (user_id, is_vip, vip_source, vip_expires_at, vip_grace_until, annual_report_owned, area_reports_owned, void_credits, updated_at)
    VALUES
      (@userId, 1, @source, @expiresAt, @graceUntil, 0, 0, 0, @now)
    ON CONFLICT(user_id) DO UPDATE SET
      is_vip          = 1,
      vip_source      = @source,
      vip_expires_at  = @expiresAt,
      vip_grace_until = @graceUntil,
      updated_at      = @now
  `).run({ userId, source, expiresAt, graceUntil, now });
}

/**
 * Extend VIP expiry (renewal). Only updates if the new expiry is later than the current one.
 */
export function renewVip(
  userId: string,
  source: SubscriptionSkuId,
  newExpiresAt: Date,
): void {
  const graceUntil = calcGraceUntil(newExpiresAt).toISOString();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO entitlements
      (user_id, is_vip, vip_source, vip_expires_at, vip_grace_until, annual_report_owned, area_reports_owned, void_credits, updated_at)
    VALUES
      (@userId, 1, @source, @expiresAt, @graceUntil, 0, 0, 0, @now)
    ON CONFLICT(user_id) DO UPDATE SET
      is_vip          = 1,
      vip_source      = @source,
      vip_expires_at  = MAX(vip_expires_at, @expiresAt),
      vip_grace_until = @graceUntil,
      updated_at      = @now
  `).run({ userId, source, expiresAt: newExpiresAt.toISOString(), graceUntil, now });
}

/**
 * Revoke VIP (cancellation / refund / expiry confirmed).
 * Keeps the row but clears VIP flag.
 */
export function revokeVip(userId: string): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO entitlements (user_id, is_vip, annual_report_owned, area_reports_owned, void_credits, updated_at)
    VALUES (@userId, 0, 0, 0, 0, @now)
    ON CONFLICT(user_id) DO UPDATE SET
      is_vip          = 0,
      vip_expires_at  = NULL,
      vip_grace_until = NULL,
      updated_at      = @now
  `).run({ userId, now });
}

/**
 * Enter billing grace period — keep is_vip=1 but set grace_until.
 */
export function setVipGrace(userId: string, graceUntil: Date): void {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE entitlements
    SET vip_grace_until = @graceUntil, updated_at = @now
    WHERE user_id = @userId
  `).run({ userId, graceUntil: graceUntil.toISOString(), now });
}

// ── One-time Mutations ────────────────────────────────────────────────────────

export function grantAnnualReport(userId: string): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO entitlements (user_id, is_vip, annual_report_owned, area_reports_owned, void_credits, updated_at)
    VALUES (@userId, 0, 1, 0, 0, @now)
    ON CONFLICT(user_id) DO UPDATE SET
      annual_report_owned = 1,
      updated_at = @now
  `).run({ userId, now });
}

export function grantAreaReading(userId: string): void {
  const now = new Date().toISOString();
  // INSERT path uses literal 1; ON CONFLICT path accumulates.
  db.prepare(`
    INSERT INTO entitlements (user_id, is_vip, annual_report_owned, area_reports_owned, void_credits, updated_at)
    VALUES (@userId, 0, 0, 1, 0, @now)
    ON CONFLICT(user_id) DO UPDATE SET
      area_reports_owned = area_reports_owned + 1,
      updated_at = @now
  `).run({ userId, now });
}

export function addVoidCredits(userId: string, credits: number): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO entitlements (user_id, is_vip, annual_report_owned, area_reports_owned, void_credits, updated_at)
    VALUES (@userId, 0, 0, 0, @credits, @now)
    ON CONFLICT(user_id) DO UPDATE SET
      void_credits = void_credits + @credits,
      updated_at = @now
  `).run({ userId, credits, now });
}

/**
 * Attempt to consume 1 VOID credit. Returns true if successful (had ≥1 credit).
 */
export function consumeVoidCredit(userId: string): boolean {
  const result = db.prepare(`
    UPDATE entitlements
    SET void_credits = void_credits - 1, updated_at = datetime('now')
    WHERE user_id = @userId AND void_credits > 0
  `).run({ userId });
  return result.changes > 0;
}

// ── Bulk grant (from SKU purchase) ───────────────────────────────────────────

/**
 * Process an entitlement grant for any SKU purchase.
 * Called after payment is confirmed (Toss, Apple IAP, Google IAP).
 */
export function grantFromSku(
  userId: string,
  skuId: SkuId,
  purchasedAt: Date = new Date(),
  expiresAt?: Date,
  { skipIfAlreadyGranted = false } = {},
): void {
  if (isVipSku(skuId)) {
    if (skipIfAlreadyGranted && checkVip(userId)) return;
    grantVip(userId, skuId, purchasedAt, expiresAt);
    return;
  }

  switch (skuId) {
    case ANNUAL_REPORT:
      grantAnnualReport(userId);
      break;
    case AREA_READING:
      grantAreaReading(userId);
      break;
    case VOID_PACK_3:
      addVoidCredits(userId, 3);
      break;
    case VOID_PACK_10:
      addVoidCredits(userId, 10);
      break;
  }
}

// ── IAP Receipt Recording ─────────────────────────────────────────────────────

type IapReceiptInput = {
  userId:                string;
  platform:              "apple" | "google" | "toss";
  skuId:                 SkuId;
  transactionId:         string;
  originalTransactionId?: string;
  purchaseToken?:        string;
  status:                "valid" | "invalid" | "expired" | "cancelled" | "refunded";
  purchaseDate?:         string;
  expiresDate?:          string;
  rawResponse?:          string;
};

export function recordIapReceipt(input: IapReceiptInput): void {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO iap_receipts
      (id, user_id, platform, sku_id, transaction_id, original_transaction_id,
       purchase_token, status, purchase_date, expires_date, raw_response)
    VALUES
      (@id, @userId, @platform, @skuId, @transactionId, @originalTransactionId,
       @purchaseToken, @status, @purchaseDate, @expiresDate, @rawResponse)
    ON CONFLICT(platform, transaction_id) DO UPDATE SET
      status       = @status,
      expires_date = @expiresDate,
      raw_response = @rawResponse,
      processed_at = datetime('now')
  `).run({
    id,
    userId:                input.userId,
    platform:              input.platform,
    skuId:                 input.skuId,
    transactionId:         input.transactionId,
    originalTransactionId: input.originalTransactionId ?? null,
    purchaseToken:         input.purchaseToken ?? null,
    status:                input.status,
    purchaseDate:          input.purchaseDate ?? null,
    expiresDate:           input.expiresDate ?? null,
    rawResponse:           input.rawResponse ? input.rawResponse.slice(0, 8000) : null,
  });
}

/** Check if a transaction was already processed (idempotency) */
export function isTransactionProcessed(platform: string, transactionId: string): boolean {
  const row = db.prepare(`
    SELECT id FROM iap_receipts
    WHERE platform = @platform AND transaction_id = @transactionId AND status = 'valid'
  `).get({ platform, transactionId });
  return !!row;
}

// ── Analytics helpers ─────────────────────────────────────────────────────────

export type EntitlementStats = {
  totalVip:            number;
  vipMonthly:          number;
  vipYearly:           number;
  activeGrace:         number;
  expired:             number;
  annualReportOwners:  number;
  areaReadingOwners:   number;
  voidPackBuyers:      number;
  totalVoidCredits:    number;
};

export function getEntitlementStats(): EntitlementStats {
  const now = new Date().toISOString();

  const r = db.prepare(`
    SELECT
      SUM(is_vip)                                         AS totalVip,
      SUM(CASE WHEN vip_source = 'vip_monthly' THEN 1 ELSE 0 END) AS vipMonthly,
      SUM(CASE WHEN vip_source = 'vip_yearly'  THEN 1 ELSE 0 END) AS vipYearly,
      SUM(CASE WHEN is_vip = 1 AND vip_expires_at < @now
               AND vip_grace_until > @now THEN 1 ELSE 0 END)       AS activeGrace,
      SUM(CASE WHEN is_vip = 1 AND vip_expires_at IS NOT NULL
               AND vip_expires_at < @now
               AND (vip_grace_until IS NULL OR vip_grace_until < @now)
               THEN 1 ELSE 0 END)                                  AS expired,
      SUM(CASE WHEN annual_report_owned > 0 THEN 1 ELSE 0 END)    AS annualReportOwners,
      SUM(CASE WHEN area_reports_owned > 0  THEN 1 ELSE 0 END)    AS areaReadingOwners,
      0                                                             AS voidPackBuyers,
      SUM(void_credits)                                            AS totalVoidCredits
    FROM entitlements
  `).get({ now }) as Record<string, number | null>;

  // void pack buyers: count users who ever bought a void pack via iap_receipts
  const voidBuyers = (db.prepare(`
    SELECT COUNT(DISTINCT user_id) AS n FROM iap_receipts
    WHERE sku_id IN ('void_pack_3','void_pack_10') AND status = 'valid'
  `).get() as { n: number }).n ?? 0;

  return {
    totalVip:           r.totalVip          ?? 0,
    vipMonthly:         r.vipMonthly        ?? 0,
    vipYearly:          r.vipYearly         ?? 0,
    activeGrace:        r.activeGrace       ?? 0,
    expired:            r.expired           ?? 0,
    annualReportOwners: r.annualReportOwners ?? 0,
    areaReadingOwners:  r.areaReadingOwners  ?? 0,
    voidPackBuyers:     voidBuyers,
    totalVoidCredits:   r.totalVoidCredits   ?? 0,
  };
}

export type RevenueMetrics = {
  totalRevenue:        number;
  revenueThisMonth:    number;
  arppu:               number;
  // % of total registered users who are currently active VIP
  vipConversion:       number;
  // Attach rates: denominator = users who ever subscribed VIP (upsell cross-sell metric).
  // "Of VIP subscribers, what % also bought X?"
  annualAttachRate:    number;
  areaAttachRate:      number;
  // Void pack attach rate: denominator = all paid users (any purchase), not just VIP.
  // Void packs are sold independently; VIP is not a prerequisite.
  voidPackAttachRate:  number;
  // Churn: (everVip - currentActiveVip) / everVip
  // = cumulative share of past VIP subscribers who are no longer active.
  // NOT a period-based rate; treats admin-granted VIPs as eternal (excluded).
  subscriberChurn:     number;
};

export function getRevenueMetrics(): RevenueMetrics {
  // Total paid orders (for revenue + ARPPU)
  const rev = db.prepare(`
    SELECT
      SUM(amount) AS total,
      SUM(CASE WHEN paid_at >= date('now','start of month') THEN amount ELSE 0 END) AS thisMonth,
      COUNT(DISTINCT user_id) AS buyers
    FROM orders
    WHERE status = 'paid'
  `).get() as { total: number | null; thisMonth: number | null; buyers: number | null };

  const totalRevenue     = rev.total     ?? 0;
  const revenueThisMonth = rev.thisMonth ?? 0;
  const buyers           = rev.buyers    ?? 0;
  const arppu            = buyers > 0 ? Math.round(totalRevenue / buyers) : 0;

  // Total registered users
  const totalUsers = (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n ?? 0;

  const stats = getEntitlementStats();
  const vipConversion = totalUsers > 0 ? Math.round(stats.totalVip / totalUsers * 100) : 0;

  // ── Attach rates ──────────────────────────────────────────────────────────
  // annualAttachRate / areaAttachRate:
  //   Denominator = users who ever had a VIP subscription (everVip).
  //   Rationale: these are upsell products targeting VIP subs.
  //   "Of all VIP subscribers, what % also bought this add-on?"
  //
  // voidPackAttachRate:
  //   Denominator = all paid users (any SKU).
  //   Rationale: void packs are standalone, no VIP prerequisite.

  const everVip = (db.prepare(`
    SELECT COUNT(DISTINCT user_id) AS n FROM iap_receipts
    WHERE sku_id IN ('vip_monthly','vip_yearly') AND status IN ('valid','expired','cancelled','refunded')
  `).get() as { n: number }).n;

  // Fall back to current VIP count when iap_receipts has no data (e.g. dev/Toss-only env)
  const vipBase = everVip > 0 ? everVip : (stats.totalVip || 1);

  const annualAttachRate   = Math.round(stats.annualReportOwners / vipBase * 100);
  const areaAttachRate     = Math.round(stats.areaReadingOwners  / vipBase * 100);
  const voidPackAttachRate = buyers > 0 ? Math.round(stats.voidPackBuyers / buyers * 100) : 0;

  // ── Churn ─────────────────────────────────────────────────────────────────
  // Definition: cumulative churn = (everVip - currentActiveVip) / everVip
  //   • everVip: distinct users who purchased any VIP SKU via IAP receipts.
  //   • currentActiveVip: stats.totalVip (is_vip=1, not expired, not in grace-only).
  //   • Excludes admin-granted VIPs (no expiry date) from everVip — they don't churn.
  //   • This is a CUMULATIVE metric, not a period churn rate.
  const churned = Math.max(0, vipBase - stats.totalVip);
  const subscriberChurn = vipBase > 0 ? Math.round(churned / vipBase * 100) : 0;

  return {
    totalRevenue,
    revenueThisMonth,
    arppu,
    vipConversion,
    annualAttachRate,
    areaAttachRate,
    voidPackAttachRate,
    subscriberChurn,
  };
}
