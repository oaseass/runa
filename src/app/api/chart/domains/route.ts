/**
 * GET /api/chart/domains
 * Returns today's per-domain readings for the authenticated user.
 */
import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/server/auth-session";
import { getDomainReadings, getDomainReadingsByDate } from "@/lib/server/chart-store";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);

  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const dateParam = request.nextUrl.searchParams.get("date");
  const date = dateParam ? new Date(dateParam) : new Date();
  const domains = isNaN(date.getTime())
    ? getDomainReadings(session.userId)
    : getDomainReadingsByDate(session.userId, date);
  if (!domains) {
    return NextResponse.json(
      { success: false, error: "Birth data incomplete." },
      { status: 422 },
    );
  }

  return NextResponse.json({ success: true, domains });
}
