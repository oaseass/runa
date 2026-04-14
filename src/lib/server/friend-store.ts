import crypto from "node:crypto";
import { db } from "./db";
import { getExternalAuthStorage } from "./auth-storage";
import {
  findPublicAuthAccountByPhone,
  findPublicAuthAccountsByPhones,
  listPublicAuthAccountsByIds,
  searchPublicAuthAccountsByUsername,
} from "./auth-account-store";

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
  created_at:     string;
};

type StoredFriendship = {
  id: string;
  requesterId: string;
  addresseeId: string;
  type: FriendshipType;
  status: FriendshipStatus;
  createdAt: string;
  updatedAt: string;
};

const FRIENDSHIP_KEY_PREFIX = "luna:friends:v1";

function friendshipItemKey(id: string) {
  return `${FRIENDSHIP_KEY_PREFIX}:item:${id}`;
}

function friendshipUserIndexKey(userId: string) {
  return `${FRIENDSHIP_KEY_PREFIX}:user:${userId}`;
}

function friendshipPairKey(userA: string, userB: string) {
  const [left, right] = [userA, userB].sort();
  return `${FRIENDSHIP_KEY_PREFIX}:pair:${left}:${right}`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function mapRow(row: DbFriendRow, myUserId: string, username: string): FriendRow {
  return {
    id:        row.id,
    userId:    row.other_user_id,
    username,
    type:      row.type as FriendshipType,
    status:    row.status as FriendshipStatus,
    direction: row.requester_id === myUserId ? "sent" : "received",
    createdAt: row.created_at,
  };
}

function mapStoredFriendship(row: StoredFriendship, myUserId: string, username: string): FriendRow {
  const otherUserId = row.requesterId === myUserId ? row.addresseeId : row.requesterId;
  return {
    id: row.id,
    userId: otherUserId,
    username,
    type: row.type,
    status: row.status,
    direction: row.requesterId === myUserId ? "sent" : "received",
    createdAt: row.createdAt,
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
    CASE WHEN f.requester_id = @userId THEN f.addressee_id ELSE f.requester_id END AS other_user_id
  FROM friendships f
`;

async function mapRowsWithAccounts(rows: DbFriendRow[], myUserId: string): Promise<FriendRow[]> {
  const accounts = await listPublicAuthAccountsByIds(rows.map((row) => row.other_user_id));
  const usernameById = new Map(accounts.map((account) => [account.id, account.username]));

  return rows.map((row) => mapRow(row, myUserId, usernameById.get(row.other_user_id) ?? "알 수 없음"));
}

async function getExternalFriendStorage() {
  try {
    return getExternalAuthStorage();
  } catch {
    return null;
  }
}

async function getExternalFriendship(userId: string, otherUserId: string): Promise<StoredFriendship | null> {
  const redis = await getExternalFriendStorage();
  if (!redis) {
    return null;
  }

  const friendshipId = await redis.get<string>(friendshipPairKey(userId, otherUserId));
  if (!friendshipId) {
    return null;
  }

  return (await redis.get<StoredFriendship>(friendshipItemKey(friendshipId))) ?? null;
}

async function setExternalFriendship(record: StoredFriendship): Promise<void> {
  const redis = await getExternalFriendStorage();
  if (!redis) {
    return;
  }

  const requesterKey = friendshipUserIndexKey(record.requesterId);
  const addresseeKey = friendshipUserIndexKey(record.addresseeId);
  const [requesterIds, addresseeIds] = await Promise.all([
    redis.get<string[]>(requesterKey),
    redis.get<string[]>(addresseeKey),
  ]);

  const nextRequesterIds = [record.id, ...(requesterIds ?? []).filter((id) => id !== record.id)];
  const nextAddresseeIds = [record.id, ...(addresseeIds ?? []).filter((id) => id !== record.id)];

  await Promise.all([
    redis.set(friendshipItemKey(record.id), record),
    redis.set(friendshipPairKey(record.requesterId, record.addresseeId), record.id),
    redis.set(requesterKey, nextRequesterIds),
    redis.set(addresseeKey, nextAddresseeIds),
  ]);
}

async function removeExternalFriendshipRecord(record: StoredFriendship): Promise<void> {
  const redis = await getExternalFriendStorage();
  if (!redis) {
    return;
  }

  const requesterKey = friendshipUserIndexKey(record.requesterId);
  const addresseeKey = friendshipUserIndexKey(record.addresseeId);
  const [requesterIds, addresseeIds] = await Promise.all([
    redis.get<string[]>(requesterKey),
    redis.get<string[]>(addresseeKey),
  ]);

  await Promise.all([
    redis.del(friendshipItemKey(record.id)),
    redis.del(friendshipPairKey(record.requesterId, record.addresseeId)),
    redis.set(requesterKey, (requesterIds ?? []).filter((id) => id !== record.id)),
    redis.set(addresseeKey, (addresseeIds ?? []).filter((id) => id !== record.id)),
  ]);
}

async function listExternalFriendships(userId: string): Promise<StoredFriendship[]> {
  const redis = await getExternalFriendStorage();
  if (!redis) {
    return [];
  }

  const ids = (await redis.get<string[]>(friendshipUserIndexKey(userId))) ?? [];
  if (ids.length === 0) {
    return [];
  }

  const records = await Promise.all(ids.map((id) => redis.get<StoredFriendship>(friendshipItemKey(id))));
  return records.filter((record): record is StoredFriendship => record !== null);
}

// ── Write operations ─────────────────────────────────────────────────────────

/**
 * Creates or no-ops a friendship/eros record.
 * For contact-based discovery we auto-accept (status = 'accepted').
 * Returns the friendship id.
 */
export async function addFriend(
  requesterId: string,
  addresseeId: string,
  type: FriendshipType = "friend",
  autoAccept = true,
): Promise<string> {
  const externalStorage = await getExternalFriendStorage();
  if (externalStorage) {
    const now = new Date().toISOString();
    const existing = await getExternalFriendship(requesterId, addresseeId);
    if (existing) {
      const nextRecord: StoredFriendship = {
        ...existing,
        type,
        status: autoAccept ? "accepted" : existing.status === "declined" ? "pending" : existing.status,
        updatedAt: now,
      };
      await setExternalFriendship(nextRecord);
      return nextRecord.id;
    }

    const record: StoredFriendship = {
      id: newId(),
      requesterId,
      addresseeId,
      type,
      status: autoAccept ? "accepted" : "pending",
      createdAt: now,
      updatedAt: now,
    };
    await setExternalFriendship(record);
    return record.id;
  }

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

export async function removeFriend(userId: string, otherUserId: string): Promise<boolean> {
  const externalStorage = await getExternalFriendStorage();
  if (externalStorage) {
    const existing = await getExternalFriendship(userId, otherUserId);
    if (!existing) {
      return false;
    }

    await removeExternalFriendshipRecord(existing);
    return true;
  }

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
export async function acceptFriend(userId: string, otherUserId: string): Promise<boolean> {
  const externalStorage = await getExternalFriendStorage();
  if (externalStorage) {
    const existing = await getExternalFriendship(userId, otherUserId);
    if (!existing || existing.requesterId !== otherUserId || existing.addresseeId !== userId || existing.status !== "pending") {
      return false;
    }

    await setExternalFriendship({
      ...existing,
      status: "accepted",
      updatedAt: new Date().toISOString(),
    });
    return true;
  }

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
export async function blockFriend(blockerId: string, blockedId: string): Promise<void> {
  const externalStorage = await getExternalFriendStorage();
  if (externalStorage) {
    const existing = await getExternalFriendship(blockerId, blockedId);
    if (existing) {
      await removeExternalFriendshipRecord(existing);
    }

    const now = new Date().toISOString();
    await setExternalFriendship({
      id: newId(),
      requesterId: blockerId,
      addresseeId: blockedId,
      type: "friend",
      status: "blocked",
      createdAt: now,
      updatedAt: now,
    });
    return;
  }

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

export async function unblockFriend(blockerId: string, blockedId: string): Promise<boolean> {
  const externalStorage = await getExternalFriendStorage();
  if (externalStorage) {
    const existing = await getExternalFriendship(blockerId, blockedId);
    if (!existing || existing.requesterId !== blockerId || existing.addresseeId !== blockedId || existing.status !== "blocked") {
      return false;
    }

    await removeExternalFriendshipRecord(existing);
    return true;
  }

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
export async function findUserByPhone(
  phone: string,
  excludeUserId?: string,
): Promise<{ id: string; username: string } | null> {
  return findPublicAuthAccountByPhone(phone, excludeUserId);
}

/**
 * Search LUNA users by username prefix (case-insensitive).
 * Returns up to 20 matches, excluding a given userId.
 */
export async function searchUsersByUsername(
  query: string,
  excludeUserId?: string,
): Promise<Array<{ id: string; username: string }>> {
  return searchPublicAuthAccountsByUsername(query, excludeUserId, 20);
}

// ── Read operations ──────────────────────────────────────────────────────────

export async function listFriends(userId: string, type?: FriendshipType): Promise<FriendRow[]> {
  const externalStorage = await getExternalFriendStorage();
  if (externalStorage) {
    const rows = (await listExternalFriendships(userId))
      .filter((row) => row.status === "accepted" && (!type || row.type === type))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    const otherUserIds = rows.map((row) => row.requesterId === userId ? row.addresseeId : row.requesterId);
    const accounts = await listPublicAuthAccountsByIds(otherUserIds);
    const usernameById = new Map(accounts.map((account) => [account.id, account.username]));

    return rows.map((row) => {
      const otherUserId = row.requesterId === userId ? row.addresseeId : row.requesterId;
      return mapStoredFriendship(row, userId, usernameById.get(otherUserId) ?? "알 수 없음");
    });
  }

  const rows = db.prepare(`
    ${FRIEND_SELECT}
    WHERE (f.requester_id = @userId OR f.addressee_id = @userId)
      AND f.status = 'accepted'
      ${type ? `AND f.type = '${type}'` : ""}
    ORDER BY f.created_at DESC
  `).all({ userId }) as DbFriendRow[];

  return mapRowsWithAccounts(rows, userId);
}

export async function listPendingReceived(userId: string): Promise<FriendRow[]> {
  const externalStorage = await getExternalFriendStorage();
  if (externalStorage) {
    const rows = (await listExternalFriendships(userId))
      .filter((row) => row.addresseeId === userId && row.status === "pending")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    const otherUserIds = rows.map((row) => row.requesterId);
    const accounts = await listPublicAuthAccountsByIds(otherUserIds);
    const usernameById = new Map(accounts.map((account) => [account.id, account.username]));

    return rows.map((row) => mapStoredFriendship(row, userId, usernameById.get(row.requesterId) ?? "알 수 없음"));
  }

  const rows = db.prepare(`
    ${FRIEND_SELECT}
    WHERE f.addressee_id = @userId AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `).all({ userId }) as DbFriendRow[];

  return mapRowsWithAccounts(rows, userId);
}

/**
 * Get the friendship status between two users (any direction).
 * Returns null if no relationship exists.
 */
export async function getFriendship(userId: string, otherUserId: string): Promise<FriendRow | null> {
  const externalStorage = await getExternalFriendStorage();
  if (externalStorage) {
    const row = await getExternalFriendship(userId, otherUserId);
    if (!row) {
      return null;
    }

    const accounts = await listPublicAuthAccountsByIds([
      row.requesterId === userId ? row.addresseeId : row.requesterId,
    ]);
    const otherUsername = accounts[0]?.username ?? "알 수 없음";
    return mapStoredFriendship(row, userId, otherUsername);
  }

  const row = db.prepare(`
    ${FRIEND_SELECT}
    WHERE (
      (f.requester_id = @userId   AND f.addressee_id = @otherId)
   OR (f.requester_id = @otherId  AND f.addressee_id = @userId)
    )
    LIMIT 1
  `).get({ userId, otherId: otherUserId }) as DbFriendRow | undefined;

  if (!row) {
    return null;
  }

  const accounts = await listPublicAuthAccountsByIds([row.other_user_id]);
  return mapRow(row, userId, accounts[0]?.username ?? "알 수 없음");
}

/**
 * Given a list of phone numbers, returns the set of user IDs (along with their
 * username and phone) that are registered LUNA users.
 * Silently ignores phones not in the users table.
 */
export async function findUsersByPhones(
  phones: string[],
): Promise<Array<{ id: string; username: string; phoneNumber: string }>> {
  return findPublicAuthAccountsByPhones(phones);
}

// ── Analytics ────────────────────────────────────────────────────────────────

export function logFriendEvent(
  userId: string,
  eventType: string,
  meta?: Record<string, unknown>,
): void {
  try {
    db.prepare(
      `INSERT INTO friend_events (user_id, event_type, meta, created_at)
       VALUES (?, ?, ?, ?)`
    ).run([userId, eventType, meta ? JSON.stringify(meta) : null, new Date().toISOString()]);
  } catch {
    // Analytics logging must not break user-facing flows.
  }
}

export function logContactInvite(senderId: string, normalizedPhone: string): void {
  try {
    const hash = crypto.createHash("sha256").update(normalizedPhone).digest("hex");
    const id = `${senderId}_${hash}`;
    db.prepare(
      `INSERT OR IGNORE INTO contact_invites (id, sender_id, phone_hash, sent_at)
       VALUES (?, ?, ?, ?)`
    ).run([id, senderId, hash, new Date().toISOString()]);
  } catch {
    // Invite analytics is best-effort only.
  }
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
