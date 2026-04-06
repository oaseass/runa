import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/server/auth-session";
import { normalizePhone } from "@/lib/phone-normalize";
import { logContactInvite, logFriendEvent } from "@/lib/server/friend-store";

/**
 * POST /api/friends/invite
 * Body: { phone: string }
 *
 * Logs an invite attempt for analytics.
 * Only a normalised SHA-256 hash of the phone is stored — never plaintext.
 */
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token  = cookieStore.get("luna_auth")?.value;
  const claims = token ? verifySessionToken(token) : null;
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { phone?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const phone = normalizePhone(body.phone ?? "");
  if (!phone) return NextResponse.json({ error: "invalid phone" }, { status: 400 });

  logContactInvite(claims.userId, phone);
  logFriendEvent(claims.userId, "invite_sent");

  return NextResponse.json({ ok: true });
}
