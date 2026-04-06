/**
 * GET /api/chart/month?year=YYYY&month=M
 * Returns per-day transit scores for the given month for the authenticated user.
 * Each day includes: score (0-100), tone, topDomain, icons.
 * Used by /calendar to show real personalized day quality indicators.
 */
import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/server/auth-session";
import { scoreMonthDays } from "@/lib/server/chart-store";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);

  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const yearParam  = request.nextUrl.searchParams.get("year");
  const monthParam = request.nextUrl.searchParams.get("month");

  const now = new Date();
  const year  = yearParam  ? parseInt(yearParam,  10) : now.getFullYear();
  const month = monthParam ? parseInt(monthParam, 10) : now.getMonth() + 1; // 1-indexed

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json({ success: false, error: "Invalid year/month" }, { status: 400 });
  }

  const result = scoreMonthDays(session.userId, year, month);
  if (!result) {
    return NextResponse.json(
      { success: false, error: "Birth data incomplete. Complete onboarding to generate calendar scores." },
      { status: 422 },
    );
  }

  return NextResponse.json({ success: true, year, month, days: result.days, chartHash: result.chartHash });
}
