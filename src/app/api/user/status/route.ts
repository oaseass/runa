import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken, AUTH_COOKIE_NAME } from "@/lib/server/auth-session";
import { getUnifiedPurchaseState } from "@/lib/server/purchase-state";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const claims = verifySessionToken(token);

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
    const purchaseState = getUnifiedPurchaseState(claims.userId);
    const isVip = isDevSkip || purchaseState.isVip;
    const isPro = isVip;

    return NextResponse.json({
      isPro,
      isVip,
      username: claims.username,
      voidCredits: purchaseState.voidCredits,
      annualReportOwned: purchaseState.annualReportOwned,
      areaReportsOwned: purchaseState.areaReportOwned,
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[api/user/status] auth-only fallback", error);

    return NextResponse.json({
      isPro: isDevSkip,
      isVip: isDevSkip,
      username: claims.username,
      voidCredits: 0,
      annualReportOwned: false,
      areaReportsOwned: false,
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  }
}
