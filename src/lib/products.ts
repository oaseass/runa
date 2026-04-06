/**
 * LUNA Product Catalog
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for all purchasable products.
 *
 * App Store / Play Store mapping:
 *   Subscriptions:
 *     Apple: Subscription Group "LUNA VIP" (com.luna.vip)
 *       - com.luna.vip.monthly  (monthly base plan)
 *       - com.luna.vip.yearly   (yearly base plan)
 *     Google: Subscription product "luna_vip"
 *       - base plan: monthly
 *       - base plan: yearly
 *
 *   One-time (non-consumable / consumable):
 *     Apple: In-App Purchases (non-consumable / consumable)
 *     Google: One-time products (inapp)
 */

// ── Subscription SKUs ─────────────────────────────────────────────────────────

export const VIP_MONTHLY = "vip_monthly" as const;
export const VIP_YEARLY  = "vip_yearly"  as const;

export type SubscriptionSkuId = typeof VIP_MONTHLY | typeof VIP_YEARLY;

// ── One-time SKUs ─────────────────────────────────────────────────────────────

export const ANNUAL_REPORT  = "annual_report"  as const;
export const AREA_READING   = "area_reading"   as const;
export const VOID_PACK_3    = "void_pack_3"    as const;
export const VOID_PACK_10   = "void_pack_10"   as const;

export type OnetimeSkuId = typeof ANNUAL_REPORT | typeof AREA_READING | typeof VOID_PACK_3 | typeof VOID_PACK_10;

export type SkuId = SubscriptionSkuId | OnetimeSkuId;

// ── Catalogue ─────────────────────────────────────────────────────────────────

type BaseProduct = {
  name: string;
  description: string;
  /** Amount in KRW (won) */
  amount: number;
  appleProductId: string;
  googleProductId: string;
};

type SubscriptionProduct = BaseProduct & {
  type: "subscription";
  period: "monthly" | "yearly";
  /** Monthly equivalent (yearly only) */
  monthlyEquivalent?: number;
  /** Google base plan ID (monthly | yearly) */
  googleBasePlanId: string;
};

type OnetimeProduct = BaseProduct & {
  type: "onetime";
  /** VOID credits granted on purchase (void packs only) */
  voidCredits?: number;
};

export type Product = SubscriptionProduct | OnetimeProduct;

export const SKUS: Record<SkuId, Product> = {
  // ── Subscriptions ────────────────────────────────────────────────────────
  [VIP_MONTHLY]: {
    type: "subscription",
    name: "LUNA VIP 월간",
    description: "모든 기능 무제한 · 매일 더 깊은 별자리 해석",
    amount: 9_900,
    period: "monthly",
    appleProductId: "com.luna.vip.monthly",
    googleProductId: "luna_vip",
    googleBasePlanId: "monthly",
  },
  [VIP_YEARLY]: {
    type: "subscription",
    name: "LUNA VIP 연간",
    description: "월 결제 대비 34% 할인 · 연간 리포트 포함",
    amount: 79_000,
    period: "yearly",
    monthlyEquivalent: 6_583,
    appleProductId: "com.luna.vip.yearly",
    googleProductId: "luna_vip",
    googleBasePlanId: "yearly",
  },

  // ── One-time ─────────────────────────────────────────────────────────────
  [ANNUAL_REPORT]: {
    type: "onetime",
    name: "2026 연간 리포트",
    description: "올해의 큰 흐름과 중요한 변화를 짚어드립니다",
    amount: 14_900,
    appleProductId: "com.luna.report.annual",
    googleProductId: "luna_annual_report",
  },
  [AREA_READING]: {
    type: "onetime",
    name: "영역 보고서",
    description: "연애 · 직업 · 재물 중 한 영역을 깊이 읽습니다",
    amount: 9_900,
    appleProductId: "com.luna.report.area",
    googleProductId: "luna_area_reading",
  },
  [VOID_PACK_3]: {
    type: "onetime",
    name: "VOID 3회권",
    description: "VOID 질문 3회 · 기간 제한 없음",
    amount: 4_900,
    voidCredits: 3,
    appleProductId: "com.luna.void.pack3",
    googleProductId: "luna_void_pack3",
  },
  [VOID_PACK_10]: {
    type: "onetime",
    name: "VOID 10회권",
    description: "VOID 질문 10회 · 기간 제한 없음 · 회당 ₩1,490",
    amount: 14_900,
    voidCredits: 10,
    appleProductId: "com.luna.void.pack10",
    googleProductId: "luna_void_pack10",
  },
};

// ── VIP product set ───────────────────────────────────────────────────────────

export const VIP_SKUS: readonly SkuId[] = [VIP_MONTHLY, VIP_YEARLY];

export function isVipSku(id: string): id is SubscriptionSkuId {
  return id === VIP_MONTHLY || id === VIP_YEARLY;
}

export function isValidSkuId(v: unknown): v is SkuId {
  return typeof v === "string" && v in SKUS;
}

// ── VIP subscription expiry helpers ──────────────────────────────────────────

/** Given a purchase date, calculate VIP expiry based on subscription period */
export function calcVipExpiry(skuId: SubscriptionSkuId, purchasedAt: Date): Date {
  const d = new Date(purchasedAt);
  if (skuId === VIP_MONTHLY) {
    d.setMonth(d.getMonth() + 1);
  } else {
    d.setFullYear(d.getFullYear() + 1);
  }
  return d;
}

/** Grace period: 16 days after expiry (Apple/Google standard) */
export function calcGraceUntil(expiresAt: Date): Date {
  const d = new Date(expiresAt);
  d.setDate(d.getDate() + 16);
  return d;
}

// ── Legacy product ID mapping ─────────────────────────────────────────────────
// Map old order-store.ts product IDs → new SkuIds for migration

export const LEGACY_TO_SKU: Partial<Record<string, SkuId>> = {
  membership: VIP_MONTHLY,
  yearly:     ANNUAL_REPORT,
  area:       AREA_READING,
  question:   VOID_PACK_3,
};

// ── Display helpers ───────────────────────────────────────────────────────────

export function formatAmount(amount: number): string {
  return `₩${amount.toLocaleString("ko-KR")}`;
}

export const LEGAL_LINKS = {
  privacyPolicy:   "/guide/privacy",
  termsOfService:  "/guide/terms",
  subscriptionInfo: "/guide/subscription",
} as const;
