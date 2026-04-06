import crypto from "node:crypto";
import { db } from "./db";

// ── Product catalogue (new unified SKUs) ──────────────────────────────────────

/** @deprecated Use SKUS from @/lib/products instead */
export const PRODUCTS = {
  // Legacy IDs (kept for DB/URL compatibility)
  yearly:     { name: "2026 연간 리포트", amount: 29_000 },
  area:       { name: "영역 보고서",       amount:  9_900 },
  question:   { name: "Void 질문 보고서",  amount:  4_900 },
  membership: { name: "LUNA 멤버십",       amount: 19_900 },
  // New SKU IDs
  vip_monthly:   { name: "LUNA VIP 월간",     amount:  9_900 },
  vip_yearly:    { name: "LUNA VIP 연간",     amount: 79_000 },
  annual_report: { name: "2026 연간 리포트",  amount: 14_900 },
  area_reading:  { name: "영역 보고서",        amount:  9_900 },
  void_pack_3:   { name: "VOID 3회권",         amount:  4_900 },
  void_pack_10:  { name: "VOID 10회권",        amount: 14_900 },
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

export type OrderStatus = "pending" | "paid" | "failed" | "cancelled";

export type Order = {
  id: string;
  userId: string;
  productId: ProductId;
  amount: number;
  status: OrderStatus;
  metadata: OrderMetadata | null;
  paymentKey: string | null;
  paymentType: string | null;
  analysisId: string | null;
  reportJson: string | null;
  paidAt: string | null;
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
  analysis_id: string | null;
  report_json: string | null;
  paid_at: string | null;
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
    analysisId: row.analysis_id,
    reportJson: row.report_json,
    paidAt: row.paid_at,
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
): void {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE orders SET
      status = 'paid',
      payment_key = @paymentKey,
      payment_type = @paymentType,
      paid_at = @now,
      updated_at = @now
    WHERE id = @id
  `).run({ id, paymentKey, paymentType, now });
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

