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
import { countStoredAuthAccounts } from "./auth-account-store";
import { db } from "./db";
import type { SkuId, SubscriptionSkuId } from "@/lib/products";
import { calcVipExpiry, calcGraceUntil, isVipSku, ANNUAL_REPORT, AREA_READING, STARTER_VOID_CREDITS, VIP_MONTHLY_VOID_CREDITS, VOID_SINGLE, VOID_PACK_5, VOID_PACK_3, VOID_PACK_10 } from "@/lib/products";

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
  vip_void_credits:     number;
  vip_void_cycle:       string | null;
  updated_at:           string;
};

type VoidCreditSourceType = "purchase" | "starter" | "manual" | "legacy_balance";

type VoidCreditLedgerRow = {
  id: string;
  user_id: string;
  order_id: string | null;
  sku_id: string;
  transaction_id: string | null;
  purchase_token: string | null;
  source_type: VoidCreditSourceType;
  total_credits: number;
  consumed_credits: number;
  refunded_credits: number;
  status: string;
  created_at: string;
  updated_at: string;
};

type VoidCreditGrantOptions = {
  orderId?: string | null;
  skuId?: SkuId | null;
  transactionId?: string | null;
  purchaseToken?: string | null;
  sourceType?: VoidCreditSourceType;
};

type VoidCreditRefundLookup = {
  orderId?: string | null;
  transactionId?: string | null;
  purchaseToken?: string | null;
};

function getCurrentKstVipCycle(now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

function isVipRowActive(row: Pick<EntitlementRow, "is_vip" | "vip_expires_at" | "vip_grace_until">, now: Date = new Date()): boolean {
  if (row.is_vip === 0) return false;
  if (!row.vip_expires_at) return true;
  if (new Date(row.vip_expires_at) > now) return true;
  if (row.vip_grace_until && new Date(row.vip_grace_until) > now) return true;
  return false;
}

function shouldUseVipMonthlyCredits(row: EntitlementRow, now: Date = new Date()): boolean {
  return row.vip_source !== "admin" && isVipRowActive(row, now);
}

function effectiveVoidCredits(row: EntitlementRow, now: Date = new Date()): number {
  const vipCredits = shouldUseVipMonthlyCredits(row, now) ? row.vip_void_credits : 0;
  return row.void_credits + vipCredits;
}

function syncVipMonthlyCredits(row: EntitlementRow): EntitlementRow {
  const now = new Date();
  if (!shouldUseVipMonthlyCredits(row, now)) {
    return row;
  }

  const cycle = getCurrentKstVipCycle(now);
  if (row.vip_void_cycle === cycle) {
    return row;
  }

  const updatedAt = now.toISOString();
  db.prepare(`
    UPDATE entitlements
    SET vip_void_credits = @credits,
        vip_void_cycle = @cycle,
        updated_at = @updatedAt
    WHERE user_id = @userId
  `).run({
    userId: row.user_id,
    credits: VIP_MONTHLY_VOID_CREDITS,
    cycle,
    updatedAt,
  });

  return {
    ...row,
    vip_void_credits: VIP_MONTHLY_VOID_CREDITS,
    vip_void_cycle: cycle,
    updated_at: updatedAt,
  };
}

function getStoredVoidCredits(userId: string): number {
  const row = db.prepare(`
    SELECT COALESCE(SUM(CASE
      WHEN total_credits - consumed_credits - refunded_credits > 0
      THEN total_credits - consumed_credits - refunded_credits
      ELSE 0
    END), 0) AS credits
    FROM void_credit_ledger
    WHERE user_id = @userId
  `).get({ userId }) as { credits: number };
  return row.credits ?? 0;
}

function syncStoredVoidCredits(userId: string, now: string = new Date().toISOString()): number {
  const credits = getStoredVoidCredits(userId);
  db.prepare(`
    INSERT INTO entitlements
      (user_id, is_vip, annual_report_owned, area_reports_owned, void_credits, vip_void_credits, vip_void_cycle, updated_at)
    VALUES
      (@userId, 0, 0, 0, @credits, 0, NULL, @now)
    ON CONFLICT(user_id) DO UPDATE SET
      void_credits = @credits,
      updated_at = @now
  `).run({ userId, credits, now });
  return credits;
}

function findExistingVoidCreditGrant(userId: string, options: VoidCreditGrantOptions): string | null {
  const clauses: string[] = [];
  const params: Record<string, string> = { userId };

  if (options.orderId) {
    clauses.push("order_id = @orderId");
    params.orderId = options.orderId;
  }

  if (options.transactionId) {
    clauses.push("transaction_id = @transactionId");
    params.transactionId = options.transactionId;
  }

  if (options.purchaseToken) {
    clauses.push("purchase_token = @purchaseToken");
    params.purchaseToken = options.purchaseToken;
  }

  if (clauses.length === 0) {
    return null;
  }

  const row = db.prepare(`
    SELECT id
    FROM void_credit_ledger
    WHERE user_id = @userId AND (${clauses.join(" OR ")})
    ORDER BY created_at DESC
    LIMIT 1
  `).get(params) as { id: string } | undefined;

  return row?.id ?? null;
}

function insertVoidCreditLedgerEntry(
  userId: string,
  credits: number,
  options: VoidCreditGrantOptions = {},
): string {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const sourceType = options.sourceType ?? "manual";
  const skuId = options.skuId ?? VOID_SINGLE;

  db.prepare(`
    INSERT INTO void_credit_ledger
      (id, user_id, order_id, sku_id, transaction_id, purchase_token, source_type, total_credits, consumed_credits, refunded_credits, status, created_at, updated_at)
    VALUES
      (@id, @userId, @orderId, @skuId, @transactionId, @purchaseToken, @sourceType, @credits, 0, 0, 'active', @now, @now)
  `).run({
    id,
    userId,
    orderId: options.orderId ?? null,
    skuId,
    transactionId: options.transactionId ?? null,
    purchaseToken: options.purchaseToken ?? null,
    sourceType,
    credits,
    now,
  });

  return id;
}

function getRefundableVoidCreditGrants(
  userId: string,
  lookup: VoidCreditRefundLookup,
): VoidCreditLedgerRow[] {
  const clauses: string[] = [];
  const params: Record<string, string> = { userId };

  if (lookup.orderId) {
    clauses.push("order_id = @orderId");
    params.orderId = lookup.orderId;
  }

  if (lookup.transactionId) {
    clauses.push("transaction_id = @transactionId");
    params.transactionId = lookup.transactionId;
  }

  if (lookup.purchaseToken) {
    clauses.push("purchase_token = @purchaseToken");
    params.purchaseToken = lookup.purchaseToken;
  }

  if (clauses.length === 0) {
    return [];
  }

  return db.prepare(`
    SELECT *
    FROM void_credit_ledger
    WHERE user_id = @userId
      AND (${clauses.join(" OR ")})
    ORDER BY created_at DESC, id DESC
  `).all(params) as VoidCreditLedgerRow[];
}

function mapRow(row: EntitlementRow): Entitlement {
  const syncedRow = syncVipMonthlyCredits(row);
  return {
    userId:            syncedRow.user_id,
    isVip:             syncedRow.is_vip === 1,
    vipSource:         syncedRow.vip_source,
    vipExpiresAt:      syncedRow.vip_expires_at,
    vipGraceUntil:     syncedRow.vip_grace_until,
    annualReportOwned: syncedRow.annual_report_owned,
    areaReportsOwned:  syncedRow.area_reports_owned,
    voidCredits:       effectiveVoidCredits(syncedRow),
    updatedAt:         syncedRow.updated_at,
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

  if (!row) return false;
  return isVipRowActive(row);
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
  const cycle = getCurrentKstVipCycle(purchasedAt);

  if (source !== "admin") {
    const exp = overrideExpiresAt ?? calcVipExpiry(source, purchasedAt);
    expiresAt  = exp.toISOString();
    graceUntil = calcGraceUntil(exp).toISOString();
  }

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO entitlements
      (user_id, is_vip, vip_source, vip_expires_at, vip_grace_until, annual_report_owned, area_reports_owned, void_credits, vip_void_credits, vip_void_cycle, updated_at)
    VALUES
      (@userId, 1, @source, @expiresAt, @graceUntil, 0, 0, 0, @vipVoidCredits, @vipVoidCycle, @now)
    ON CONFLICT(user_id) DO UPDATE SET
      is_vip          = 1,
      vip_source      = @source,
      vip_expires_at  = @expiresAt,
      vip_grace_until = @graceUntil,
      vip_void_credits = CASE
        WHEN @source = 'admin' THEN vip_void_credits
        WHEN is_vip = 1 AND vip_void_cycle = @vipVoidCycle THEN vip_void_credits
        ELSE @vipVoidCredits
      END,
      vip_void_cycle = CASE
        WHEN @source = 'admin' THEN vip_void_cycle
        ELSE @vipVoidCycle
      END,
      updated_at      = @now
  `).run({
    userId,
    source,
    expiresAt,
    graceUntil,
    vipVoidCredits: source === "admin" ? 0 : VIP_MONTHLY_VOID_CREDITS,
    vipVoidCycle: source === "admin" ? null : cycle,
    now,
  });
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
  const cycle = getCurrentKstVipCycle();
  db.prepare(`
    INSERT INTO entitlements
      (user_id, is_vip, vip_source, vip_expires_at, vip_grace_until, annual_report_owned, area_reports_owned, void_credits, vip_void_credits, vip_void_cycle, updated_at)
    VALUES
      (@userId, 1, @source, @expiresAt, @graceUntil, 0, 0, 0, @vipVoidCredits, @vipVoidCycle, @now)
    ON CONFLICT(user_id) DO UPDATE SET
      is_vip          = 1,
      vip_source      = @source,
      vip_expires_at  = MAX(vip_expires_at, @expiresAt),
      vip_grace_until = @graceUntil,
      vip_void_credits = CASE
        WHEN vip_void_cycle = @vipVoidCycle THEN vip_void_credits
        ELSE @vipVoidCredits
      END,
      vip_void_cycle = @vipVoidCycle,
      updated_at      = @now
  `).run({
    userId,
    source,
    expiresAt: newExpiresAt.toISOString(),
    graceUntil,
    vipVoidCredits: VIP_MONTHLY_VOID_CREDITS,
    vipVoidCycle: cycle,
    now,
  });
}

/**
 * Revoke VIP (cancellation / refund / expiry confirmed).
 * Keeps the row but clears VIP flag.
 */
export function revokeVip(userId: string): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO entitlements (user_id, is_vip, annual_report_owned, area_reports_owned, void_credits, vip_void_credits, vip_void_cycle, updated_at)
    VALUES (@userId, 0, 0, 0, 0, 0, NULL, @now)
    ON CONFLICT(user_id) DO UPDATE SET
      is_vip          = 0,
      vip_expires_at  = NULL,
      vip_grace_until = NULL,
      vip_void_credits = 0,
      vip_void_cycle = NULL,
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

export function revokeAnnualReport(userId: string): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO entitlements (user_id, is_vip, annual_report_owned, area_reports_owned, void_credits, vip_void_credits, vip_void_cycle, updated_at)
    VALUES (@userId, 0, 0, 0, 0, 0, NULL, @now)
    ON CONFLICT(user_id) DO UPDATE SET
      annual_report_owned = CASE WHEN annual_report_owned > 0 THEN annual_report_owned - 1 ELSE 0 END,
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

export function revokeAreaReading(userId: string, count = 1): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO entitlements (user_id, is_vip, annual_report_owned, area_reports_owned, void_credits, vip_void_credits, vip_void_cycle, updated_at)
    VALUES (@userId, 0, 0, 0, 0, 0, NULL, @now)
    ON CONFLICT(user_id) DO UPDATE SET
      area_reports_owned = CASE
        WHEN area_reports_owned - @count > 0 THEN area_reports_owned - @count
        ELSE 0
      END,
      updated_at = @now
  `).run({ userId, count, now });
}

export function addVoidCredits(
  userId: string,
  credits: number,
  options: VoidCreditGrantOptions = {},
): void {
  if (credits <= 0) {
    return;
  }

  if ((options.sourceType ?? "purchase") === "purchase") {
    const existingId = findExistingVoidCreditGrant(userId, options);
    if (existingId) {
      syncStoredVoidCredits(userId);
      return;
    }
  }

  insertVoidCreditLedgerEntry(userId, credits, {
    ...options,
    sourceType: options.sourceType ?? (options.orderId || options.transactionId || options.purchaseToken ? "purchase" : "manual"),
  });
  syncStoredVoidCredits(userId);
}

export function grantStarterVoidCredits(userId: string, credits: number = STARTER_VOID_CREDITS): boolean {
  const now = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO entitlements (user_id, is_vip, annual_report_owned, area_reports_owned, void_credits, vip_void_credits, vip_void_cycle, updated_at)
    VALUES (@userId, 0, 0, 0, 0, 0, NULL, @now)
    ON CONFLICT(user_id) DO NOTHING
  `).run({ userId, now });

  if (result.changes > 0) {
    insertVoidCreditLedgerEntry(userId, credits, {
      skuId: VOID_SINGLE,
      sourceType: "starter",
    });
    syncStoredVoidCredits(userId, now);
  }

  return result.changes > 0;
}

export function refundVoidCredits(
  userId: string,
  lookup: VoidCreditRefundLookup,
): number {
  const grants = getRefundableVoidCreditGrants(userId, lookup);
  if (grants.length === 0) {
    return 0;
  }

  const now = new Date().toISOString();
  let refundedCredits = 0;

  const transaction = db.transaction(() => {
    for (const grant of grants) {
      const availableCredits = Math.max(
        0,
        grant.total_credits - grant.consumed_credits - grant.refunded_credits,
      );

      if (availableCredits <= 0) {
        continue;
      }

      db.prepare(`
        UPDATE void_credit_ledger
        SET refunded_credits = refunded_credits + @credits,
            status = CASE
              WHEN total_credits <= consumed_credits + refunded_credits + @credits
                THEN CASE WHEN consumed_credits > 0 THEN 'exhausted' ELSE 'refunded' END
              ELSE status
            END,
            updated_at = @now
        WHERE id = @id
      `).run({
        id: grant.id,
        credits: availableCredits,
        now,
      });

      refundedCredits += availableCredits;
    }

    syncStoredVoidCredits(userId, now);
  });

  transaction();

  return refundedCredits;
}

/**
 * Attempt to consume 1 VOID credit. Returns true if successful (had ≥1 credit).
 */
export function consumeVoidCredit(userId: string): boolean {
  const row = db.prepare("SELECT * FROM entitlements WHERE user_id = @userId").get({ userId }) as EntitlementRow | undefined;
  if (!row) return false;

  const syncedRow = syncVipMonthlyCredits(row);
  if (shouldUseVipMonthlyCredits(syncedRow) && syncedRow.vip_void_credits > 0) {
    const vipResult = db.prepare(`
      UPDATE entitlements
      SET vip_void_credits = vip_void_credits - 1,
          updated_at = datetime('now')
      WHERE user_id = @userId AND vip_void_credits > 0
    `).run({ userId });
    if (vipResult.changes > 0) {
      return true;
    }
  }

  let consumed = false;
  const now = new Date().toISOString();

  const consumePurchaseCredit = db.transaction(() => {
    const grants = db.prepare(`
      SELECT *
      FROM void_credit_ledger
      WHERE user_id = @userId
        AND total_credits > consumed_credits + refunded_credits
      ORDER BY created_at ASC, id ASC
    `).all({ userId }) as VoidCreditLedgerRow[];

    for (const grant of grants) {
      const result = db.prepare(`
        UPDATE void_credit_ledger
        SET consumed_credits = consumed_credits + 1,
            status = CASE
              WHEN total_credits <= consumed_credits + refunded_credits + 1 THEN 'exhausted'
              ELSE status
            END,
            updated_at = @now
        WHERE id = @id
          AND total_credits > consumed_credits + refunded_credits
      `).run({ id: grant.id, now });

      if (result.changes > 0) {
        consumed = true;
        break;
      }
    }

    syncStoredVoidCredits(userId, now);
  });

  consumePurchaseCredit();
  return consumed;
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
  options: {
    skipIfAlreadyGranted?: boolean;
    orderId?: string | null;
    transactionId?: string | null;
    purchaseToken?: string | null;
    sourceType?: VoidCreditSourceType;
  } = {},
): void {
  const { skipIfAlreadyGranted = false } = options;

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
    case VOID_SINGLE:
      addVoidCredits(userId, 1, { ...options, skuId, sourceType: options.sourceType ?? "purchase" });
      break;
    case VOID_PACK_5:
      addVoidCredits(userId, 5, { ...options, skuId, sourceType: options.sourceType ?? "purchase" });
      break;
    case VOID_PACK_3:
      addVoidCredits(userId, 3, { ...options, skuId, sourceType: options.sourceType ?? "purchase" });
      break;
    case VOID_PACK_10:
      addVoidCredits(userId, 10, { ...options, skuId, sourceType: options.sourceType ?? "purchase" });
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
      original_transaction_id = COALESCE(@originalTransactionId, original_transaction_id),
      purchase_token = COALESCE(@purchaseToken, purchase_token),
      status       = @status,
      purchase_date = COALESCE(@purchaseDate, purchase_date),
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
      SUM(
        void_credits +
        CASE
          WHEN is_vip = 1
            AND vip_source != 'admin'
            AND (vip_expires_at IS NULL OR vip_expires_at > @now OR (vip_grace_until IS NOT NULL AND vip_grace_until > @now))
          THEN vip_void_credits
          ELSE 0
        END
      )                                                            AS totalVoidCredits
    FROM entitlements
  `).get({ now }) as Record<string, number | null>;

  // void pack buyers: count users who ever bought a void pack via iap_receipts
  const voidBuyers = (db.prepare(`
    SELECT COUNT(DISTINCT user_id) AS n FROM iap_receipts
    WHERE sku_id IN ('void_single','void_pack_5','void_pack_3','void_pack_10') AND status = 'valid'
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

export async function getRevenueMetrics(): Promise<RevenueMetrics> {
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
  const totalUsers = await countStoredAuthAccounts();

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
