/**
 * GET /api/chart/transit-data
 * Returns TransitChartData (natal + transit positions, houses, active aspects)
 * for the authenticated user for today.
 */
import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/server/auth-session";
import { getTransitChartDataForUser } from "@/lib/server/chart-runtime";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);

  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const dateParam = request.nextUrl.searchParams.get("date");
  const date = dateParam ? new Date(dateParam) : new Date();
  const resolvedDate = isNaN(date.getTime()) ? new Date() : date;
  const data = await getTransitChartDataForUser(session.userId, resolvedDate);
  if (!data) {
    return NextResponse.json(
      { success: false, error: "Birth data incomplete." },
      { status: 422 },
    );
  }

  return NextResponse.json({ success: true, data });
}
