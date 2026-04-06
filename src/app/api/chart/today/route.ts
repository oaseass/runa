/**
 * GET /api/chart/today
 * Returns today's transit interpretation for the authenticated user.
 */
import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/server/auth-session";
import { getTodayInterpretation, getDateInterpretation } from "@/lib/server/chart-store";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);

  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const dateParam = request.nextUrl.searchParams.get("date");
  const date = dateParam ? new Date(dateParam) : new Date();
  const interpretation = isNaN(date.getTime())
    ? getTodayInterpretation(session.userId)
    : getDateInterpretation(session.userId, date);
  if (!interpretation) {
    return NextResponse.json(
      { success: false, error: "Birth data incomplete. Complete onboarding to generate today's reading." },
      { status: 422 },
    );
  }

  return NextResponse.json({ success: true, interpretation });
}
