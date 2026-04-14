"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/server/auth-session";
import {
  createOrder,
  getOrder,
  isValidProductId,
} from "@/lib/server/order-store";
import { finalizePaidOrder } from "@/lib/server/order-fulfillment";

/**
 * Temporary bypass: when payment is not attached, complete the order through the
 * same fulfillment path used by real payments so entitlement state stays in sync.
 */
export async function devPurchaseAction(formData: FormData) {
  const skipPayment = process.env.SKIP_PAYMENT === "true" || process.env.NEXT_PUBLIC_SKIP_PAYMENT === "true";
  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.trim() ?? "";
  const tossConfigured = Boolean(clientKey) && !clientKey.startsWith("test_ck_placeholder");

  if (!skipPayment && tossConfigured) {
    redirect("/store");
  }

  const productId = formData.get("productId") as string | null;
  if (!productId || !isValidProductId(productId)) redirect("/store");

  const existingOrderIdRaw = formData.get("existingOrderId");
  const existingOrderId = typeof existingOrderIdRaw === "string" && existingOrderIdRaw.trim()
    ? existingOrderIdRaw.trim()
    : null;

  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const claims = verifySessionToken(token);
  if (!claims) redirect("/account-access");

  let order = existingOrderId ? getOrder(existingOrderId) : null;
  const canReuseOrder =
    order &&
    order.userId === claims.userId &&
    order.productId === productId &&
    order.status === "pending";

  if (!canReuseOrder) {
    order = createOrder(claims.userId, productId);
  }

  if (!order) {
    redirect("/payment/fail?code=ORDER_CREATE_FAILED&message=" + encodeURIComponent("주문 정보를 준비하지 못했습니다."));
  }

  const finalized = await finalizePaidOrder({
    orderId: order.id,
    userId: claims.userId,
    paymentKey: `temp_skip_${Date.now()}`,
    paymentType: "DEV",
    purchaseDate: new Date(),
    skipReceiptRecording: true,
  });

  redirect(finalized.redirectTo);
}
