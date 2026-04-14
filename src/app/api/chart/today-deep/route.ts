/**
 * GET /api/chart/today-deep?date=YYYY-MM-DD
 * Returns a unified TodayDeepReport where ALL editorial sections derive from
 * the same primary transit. Single source of truth for /home/detail/today.
 */
import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/server/auth-session";
import { getTodayDeepReportForUser } from "@/lib/server/chart-runtime";
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

  const dateParam = request.nextUrl.searchParams.get("date");
  const date = dateParam ? new Date(dateParam) : new Date();
  const resolvedDate = isNaN(date.getTime()) ? new Date() : date;

  const report = await getTodayDeepReportForUser(session.userId, resolvedDate);
  if (!report) {
    return NextResponse.json(
      { success: false, error: "Birth data incomplete or no active transits." },
      { status: 422 },
    );
  }

  return NextResponse.json({ success: true, report });
}
