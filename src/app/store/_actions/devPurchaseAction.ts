"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/server/auth-session";
import {
  createOrder,
  markOrderPaid,
  setOrderReportJson,
  isValidProductId,
} from "@/lib/server/order-store";
import { generateAreaReport } from "@/lib/server/area-report";
import { generateYearlyReport } from "@/lib/server/yearly-report";

/**
 * Dev-only: skip payment and go directly to the result page.
 * Accepts FormData so it can be used directly as a form action.
 */
export async function devPurchaseAction(formData: FormData) {
  if (process.env.SKIP_PAYMENT !== "true" && process.env.NEXT_PUBLIC_SKIP_PAYMENT !== "true") {
    redirect("/store");
  }

  const productId = formData.get("productId") as string | null;
  if (!productId || !isValidProductId(productId)) redirect("/store");

  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const claims = verifySessionToken(token);
  if (!claims) redirect("/account-access");

  const order = createOrder(claims.userId, productId);
  markOrderPaid(order.id, `dev_skip_${Date.now()}`, "DEV");

  if (productId === "area") {
    try {
      const report = await generateAreaReport(claims.userId);
      if (report) setOrderReportJson(order.id, JSON.stringify(report));
    } catch { /* best-effort */ }
    redirect(`/store/report/${order.id}`);
  }

  if (productId === "yearly") {
    try {
      const report = await generateYearlyReport(claims.userId);
      if (report) setOrderReportJson(order.id, JSON.stringify(report));
    } catch { /* best-effort */ }
    redirect(`/store/report/${order.id}`);
  }

  // membership: mark paid, reload store so the "구독 중" state appears
  redirect("/store");
}
