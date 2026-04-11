"use server";

import { redirect } from "next/navigation";
import { requireAdminAuth } from "@/lib/server/admin-session";
import { RefundServiceError, refundWebOrder } from "@/lib/server/refund-service";

function sanitizeReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/admin/orders")) {
    return "/admin/orders";
  }

  return value;
}

function withRefundState(path: string, state: string, code?: string) {
  const url = new URL(path, "https://luna.local");
  url.searchParams.set("refund", state);
  if (code) {
    url.searchParams.set("refundCode", code);
  } else {
    url.searchParams.delete("refundCode");
  }

  return `${url.pathname}${url.search}`;
}

export async function refundOrderAction(formData: FormData) {
  await requireAdminAuth();

  const orderId = formData.get("orderId");
  const reason = formData.get("reason");
  const returnTo = sanitizeReturnTo(formData.get("returnTo") as string | null);

  if (typeof orderId !== "string" || orderId.trim().length === 0) {
    redirect(withRefundState(returnTo, "error", "INVALID_ORDER"));
  }

  try {
    await refundWebOrder(orderId, typeof reason === "string" && reason.trim().length > 0 ? reason.trim() : "관리자 환불");
  } catch (error) {
    const code = error instanceof RefundServiceError ? error.code : "REFUND_FAILED";
    redirect(withRefundState(returnTo, "error", code));
  }

  redirect(withRefundState(returnTo, "success"));
}