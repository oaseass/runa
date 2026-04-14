import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/server/auth-session";
import {
  listFriends,
  listPendingReceived,
  addFriend,
  logFriendEvent,
} from "@/lib/server/friend-store";
import type { FriendshipType } from "@/lib/server/friend-store";

/**
 * GET /api/friends
 * Returns the calling user's accepted friends + pending incoming requests.
 */
export async function GET(request: Request) {
  const cookieStore = await cookies();
  const token  = cookieStore.get("luna_auth")?.value;
  const claims = token ? verifySessionToken(token) : null;
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const typeParam = searchParams.get("type") as FriendshipType | null;
  const type = typeParam === "eros" ? "eros" : typeParam === "friend" ? "friend" : undefined;

  const friends  = await listFriends(claims.userId, type);
  const pending  = await listPendingReceived(claims.userId);

  return NextResponse.json({ friends, pending });
}

/**
 * POST /api/friends
 * Body: { addresseeId: string; type?: "friend" | "eros" }
 *
 * Contact-based flows use autoAccept=true (both parties know each other via contacts).
 */
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token  = cookieStore.get("luna_auth")?.value;
  const claims = token ? verifySessionToken(token) : null;
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { addresseeId?: string; type?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const addresseeId = body.addresseeId?.trim();
  if (!addresseeId) return NextResponse.json({ error: "addresseeId required" }, { status: 400 });
  if (addresseeId === claims.userId) {
    return NextResponse.json({ error: "cannot add self" }, { status: 400 });
  }

  const type: FriendshipType = body.type === "eros" ? "eros" : "friend";

  const friendshipId = await addFriend(claims.userId, addresseeId, type, true);

  logFriendEvent(claims.userId, "friend_request_sent", {
    addresseeId,
    type,
    autoAccept: true,
  });

  return NextResponse.json({ ok: true, friendshipId });
}
