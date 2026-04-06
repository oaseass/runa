/**
 * GET /api/test/user-info?username=<username>
 * ─────────────────────────────────────────────────────────────────────────────
 * Development-only endpoint: returns userId, username, phoneNumber for a user.
 * Used by Playwright tests to generate session cookies.
 *
 * DISABLED in production (NODE_ENV=production returns 404).
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const username = searchParams.get("username");
  if (!username) {
    return NextResponse.json({ error: "username required" }, { status: 400 });
  }

  const row = db.prepare(
    "SELECT id, username, phone_number FROM users WHERE username = ?"
  ).get(username) as { id: string; username: string; phone_number: string } | undefined;

  if (!row) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }

  return NextResponse.json({
    userId:      row.id,
    username:    row.username,
    phoneNumber: row.phone_number,
  });
}
