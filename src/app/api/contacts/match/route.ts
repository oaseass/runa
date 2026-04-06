import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/server/auth-session";
import { normalizePhone } from "@/lib/phone-normalize";
import { findUsersByPhones, getFriendship, logFriendEvent } from "@/lib/server/friend-store";

/** Raw contact entry from the device */
type RawContact = {
  name:   string;
  phones: string[];
};

/**
 * POST /api/contacts/match
 * Body: { contacts: RawContact[] }  (max 500 contacts per request)
 *
 * Returns:
 *  matched[]    — LUNA-registered users found in the contact list
 *  unregistered[] — contacts with no LUNA account (safe: first normalized phone only)
 *
 * Privacy: raw phone numbers are never stored. Processing is in-memory only.
 */
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token  = cookieStore.get("luna_auth")?.value;
  const claims = token ? verifySessionToken(token) : null;
  if (!claims) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { contacts?: RawContact[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const rawContacts: RawContact[] = Array.isArray(body.contacts) ? body.contacts : [];
  if (rawContacts.length > 500) {
    return NextResponse.json({ error: "too many contacts (max 500 per batch)" }, { status: 413 });
  }

  // ── Build phone→contactName map (normalized) ─────────────────────────────
  const phoneToName = new Map<string, string>();
  const allNormalized: string[] = [];

  for (const c of rawContacts) {
    if (!c.name || typeof c.name !== "string") continue;
    const phones: string[] = Array.isArray(c.phones) ? c.phones : [];
    for (const raw of phones) {
      if (typeof raw !== "string") continue;
      const n = normalizePhone(raw);
      if (n && !phoneToName.has(n)) {
        phoneToName.set(n, c.name.trim());
        allNormalized.push(n);
      }
    }
  }

  // ── Exclude self ──────────────────────────────────────────────────────────
  // (caller's own number may be in their contacts)

  // ── Look up matched LUNA users ────────────────────────────────────────────
  const lunaUsers = findUsersByPhones(allNormalized);

  // ── Tag with friendship status vs calling user ────────────────────────────
  type FriendStatus = "not_connected" | "accepted" | "pending_sent" | "pending_received";

  type MatchedUser = {
    userId:           string;
    username:         string;
    contactName:      string;
    friendshipStatus: FriendStatus;
    friendshipId:     string | null;
  };

  const matched: MatchedUser[] = [];

  for (const user of lunaUsers) {
    // Don't return self
    if (user.id === claims.userId) continue;

    const fs = getFriendship(claims.userId, user.id);
    let friendshipStatus: FriendStatus = "not_connected";
    let friendshipId: string | null = null;

    if (fs) {
      friendshipId = fs.id;
      if (fs.status === "accepted") {
        friendshipStatus = "accepted";
      } else if (fs.status === "pending") {
        friendshipStatus = fs.direction === "sent" ? "pending_sent" : "pending_received";
      }
    }

    matched.push({
      userId: user.id,
      username: user.username,
      contactName: phoneToName.get(user.phoneNumber) ?? user.username,
      friendshipStatus,
      friendshipId,
    });
  }

  // ── Unregistered contacts ──────────────────────────────────────────────────
  // Only include one normalized phone per contact (for invite linking)
  // We return the phone so the client can use it for share/SMS — not stored server-side.
  type UnregisteredContact = { name: string; phone: string };
  const unregistered: UnregisteredContact[] = [];
  const seenNames = new Set<string>();

  for (const [phone, name] of phoneToName) {
    // Skip phones that matched a LUNA user
    const isLunaUser = lunaUsers.some((u) => u.phoneNumber === phone);
    if (isLunaUser) continue;

    // One entry per contact name (take first phone)
    if (seenNames.has(name)) continue;
    seenNames.add(name);
    unregistered.push({ name, phone });
  }

  // Only first 200 unregistered contacts to keep response size reasonable
  const unregisteredSlice = unregistered.slice(0, 200);

  // ── Log analytics event ────────────────────────────────────────────────────
  logFriendEvent(claims.userId, "contact_scan", {
    totalContacts: rawContacts.length,
    uniquePhones:  allNormalized.length,
    matchCount:    matched.length,
    inviteCount:   unregisteredSlice.length,
  });

  if (matched.length > 0) {
    logFriendEvent(claims.userId, "match_found", { count: matched.length });
  }

  return NextResponse.json({ matched, unregistered: unregisteredSlice });
}
