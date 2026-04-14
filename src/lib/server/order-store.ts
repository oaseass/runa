import crypto from "node:crypto";
import { db } from "./db";

// ── Product catalogue (new unified SKUs) ──────────────────────────────────────

/** @deprecated Use SKUS from @/lib/products instead */
export const PRODUCTS = {
  // Legacy IDs (kept for DB/URL compatibility)
  yearly:     { name: "2026 연간 리포트", amount:  3_000 },
  area:       { name: "영역 보고서",       amount:  3_000 },
  question:   { name: "VOID 1회권",        amount:    500 },
  membership: { name: "LUNA 멤버십",       amount: 19_900 },
  // New SKU IDs
  vip_monthly:   { name: "LUNA VIP 월간",     amount:  9_900 },
  vip_yearly:    { name: "LUNA VIP 연간",     amount: 79_000 },
  annual_report: { name: "2026 연간 리포트",  amount:  3_000 },
  area_reading:  { name: "영역 보고서",        amount:  3_000 },
  void_single:   { name: "VOID 1회권",         amount:    500 },
  void_pack_5:   { name: "VOID 5회권",         amount:  1_500 },
  void_pack_3:   { name: "VOID 3회권",         amount:  1_500 },
  void_pack_10:  { name: "VOID 10회권",        amount:  5_000 },
} as const;

export type ProductId = keyof typeof PRODUCTS;

export function isValidProductId(v: unknown): v is ProductId {
  return typeof v === "string" && v in PRODUCTS;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type OrderMetadata = {
  questionText?: string;
  category?: string;
  questionType?: string;
  chartHash?: string | null;
};

export type OrderStatus = "pending" | "paid" | "failed" | "cancelled" | "refunded";

export type Order = {
  id: string;
  userId: string;
  productId: ProductId;
  amount: number;
  status: OrderStatus;
  metadata: OrderMetadata | null;
  paymentKey: string | null;
  paymentType: string | null;
  providerRef: string | null;
  analysisId: string | null;
  reportJson: string | null;
  paidAt: string | null;
  refundedAt: string | null;
  refundAmount: number;
  refundReason: string | null;
  refundSource: string | null;
  refundReference: string | null;
  failCode: string | null;
  failMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

type DbRow = {
  id: string;
  user_id: string;
  product_id: string;
  amount: number;
  status: string;
  metadata: string | null;
  payment_key: string | null;
  payment_type: string | null;
  provider_ref: string | null;
  analysis_id: string | null;
  report_json: string | null;
  paid_at: string | null;
  refunded_at: string | null;
  refund_amount: number;
  refund_reason: string | null;
  refund_source: string | null;
  refund_reference: string | null;
  fail_code: string | null;
  fail_message: string | null;
  created_at: string;
  updated_at: string;
};

function rowToOrder(row: DbRow): Order {
  return {
    id: row.id,
    userId: row.user_id,
    productId: row.product_id as ProductId,
    amount: row.amount,
    status: row.status as OrderStatus,
    metadata: row.metadata ? (JSON.parse(row.metadata) as OrderMetadata) : null,
    paymentKey: row.payment_key,
    paymentType: row.payment_type,
    providerRef: row.provider_ref,
    analysisId: row.analysis_id,
    reportJson: row.report_json,
    paidAt: row.paid_at,
    refundedAt: row.refunded_at,
    refundAmount: row.refund_amount,
    refundReason: row.refund_reason,
    refundSource: row.refund_source,
    refundReference: row.refund_reference,
    failCode: row.fail_code,
    failMessage: row.fail_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export function createOrder(
  userId: string,
  productId: ProductId,
  metadata?: OrderMetadata,
): Order {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO orders
      (id, user_id, product_id, amount, status, metadata, created_at, updated_at)
    VALUES
      (@id, @userId, @productId, @amount, 'pending', @metadata, @now, @now)
  `).run({
    id,
    userId,
    productId,
    amount: PRODUCTS[productId].amount,
    metadata: metadata ? JSON.stringify(metadata) : null,
    now,
  });

  return getOrder(id)!;
}

export function getOrder(id: string): Order | null {
  const row = db
    .prepare("SELECT * FROM orders WHERE id = @id")
    .get({ id }) as DbRow | undefined;
  return row ? rowToOrder(row) : null;
}

export function markOrderPaid(
  id: string,
  paymentKey: string,
  paymentType: string,
  providerRef?: string | null,
): void {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE orders SET
      status = 'paid',
      payment_key = @paymentKey,
      payment_type = @paymentType,
      provider_ref = COALESCE(@providerRef, provider_ref),
      paid_at = @now,
      updated_at = @now
    WHERE id = @id
  `).run({ id, paymentKey, paymentType, providerRef: providerRef ?? null, now });
}

export function setOrderProviderRef(id: string, providerRef: string): void {
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE orders SET provider_ref = @providerRef, updated_at = @now WHERE id = @id",
  ).run({ id, providerRef, now });
}

export function setOrderAnalysisId(id: string, analysisId: string): void {
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE orders SET analysis_id = @analysisId, updated_at = @now WHERE id = @id",
  ).run({ id, analysisId, now });
}

export function setOrderReportJson(id: string, reportJson: string): void {
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE orders SET report_json = @reportJson, updated_at = @now WHERE id = @id",
  ).run({ id, reportJson, now });
}

export function getPaidProductIds(userId: string): Set<ProductId> {
  const rows = db
    .prepare("SELECT product_id FROM orders WHERE user_id = @userId AND status = 'paid'")
    .all({ userId }) as { product_id: string }[];
  return new Set(rows.map((r) => r.product_id as ProductId));
}

export function getLatestPaidOrderByProduct(
  userId: string,
  productId: ProductId,
): Order | null {
  const row = db
    .prepare(
      `SELECT * FROM orders
       WHERE user_id = @userId AND product_id = @productId AND status = 'paid'
       ORDER BY paid_at DESC LIMIT 1`,
    )
    .get({ userId, productId }) as DbRow | undefined;
  return row ? rowToOrder(row) : null;
}

export function getLatestPaidOrderByProducts(
  userId: string,
  productIds: ProductId[],
): Order | null {
  if (productIds.length === 0) {
    return null;
  }

  const placeholders = productIds.map((_, index) => `@productId${index}`).join(", ");
  const params = productIds.reduce<Record<string, string>>((acc, productId, index) => {
    acc[`productId${index}`] = productId;
    return acc;
  }, { userId });

  const row = db
    .prepare(
      `SELECT * FROM orders
       WHERE user_id = @userId AND status = 'paid' AND product_id IN (${placeholders})
       ORDER BY paid_at DESC, updated_at DESC
       LIMIT 1`,
    )
    .get(params) as DbRow | undefined;

  return row ? rowToOrder(row) : null;
}

export function markOrderFailed(
  id: string,
  code: string,
  message: string,
): void {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE orders SET
      status = 'failed',
      fail_code = @code,
      fail_message = @message,
      updated_at = @now
    WHERE id = @id
  `).run({ id, code, message, now });
}

export function markOrderCancelled(id: string, reason?: string | null): void {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE orders SET
      status = 'cancelled',
      refund_reason = COALESCE(@reason, refund_reason),
      updated_at = @now
    WHERE id = @id
  `).run({ id, reason: reason ?? null, now });
}

export function markOrderRefunded(
  id: string,
  options: {
    amount: number;
    reason?: string | null;
    source?: string | null;
    reference?: string | null;
  },
): void {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE orders SET
      status = 'refunded',
      refunded_at = @now,
      refund_amount = @amount,
      refund_reason = COALESCE(@reason, refund_reason),
      refund_source = COALESCE(@source, refund_source),
      refund_reference = COALESCE(@reference, refund_reference),
      updated_at = @now
    WHERE id = @id
  `).run({
    id,
    amount: options.amount,
    reason: options.reason ?? null,
    source: options.source ?? null,
    reference: options.reference ?? null,
    now,
  });
}

export function getOrderByAnalysisId(
  analysisId: string,
  userId?: string,
): Order | null {
  const query = userId
    ? "SELECT * FROM orders WHERE analysis_id = @analysisId AND user_id = @userId ORDER BY updated_at DESC LIMIT 1"
    : "SELECT * FROM orders WHERE analysis_id = @analysisId ORDER BY updated_at DESC LIMIT 1";
  const row = db.prepare(query).get({ analysisId, userId }) as DbRow | undefined;
  return row ? rowToOrder(row) : null;
}

/* ── VIP Status ───────────────────────────────────────────────────────────── */

/** VIP 판정 기준: membership 또는 yearly 상품이 paid 상태. */
export const VIP_PRODUCT_IDS = ["membership", "yearly"] as const;

export type VipStatus = {
  isVip: boolean;
  productId: string | null;  // VIP 근거 상품
  paidAt: string | null;     // VIP 획득 시각
};

export function getVipStatus(userId: string): VipStatus {
  const row = db
    .prepare(
      `SELECT product_id, paid_at
       FROM orders
       WHERE user_id = @userId
         AND status = 'paid'
         AND product_id IN ('membership', 'yearly')
       ORDER BY paid_at DESC
       LIMIT 1`,
    )
    .get({ userId }) as { product_id: string; paid_at: string } | undefined;

  return {
    isVip:     !!row,
    productId: row?.product_id ?? null,
    paidAt:    row?.paid_at    ?? null,
  };
}

