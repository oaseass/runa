import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/server/auth-session";
import {
  findUserByPhone,
  searchUsersByUsername,
  getFriendship,
} from "@/lib/server/friend-store";
import { normalizePhone } from "@/lib/phone-normalize";

/**
 * GET /api/friends/search?q=<query>
 *
 * If q starts with a digit or '+', treats it as a phone number (E.164 normalize).
 * Otherwise, does a username prefix search (up to 20 results).
 *
 * Each result includes the current friendship status with the caller.
 */
export async function GET(request: Request) {
  const cookieStore = await cookies();
  const token  = cookieStore.get("luna_auth")?.value;
  const claims = token ? verifySessionToken(token) : null;
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("q")?.trim() ?? "";

  if (!raw || raw.length < 2) {
    return NextResponse.json({ users: [] });
  }

  const isPhone = /^[\d+]/.test(raw);

  let users: Array<{ id: string; username: string }> = [];

  if (isPhone) {
    const normalized = normalizePhone(raw);
    if (!normalized) return NextResponse.json({ users: [] });
    const found = findUserByPhone(normalized, claims.userId);
    if (found) users = [found];
  } else {
    users = searchUsersByUsername(raw, claims.userId);
  }

  const withStatus = users.map((u) => {
    const ship = getFriendship(claims.userId, u.id);
    let friendshipStatus: string = "not_connected";
    if (ship) {
      if (ship.status === "accepted") {
        friendshipStatus = "accepted";
      } else if (ship.status === "blocked") {
        friendshipStatus = "blocked";
      } else if (ship.direction === "sent") {
        friendshipStatus = "pending_sent";
      } else {
        friendshipStatus = "pending_received";
      }
    }
    return { id: u.id, username: u.username, friendshipStatus };
  });

  return NextResponse.json({ users: withStatus });
}
