import crypto from "node:crypto";
import {
  ANNUAL_REPORT,
  AREA_READING,
  VIP_MONTHLY,
  VIP_YEARLY,
  VOID_PACK_10,
  VOID_PACK_3,
  VOID_PACK_5,
  VOID_SINGLE,
  isAnnualReportProductId,
  isAreaReportProductId,
  isVipCheckoutProductId,
  isVoidCreditPackProductId,
} from "@/lib/products";
import { finalizePaidOrder } from "./order-fulfillment";
import { createOrder, getOrder, isValidProductId, type ProductId } from "./order-store";

export const TEMP_PURCHASE_COOKIE_NAME = "luna_temp_purchase";

const TEMP_PURCHASE_COOKIE_MAX_AGE = 60 * 60 * 24 * 14;

export type TemporaryPurchaseState = {
  isVip: boolean;
  annualReportOwned: boolean;
  areaReportOwned: boolean;
  voidCredits: number;
  updatedAt: string;
};

type PurchaseStateLike = {
  isVip?: boolean;
  vipSource?: string | null;
  annualReportOwned?: boolean;
  areaReportOwned?: boolean;
  voidCredits?: number;
  hasVoidCredits?: boolean;
};

function createEmptyTemporaryPurchaseState(): TemporaryPurchaseState {
  return {
    isVip: false,
    annualReportOwned: false,
    areaReportOwned: false,
    voidCredits: 0,
    updatedAt: new Date().toISOString(),
  };
}

function getTemporaryPurchaseSecret() {
  return process.env.AUTH_SESSION_SECRET?.trim() || "luna-dev-session-secret-change-me";
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string) {
  return crypto.createHmac("sha256", getTemporaryPurchaseSecret()).update(value).digest("base64url");
}

function isValidTemporaryPurchaseState(value: unknown): value is TemporaryPurchaseState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const state = value as Partial<TemporaryPurchaseState>;
  return (
    typeof state.isVip === "boolean" &&
    typeof state.annualReportOwned === "boolean" &&
    typeof state.areaReportOwned === "boolean" &&
    typeof state.voidCredits === "number" &&
    Number.isFinite(state.voidCredits) &&
    state.voidCredits >= 0 &&
    typeof state.updatedAt === "string"
  );
}

export function getTemporaryPurchaseCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TEMP_PURCHASE_COOKIE_MAX_AGE,
  };
}

export function createTemporaryPurchaseCookieValue(state: TemporaryPurchaseState) {
  const payload = base64UrlEncode(JSON.stringify(state));
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

export function readTemporaryPurchaseState(token: string | null | undefined): TemporaryPurchaseState | null {
  if (!token) {
    return null;
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature || sign(payload) !== signature) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as unknown;
    if (!isValidTemporaryPurchaseState(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function canUseTemporaryPurchase() {
  const skipPayment = process.env.SKIP_PAYMENT === "true" || process.env.NEXT_PUBLIC_SKIP_PAYMENT === "true";
  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.trim() ?? "";
  const tossConfigured = Boolean(clientKey) && !clientKey.startsWith("test_ck_placeholder");
  return skipPayment || !tossConfigured;
}

export function isUnavailableSqliteError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error
    ? String((error as { code?: string }).code ?? "")
    : "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    code === "SQLITE_READONLY" ||
    code === "SQLITE_CANTOPEN" ||
    message.includes("readonly") ||
    message.includes("cantopen")
  );
}

export function getTemporaryPurchaseRedirectPath(productId: ProductId) {
  if (isVipCheckoutProductId(productId)) {
    return "/home";
  }

  if (isAnnualReportProductId(productId)) {
    return "/store/report/yearly";
  }

  if (isAreaReportProductId(productId)) {
    return "/store/report/area";
  }

  if (isVoidCreditPackProductId(productId)) {
    return "/void";
  }

  return "/store";
}

export function grantTemporaryPurchase(
  existingState: TemporaryPurchaseState | null,
  productId: ProductId,
): TemporaryPurchaseState {
  const next = {
    ...(existingState ?? createEmptyTemporaryPurchaseState()),
    updatedAt: new Date().toISOString(),
  };

  switch (productId) {
    case "membership":
    case VIP_MONTHLY:
    case VIP_YEARLY:
      next.isVip = true;
      next.voidCredits = Math.max(next.voidCredits, 30);
      return next;
    case "yearly":
    case ANNUAL_REPORT:
      next.annualReportOwned = true;
      return next;
    case "area":
    case AREA_READING:
      next.areaReportOwned = true;
      return next;
    case "question":
    case VOID_SINGLE:
      next.voidCredits += 1;
      return next;
    case VOID_PACK_3:
      next.voidCredits += 3;
      return next;
    case VOID_PACK_5:
      next.voidCredits += 5;
      return next;
    case VOID_PACK_10:
      next.voidCredits += 10;
      return next;
    default:
      return next;
  }
}

export function consumeTemporaryVoidCredit(existingState: TemporaryPurchaseState | null) {
  if (!existingState || existingState.voidCredits < 1) {
    return null;
  }

  return {
    ...existingState,
    voidCredits: existingState.voidCredits - 1,
    updatedAt: new Date().toISOString(),
  };
}

export function getEffectivePurchaseState(
  base: PurchaseStateLike | null,
  temporaryState: TemporaryPurchaseState | null,
) {
  if (!base && !temporaryState) {
    return null;
  }

  const voidCredits = Math.max(base?.voidCredits ?? 0, temporaryState?.voidCredits ?? 0);

  return {
    ...base,
    isVip: Boolean(base?.isVip || temporaryState?.isVip),
    vipSource: base?.vipSource ?? (temporaryState?.isVip ? "temporary" : null),
    annualReportOwned: Boolean(base?.annualReportOwned || temporaryState?.annualReportOwned),
    areaReportOwned: Boolean(base?.areaReportOwned || temporaryState?.areaReportOwned),
    voidCredits,
    hasVoidCredits: voidCredits > 0,
  };
}

export class TemporaryPurchaseError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function completeTemporaryPurchase(options: {
  userId: string;
  productId: string;
  existingOrderId?: string | null;
}) {
  if (!canUseTemporaryPurchase()) {
    throw new TemporaryPurchaseError("TEMP_PURCHASE_DISABLED", "임시 결제를 사용할 수 없어요.", 403);
  }

  if (!isValidProductId(options.productId)) {
    throw new TemporaryPurchaseError("INVALID_PRODUCT", "지원하지 않는 상품입니다.", 400);
  }

  let order = options.existingOrderId ? getOrder(options.existingOrderId) : null;
  const canReuseOrder =
    order &&
    order.userId === options.userId &&
    order.productId === options.productId &&
    order.status === "pending";

  if (!canReuseOrder) {
    order = createOrder(options.userId, options.productId);
  }

  if (!order) {
    throw new TemporaryPurchaseError(
      "ORDER_CREATE_FAILED",
      "주문 정보를 준비하지 못했습니다.",
      500,
    );
  }

  const finalized = await finalizePaidOrder({
    orderId: order.id,
    userId: options.userId,
    paymentKey: `temp_skip_${Date.now()}`,
    paymentType: "DEV",
    purchaseDate: new Date(),
    skipReceiptRecording: true,
  });

  return {
    orderId: order.id,
    redirectTo: finalized.redirectTo,
    productId: options.productId as ProductId,
  };
}