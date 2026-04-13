import type { CategoryKey } from "@/app/void/types";
import {
  ANNUAL_REPORT,
  AREA_READING,
  VOID_PACK_10,
  VOID_PACK_5,
  VOID_PACK_3,
  VOID_SINGLE,
  isAnnualReportProductId,
  isAreaReportProductId,
  isVipSku,
  isValidSkuId,
  isVipCheckoutProductId,
  isVoidCreditPackProductId,
  LEGACY_TO_SKU,
  resolveCheckoutSkuId,
} from "@/lib/products";
import { generateAreaReport } from "./area-report";
import { grantFromSku, recordIapReceipt } from "./entitlement-store";
import {
  getOrder,
  markOrderPaid,
  setOrderAnalysisId,
  setOrderReportJson,
  type Order,
} from "./order-store";
import { generateVoidAnalysis } from "./void-analysis";
import { createVoidAnalysisRequest, updateVoidAnalysisRequest } from "./void-store";
import { generateYearlyReport } from "./yearly-report";

type ReceiptPlatform = "apple" | "google" | "toss";

export class OrderFulfillmentError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function resolveOrderSkuId(productId: string) {
  const legacySkuId = LEGACY_TO_SKU[productId];
  return legacySkuId ?? (isValidSkuId(productId) ? productId : null);
}

export function getSkuRedirectPath(skuId: string): string {
  if (isVipSku(skuId)) {
    return "/home";
  }

  switch (skuId) {
    case ANNUAL_REPORT:
      return "/store/report/yearly";
    case AREA_READING:
      return "/store/report/area";
    case VOID_SINGLE:
    case VOID_PACK_5:
    case VOID_PACK_3:
    case VOID_PACK_10:
      return "/void";
    default:
      return "/store";
  }
}

export function getPaidOrderRedirectPath(order: Pick<Order, "id" | "productId" | "analysisId">): string {
  if (order.productId === "question" && order.analysisId) {
    return `/void/result/${order.analysisId}`;
  }

  if (isVipCheckoutProductId(order.productId)) {
    return "/home";
  }

  if (isAnnualReportProductId(order.productId) || isAreaReportProductId(order.productId)) {
    return `/store/report/${order.id}`;
  }

  if (isVoidCreditPackProductId(order.productId)) {
    return "/void";
  }

  return "/store";
}

export function assertOrderMatchesSku(orderId: string, userId: string, skuId: string): Order {
  const order = getOrder(orderId);
  if (!order || order.userId !== userId) {
    throw new OrderFulfillmentError("ORDER_NOT_FOUND", "주문을 찾을 수 없습니다.");
  }

  if (resolveCheckoutSkuId(order.productId) !== skuId) {
    throw new OrderFulfillmentError("ORDER_SKU_MISMATCH", "주문 상품과 영수증 상품이 일치하지 않습니다.");
  }

  return order;
}

export type FinalizePaidOrderOptions = {
  orderId: string;
  userId: string;
  paymentKey: string;
  paymentType: string;
  providerRef?: string;
  purchaseToken?: string;
  purchaseDate?: Date;
  receiptPlatform?: ReceiptPlatform;
  skipEntitlementGrant?: boolean;
  skipReceiptRecording?: boolean;
};

async function ensureOrderReport(order: Order, userId: string) {
  if (isAreaReportProductId(order.productId)) {
    const report = await generateAreaReport(userId);
    if (report) {
      setOrderReportJson(order.id, JSON.stringify(report));
    }
    return;
  }

  if (isAnnualReportProductId(order.productId) && !order.reportJson) {
    const report = await generateYearlyReport(userId);
    if (report) {
      setOrderReportJson(order.id, JSON.stringify(report));
    }
  }
}

async function ensureVoidAnalysis(order: Order, userId: string) {
  if (order.productId !== "question") {
    return;
  }

  if (order.analysisId) {
    return;
  }

  const metadata = order.metadata ?? {};
  const category = (metadata.category ?? "self") as CategoryKey;
  const questionText = metadata.questionText ?? "";
  const questionType = (metadata.questionType ?? "preset") as "preset" | "custom";
  const chartHash = metadata.chartHash ?? null;

  const record = createVoidAnalysisRequest({
    userId,
    category,
    questionText,
    questionType,
    chartHash,
    initialStatus: "generating",
  });

  let finalStatus: "complete" | "chart_missing" | "failed" = "failed";
  let analysisJson: string | undefined;

  try {
    const output = await generateVoidAnalysis(userId, category, questionText);
    if (output) {
      analysisJson = JSON.stringify(output);
      finalStatus = "complete";
    } else {
      finalStatus = "chart_missing";
    }
  } catch {
    finalStatus = "failed";
  }

  updateVoidAnalysisRequest(record.id, { status: finalStatus, analysisJson });
  setOrderAnalysisId(order.id, record.id);
}

export async function finalizePaidOrder(options: FinalizePaidOrderOptions) {
  const order = getOrder(options.orderId);
  if (!order || order.userId !== options.userId) {
    throw new OrderFulfillmentError("ORDER_NOT_FOUND", "주문을 찾을 수 없습니다.");
  }

  const purchasedAt = options.purchaseDate ?? new Date();
  const skuId = resolveOrderSkuId(order.productId);
  const needsPaymentMark = order.status !== "paid";

  if (needsPaymentMark) {
    markOrderPaid(order.id, options.paymentKey, options.paymentType, options.providerRef ?? options.purchaseToken);
  }

  const freshOrder = getOrder(order.id) ?? order;

  if (!options.skipEntitlementGrant && skuId) {
    grantFromSku(options.userId, skuId, purchasedAt, undefined, {
      skipIfAlreadyGranted: false,
      orderId: order.id,
      transactionId: options.paymentKey,
      purchaseToken: options.purchaseToken,
    });
  }

  if (!options.skipReceiptRecording && options.receiptPlatform && skuId) {
    recordIapReceipt({
      userId: options.userId,
      platform: options.receiptPlatform,
      skuId,
      transactionId: options.paymentKey,
      status: "valid",
      purchaseDate: purchasedAt.toISOString(),
    });
  }

  await ensureOrderReport(freshOrder, options.userId);
  await ensureVoidAnalysis(freshOrder, options.userId);

  const deliveredOrder = getOrder(order.id) ?? freshOrder;

  return {
    order: deliveredOrder,
    redirectTo: getPaidOrderRedirectPath(deliveredOrder),
  };
}