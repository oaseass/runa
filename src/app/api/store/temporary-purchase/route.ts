import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/server/auth-session";
import { isValidProductId } from "@/lib/server/order-store";
import {
  TEMP_PURCHASE_COOKIE_NAME,
  TemporaryPurchaseError,
  canUseTemporaryPurchase,
  completeTemporaryPurchase,
  createTemporaryPurchaseCookieValue,
  getTemporaryPurchaseCookieOptions,
  getTemporaryPurchaseRedirectPath,
  grantTemporaryPurchase,
  isUnavailableSqliteError,
  readTemporaryPurchaseState,
} from "@/lib/server/temporary-purchase";

type TemporaryPurchaseResponse = {
  ok: boolean;
  redirectTo?: string;
  message?: string;
};

export async function POST(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const claims = verifySessionToken(token);

  if (!claims) {
    return NextResponse.json<TemporaryPurchaseResponse>(
      { ok: false, message: "로그인이 필요해요." },
      { status: 401 },
    );
  }

  let body: { productId?: string; existingOrderId?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<TemporaryPurchaseResponse>(
      { ok: false, message: "잘못된 요청입니다." },
      { status: 400 },
    );
  }

  if (!isValidProductId(body.productId)) {
    return NextResponse.json<TemporaryPurchaseResponse>(
      { ok: false, message: "지원하지 않는 상품입니다." },
      { status: 400 },
    );
  }

  if (!canUseTemporaryPurchase()) {
    return NextResponse.json<TemporaryPurchaseResponse>(
      { ok: false, message: "임시 결제를 사용할 수 없어요." },
      { status: 403 },
    );
  }

  try {
    const result = await completeTemporaryPurchase({
      userId: claims.userId,
      productId: body.productId,
      existingOrderId: body.existingOrderId,
    });

    return NextResponse.json<TemporaryPurchaseResponse>({
      ok: true,
      redirectTo: result.redirectTo,
    });
  } catch (error) {
    if (isUnavailableSqliteError(error)) {
      const existingState = readTemporaryPurchaseState(
        request.cookies.get(TEMP_PURCHASE_COOKIE_NAME)?.value,
      );
      const nextState = grantTemporaryPurchase(existingState, body.productId);
      const response = NextResponse.json<TemporaryPurchaseResponse>({
        ok: true,
        redirectTo: getTemporaryPurchaseRedirectPath(body.productId),
      });
      response.cookies.set(
        TEMP_PURCHASE_COOKIE_NAME,
        createTemporaryPurchaseCookieValue(nextState),
        getTemporaryPurchaseCookieOptions(),
      );
      return response;
    }

    if (error instanceof TemporaryPurchaseError) {
      return NextResponse.json<TemporaryPurchaseResponse>(
        { ok: false, message: error.message },
        { status: error.status },
      );
    }

    console.error("[api/store/temporary-purchase] failed", error);
    return NextResponse.json<TemporaryPurchaseResponse>(
      { ok: false, message: "임시 결제 처리 중 오류가 발생했어요." },
      { status: 500 },
    );
  }
}