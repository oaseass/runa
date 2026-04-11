import crypto from "node:crypto";
import {
  ANNUAL_REPORT,
  AREA_READING,
  LEGACY_TO_SKU,
  VIP_MONTHLY,
  VIP_YEARLY,
  VOID_PACK_10,
  VOID_PACK_3,
  VOID_PACK_5,
  VOID_SINGLE,
  isValidSkuId,
  type SkuId,
} from "@/lib/products";
import { db } from "./db";
import {
  getEntitlement,
  recordIapReceipt,
  refundVoidCredits,
  revokeAnnualReport,
  revokeAreaReading,
  revokeVip,
  type Entitlement,
} from "./entitlement-store";
import {
  getOrder,
  markOrderCancelled,
  markOrderRefunded,
  type Order,
} from "./order-store";

type ReceiptPlatform = "apple" | "google" | "toss";

export type RefundSource = "toss" | "apple" | "google" | "admin" | "dev" | "system";

type ReceiptRow = {
  user_id: string;
  sku_id: string;
  transaction_id: string;
  original_transaction_id: string | null;
  purchase_token: string | null;
  purchase_date: string | null;
  expires_date: string | null;
  raw_response: string | null;
};

export type RefundOutcome = {
  order: Order | null;
  entitlement: Entitlement;
  refundedVoidCredits: number;
  eventId: string | null;
  alreadyProcessed: boolean;
};

type ReceiptLookup = {
  transactionId?: string | null;
  originalTransactionId?: string | null;
  purchaseToken?: string | null;
};

type RefundEventLookup = ReceiptLookup & {
  orderId?: string | null;
  externalRef?: string | null;
};

type ApplyLocalRefundInput = {
  userId: string;
  skuId: SkuId;
  source: RefundSource;
  reason: string;
  orderId?: string | null;
  amount?: number;
  externalRef?: string | null;
  transactionId?: string | null;
  originalTransactionId?: string | null;
  purchaseToken?: string | null;
  receiptPlatform?: ReceiptPlatform;
  rawResponse?: string;
};

export class RefundServiceError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

type TossCancelOk = {
  paymentKey: string;
  cancels?: Array<{
    transactionKey?: string;
    cancelReason?: string;
    canceledAt?: string;
    cancelAmount?: number;
  }>;
  totalCancelAmount?: number;
};

type TossCancelErr = {
  code?: string;
  message?: string;
};

function resolveOrderSkuId(productId: string): SkuId | null {
  const legacySkuId = LEGACY_TO_SKU[productId];
  return legacySkuId ?? (isValidSkuId(productId) ? productId : null);
}

function getOrderProductIdsForSku(skuId: SkuId): string[] {
  switch (skuId) {
    case VIP_MONTHLY:
      return ["membership", "vip_monthly"];
    case VIP_YEARLY:
      return ["vip_yearly"];
    case ANNUAL_REPORT:
      return ["yearly", "annual_report"];
    case AREA_READING:
      return ["area", "area_reading"];
    case VOID_SINGLE:
      return ["question", "void_single"];
    case VOID_PACK_5:
      return ["void_pack_5"];
    case VOID_PACK_3:
      return ["void_pack_3"];
    case VOID_PACK_10:
      return ["void_pack_10"];
    default:
      return [skuId];
  }
}

function buildReceiptWhereClauses(lookup: ReceiptLookup, params: Record<string, string>) {
  const clauses: string[] = [];

  if (lookup.transactionId) {
    clauses.push("transaction_id = @transactionId");
    params.transactionId = lookup.transactionId;
  }

  if (lookup.originalTransactionId) {
    clauses.push("original_transaction_id = @originalTransactionId");
    params.originalTransactionId = lookup.originalTransactionId;
  }

  if (lookup.purchaseToken) {
    clauses.push("purchase_token = @purchaseToken");
    params.purchaseToken = lookup.purchaseToken;
  }

  return clauses;
}

function findLatestReceipt(
  platform: ReceiptPlatform,
  lookup: ReceiptLookup,
): ReceiptRow | null {
  const params: Record<string, string> = { platform };
  const clauses = buildReceiptWhereClauses(lookup, params);

  if (clauses.length === 0) {
    return null;
  }

  const row = db.prepare(`
    SELECT user_id, sku_id, transaction_id, original_transaction_id, purchase_token, purchase_date, expires_date, raw_response
    FROM iap_receipts
    WHERE platform = @platform AND (${clauses.join(" OR ")})
    ORDER BY processed_at DESC
    LIMIT 1
  `).get(params) as ReceiptRow | undefined;

  return row ?? null;
}

function findRelatedOrderId(
  userId: string,
  skuId: SkuId,
  lookup: ReceiptLookup & { orderId?: string | null },
): string | null {
  if (lookup.orderId) {
    const directOrder = getOrder(lookup.orderId);
    if (directOrder?.userId === userId) {
      return directOrder.id;
    }
  }

  const products = getOrderProductIdsForSku(skuId);
  const productPlaceholders = products.map((_, index) => `@product${index}`).join(", ");
  const params: Record<string, string> = { userId };
  const refClauses: string[] = [];

  products.forEach((productId, index) => {
    params[`product${index}`] = productId;
  });

  if (lookup.transactionId) {
    refClauses.push("payment_key = @transactionId");
    refClauses.push("provider_ref = @transactionId");
    params.transactionId = lookup.transactionId;
  }

  if (lookup.originalTransactionId) {
    refClauses.push("payment_key = @originalTransactionId");
    refClauses.push("provider_ref = @originalTransactionId");
    params.originalTransactionId = lookup.originalTransactionId;
  }

  if (lookup.purchaseToken) {
    refClauses.push("provider_ref = @purchaseToken");
    params.purchaseToken = lookup.purchaseToken;
  }

  if (refClauses.length > 0) {
    const row = db.prepare(`
      SELECT id
      FROM orders
      WHERE user_id = @userId
        AND product_id IN (${productPlaceholders})
        AND status IN ('paid', 'cancelled')
        AND (${refClauses.join(" OR ")})
      ORDER BY paid_at DESC, updated_at DESC
      LIMIT 1
    `).get(params) as { id: string } | undefined;

    if (row?.id) {
      return row.id;
    }
  }

  if (skuId === VIP_MONTHLY || skuId === VIP_YEARLY) {
    const row = db.prepare(`
      SELECT id
      FROM orders
      WHERE user_id = @userId
        AND product_id IN (${productPlaceholders})
        AND status IN ('paid', 'cancelled')
      ORDER BY paid_at DESC, updated_at DESC
      LIMIT 1
    `).get(params) as { id: string } | undefined;

    return row?.id ?? null;
  }

  return null;
}

function hasRefundEvent(source: RefundSource, lookup: RefundEventLookup): boolean {
  const clauses: string[] = [];
  const params: Record<string, string> = { source };

  if (lookup.orderId) {
    clauses.push("order_id = @orderId");
    params.orderId = lookup.orderId;
  }

  if (lookup.externalRef) {
    clauses.push("external_ref = @externalRef");
    params.externalRef = lookup.externalRef;
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
    return false;
  }

  const row = db.prepare(`
    SELECT id
    FROM refund_events
    WHERE source = @source AND (${clauses.join(" OR ")})
    ORDER BY created_at DESC
    LIMIT 1
  `).get(params) as { id: string } | undefined;

  return !!row;
}

function createRefundEvent(input: {
  orderId?: string | null;
  userId: string;
  source: RefundSource;
  reason: string;
  amount: number;
  externalRef?: string | null;
  transactionId?: string | null;
  purchaseToken?: string | null;
  metadata?: string | null;
}): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO refund_events
      (id, order_id, user_id, source, reason, amount, status, external_ref, transaction_id, purchase_token, metadata, created_at, processed_at)
    VALUES
      (@id, @orderId, @userId, @source, @reason, @amount, 'completed', @externalRef, @transactionId, @purchaseToken, @metadata, @now, @now)
  `).run({
    id,
    orderId: input.orderId ?? null,
    userId: input.userId,
    source: input.source,
    reason: input.reason,
    amount: input.amount,
    externalRef: input.externalRef ?? null,
    transactionId: input.transactionId ?? null,
    purchaseToken: input.purchaseToken ?? null,
    metadata: input.metadata ?? null,
    now,
  });
  return id;
}

function syncReceiptStatus(input: {
  userId: string;
  skuId: SkuId;
  platform: ReceiptPlatform;
  status: "cancelled" | "expired" | "refunded";
  transactionId?: string | null;
  originalTransactionId?: string | null;
  purchaseToken?: string | null;
  rawResponse?: string;
}): void {
  const receipt = findLatestReceipt(input.platform, {
    transactionId: input.transactionId,
    originalTransactionId: input.originalTransactionId,
    purchaseToken: input.purchaseToken,
  });

  const transactionId = input.transactionId ?? receipt?.transaction_id ?? null;
  if (!transactionId) {
    return;
  }

  recordIapReceipt({
    userId: input.userId,
    platform: input.platform,
    skuId: input.skuId,
    transactionId,
    originalTransactionId: input.originalTransactionId ?? receipt?.original_transaction_id ?? undefined,
    purchaseToken: input.purchaseToken ?? receipt?.purchase_token ?? undefined,
    status: input.status,
    purchaseDate: receipt?.purchase_date ?? undefined,
    expiresDate: receipt?.expires_date ?? undefined,
    rawResponse: input.rawResponse ?? receipt?.raw_response ?? undefined,
  });
}

async function cancelTossPayment(
  paymentKey: string,
  reason: string,
): Promise<{ ok: true; data: TossCancelOk } | { ok: false; code: string; message: string }> {
  const secretKey = process.env.TOSS_SECRET_KEY ?? "";
  if (!secretKey) {
    return {
      ok: false,
      code: "TOSS_SECRET_MISSING",
      message: "Toss 환불 키가 설정되지 않았습니다.",
    };
  }

  const encoded = Buffer.from(`${secretKey}:`).toString("base64");

  let response: Response;
  try {
    response = await fetch(`https://api.tosspayments.com/v1/payments/${paymentKey}/cancel`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${encoded}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cancelReason: reason }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, code: "NETWORK_ERROR", message: "Toss 환불 호출에 실패했습니다." };
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as TossCancelErr;
    return {
      ok: false,
      code: errorBody.code ?? "TOSS_CANCEL_FAILED",
      message: errorBody.message ?? "결제 환불에 실패했습니다.",
    };
  }

  const data = (await response.json()) as TossCancelOk;
  return { ok: true, data };
}

export function canManuallyRefundOrder(
  order: Pick<Order, "status" | "paymentType" | "paymentKey">,
): boolean {
  if (order.status !== "paid") {
    return false;
  }

  if (!order.paymentKey) {
    return false;
  }

  return order.paymentType !== "APPLE_IAP" && order.paymentType !== "GOOGLE_IAP";
}

export function resolveReceiptRefundContext(input: {
  platform: ReceiptPlatform;
  transactionId?: string | null;
  originalTransactionId?: string | null;
  purchaseToken?: string | null;
  skuId?: SkuId | null;
}): {
  userId: string;
  skuId: SkuId;
  orderId: string | null;
  transactionId: string | null;
  originalTransactionId: string | null;
  purchaseToken: string | null;
  receipt: ReceiptRow | null;
} | null {
  const receipt = findLatestReceipt(input.platform, {
    transactionId: input.transactionId,
    originalTransactionId: input.originalTransactionId,
    purchaseToken: input.purchaseToken,
  });

  const resolvedSkuId = input.skuId ?? (receipt && isValidSkuId(receipt.sku_id) ? receipt.sku_id : null);
  if (!receipt || !resolvedSkuId) {
    return null;
  }

  const orderId = findRelatedOrderId(receipt.user_id, resolvedSkuId, {
    transactionId: input.transactionId ?? receipt.transaction_id,
    originalTransactionId: input.originalTransactionId ?? receipt.original_transaction_id,
    purchaseToken: input.purchaseToken ?? receipt.purchase_token,
  });

  return {
    userId: receipt.user_id,
    skuId: resolvedSkuId,
    orderId,
    transactionId: input.transactionId ?? receipt.transaction_id,
    originalTransactionId: input.originalTransactionId ?? receipt.original_transaction_id,
    purchaseToken: input.purchaseToken ?? receipt.purchase_token,
    receipt,
  };
}

export function applyLocalRefund(input: ApplyLocalRefundInput): RefundOutcome {
  const existingOrder = input.orderId ? getOrder(input.orderId) : null;
  if (existingOrder?.status === "refunded") {
    return {
      order: existingOrder,
      entitlement: getEntitlement(input.userId),
      refundedVoidCredits: 0,
      eventId: null,
      alreadyProcessed: true,
    };
  }

  if (hasRefundEvent(input.source, {
    orderId: input.orderId,
    externalRef: input.externalRef,
    transactionId: input.transactionId,
    purchaseToken: input.purchaseToken,
  })) {
    return {
      order: input.orderId ? getOrder(input.orderId) : null,
      entitlement: getEntitlement(input.userId),
      refundedVoidCredits: 0,
      eventId: null,
      alreadyProcessed: true,
    };
  }

  const amount = input.amount ?? existingOrder?.amount ?? 0;
  const applyRefund = db.transaction(() => {
    let refundedVoidCredits = 0;

    switch (input.skuId) {
      case VIP_MONTHLY:
      case VIP_YEARLY:
        revokeVip(input.userId);
        break;
      case ANNUAL_REPORT:
        revokeAnnualReport(input.userId);
        break;
      case AREA_READING:
        revokeAreaReading(input.userId, 1);
        break;
      case VOID_SINGLE:
      case VOID_PACK_5:
      case VOID_PACK_3:
      case VOID_PACK_10:
        refundedVoidCredits = refundVoidCredits(input.userId, {
          orderId: input.orderId,
          transactionId: input.transactionId,
          purchaseToken: input.purchaseToken,
        });
        break;
    }

    if (input.orderId) {
      markOrderRefunded(input.orderId, {
        amount,
        reason: input.reason,
        source: input.source,
        reference: input.externalRef ?? input.purchaseToken ?? input.transactionId ?? null,
      });
    }

    if (input.receiptPlatform) {
      syncReceiptStatus({
        userId: input.userId,
        skuId: input.skuId,
        platform: input.receiptPlatform,
        status: "refunded",
        transactionId: input.transactionId,
        originalTransactionId: input.originalTransactionId,
        purchaseToken: input.purchaseToken,
        rawResponse: input.rawResponse,
      });
    }

    const eventId = createRefundEvent({
      orderId: input.orderId,
      userId: input.userId,
      source: input.source,
      reason: input.reason,
      amount,
      externalRef: input.externalRef,
      transactionId: input.transactionId,
      purchaseToken: input.purchaseToken,
      metadata: input.rawResponse ?? null,
    });

    return { refundedVoidCredits, eventId };
  });

  const result = applyRefund();

  return {
    order: input.orderId ? getOrder(input.orderId) : null,
    entitlement: getEntitlement(input.userId),
    refundedVoidCredits: result.refundedVoidCredits,
    eventId: result.eventId,
    alreadyProcessed: false,
  };
}

export function deactivateSubscriptionAccess(input: {
  userId: string;
  skuId: typeof VIP_MONTHLY | typeof VIP_YEARLY;
  platform: "apple" | "google";
  status: "cancelled" | "expired";
  reason: string;
  transactionId?: string | null;
  originalTransactionId?: string | null;
  purchaseToken?: string | null;
  rawResponse?: string;
}): { order: Order | null; entitlement: Entitlement } {
  revokeVip(input.userId);

  const orderId = findRelatedOrderId(input.userId, input.skuId, {
    transactionId: input.transactionId,
    originalTransactionId: input.originalTransactionId,
    purchaseToken: input.purchaseToken,
  });

  if (orderId) {
    const order = getOrder(orderId);
    if (order && order.status !== "refunded") {
      markOrderCancelled(orderId, input.reason);
    }
  }

  syncReceiptStatus({
    userId: input.userId,
    skuId: input.skuId,
    platform: input.platform,
    status: input.status,
    transactionId: input.transactionId,
    originalTransactionId: input.originalTransactionId,
    purchaseToken: input.purchaseToken,
    rawResponse: input.rawResponse,
  });

  return {
    order: orderId ? getOrder(orderId) : null,
    entitlement: getEntitlement(input.userId),
  };
}

export async function refundWebOrder(orderId: string, reason: string): Promise<RefundOutcome> {
  const order = getOrder(orderId);
  if (!order) {
    throw new RefundServiceError("ORDER_NOT_FOUND", "주문을 찾을 수 없습니다.");
  }

  if (order.status === "refunded") {
    return {
      order,
      entitlement: getEntitlement(order.userId),
      refundedVoidCredits: 0,
      eventId: null,
      alreadyProcessed: true,
    };
  }

  if (!canManuallyRefundOrder(order)) {
    throw new RefundServiceError("ORDER_NOT_REFUNDABLE", "이 주문은 관리자 환불 대상이 아닙니다.");
  }

  const skuId = resolveOrderSkuId(order.productId);
  if (!skuId) {
    throw new RefundServiceError("UNKNOWN_SKU", "환불 가능한 상품을 판별하지 못했습니다.");
  }

  const paymentKey = order.paymentKey;
  if (!paymentKey) {
    throw new RefundServiceError("ORDER_NOT_REFUNDABLE", "결제 키가 없어 환불할 수 없습니다.");
  }

  const skipPayment = process.env.SKIP_PAYMENT === "true" || process.env.NEXT_PUBLIC_SKIP_PAYMENT === "true";
  const isDevPayment =
    skipPayment ||
    order.paymentType === "DEV" ||
    paymentKey.startsWith("dev_skip_") ||
    paymentKey.startsWith("test_");

  let externalRef = paymentKey;
  let rawResponse: string | undefined;

  if (!isDevPayment) {
    const cancelResult = await cancelTossPayment(paymentKey, reason);
    if (!cancelResult.ok) {
      throw new RefundServiceError(cancelResult.code, cancelResult.message);
    }

    externalRef = cancelResult.data.cancels?.[0]?.transactionKey ?? cancelResult.data.paymentKey;
    rawResponse = JSON.stringify(cancelResult.data);
  }

  return applyLocalRefund({
    userId: order.userId,
    skuId,
    source: isDevPayment ? "dev" : "toss",
    reason,
    orderId: order.id,
    amount: order.amount,
    externalRef,
    transactionId: paymentKey,
    receiptPlatform: "toss",
    rawResponse,
  });
}