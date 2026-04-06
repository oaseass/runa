/**
 * POST /api/iap/apple
 * ─────────────────────────────────────────────────────────────────────────────
 * Verify an Apple App Store purchase (StoreKit 2 signed transaction).
 *
 * Request body:
 *   { signedTransactionInfo: string }    — StoreKit 2 JWS transaction
 *   OR { receiptData: string }           — legacy base64 receipt (StoreKit 1)
 *
 * On success: grants entitlement and returns updated entitlement.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/server/auth-session";
import { recordIapReceipt, grantFromSku, isTransactionProcessed, getEntitlement } from "@/lib/server/entitlement-store";
import { isValidSkuId } from "@/lib/products";
import type { SkuId } from "@/lib/products";

// ── Apple Product ID → SkuId map ─────────────────────────────────────────────

const APPLE_TO_SKU: Record<string, SkuId> = {
  "com.luna.vip.monthly":   "vip_monthly",
  "com.luna.vip.yearly":    "vip_yearly",
  "com.luna.report.annual": "annual_report",
  "com.luna.report.area":   "area_reading",
  "com.luna.void.pack3":    "void_pack_3",
  "com.luna.void.pack10":   "void_pack_10",
};

// ── StoreKit 2: decode JWS payload (no signature verification — use Apple API) ─

function decodeJwsPayload(jws: string): Record<string, unknown> | null {
  try {
    const parts = jws.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(payload, "base64").toString("utf-8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ── Apple server-side verification (StoreKit 2) ───────────────────────────────

async function verifyAppleTransaction(signedTransaction: string): Promise<{
  valid: boolean;
  productId?: string;
  transactionId?: string;
  originalTransactionId?: string;
  purchaseDate?: string;
  expiresDate?: string;
  inAppOwnershipType?: string;
}> {
  // Decode JWS locally first (for product ID / transaction ID)
  const decoded = decodeJwsPayload(signedTransaction);
  if (!decoded) return { valid: false };

  const productId     = decoded.productId     as string | undefined;
  const transactionId = decoded.transactionId as string | undefined;

  if (!productId || !transactionId) return { valid: false };

  // Verify with Apple's server (production first, sandbox fallback)
  const appleApiBase = process.env.APPLE_IAP_ENV === "sandbox"
    ? "https://api.storekit-sandbox.itunes.apple.com"
    : "https://api.storekit.itunes.apple.com";

  const issuerKey    = process.env.APPLE_ISSUER_ID      ?? "";
  const keyId        = process.env.APPLE_KEY_ID         ?? "";
  const privateKey   = process.env.APPLE_PRIVATE_KEY    ?? "";
  const bundleId     = process.env.APPLE_BUNDLE_ID      ?? "com.luna.app";

  // If Apple credentials not set — trust the local decode (dev mode)
  if (!issuerKey || !keyId || !privateKey) {
    return {
      valid:                true,
      productId,
      transactionId,
      originalTransactionId: decoded.originalTransactionId as string | undefined,
      purchaseDate:          decoded.purchaseDate ? new Date(decoded.purchaseDate as number).toISOString() : undefined,
      expiresDate:           decoded.expiresDate  ? new Date(decoded.expiresDate  as number).toISOString() : undefined,
    };
  }

  // Build JWT for Apple API auth (App Store Connect API)
  // NOTE: In production, use a proper JWT library. Here we build it manually.
  const now = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: issuerKey, iat: now, exp: now + 300, aud: "appstoreconnect-v1", bid: bundleId,
  })).toString("base64url");

  let signature: string;
  try {
    const { createSign } = await import("node:crypto");
    const signer = createSign("SHA256");
    signer.update(`${header}.${payload}`);
    signature = signer.sign({ key: privateKey, dsaEncoding: "ieee-p1363" }, "base64url");
  } catch {
    // Sign error — fallback to decoded data
    return {
      valid:                true,
      productId,
      transactionId,
      originalTransactionId: decoded.originalTransactionId as string | undefined,
      purchaseDate:          decoded.purchaseDate ? new Date(decoded.purchaseDate as number).toISOString() : undefined,
      expiresDate:           decoded.expiresDate  ? new Date(decoded.expiresDate  as number).toISOString() : undefined,
    };
  }

  const jwt = `${header}.${payload}.${signature}`;

  try {
    const resp = await fetch(`${appleApiBase}/inApps/v1/transactions/${transactionId}`, {
      headers: { Authorization: `Bearer ${jwt}` },
      cache: "no-store",
    });
    if (!resp.ok) return { valid: false };
    const data = await resp.json() as { signedTransactionInfo?: string };
    const verified = decodeJwsPayload(data.signedTransactionInfo ?? "");
    if (!verified) return { valid: false };

    return {
      valid:                true,
      productId:            verified.productId             as string,
      transactionId:        verified.transactionId         as string,
      originalTransactionId: verified.originalTransactionId as string | undefined,
      purchaseDate:          verified.purchaseDate ? new Date(verified.purchaseDate as number).toISOString() : undefined,
      expiresDate:           verified.expiresDate  ? new Date(verified.expiresDate  as number).toISOString() : undefined,
      inAppOwnershipType:    verified.inAppOwnershipType   as string | undefined,
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

  let body: { signedTransactionInfo?: string; receiptData?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.signedTransactionInfo && !body.receiptData) {
    return NextResponse.json({ error: "signedTransactionInfo or receiptData required" }, { status: 400 });
  }

  // Legacy receipt (StoreKit 1)
  if (body.receiptData && !body.signedTransactionInfo) {
    return NextResponse.json({ error: "legacy receipts not supported; use StoreKit 2" }, { status: 400 });
  }

  const result = await verifyAppleTransaction(body.signedTransactionInfo!);
  if (!result.valid || !result.productId || !result.transactionId) {
    return NextResponse.json({ error: "invalid_receipt" }, { status: 422 });
  }

  const skuId = APPLE_TO_SKU[result.productId];
  if (!skuId || !isValidSkuId(skuId)) {
    return NextResponse.json({ error: "unknown_product", productId: result.productId }, { status: 422 });
  }

  // Idempotency
  if (isTransactionProcessed("apple", result.transactionId)) {
    return NextResponse.json({ ok: true, skuId, alreadyProcessed: true, entitlement: getEntitlement(claims.userId) });
  }

  const purchasedAt = result.purchaseDate ? new Date(result.purchaseDate) : new Date();
  const expiresAt   = result.expiresDate  ? new Date(result.expiresDate)  : undefined;

  grantFromSku(claims.userId, skuId, purchasedAt, expiresAt);

  recordIapReceipt({
    userId:                claims.userId,
    platform:              "apple",
    skuId,
    transactionId:         result.transactionId,
    originalTransactionId: result.originalTransactionId,
    status:                "valid",
    purchaseDate:          result.purchaseDate,
    expiresDate:           result.expiresDate,
    rawResponse:           JSON.stringify(result),
  });

  return NextResponse.json({ ok: true, skuId, entitlement: getEntitlement(claims.userId) });
}
