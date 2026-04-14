"use client";

import { resolveCheckoutSkuId, SKUS, type SkuId } from "@/lib/products";

type NativePlatform = "ios" | "android";

type NativeIapPurchaseInput = {
  skuId: SkuId;
  platform: NativePlatform;
  productId: string;
  basePlanId?: string;
  isSubscription: boolean;
  orderId?: string;
};

type NativeIapRestoreInput = {
  platform: NativePlatform;
};

type NativeIapPlugin = {
  purchase?: (input: NativeIapPurchaseInput) => Promise<unknown>;
  restore?: (input: NativeIapRestoreInput) => Promise<unknown>;
};

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, unknown>;
};

type PurchaseVerificationResult = {
  ok: boolean;
  skuId?: string;
  redirectTo?: string;
  alreadyProcessed?: boolean;
  entitlement?: Record<string, unknown>;
  error?: string;
};

type RestoreVerificationResult = {
  ok: boolean;
  restoredCount?: number;
  entitlement?: Record<string, unknown>;
  error?: string;
};

type NativePurchaseResult = {
  redirectTo?: string;
  entitlement?: Record<string, unknown>;
  skuId: string;
};

type NativeRestoreResult = {
  restoredCount: number;
  entitlement?: Record<string, unknown>;
};

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function getSessionId(): string {
  if (typeof sessionStorage === "undefined") {
    return "native-iap";
  }

  let sessionId = sessionStorage.getItem("_lsid");
  if (!sessionId) {
    sessionId = makeId();
    sessionStorage.setItem("_lsid", sessionId);
  }

  return sessionId;
}

function normalizeBridgePayload<T>(value: unknown): T {
  if (typeof value === "string") {
    return JSON.parse(value) as T;
  }

  return value as T;
}

function getCapacitor() {
  if (typeof window === "undefined") {
    return null;
  }

  return (window as typeof window & { Capacitor?: CapacitorGlobal }).Capacitor ?? null;
}

function getNativeIapPlugin(): NativeIapPlugin | null {
  if (typeof window === "undefined") {
    return null;
  }

  const capacitor = getCapacitor();
  const plugin = capacitor?.Plugins?.LunaIap;
  if (plugin) {
    return plugin as NativeIapPlugin;
  }

  return (window as typeof window & { LunaNativeIap?: NativeIapPlugin }).LunaNativeIap ?? null;
}

export function getNativePlatform(): NativePlatform | null {
  const capacitor = getCapacitor();
  if (!capacitor?.isNativePlatform?.()) {
    return null;
  }

  const platform = capacitor.getPlatform?.();
  if (platform === "ios" || platform === "android") {
    return platform;
  }

  const userAgent = navigator.userAgent.toLowerCase();
  return userAgent.includes("iphone") || userAgent.includes("ipad") ? "ios" : "android";
}

function getStoreProduct(skuId: SkuId, platform: NativePlatform) {
  const sku = SKUS[skuId];

  return {
    productId: platform === "ios" ? sku.appleProductId : sku.googleProductId,
    basePlanId: platform === "android" && sku.type === "subscription" ? sku.googleBasePlanId : undefined,
    isSubscription: sku.type === "subscription",
  };
}

async function trackNativeIapEvent(event: string, properties: Record<string, unknown>) {
  try {
    await fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "event",
        sessionId: getSessionId(),
        path: typeof window !== "undefined" ? window.location.pathname : "/store/checkout",
        event,
        properties,
      }),
    });
  } catch {
    // telemetry is best-effort only
  }
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "앱 결제 처리 중 오류가 발생했어요.";
}

type AndroidPurchasePayload = {
  productId?: string;
  purchaseToken?: string;
  packageName?: string;
};

type ApplePurchasePayload = {
  signedTransactionInfo?: string;
};

type AppleRestorePayload = { transactions?: string[] };

type AndroidRestorePayload = {
  purchases?: Array<{
    productId?: string;
    purchaseToken?: string;
    isSubscription?: boolean;
  }>;
};

async function verifyNativePurchase(
  platform: NativePlatform,
  orderId: string | undefined,
  skuId: SkuId,
  payload: unknown,
): Promise<NativePurchaseResult> {
  const storeProduct = getStoreProduct(skuId, platform);
  const normalized = normalizeBridgePayload<AndroidPurchasePayload & ApplePurchasePayload>(payload);

  const response = await fetch(platform === "android" ? "/api/iap/google" : "/api/iap/apple", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      platform === "android"
        ? {
            productId: normalized.productId ?? storeProduct.productId,
            purchaseToken: normalized.purchaseToken,
            packageName: normalized.packageName,
            isSubscription: storeProduct.isSubscription,
            orderId,
          }
        : {
            signedTransactionInfo: normalized.signedTransactionInfo,
            orderId,
          },
    ),
  });

  const result = (await response.json().catch(() => ({ ok: false, error: "invalid_response" }))) as PurchaseVerificationResult;
  if (!response.ok || !result.ok) {
    throw new Error(result.error ?? "purchase_verification_failed");
  }

  return {
    redirectTo: result.redirectTo,
    entitlement: result.entitlement,
    skuId: result.skuId ?? skuId,
  };
}

export async function purchaseWithNativeIap(productId: string, orderId?: string): Promise<NativePurchaseResult> {
  const platform = getNativePlatform();
  if (!platform) {
    throw new Error("앱 결제는 iPhone/Android 앱 안에서만 사용할 수 있어요.");
  }

  const skuId = resolveCheckoutSkuId(productId);
  if (!skuId) {
    throw new Error("앱 결제를 지원하지 않는 상품이에요.");
  }

  const plugin = getNativeIapPlugin();
  if (!plugin?.purchase) {
    await trackNativeIapEvent("native_iap_bridge_missing", {
      platform,
      checkoutProductId: productId,
      skuId,
      orderId: orderId ?? null,
    });
    throw new Error("앱 결제 브리지가 연결되지 않았어요.");
  }

  const storeProduct = getStoreProduct(skuId, platform);

  await trackNativeIapEvent("native_iap_purchase_started", {
    platform,
    checkoutProductId: productId,
    skuId,
    orderId: orderId ?? null,
    nativeProductId: storeProduct.productId,
  });

  try {
    const rawResult = await plugin.purchase({
      skuId,
      platform,
      productId: storeProduct.productId,
      basePlanId: storeProduct.basePlanId,
      isSubscription: storeProduct.isSubscription,
      orderId,
    });

    const result = await verifyNativePurchase(platform, orderId, skuId, rawResult);

    await trackNativeIapEvent("native_iap_purchase_verified", {
      platform,
      checkoutProductId: productId,
      skuId,
      orderId: orderId ?? null,
      redirectTo: result.redirectTo ?? null,
    });

    return result;
  } catch (error) {
    await trackNativeIapEvent("native_iap_purchase_failed", {
      platform,
      checkoutProductId: productId,
      skuId,
      orderId: orderId ?? null,
      error: toErrorMessage(error),
    });
    throw error;
  }
}

export async function restoreNativePurchases(): Promise<NativeRestoreResult> {
  const platform = getNativePlatform();
  if (!platform) {
    throw new Error("구매 복원은 앱에서만 사용할 수 있어요.");
  }

  const plugin = getNativeIapPlugin();
  if (!plugin?.restore) {
    await trackNativeIapEvent("native_iap_bridge_missing", {
      platform,
      action: "restore",
    });
    throw new Error("구매 복원 브리지가 연결되지 않았어요.");
  }

  await trackNativeIapEvent("native_iap_restore_started", { platform });

  try {
    const rawResult = await plugin.restore({ platform });
    const normalized = normalizeBridgePayload<AppleRestorePayload & AndroidRestorePayload>(rawResult);

    const response = await fetch("/api/iap/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        platform === "android"
          ? { platform, purchases: normalized.purchases ?? [] }
          : { platform, transactions: normalized.transactions ?? [] },
      ),
    });

    const result = (await response.json().catch(() => ({ ok: false, error: "invalid_response" }))) as RestoreVerificationResult;
    if (!response.ok || !result.ok) {
      throw new Error(result.error ?? "restore_failed");
    }

    await trackNativeIapEvent("native_iap_restore_completed", {
      platform,
      restoredCount: result.restoredCount ?? 0,
    });

    return {
      restoredCount: result.restoredCount ?? 0,
      entitlement: result.entitlement,
    };
  } catch (error) {
    await trackNativeIapEvent("native_iap_restore_failed", {
      platform,
      error: toErrorMessage(error),
    });
    throw error;
  }
}