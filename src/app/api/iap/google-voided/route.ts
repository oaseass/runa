import { NextResponse } from "next/server";
import { VIP_MONTHLY, VIP_YEARLY } from "@/lib/products";
import { applyLocalRefund, resolveReceiptRefundContext } from "@/lib/server/refund-service";

export const dynamic = "force-dynamic";

type GoogleVoidedPurchase = {
  orderId?: string;
  purchaseToken?: string;
  voidedReason?: number;
  voidedSource?: number;
  voidedTimeMillis?: string;
};

function isAuthorizedRequest(request: Request): boolean {
  const secrets = [
    process.env.GOOGLE_REFUND_SYNC_SECRET?.trim(),
    process.env.CRON_SECRET?.trim(),
  ].filter((value): value is string => !!value);

  if (secrets.length === 0) {
    if (process.env.NODE_ENV !== "production") {
      return true;
    }

    const userAgent = request.headers.get("user-agent")?.trim() ?? "";
    return userAgent.startsWith("vercel-cron/");
  }

  const authHeader = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-luna-sync-secret");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  return secrets.some((secret) => bearerToken === secret || headerSecret === secret);
}

async function getGoogleAccessToken(): Promise<string | null> {
  const serviceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccount) {
    return null;
  }

  try {
    const sa = JSON.parse(serviceAccount) as {
      client_email: string;
      private_key: string;
    };
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/androidpublisher",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })).toString("base64url");

    const { createSign } = await import("node:crypto");
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${payload}`);
    const signature = signer.sign(sa.private_key, "base64url");
    const assertion = `${header}.${payload}.${signature}`;

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

async function fetchVoidedPurchases(limit = 100): Promise<GoogleVoidedPurchase[]> {
  const accessToken = await getGoogleAccessToken();
  if (!accessToken) {
    return [];
  }

  const packageName = process.env.GOOGLE_PACKAGE_NAME?.trim() || "com.lunastar.app";
  const url = new URL(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/voidedpurchases`,
  );
  url.searchParams.set("maxResults", String(limit));

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json() as { voidedPurchases?: GoogleVoidedPurchase[] };
  return data.voidedPurchases ?? [];
}

async function handleSync(request: Request) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const voidedPurchases = await fetchVoidedPurchases();
  let processed = 0;
  let skipped = 0;
  let alreadyProcessed = 0;

  for (const item of voidedPurchases) {
    const context = resolveReceiptRefundContext({
      platform: "google",
      transactionId: item.orderId,
      purchaseToken: item.purchaseToken,
    });

    if (!context || context.skuId === VIP_MONTHLY || context.skuId === VIP_YEARLY) {
      skipped += 1;
      continue;
    }

    const result = applyLocalRefund({
      userId: context.userId,
      skuId: context.skuId,
      source: "google",
      reason: item.voidedReason === 1 ? "Google Play 환불" : "Google Play 취소",
      orderId: context.orderId,
      externalRef: item.orderId ?? item.purchaseToken,
      transactionId: context.transactionId ?? item.orderId,
      purchaseToken: context.purchaseToken ?? item.purchaseToken,
      receiptPlatform: "google",
      rawResponse: JSON.stringify(item),
    });

    if (result.alreadyProcessed) {
      alreadyProcessed += 1;
      continue;
    }

    processed += 1;
  }

  return NextResponse.json({
    ok: true,
    total: voidedPurchases.length,
    processed,
    skipped,
    alreadyProcessed,
  });
}

export async function GET(request: Request) {
  return handleSync(request);
}

export async function POST(request: Request) {
  return handleSync(request);
}