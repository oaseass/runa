import { NextResponse } from "next/server";
import {
  grantVip,
  renewVip,
  setVipGrace,
  recordIapReceipt,
} from "@/lib/server/entitlement-store";
import {
  APPLE_TO_SKU,
  decodeJwsPayload,
  verifyAppleSignedPayload,
} from "@/lib/server/apple-jws";
import {
  applyLocalRefund,
  deactivateSubscriptionAccess,
  resolveReceiptRefundContext,
} from "@/lib/server/refund-service";
import { VIP_MONTHLY, VIP_YEARLY, type SubscriptionSkuId } from "@/lib/products";

type AppleNotificationEnvelope = {
  notificationType?: string;
  subtype?: string;
  data?: {
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
  };
};

type AppleTransactionInfo = {
  productId?: string;
  transactionId?: string;
  originalTransactionId?: string;
  purchaseDate?: string | number;
  expiresDate?: string | number;
};

type AppleRenewalInfo = {
  gracePeriodExpiresDate?: string | number;
};

function readSignedApplePayload<T>(signedPayload: string): T | null {
  const verified = verifyAppleSignedPayload<T>(signedPayload);
  if (verified) {
    return verified;
  }

  if (process.env.APPLE_ALLOW_UNSIGNED_NOTIFICATIONS === "true") {
    return decodeJwsPayload<T>(signedPayload);
  }

  return null;
}

function toDate(value: unknown): Date | undefined {
  if (typeof value === "number") {
    return new Date(value);
  }

  if (typeof value === "string") {
    if (/^\d+$/.test(value)) {
      return new Date(Number(value));
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return undefined;
}

function isSubscriptionSku(skuId: string): skuId is SubscriptionSkuId {
  return skuId === VIP_MONTHLY || skuId === VIP_YEARLY;
}

export async function POST(request: Request) {
  let body: { signedPayload?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.signedPayload) {
    return NextResponse.json({ error: "signedPayload required" }, { status: 400 });
  }

  const payload = readSignedApplePayload<AppleNotificationEnvelope>(body.signedPayload);
  if (!payload) {
    return NextResponse.json({ error: "invalid signedPayload" }, { status: 422 });
  }

  const signedTransactionInfo = payload.data?.signedTransactionInfo;
  const signedRenewalInfo = payload.data?.signedRenewalInfo;

  const transaction = signedTransactionInfo
    ? readSignedApplePayload<AppleTransactionInfo>(signedTransactionInfo)
    : null;
  const renewal = signedRenewalInfo
    ? readSignedApplePayload<AppleRenewalInfo>(signedRenewalInfo)
    : null;

  if (!transaction?.productId || !transaction.transactionId) {
    return NextResponse.json({ ok: true, warning: "no_transaction_info" });
  }

  const skuId = APPLE_TO_SKU[transaction.productId];
  if (!skuId) {
    return NextResponse.json({ ok: true, warning: "unknown_sku" });
  }

  const context = resolveReceiptRefundContext({
    platform: "apple",
    transactionId: transaction.transactionId,
    originalTransactionId: transaction.originalTransactionId,
    skuId,
  });

  if (!context) {
    return NextResponse.json({ ok: true, warning: "unknown_receipt" });
  }

  const purchaseDate = toDate(transaction.purchaseDate) ?? new Date();
  const expiresAt = toDate(transaction.expiresDate);
  const rawResponse = JSON.stringify(payload);
  const notificationType = payload.notificationType ?? "UNKNOWN";

  switch (notificationType) {
    case "SUBSCRIBED":
      if (isSubscriptionSku(skuId)) {
        grantVip(context.userId, skuId, purchaseDate, expiresAt);
        recordIapReceipt({
          userId: context.userId,
          platform: "apple",
          skuId,
          transactionId: context.transactionId ?? transaction.transactionId,
          originalTransactionId: context.originalTransactionId ?? transaction.originalTransactionId,
          status: "valid",
          purchaseDate: purchaseDate.toISOString(),
          expiresDate: expiresAt?.toISOString(),
          rawResponse,
        });
      }
      break;
    case "DID_RENEW":
    case "RENEWAL_EXTENDED":
      if (isSubscriptionSku(skuId) && expiresAt) {
        renewVip(context.userId, skuId, expiresAt);
        recordIapReceipt({
          userId: context.userId,
          platform: "apple",
          skuId,
          transactionId: context.transactionId ?? transaction.transactionId,
          originalTransactionId: context.originalTransactionId ?? transaction.originalTransactionId,
          status: "valid",
          purchaseDate: purchaseDate.toISOString(),
          expiresDate: expiresAt.toISOString(),
          rawResponse,
        });
      }
      break;
    case "DID_FAIL_TO_RENEW":
      if (isSubscriptionSku(skuId)) {
        const graceUntil = toDate(renewal?.gracePeriodExpiresDate) ?? new Date(Date.now() + 16 * 24 * 60 * 60 * 1000);
        setVipGrace(context.userId, graceUntil);
        recordIapReceipt({
          userId: context.userId,
          platform: "apple",
          skuId,
          transactionId: context.transactionId ?? transaction.transactionId,
          originalTransactionId: context.originalTransactionId ?? transaction.originalTransactionId,
          status: "cancelled",
          purchaseDate: purchaseDate.toISOString(),
          expiresDate: graceUntil.toISOString(),
          rawResponse,
        });
      }
      break;
    case "EXPIRED":
      if (isSubscriptionSku(skuId)) {
        deactivateSubscriptionAccess({
          userId: context.userId,
          skuId,
          platform: "apple",
          status: "expired",
          reason: "Apple 구독 만료",
          transactionId: context.transactionId,
          originalTransactionId: context.originalTransactionId,
          rawResponse,
        });
      }
      break;
    case "REFUND":
    case "REVOKE":
      applyLocalRefund({
        userId: context.userId,
        skuId: context.skuId,
        source: "apple",
        reason: notificationType === "REFUND" ? "Apple 환불" : "Apple 회수",
        orderId: context.orderId,
        externalRef: context.originalTransactionId ?? context.transactionId,
        transactionId: context.transactionId,
        originalTransactionId: context.originalTransactionId,
        receiptPlatform: "apple",
        rawResponse,
      });
      break;
    default:
      break;
  }

  return NextResponse.json({ ok: true });
}