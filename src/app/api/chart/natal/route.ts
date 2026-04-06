import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/server/auth-session";
import { getOrComputeNatalChart } from "@/lib/server/chart-store";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const natal = getOrComputeNatalChart(session.userId);
  if (!natal) {
    return NextResponse.json({ success: false, error: "Birth data incomplete." }, { status: 422 });
  }
  return NextResponse.json({ success: true, natal });
}