import { VIP_MONTHLY, VIP_YEARLY } from "@/lib/products";
import { checkVip, getEntitlement, grantVip } from "./entitlement-store";
import { getLatestPaidOrderByProducts, getPaidProductIds } from "./order-store";

function hasPaidProduct(paidIds: Set<string>, ...productIds: string[]) {
  return productIds.some((productId) => paidIds.has(productId));
}

function syncVipEntitlementFromOrders(userId: string) {
  if (checkVip(userId)) {
    return getEntitlement(userId);
  }

  const latestVipOrder = getLatestPaidOrderByProducts(userId, ["vip_yearly", "vip_monthly", "membership"]);
  if (!latestVipOrder?.paidAt) {
    return getEntitlement(userId);
  }

  grantVip(
    userId,
    latestVipOrder.productId === "vip_yearly" ? VIP_YEARLY : VIP_MONTHLY,
    new Date(latestVipOrder.paidAt),
  );

  return getEntitlement(userId);
}

export type UnifiedPurchaseState = {
  isVip: boolean;
  vipSource: string | null;
  annualReportOwned: boolean;
  areaReportOwned: boolean;
  voidCredits: number;
  hasVoidCredits: boolean;
  paidIds: Set<string>;
};

export function getUnifiedPurchaseState(userId: string): UnifiedPurchaseState {
  const entitlement = syncVipEntitlementFromOrders(userId);
  const paidIds = getPaidProductIds(userId);
  const voidCredits = entitlement.voidCredits;

  return {
    isVip: checkVip(userId),
    vipSource: entitlement.vipSource,
    annualReportOwned:
      entitlement.annualReportOwned > 0 ||
      hasPaidProduct(paidIds, "yearly", "annual_report"),
    areaReportOwned:
      entitlement.areaReportsOwned > 0 ||
      hasPaidProduct(paidIds, "area", "area_reading"),
    voidCredits,
    hasVoidCredits: voidCredits > 0,
    paidIds,
  };
}

export function getUnifiedPurchaseStateSafe(userId: string): UnifiedPurchaseState | null {
  try {
    return getUnifiedPurchaseState(userId);
  } catch (error) {
    console.error("[purchase-state] fallback", error);
    return null;
  }
}