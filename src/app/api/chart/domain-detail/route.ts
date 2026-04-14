/**
 * GET /api/chart/domain-detail?domain=love&date=YYYY-MM-DD
 * Returns full DomainDetail for the given domain key and date.
 */
import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/server/auth-session";
import { getDomainDetailForUser } from "@/lib/server/chart-runtime";
import { getUnifiedPurchaseStateSafe } from "@/lib/server/purchase-state";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);

  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const purchaseState = getUnifiedPurchaseStateSafe(session.userId);
  if (!purchaseState?.isVip) {
    return NextResponse.json({ success: false, error: "Premium required" }, { status: 402 });
  }

  const domainKey = request.nextUrl.searchParams.get("domain") ?? "love";
  const dateParam = request.nextUrl.searchParams.get("date");
  const date = dateParam ? new Date(dateParam) : new Date();
  const resolvedDate = isNaN(date.getTime()) ? new Date() : date;

  const detail = await getDomainDetailForUser(session.userId, domainKey, resolvedDate);
  if (!detail) {
    return NextResponse.json(
      { success: false, error: "Birth data incomplete." },
      { status: 422 },
    );
  }

  return NextResponse.json({ success: true, detail });
}
