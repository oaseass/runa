import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/server/auth-session";
import { removeFriend, acceptFriend, blockFriend, unblockFriend, logFriendEvent } from "@/lib/server/friend-store";

type Params = { params: Promise<{ userId: string }> };

/**
 * PATCH /api/friends/[userId]
 * Body: { action: "accept" | "block" | "unblock" | "remove" }
 */
export async function PATCH(request: Request, { params }: Params) {
  const cookieStore = await cookies();
  const token  = cookieStore.get("luna_auth")?.value;
  const claims = token ? verifySessionToken(token) : null;
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { userId: otherUserId } = await params;

  let body: { action?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const action = body.action;
  let ok = false;

  switch (action) {
    case "accept":
      ok = await acceptFriend(claims.userId, otherUserId);
      if (ok) logFriendEvent(claims.userId, "friend_request_accepted", { otherUserId });
      break;
    case "block":
      await blockFriend(claims.userId, otherUserId);
      logFriendEvent(claims.userId, "friend_blocked", { otherUserId });
      ok = true;
      break;
    case "unblock":
      ok = await unblockFriend(claims.userId, otherUserId);
      break;
    case "remove":
      ok = await removeFriend(claims.userId, otherUserId);
      if (ok) logFriendEvent(claims.userId, "friend_removed", { otherUserId });
      break;
    default:
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }

  return NextResponse.json({ ok });
}

/**
 * DELETE /api/friends/[userId]
 * Alias for remove — keeps backwards compatibility.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const cookieStore = await cookies();
  const token  = cookieStore.get("luna_auth")?.value;
  const claims = token ? verifySessionToken(token) : null;
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { userId: otherUserId } = await params;
  const ok = await removeFriend(claims.userId, otherUserId);
  return NextResponse.json({ ok });
}
