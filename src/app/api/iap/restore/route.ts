/**
 * POST /api/iap/restore
 * ─────────────────────────────────────────────────────────────────────────────
 * Restore purchases for a user.
 *
 * Client sends all transactions from StoreKit / Google Play.
 * Server re-verifies each and re-grants entitlements.
 *
 * Request body:
 *   {
 *     platform: "apple" | "google",
 *     // Apple: array of signed JWS transactions
 *     transactions?: string[],
 *     // Google: array of { productId, purchaseToken }
 *     purchases?: Array<{ productId: string; purchaseToken: string; isSubscription?: boolean }>
 *   }
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/server/auth-session";
import { getEntitlement } from "@/lib/server/entitlement-store";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token  = cookieStore.get("luna_auth")?.value;
  const claims = token ? verifySessionToken(token) : null;
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    platform?: string;
    transactions?: string[];
    purchases?: Array<{ productId: string; purchaseToken: string; isSubscription?: boolean }>;
  };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { platform } = body;
  if (platform !== "apple" && platform !== "google") {
    return NextResponse.json({ error: "platform must be apple or google" }, { status: 400 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (request.headers.get("origin") ?? "http://localhost:3000");

  const authCookie = cookieStore.get("luna_auth");
  const cookieHeader = authCookie ? `luna_auth=${authCookie.value}` : "";

  const results: Array<{ id: string; ok: boolean; skuId?: string; error?: string }> = [];

  if (platform === "apple") {
    const transactions = body.transactions ?? [];
    for (const tx of transactions) {
      try {
        const resp = await fetch(`${baseUrl}/api/iap/apple`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookieHeader },
          body: JSON.stringify({ signedTransactionInfo: tx }),
        });
        const data = await resp.json() as { ok?: boolean; skuId?: string; error?: string; alreadyProcessed?: boolean };
        results.push({ id: tx.slice(0, 16), ok: data.ok ?? false, skuId: data.skuId, error: data.error });
      } catch {
        results.push({ id: tx.slice(0, 16), ok: false, error: "network_error" });
      }
    }
  } else {
    const purchases = body.purchases ?? [];
    for (const p of purchases) {
      try {
        const resp = await fetch(`${baseUrl}/api/iap/google`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookieHeader },
          body: JSON.stringify({ productId: p.productId, purchaseToken: p.purchaseToken, isSubscription: p.isSubscription }),
        });
        const data = await resp.json() as { ok?: boolean; skuId?: string; error?: string; alreadyProcessed?: boolean };
        results.push({ id: p.purchaseToken.slice(0, 16), ok: data.ok ?? false, skuId: data.skuId, error: data.error });
      } catch {
        results.push({ id: p.purchaseToken.slice(0, 16), ok: false, error: "network_error" });
      }
    }
  }

  const restoredCount = results.filter((r) => r.ok).length;
  return NextResponse.json({
    ok: true,
    restoredCount,
    results,
    entitlement: getEntitlement(claims.userId),
  });
}
