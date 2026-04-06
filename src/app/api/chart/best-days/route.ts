/**
 * GET /api/chart/best-days?count=10&daysAhead=45
 * Returns the top N scoring upcoming days for the authenticated user.
 * Used by /best-days and /home to show personalized upcoming best days.
 */
import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/server/auth-session";
import { getPersonalizedBestDays } from "@/lib/server/chart-store";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);

  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const countParam     = request.nextUrl.searchParams.get("count");
  const daysAheadParam = request.nextUrl.searchParams.get("daysAhead");

  const count     = countParam     ? Math.min(parseInt(countParam,     10), 30) : 10;
  const daysAhead = daysAheadParam ? Math.min(parseInt(daysAheadParam, 10), 90) : 45;

  const bestDays = getPersonalizedBestDays(session.userId, count, daysAhead);
  if (!bestDays) {
    return NextResponse.json(
      { success: false, error: "Birth data incomplete. Complete onboarding to generate best days." },
      { status: 422 },
    );
  }

  return NextResponse.json({ success: true, bestDays });
}
