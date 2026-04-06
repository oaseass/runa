/**
 * seed-test-users.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Seeds 6 deterministic test users into the local SQLite DB.
 * Run:  npx tsx src/lib/__tests__/seed-test-users.ts
 *
 * Users created (username / phone / password all predictable):
 *   free            +8201000000001  test1234  → no entitlements
 *   vip_monthly     +8201000000002  test1234  → VIP monthly (expires +30d)
 *   vip_yearly      +8201000000003  test1234  → VIP yearly  (expires +365d)
 *   annual          +8201000000004  test1234  → annual_report_owned=1
 *   area            +8201000000005  test1234  → area_reports_owned=1
 *   void_user       +8201000000006  test1234  → void_credits=7
 *
 * The script is idempotent: re-running will UPDATE existing users.
 */

import crypto from "node:crypto";
import path from "node:path";
import Database from "better-sqlite3";

const dbPath = process.env.LUNA_DB_PATH?.trim() ||
  path.join(process.cwd(), "data", "luna.db");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

const PASSWORD   = "test1234";
const PHONE_BASE = "+82010000000";

const USERS = [
  { slot: 1, username: "test_free",        label: "무료 유저" },
  { slot: 2, username: "test_vip_monthly", label: "월간 VIP" },
  { slot: 3, username: "test_vip_yearly",  label: "연간 VIP" },
  { slot: 4, username: "test_annual",      label: "연간 리포트 구매" },
  { slot: 5, username: "test_area",        label: "영역 리딩 구매" },
  { slot: 6, username: "test_void",        label: "VOID 크레딧 보유" },
] as const;

function upsertUser(slot: number, username: string) {
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username) as { id: string } | undefined;
  if (existing) return existing.id;

  const id   = crypto.randomUUID();
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPassword(PASSWORD, salt);
  const now  = new Date().toISOString();
  const phone = `${PHONE_BASE}${slot}`;

  db.prepare(`
    INSERT OR IGNORE INTO users (id, username, phone_number, password_hash, password_salt, created_at, updated_at)
    VALUES (@id, @username, @phone, @hash, @salt, @now, @now)
  `).run({ id, username, phone, hash, salt, now });

  return id;
}

function upsertEntitlement(userId: string, fields: {
  is_vip?:              number;
  vip_source?:          string | null;
  vip_expires_at?:      string | null;
  vip_grace_until?:     string | null;
  annual_report_owned?: number;
  area_reports_owned?:  number;
  void_credits?:        number;
}) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO entitlements
      (user_id, is_vip, vip_source, vip_expires_at, vip_grace_until,
       annual_report_owned, area_reports_owned, void_credits, updated_at)
    VALUES
      (@userId, @is_vip, @vip_source, @vip_expires_at, @vip_grace_until,
       @annual_report_owned, @area_reports_owned, @void_credits, @now)
    ON CONFLICT(user_id) DO UPDATE SET
      is_vip              = @is_vip,
      vip_source          = @vip_source,
      vip_expires_at      = @vip_expires_at,
      vip_grace_until     = @vip_grace_until,
      annual_report_owned = @annual_report_owned,
      area_reports_owned  = @area_reports_owned,
      void_credits        = @void_credits,
      updated_at          = @now
  `).run({
    userId,
    is_vip:              fields.is_vip              ?? 0,
    vip_source:          fields.vip_source          ?? null,
    vip_expires_at:      fields.vip_expires_at      ?? null,
    vip_grace_until:     fields.vip_grace_until     ?? null,
    annual_report_owned: fields.annual_report_owned ?? 0,
    area_reports_owned:  fields.area_reports_owned  ?? 0,
    void_credits:        fields.void_credits        ?? 0,
    now,
  });
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

const now = new Date();

// ── Seed ─────────────────────────────────────────────────────────

const results: { label: string; userId: string; username: string }[] = [];

for (const { slot, username, label } of USERS) {
  const userId = upsertUser(slot, username);
  results.push({ label, userId, username });

  if (slot === 1) {
    // free: ensure no entitlements row (or blank one)
    upsertEntitlement(userId, {});
  } else if (slot === 2) {
    // vip_monthly: active for 30 days
    const exp   = addDays(now, 30);
    const grace = addDays(exp, 16);
    upsertEntitlement(userId, {
      is_vip: 1, vip_source: "vip_monthly",
      vip_expires_at: exp.toISOString(), vip_grace_until: grace.toISOString(),
    });
  } else if (slot === 3) {
    // vip_yearly: active for 365 days
    const exp   = addDays(now, 365);
    const grace = addDays(exp, 16);
    upsertEntitlement(userId, {
      is_vip: 1, vip_source: "vip_yearly",
      vip_expires_at: exp.toISOString(), vip_grace_until: grace.toISOString(),
    });
  } else if (slot === 4) {
    // annual report only, no VIP
    upsertEntitlement(userId, { annual_report_owned: 1 });
  } else if (slot === 5) {
    // area reading only, no VIP
    upsertEntitlement(userId, { area_reports_owned: 1 });
  } else if (slot === 6) {
    // 7 void credits, no VIP
    upsertEntitlement(userId, { void_credits: 7 });
  }
}

console.log("\n✓ Test users seeded\n");
console.table(results.map((r) => ({ ...r, password: PASSWORD })));
console.log("\nCookie 생성은 아래 명령으로:");
console.log("  npx tsx src/lib/__tests__/gen-session-cookie.ts <username>\n");
