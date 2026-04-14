import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken, AUTH_COOKIE_NAME } from "@/lib/server/auth-session";
import { getUnifiedPurchaseState } from "@/lib/server/purchase-state";
import {
  TEMP_PURCHASE_COOKIE_NAME,
  getEffectivePurchaseState,
  readTemporaryPurchaseState,
} from "@/lib/server/temporary-purchase";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const claims = verifySessionToken(token);
  const temporaryPurchaseState = readTemporaryPurchaseState(
    cookieStore.get(TEMP_PURCHASE_COOKIE_NAME)?.value,
  );

  if (!claims) {
    return NextResponse.json(
      { isPro: false, isVip: false, username: null, voidCredits: 0, annualReportOwned: false, areaReportsOwned: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const isDevSkip =
    process.env.SKIP_PAYMENT === "true" ||
    process.env.NEXT_PUBLIC_SKIP_PAYMENT === "true";

  try {
    const purchaseState = getEffectivePurchaseState(
      getUnifiedPurchaseState(claims.userId),
      temporaryPurchaseState,
    );
    const isVip = isDevSkip || Boolean(purchaseState?.isVip);
    const isPro = isVip;

    return NextResponse.json({
      isPro,
      isVip,
      username: claims.username,
      voidCredits: purchaseState?.voidCredits ?? 0,
      annualReportOwned: purchaseState?.annualReportOwned ?? false,
      areaReportsOwned: purchaseState?.areaReportOwned ?? false,
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[api/user/status] auth-only fallback", error);

    const fallbackPurchaseState = getEffectivePurchaseState(null, temporaryPurchaseState);

    return NextResponse.json({
      isPro: isDevSkip || Boolean(fallbackPurchaseState?.isVip),
      isVip: isDevSkip || Boolean(fallbackPurchaseState?.isVip),
      username: claims.username,
      voidCredits: fallbackPurchaseState?.voidCredits ?? 0,
      annualReportOwned: fallbackPurchaseState?.annualReportOwned ?? false,
      areaReportsOwned: fallbackPurchaseState?.areaReportOwned ?? false,
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  }
}
