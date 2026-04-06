import { NextResponse } from "next/server";
import { clearAdminCookie } from "@/lib/server/admin-session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearAdminCookie(response);
  return response;
}
