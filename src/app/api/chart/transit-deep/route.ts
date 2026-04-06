/**
 * GET /api/chart/transit-deep?idx=0&date=YYYY-MM-DD
 * Returns a single TransitDeepDetail (or all if idx omitted).
 */
import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/server/auth-session";
import { getTransitDeepList } from "@/lib/server/chart-store";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);

  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const dateParam = request.nextUrl.searchParams.get("date");
  const date = dateParam ? new Date(dateParam) : new Date();
  const resolvedDate = isNaN(date.getTime()) ? new Date() : date;

  const list = getTransitDeepList(session.userId, resolvedDate);
  if (!list) {
    return NextResponse.json({ success: false, error: "Birth data incomplete." }, { status: 422 });
  }

  const idxParam = request.nextUrl.searchParams.get("idx");
  const tp = request.nextUrl.searchParams.get("tp");
  const np = request.nextUrl.searchParams.get("np");

  // When transit/natal planet names provided, find the matching detail for exact label consistency
  if (tp && np) {
    const matched = list.find((d) => d.transitPlanet === tp && d.natalPlanet === np)
      ?? list[0]
      ?? null;
    return NextResponse.json({ success: true, detail: matched, total: list.length });
  }

  if (idxParam !== null) {
    const idx = Number(idxParam);
    const detail = list[idx] ?? list[0] ?? null;
    return NextResponse.json({ success: true, detail, total: list.length });
  }

  return NextResponse.json({ success: true, list, total: list.length });
}
