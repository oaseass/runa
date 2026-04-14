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
  try {
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

    if (allNormalized.length === 0) {
      return NextResponse.json({ matched: [], unregistered: [] });
    }

    const lunaUsers = await findUsersByPhones(allNormalized);
    const matchedPhones = new Set(lunaUsers.map((user) => user.phoneNumber));

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
      if (user.id === claims.userId) continue;

      let friendshipStatus: FriendStatus = "not_connected";
      let friendshipId: string | null = null;

      try {
        const fs = await getFriendship(claims.userId, user.id);
        if (fs) {
          friendshipId = fs.id;
          if (fs.status === "accepted") {
            friendshipStatus = "accepted";
          } else if (fs.status === "pending") {
            friendshipStatus = fs.direction === "sent" ? "pending_sent" : "pending_received";
          }
        }
      } catch (error) {
        console.error("[contacts/match] friendship lookup failed", error);
      }

      matched.push({
        userId: user.id,
        username: user.username,
        contactName: phoneToName.get(user.phoneNumber) ?? user.username,
        friendshipStatus,
        friendshipId,
      });
    }

    type UnregisteredContact = { name: string; phone: string };
    const unregistered: UnregisteredContact[] = [];
    const seenNames = new Set<string>();

    for (const [phone, name] of phoneToName) {
      if (matchedPhones.has(phone)) continue;
      if (seenNames.has(name)) continue;
      seenNames.add(name);
      unregistered.push({ name, phone });
    }

    const unregisteredSlice = unregistered.slice(0, 200);

    try {
      logFriendEvent(claims.userId, "contact_scan", {
        totalContacts: rawContacts.length,
        uniquePhones:  allNormalized.length,
        matchCount:    matched.length,
        inviteCount:   unregisteredSlice.length,
      });

      if (matched.length > 0) {
        logFriendEvent(claims.userId, "match_found", { count: matched.length });
      }
    } catch (error) {
      console.error("[contacts/match] analytics logging failed", error);
    }

    return NextResponse.json({ matched, unregistered: unregisteredSlice });
  } catch (error) {
    console.error("[contacts/match] unexpected failure", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
