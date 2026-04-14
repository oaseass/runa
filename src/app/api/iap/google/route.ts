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
import { assertOrderMatchesSku, finalizePaidOrder, getSkuRedirectPath, OrderFulfillmentError } from "@/lib/server/order-fulfillment";

// ── Google Product ID → SkuId map ────────────────────────────────────────────

const GOOGLE_TO_SKU: Record<string, SkuId> = {
  luna_vip:           "vip_monthly",   // resolved via basePlanId below
  luna_annual_report: "annual_report",
  luna_area_reading:  "area_reading",
  luna_void_single:   "void_single",
  luna_void_pack5:    "void_pack_5",
  luna_void_pack3:    "void_pack_3",
  luna_void_pack10:   "void_pack_10",
};

const GOOGLE_BASE_PLAN_TO_SKU: Record<string, SkuId> = {
  monthly: "vip_monthly",
  yearly:  "vip_yearly",
};

const PACKAGE_NAME = process.env.GOOGLE_PACKAGE_NAME ?? "com.lunastar.app";

function isVoidConsumableSku(skuId: SkuId) {
  return skuId === "void_single" || skuId === "void_pack_5" || skuId === "void_pack_3" || skuId === "void_pack_10";
}

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
      acknowledgementState?: string;
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
      acknowledgementState: data.acknowledgementState ?? null,
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
    const data = await resp.json() as { purchaseState?: number; orderId?: string; acknowledgementState?: number; consumptionState?: number };
    // purchaseState 0 = purchased
    if (data.purchaseState !== 0) return { valid: false };

    return {
      valid:   true,
      skuId:   GOOGLE_TO_SKU[productId] ?? null,
      orderId: data.orderId ?? purchaseToken.slice(0, 32),
      acknowledgementState: data.acknowledgementState ?? 0,
      consumptionState: data.consumptionState ?? 0,
    };
  } catch {
    return { valid: false };
  }
}

async function postGooglePublisherAction(url: string) {
  const token = await getGoogleAccessToken();
  if (!token) {
    return true;
  }

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
      cache: "no-store",
    });

    return resp.ok;
  } catch {
    return false;
  }
}

async function finalizeGoogleStorePurchase(options: {
  productId: string;
  purchaseToken: string;
  packageName: string;
  skuId: SkuId;
  isSubscription: boolean;
  acknowledgementState?: string | number | null;
  consumptionState?: number | null;
}) {
  if (options.isSubscription) {
    if (options.acknowledgementState === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED") {
      return true;
    }

    return postGooglePublisherAction(
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${options.packageName}/purchases/subscriptions/${options.productId}/tokens/${options.purchaseToken}:acknowledge`,
    );
  }

  if (isVoidConsumableSku(options.skuId)) {
    if ((options.consumptionState ?? 0) === 1) {
      return true;
    }

    return postGooglePublisherAction(
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${options.packageName}/purchases/products/${options.productId}/tokens/${options.purchaseToken}:consume`,
    );
  }

  if ((options.acknowledgementState ?? 0) === 1) {
    return true;
  }

  return postGooglePublisherAction(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${options.packageName}/purchases/products/${options.productId}/tokens/${options.purchaseToken}:acknowledge`,
  );
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token  = cookieStore.get("luna_auth")?.value;
  const claims = token ? verifySessionToken(token) : null;
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { productId?: string; purchaseToken?: string; packageName?: string; isSubscription?: boolean; orderId?: string };
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

  const storeFinalized = await finalizeGoogleStorePurchase({
    productId,
    purchaseToken,
    packageName: pkg,
    skuId,
    isSubscription,
    acknowledgementState: "acknowledgementState" in result ? result.acknowledgementState : null,
    consumptionState: "consumptionState" in result ? result.consumptionState : null,
  });

  if (!storeFinalized) {
    return NextResponse.json({ error: "google_finalize_failed" }, { status: 502 });
  }

  if (body.orderId) {
    try {
      assertOrderMatchesSku(body.orderId, claims.userId, skuId);
    } catch (error) {
      const code = error instanceof OrderFulfillmentError ? error.code : "ORDER_VALIDATION_FAILED";
      return NextResponse.json({ error: code }, { status: 422 });
    }
  }

  // Idempotency
  const transactionId = "orderId" in result ? (result.orderId ?? purchaseToken) : purchaseToken;
  let redirectTo: string | undefined = getSkuRedirectPath(skuId);

  if (isTransactionProcessed("google", transactionId)) {
    if (body.orderId) {
      try {
        const finalized = await finalizePaidOrder({
          orderId: body.orderId,
          userId: claims.userId,
          paymentKey: transactionId,
          paymentType: "GOOGLE_IAP",
          providerRef: purchaseToken,
          purchaseToken,
          purchaseDate: new Date(),
          skipEntitlementGrant: true,
          skipReceiptRecording: true,
        });
        redirectTo = finalized.redirectTo;
      } catch {
        redirectTo = undefined;
      }
    }

    return NextResponse.json({ ok: true, skuId, alreadyProcessed: true, entitlement: getEntitlement(claims.userId), redirectTo });
  }

  const expiresDate = "expiresDate" in result ? result.expiresDate as string | undefined : undefined;
  const expiresAt   = expiresDate ? new Date(expiresDate) : undefined;

  grantFromSku(claims.userId, skuId, new Date(), expiresAt, {
    orderId: body.orderId,
    transactionId,
    purchaseToken,
    sourceType: "purchase",
  });

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

  if (body.orderId) {
    try {
      const finalized = await finalizePaidOrder({
        orderId: body.orderId,
        userId: claims.userId,
        paymentKey: transactionId,
        paymentType: "GOOGLE_IAP",
        providerRef: purchaseToken,
        purchaseToken,
        purchaseDate: new Date(),
        skipEntitlementGrant: true,
        skipReceiptRecording: true,
      });
      redirectTo = finalized.redirectTo;
    } catch (error) {
      const code = error instanceof OrderFulfillmentError ? error.code : "ORDER_FULFILLMENT_FAILED";
      return NextResponse.json({ error: code }, { status: 422 });
    }
  }

  return NextResponse.json({ ok: true, skuId, entitlement: getEntitlement(claims.userId), redirectTo });
}
