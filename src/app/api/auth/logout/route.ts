import { NextResponse } from "next/server";
import { clearAuthCookie } from "@/lib/server/auth-session";

export async function POST() {
  const response = NextResponse.json({ success: true }, { status: 200 });
  clearAuthCookie(response);
  return response;
}
