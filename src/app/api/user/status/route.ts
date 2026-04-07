import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken, AUTH_COOKIE_NAME } from "@/lib/server/auth-session";

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
    const [{ getPaidProductIds }, { checkVip, getEntitlement }] = await Promise.all([
      import("@/lib/server/order-store"),
      import("@/lib/server/entitlement-store"),
    ]);

    const paidIds = getPaidProductIds(claims.userId);
    const isVip = isDevSkip || checkVip(claims.userId);
    const isPro = isDevSkip || isVip || paidIds.has("membership");
    const ent = getEntitlement(claims.userId);

    return NextResponse.json({
      isPro,
      isVip,
      username: claims.username,
      voidCredits: ent.voidCredits,
      annualReportOwned: ent.annualReportOwned > 0,
      areaReportsOwned: ent.areaReportsOwned > 0,
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
