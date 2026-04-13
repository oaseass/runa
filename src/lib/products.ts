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
export const VOID_SINGLE    = "void_single"    as const;
export const VOID_PACK_5    = "void_pack_5"    as const;
export const VOID_PACK_3    = "void_pack_3"    as const;
export const VOID_PACK_10   = "void_pack_10"   as const;

export type OnetimeSkuId = typeof ANNUAL_REPORT | typeof AREA_READING | typeof VOID_SINGLE | typeof VOID_PACK_5 | typeof VOID_PACK_3 | typeof VOID_PACK_10;

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

export const VIP_MONTHLY_VOID_CREDITS = 30;
export const STARTER_VOID_CREDITS = 3;

export const SKUS: Record<SkuId, Product> = {
  // ── Subscriptions ────────────────────────────────────────────────────────
  [VIP_MONTHLY]: {
    type: "subscription",
    name: "LUNA VIP 월간",
    description: "깊이 보기 + VOID 월 30회 크레딧",
    amount: 9_900,
    period: "monthly",
    appleProductId: "com.luna.vip.monthly",
    googleProductId: "luna_vip",
    googleBasePlanId: "monthly",
  },
  [VIP_YEARLY]: {
    type: "subscription",
    name: "LUNA VIP 연간",
    description: "깊이 보기 + VOID 월 30회 크레딧 · 연간 결제",
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
    amount: 3_000,
    appleProductId: "com.luna.report.annual",
    googleProductId: "luna_annual_report",
  },
  [AREA_READING]: {
    type: "onetime",
    name: "영역 보고서",
    description: "연애 · 직업 · 재물 중 한 영역을 깊이 읽습니다",
    amount: 3_000,
    appleProductId: "com.luna.report.area",
    googleProductId: "luna_area_reading",
  },
  [VOID_SINGLE]: {
    type: "onetime",
    name: "VOID 1회권",
    description: "VOID 질문 1회 · 회당 ₩500",
    amount: 500,
    voidCredits: 1,
    appleProductId: "com.luna.void.single",
    googleProductId: "luna_void_single",
  },
  [VOID_PACK_5]: {
    type: "onetime",
    name: "VOID 5회권",
    description: "VOID 질문 5회 · 40% 할인",
    amount: 1_500,
    voidCredits: 5,
    appleProductId: "com.luna.void.pack5",
    googleProductId: "luna_void_pack5",
  },
  [VOID_PACK_3]: {
    type: "onetime",
    name: "VOID 3회권",
    description: "VOID 질문 3회 · 회당 ₩500",
    amount: 1_500,
    voidCredits: 3,
    appleProductId: "com.luna.void.pack3",
    googleProductId: "luna_void_pack3",
  },
  [VOID_PACK_10]: {
    type: "onetime",
    name: "VOID 10회권",
    description: "VOID 질문 10회 · 회당 ₩500",
    amount: 5_000,
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
  question:   VOID_SINGLE,
};

export function resolveCheckoutSkuId(productId: string): SkuId | null {
  if (isValidSkuId(productId)) {
    return productId;
  }

  return LEGACY_TO_SKU[productId] ?? null;
}

export function isVipCheckoutProductId(productId: string): boolean {
  return productId === "membership" || productId === VIP_MONTHLY || productId === VIP_YEARLY;
}

export function isAnnualReportProductId(productId: string): boolean {
  return productId === "yearly" || productId === ANNUAL_REPORT;
}

export function isAreaReportProductId(productId: string): boolean {
  return productId === "area" || productId === AREA_READING;
}

export function isVoidCreditPackProductId(productId: string): boolean {
  return productId === "question" || productId === VOID_SINGLE || productId === VOID_PACK_5 || productId === VOID_PACK_3 || productId === VOID_PACK_10;
}

// ── Display helpers ───────────────────────────────────────────────────────────

export function formatAmount(amount: number): string {
  return `₩${amount.toLocaleString("ko-KR")}`;
}

export const LEGAL_LINKS = {
  privacyPolicy:   "/guide/privacy",
  termsOfService:  "/guide/terms",
  subscriptionInfo: "/guide/subscription",
} as const;
