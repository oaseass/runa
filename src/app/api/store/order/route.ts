import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/server/auth-session";
import { createOrder, getOrder, isValidProductId } from "@/lib/server/order-store";

function orderCreateFailureMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("SQLITE_READONLY") || message.toLowerCase().includes("readonly")) {
    return "현재 웹 결제를 준비 중이에요. 앱에서 스토어 결제를 이용해 주세요.";
  }

  return "주문 정보를 준비하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const claims = verifySessionToken(token);

  if (!claims) {
    return NextResponse.json({ ok: false, message: "로그인이 필요해요." }, { status: 401 });
  }

  let body: { productId?: string; existingOrderId?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "잘못된 요청입니다." }, { status: 400 });
  }

  if (!isValidProductId(body.productId)) {
    return NextResponse.json({ ok: false, message: "지원하지 않는 상품입니다." }, { status: 400 });
  }

  if (body.existingOrderId) {
    try {
      const existing = getOrder(body.existingOrderId);
      const isReusable =
        existing &&
        existing.userId === claims.userId &&
        existing.productId === body.productId &&
        existing.status === "pending";

      if (isReusable) {
        return NextResponse.json({ ok: true, orderId: existing.id });
      }
    } catch (error) {
      console.error("[api/store/order] pending-order lookup fallback", error);
    }
  }

  try {
    const order = createOrder(claims.userId, body.productId);
    return NextResponse.json({ ok: true, orderId: order.id });
  } catch (error) {
    console.error("[api/store/order] create failed", error);
    const message = orderCreateFailureMessage(error);
    const status = message.includes("앱에서 스토어 결제") ? 503 : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}