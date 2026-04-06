import crypto from "node:crypto";
import { db } from "./db";

// ── Types ────────────────────────────────────────────────────────────────────

export type FriendshipType   = "friend" | "eros";
/**
 * State machine:
 *   pending  → accepted  (addressee accepts)
 *   pending  → declined  (addressee declines)
 *   accepted → blocked   (either party blocks)
 *   *        → removed   (row deleted — used for clean re-add)
 */
export type FriendshipStatus = "pending" | "accepted" | "declined" | "blocked";

export type FriendRow = {
  id:        string;
  userId:    string;   // the other user's ID
  username:  string;   // the other user's username
  type:      FriendshipType;
  status:    FriendshipStatus;
  direction: "sent" | "received";
  createdAt: string;
};

type DbFriendRow = {
  id:             string;
  requester_id:   string;
  addressee_id:   string;
  type:           string;
  status:         string;
  other_user_id:  string;
  other_username: string;
  created_at:     string;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function mapRow(row: DbFriendRow, myUserId: string): FriendRow {
  return {
    id:        row.id,
    userId:    row.other_user_id,
    username:  row.other_username,
    type:      row.type as FriendshipType,
    status:    row.status as FriendshipStatus,
    direction: row.requester_id === myUserId ? "sent" : "received",
    createdAt: row.created_at,
  };
}

const FRIEND_SELECT = `
  SELECT
    f.id,
    f.requester_id,
    f.addressee_id,
    f.type,
    f.status,
    f.created_at,
    CASE WHEN f.requester_id = @userId THEN f.addressee_id   ELSE f.requester_id   END AS other_user_id,
    CASE WHEN f.requester_id = @userId THEN ua.username       ELSE ur.username      END AS other_username
  FROM friendships f
  JOIN users ur ON ur.id = f.requester_id
  JOIN users ua ON ua.id = f.addressee_id
`;

// ── Write operations ─────────────────────────────────────────────────────────

/**
 * Creates or no-ops a friendship/eros record.
 * For contact-based discovery we auto-accept (status = 'accepted').
 * Returns the friendship id.
 */
export function addFriend(
  requesterId: string,
  addresseeId: string,
  type: FriendshipType = "friend",
  autoAccept = true,
): string {
  // Check if reverse already exists
  const existing = db.prepare(
    `SELECT id FROM friendships WHERE requester_id = ? AND addressee_id = ?`
  ).get([addresseeId, requesterId]) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE friendships SET status = 'accepted', updated_at = ? WHERE id = ?`
    ).run([new Date().toISOString(), existing.id]);
    return existing.id;
  }

  const id = newId();
  const now = new Date().toISOString();
  const status = autoAccept ? "accepted" : "pending";

  db.prepare(`
    INSERT INTO friendships (id, requester_id, addressee_id, type, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(requester_id, addressee_id) DO UPDATE
      SET status = CASE WHEN status = 'declined' THEN excluded.status ELSE status END,
          updated_at = excluded.updated_at
  `).run([id, requesterId, addresseeId, type, status, now, now]);

  return id;
}

export function removeFriend(userId: string, otherUserId: string): boolean {
  const r = db.prepare(`
    DELETE FROM friendships
    WHERE (requester_id = ? AND addressee_id = ?)
       OR (requester_id = ? AND addressee_id = ?)
  `).run([userId, otherUserId, otherUserId, userId]);
  return r.changes > 0;
}

/**
 * Accept a pending friend request from otherUserId to userId.
 * Only succeeds when a row with status='pending' exists where otherUserId is requester.
 */
export function acceptFriend(userId: string, otherUserId: string): boolean {
  const r = db.prepare(`
    UPDATE friendships
    SET status = 'accepted', updated_at = ?
    WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'
  `).run([new Date().toISOString(), otherUserId, userId]);
  return r.changes > 0;
}

/**
 * Block another user. Creates/updates friendship row with status='blocked' and
 * blocker_id stored in the requester slot so we know who initiated the block.
 * Cross-block: if they already blocked us, keep their row; just add ours.
 */
export function blockFriend(blockerId: string, blockedId: string): void {
  const now = new Date().toISOString();
  const id  = newId();
  // Delete any existing relationship first so we can insert deterministically
  db.prepare(`
    DELETE FROM friendships
    WHERE (requester_id = ? AND addressee_id = ?)
       OR (requester_id = ? AND addressee_id = ?)
  `).run([blockerId, blockedId, blockedId, blockerId]);
  db.prepare(`
    INSERT INTO friendships (id, requester_id, addressee_id, type, status, created_at, updated_at)
    VALUES (?, ?, ?, 'friend', 'blocked', ?, ?)
  `).run([id, blockerId, blockedId, now, now]);
}

export function unblockFriend(blockerId: string, blockedId: string): boolean {
  const r = db.prepare(`
    DELETE FROM friendships
    WHERE requester_id = ? AND addressee_id = ? AND status = 'blocked'
  `).run([blockerId, blockedId]);
  return r.changes > 0;
}

/**
 * Find a single LUNA user by exact normalised phone number.
 * Returns null if not found or phone is the caller's own number.
 */
export function findUserByPhone(
  phone: string,
  excludeUserId?: string,
): { id: string; username: string } | null {
  const row = db.prepare(
    `SELECT id, username FROM users WHERE phone_number = ?`
  ).get([phone]) as { id: string; username: string } | undefined;
  if (!row) return null;
  if (excludeUserId && row.id === excludeUserId) return null;
  return row;
}

/**
 * Search LUNA users by username prefix (case-insensitive).
 * Returns up to 20 matches, excluding a given userId.
 */
export function searchUsersByUsername(
  query: string,
  excludeUserId?: string,
): Array<{ id: string; username: string }> {
  const like = `${query.replace(/%/g, "")}%`;
  const rows = db.prepare(
    `SELECT id, username FROM users
     WHERE username LIKE ? ${excludeUserId ? `AND id != ?` : ""}
     ORDER BY username ASC LIMIT 20`
  ).all(excludeUserId ? [like, excludeUserId] : [like]) as Array<{ id: string; username: string }>;
  return rows;
}

// ── Read operations ──────────────────────────────────────────────────────────

export function listFriends(userId: string, type?: FriendshipType): FriendRow[] {
  const rows = db.prepare(`
    ${FRIEND_SELECT}
    WHERE (f.requester_id = @userId OR f.addressee_id = @userId)
      AND f.status = 'accepted'
      ${type ? `AND f.type = '${type}'` : ""}
    ORDER BY f.created_at DESC
  `).all({ userId }) as DbFriendRow[];

  return rows.map((r) => mapRow(r, userId));
}

export function listPendingReceived(userId: string): FriendRow[] {
  const rows = db.prepare(`
    ${FRIEND_SELECT}
    WHERE f.addressee_id = @userId AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `).all({ userId }) as DbFriendRow[];

  return rows.map((r) => mapRow(r, userId));
}

/**
 * Get the friendship status between two users (any direction).
 * Returns null if no relationship exists.
 */
export function getFriendship(userId: string, otherUserId: string): FriendRow | null {
  const row = db.prepare(`
    ${FRIEND_SELECT}
    WHERE (
      (f.requester_id = @userId   AND f.addressee_id = @otherId)
   OR (f.requester_id = @otherId  AND f.addressee_id = @userId)
    )
    LIMIT 1
  `).get({ userId, otherId: otherUserId }) as DbFriendRow | undefined;

  return row ? mapRow(row, userId) : null;
}

/**
 * Given a list of phone numbers, returns the set of user IDs (along with their
 * username and phone) that are registered LUNA users.
 * Silently ignores phones not in the users table.
 */
export function findUsersByPhones(
  phones: string[],
): Array<{ id: string; username: string; phoneNumber: string }> {
  if (phones.length === 0) return [];

  // better-sqlite3 doesn't support IN (?) with arrays directly;
  // build placeholders manually
  const placeholders = phones.map(() => "?").join(",");
  const rows = db.prepare(
    `SELECT id, username, phone_number FROM users WHERE phone_number IN (${placeholders})`
  ).all(phones) as Array<{ id: string; username: string; phone_number: string }>;

  return rows.map((r) => ({ id: r.id, username: r.username, phoneNumber: r.phone_number }));
}

// ── Analytics ────────────────────────────────────────────────────────────────

export function logFriendEvent(
  userId: string,
  eventType: string,
  meta?: Record<string, unknown>,
): void {
  db.prepare(
    `INSERT INTO friend_events (user_id, event_type, meta, created_at)
     VALUES (?, ?, ?, ?)`
  ).run([userId, eventType, meta ? JSON.stringify(meta) : null, new Date().toISOString()]);
}

export function logContactInvite(senderId: string, normalizedPhone: string): void {
  const hash = crypto.createHash("sha256").update(normalizedPhone).digest("hex");
  const id = `${senderId}_${hash}`;
  db.prepare(
    `INSERT OR IGNORE INTO contact_invites (id, sender_id, phone_hash, sent_at)
     VALUES (?, ?, ?, ?)`
  ).run([id, senderId, hash, new Date().toISOString()]);
}

// ── Admin analytics queries ──────────────────────────────────────────────────

/** Total accepted friendships count by type */
export function countFriendships(type?: FriendshipType): number {
  const row = db.prepare(
    `SELECT COUNT(*) AS n FROM friendships WHERE status = 'accepted'${type ? ` AND type = ?` : ""}`
  ).get(type ? [type] : undefined) as { n: number };
  return row.n;
}

/** Total unique invite probes sent */
export function countInvitesSent(): number {
  const row = db.prepare(
    `SELECT COUNT(*) AS n FROM contact_invites`
  ).get() as { n: number };
  return row.n;
}

/** Count of contact_scan events — gives match rate when compared to match_found events */
export function getFriendEventStats(): {
  contactScans:      number;
  matchesFound:      number;
  requestsSent:      number;
  invitesSent:       number;
  friendships:       number;
  erosFriendships:   number;
  blocked:           number;
  matchRate:         number; // matchesFound / contactScans (0-100)
  addRate:           number; // requestsSent / matchesFound (0-100)
} {
  const count = (evType: string) =>
    (db.prepare(
      `SELECT COUNT(*) AS n FROM friend_events WHERE event_type = ?`
    ).get([evType]) as { n: number }).n;

  const blockedRow = db.prepare(
    `SELECT COUNT(*) AS n FROM friendships WHERE status = 'blocked'`
  ).get() as { n: number };

  const scans   = count("contact_scan");
  const matches = count("match_found");
  const reqs    = count("friend_request_sent");

  return {
    contactScans:    scans,
    matchesFound:    matches,
    requestsSent:    reqs,
    invitesSent:     countInvitesSent(),
    friendships:     countFriendships("friend"),
    erosFriendships: countFriendships("eros"),
    blocked:         blockedRow.n,
    matchRate:       scans  > 0 ? Math.round(matches / scans  * 100) : 0,
    addRate:         matches > 0 ? Math.round(reqs    / matches * 100) : 0,
  };
}
