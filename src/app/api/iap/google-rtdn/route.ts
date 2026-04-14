/**
 * POST /api/iap/google-rtdn
 * ─────────────────────────────────────────────────────────────────────────────
 * Google Play Real-Time Developer Notifications (RTDN) webhook.
 *
 * Google sends a Pub/Sub push message to this endpoint whenever a
 * subscription event occurs.
 *
 * Configure in Google Play Console → Monetization → Real-time developer notifications
 * with topic: projects/{project}/topics/{topic}
 * Push endpoint: https://your-domain.com/api/iap/google-rtdn
 *
 * Verification: Check the GOOGLE_RTDN_SECRET env var against the
 * X-Goog-Channel-Token header (set when creating the Pub/Sub subscription).
 */

import { NextResponse } from "next/server";
import { grantVip, renewVip, setVipGrace, recordIapReceipt } from "@/lib/server/entitlement-store";
import { db } from "@/lib/server/db";
import { VIP_MONTHLY, VIP_YEARLY } from "@/lib/products";
import type { SubscriptionSkuId } from "@/lib/products";
import { applyLocalRefund, deactivateSubscriptionAccess } from "@/lib/server/refund-service";

// ── Types ─────────────────────────────────────────────────────────────────────

type PubSubMessage = {
  message: {
    data:       string;   // base64-encoded JSON
    messageId:  string;
    attributes?: Record<string, string>;
  };
  subscription: string;
};

type RtdnPayload = {
  version?:                string;
  packageName?:            string;
  eventTimeMillis?:        string;
  subscriptionNotification?: {
    version:          string;
    notificationType: number;
    purchaseToken:    string;
    subscriptionId:   string;
  };
  oneTimeProductNotification?: {
    version:          string;
    notificationType: number;
    purchaseToken:    string;
    sku:              string;
  };
};

// Google subscription notification types
const SUB_NOTIFY = {
  RECOVERED:       1,
  RENEWED:         2,
  CANCELED:        3,
  PURCHASED:       4,
  ON_HOLD:         5,
  IN_GRACE_PERIOD: 6,
  RESTARTED:       7,
  PRICE_CHANGE:    8,
  DEFERRED:        9,
  PAUSED:          10,
  PAUSE_SCHEDULE:  11,
  REVOKED:         12,
  EXPIRED:         13,
} as const;

const GOOGLE_PACKAGE = process.env.GOOGLE_PACKAGE_NAME ?? "com.lunastar.app";

// ── Helper: get userId from purchase token in iap_receipts ────────────────────

function getUserIdByPurchaseToken(purchaseToken: string): string | null {
  const row = db.prepare(
    "SELECT user_id FROM iap_receipts WHERE purchase_token = @token LIMIT 1"
  ).get({ token: purchaseToken }) as { user_id: string } | undefined;
  return row?.user_id ?? null;
}

// ── Helper: resolve SkuId from Google subscriptionId ─────────────────────────

function resolveSubscriptionSku(subscriptionId: string): SubscriptionSkuId {
  // luna_vip with unknown base plan — try to look up from receipt record
  return subscriptionId.includes("yearly") ? VIP_YEARLY : VIP_MONTHLY;
}

// ── Verify Google credentials from service account ────────────────────────────

async function getAccessToken(): Promise<string | null> {
  const sa = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!sa) return null;
  try {
    const { client_email, private_key } = JSON.parse(sa) as { client_email: string; private_key: string };
    const now = Math.floor(Date.now() / 1000);
    const hdr = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const pay = Buffer.from(JSON.stringify({
      iss: client_email, scope: "https://www.googleapis.com/auth/androidpublisher",
      aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
    })).toString("base64url");
    const { createSign } = await import("node:crypto");
    const sig = createSign("RSA-SHA256").update(`${hdr}.${pay}`).sign(private_key, "base64url");
    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${hdr}.${pay}.${sig}` }),
      cache: "no-store",
    });
    if (!resp.ok) return null;
    return ((await resp.json()) as { access_token?: string }).access_token ?? null;
  } catch { return null; }
}

async function fetchSubscriptionExpiry(purchaseToken: string): Promise<Date | null> {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const url  = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${GOOGLE_PACKAGE}/purchases/subscriptionsv2/tokens/${purchaseToken}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!resp.ok) return null;
    const data = await resp.json() as { lineItems?: Array<{ expiryTime?: string }> };
    const exp  = data.lineItems?.[0]?.expiryTime;
    return exp ? new Date(exp) : null;
  } catch { return null; }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // Verify shared secret
  const secret = process.env.GOOGLE_RTDN_SECRET;
  if (secret) {
    const channelToken = request.headers.get("X-Goog-Channel-Token");
    if (channelToken !== secret) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  let body: PubSubMessage;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // Decode Pub/Sub message
  let payload: RtdnPayload;
  try {
    const json = Buffer.from(body.message.data, "base64").toString("utf-8");
    payload = JSON.parse(json) as RtdnPayload;
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const subNotif = payload.subscriptionNotification;
  if (!subNotif) {
    // Acknowledge non-subscription notifications
    return NextResponse.json({ ok: true });
  }

  const { notificationType, purchaseToken, subscriptionId } = subNotif;
  const userId = getUserIdByPurchaseToken(purchaseToken);

  // Log RTDN event (fire analytics regardless of userId resolution)
  if (!userId) {
    // Unknown user — acknowledge to prevent retry flooding
    return NextResponse.json({ ok: true, warning: "unknown_user" });
  }

  const skuId = resolveSubscriptionSku(subscriptionId);
  const now   = new Date();

  switch (notificationType) {
    case SUB_NOTIFY.PURCHASED:
    case SUB_NOTIFY.RECOVERED:
    case SUB_NOTIFY.RESTARTED: {
      const expiresAt = await fetchSubscriptionExpiry(purchaseToken);
      grantVip(userId, skuId, now, expiresAt ?? undefined);
      recordIapReceipt({ userId, platform: "google", skuId, transactionId: purchaseToken, purchaseToken, status: "valid", expiresDate: expiresAt?.toISOString() });
      break;
    }
    case SUB_NOTIFY.RENEWED: {
      const expiresAt = await fetchSubscriptionExpiry(purchaseToken);
      if (expiresAt) renewVip(userId, skuId, expiresAt);
      recordIapReceipt({ userId, platform: "google", skuId, transactionId: `${purchaseToken}_renewal_${Date.now()}`, purchaseToken, status: "valid", expiresDate: expiresAt?.toISOString() });
      break;
    }
    case SUB_NOTIFY.IN_GRACE_PERIOD: {
      // Keep VIP but enter grace period (16 days)
      const graceUntil = new Date(now);
      graceUntil.setDate(graceUntil.getDate() + 16);
      setVipGrace(userId, graceUntil);
      break;
    }
    case SUB_NOTIFY.CANCELED: {
      // Auto-renew가 꺼진 상태일 수 있으므로 즉시 권한을 회수하지 않는다.
      recordIapReceipt({
        userId,
        platform: "google",
        skuId,
        transactionId: `${purchaseToken}_cancelled_${Date.now()}`,
        purchaseToken,
        status: "cancelled",
      });
      break;
    }
    case SUB_NOTIFY.ON_HOLD:
      deactivateSubscriptionAccess({
        userId,
        skuId,
        platform: "google",
        status: "cancelled",
        reason: "Google 결제 보류",
        purchaseToken,
        rawResponse: JSON.stringify(payload),
      });
      break;
    case SUB_NOTIFY.REVOKED:
      applyLocalRefund({
        userId,
        skuId,
        source: "google",
        reason: "Google Play 구독 환불",
        externalRef: purchaseToken,
        purchaseToken,
        receiptPlatform: "google",
        rawResponse: JSON.stringify(payload),
      });
      break;
    case SUB_NOTIFY.EXPIRED: {
      deactivateSubscriptionAccess({
        userId,
        skuId,
        platform: "google",
        status: "expired",
        reason: "Google 구독 만료",
        purchaseToken,
        rawResponse: JSON.stringify(payload),
      });
      break;
    }
    default:
      // Deferred, paused, price changes — no action needed
      break;
  }

  return NextResponse.json({ ok: true });
}
