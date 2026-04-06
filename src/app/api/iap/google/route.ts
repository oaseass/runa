/**
 * POST /api/iap/google
 * ─────────────────────────────────────────────────────────────────────────────
 * Verify a Google Play purchase.
 *
 * Request body:
 *   { productId: string; purchaseToken: string; packageName?: string }
 *
 * Verifies via Google Play Developer API, then grants entitlement.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/server/auth-session";
import { recordIapReceipt, grantFromSku, isTransactionProcessed, getEntitlement } from "@/lib/server/entitlement-store";
import { isValidSkuId } from "@/lib/products";
import type { SkuId } from "@/lib/products";

// ── Google Product ID → SkuId map ────────────────────────────────────────────

const GOOGLE_TO_SKU: Record<string, SkuId> = {
  luna_vip:           "vip_monthly",   // resolved via basePlanId below
  luna_annual_report: "annual_report",
  luna_area_reading:  "area_reading",
  luna_void_pack3:    "void_pack_3",
  luna_void_pack10:   "void_pack_10",
};

const GOOGLE_BASE_PLAN_TO_SKU: Record<string, SkuId> = {
  monthly: "vip_monthly",
  yearly:  "vip_yearly",
};

const PACKAGE_NAME = process.env.GOOGLE_PACKAGE_NAME ?? "com.luna.app";

// ── Build Google access token from service account ────────────────────────────

async function getGoogleAccessToken(): Promise<string | null> {
  const serviceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccount) return null;

  try {
    const sa = JSON.parse(serviceAccount) as {
      client_email: string; private_key: string;
    };

    const now = Math.floor(Date.now() / 1000);
    const header  = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      iss:   sa.client_email,
      scope: "https://www.googleapis.com/auth/androidpublisher",
      aud:   "https://oauth2.googleapis.com/token",
      iat:   now, exp: now + 3600,
    })).toString("base64url");

    const { createSign } = await import("node:crypto");
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${payload}`);
    const signature = signer.sign(sa.private_key, "base64url");
    const jwt = `${header}.${payload}.${signature}`;

    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
      cache: "no-store",
    });
    if (!resp.ok) return null;
    const data = await resp.json() as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

// ── Verify Google subscription ────────────────────────────────────────────────

async function verifyGoogleSubscription(
  productId: string,
  purchaseToken: string,
  packageName: string,
) {
  const token = await getGoogleAccessToken();

  // Dev fallback: trust client if no credentials
  if (!token) {
    return { valid: true, skuId: GOOGLE_TO_SKU[productId] ?? null, orderId: purchaseToken.slice(0, 32), expiresMillis: null, basePlanId: null };
  }

  try {
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptionsv2/tokens/${purchaseToken}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!resp.ok) return { valid: false };
    const data = await resp.json() as {
      subscriptionState?: string;
      orderId?: string;
      lineItems?: Array<{ productId?: string; offerDetails?: { basePlanId?: string }; expiryTime?: string }>;
    };

    if (data.subscriptionState !== "SUBSCRIPTION_STATE_ACTIVE" &&
        data.subscriptionState !== "SUBSCRIPTION_STATE_IN_GRACE_PERIOD") {
      return { valid: false };
    }

    const lineItem    = data.lineItems?.[0];
    const basePlanId  = lineItem?.offerDetails?.basePlanId ?? null;
    const expiresStr  = lineItem?.expiryTime ?? null;

    const skuId = basePlanId
      ? (GOOGLE_BASE_PLAN_TO_SKU[basePlanId] ?? GOOGLE_TO_SKU[productId] ?? null)
      : (GOOGLE_TO_SKU[productId] ?? null);

    return {
      valid:       true,
      skuId,
      orderId:     data.orderId ?? purchaseToken.slice(0, 32),
      expiresDate: expiresStr,
      basePlanId,
    };
  } catch {
    return { valid: false };
  }
}

// ── Verify Google one-time product ────────────────────────────────────────────

async function verifyGoogleOnetime(
  productId: string,
  purchaseToken: string,
  packageName: string,
) {
  const token = await getGoogleAccessToken();
  if (!token) {
    return { valid: true, skuId: GOOGLE_TO_SKU[productId] ?? null, orderId: purchaseToken.slice(0, 32) };
  }

  try {
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/products/${productId}/tokens/${purchaseToken}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!resp.ok) return { valid: false };
    const data = await resp.json() as { purchaseState?: number; orderId?: string };
    // purchaseState 0 = purchased
    if (data.purchaseState !== 0) return { valid: false };

    return {
      valid:   true,
      skuId:   GOOGLE_TO_SKU[productId] ?? null,
      orderId: data.orderId ?? purchaseToken.slice(0, 32),
    };
  } catch {
    return { valid: false };
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token  = cookieStore.get("luna_auth")?.value;
  const claims = token ? verifySessionToken(token) : null;
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { productId?: string; purchaseToken?: string; packageName?: string; isSubscription?: boolean };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { productId, purchaseToken } = body;
  if (!productId || !purchaseToken) {
    return NextResponse.json({ error: "productId and purchaseToken required" }, { status: 400 });
  }

  const pkg = body.packageName ?? PACKAGE_NAME;
  const isSubscription = body.isSubscription ?? productId === "luna_vip";

  const result = isSubscription
    ? await verifyGoogleSubscription(productId, purchaseToken, pkg)
    : await verifyGoogleOnetime(productId, purchaseToken, pkg);

  if (!result.valid || !result.skuId) {
    return NextResponse.json({ error: "invalid_purchase" }, { status: 422 });
  }

  const skuId = result.skuId as SkuId;
  if (!isValidSkuId(skuId)) {
    return NextResponse.json({ error: "unknown_sku", skuId }, { status: 422 });
  }

  // Idempotency
  const transactionId = "orderId" in result ? (result.orderId ?? purchaseToken) : purchaseToken;
  if (isTransactionProcessed("google", transactionId)) {
    return NextResponse.json({ ok: true, skuId, alreadyProcessed: true, entitlement: getEntitlement(claims.userId) });
  }

  const expiresDate = "expiresDate" in result ? result.expiresDate as string | undefined : undefined;
  const expiresAt   = expiresDate ? new Date(expiresDate) : undefined;

  grantFromSku(claims.userId, skuId, new Date(), expiresAt);

  recordIapReceipt({
    userId:        claims.userId,
    platform:      "google",
    skuId,
    transactionId,
    purchaseToken,
    status:        "valid",
    expiresDate,
    rawResponse:   JSON.stringify(result),
  });

  return NextResponse.json({ ok: true, skuId, entitlement: getEntitlement(claims.userId) });
}
