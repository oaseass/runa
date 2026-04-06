import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/server/auth-session";
import { isAdminToken } from "@/lib/server/admin-auth";
import { getAdminStats } from "@/lib/server/admin-stats";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (!isAdminToken(token)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const stats = getAdminStats();
  return NextResponse.json(stats);
}
