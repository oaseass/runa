import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const dataDir = path.join(process.cwd(), "data");
const dbPath = process.env.LUNA_DB_PATH?.trim() || path.join(dataDir, "luna.db");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    phone_number TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS onboarding_profiles (
    user_id TEXT PRIMARY KEY,
    birth_date TEXT,
    birth_hour INTEGER,
    birth_minute INTEGER,
    birth_time_text TEXT,
    birth_place_id TEXT,
    birth_place_full_text TEXT,
    birth_place_main_text TEXT,
    birth_place_secondary_text TEXT,
    birth_latitude REAL,
    birth_longitude REAL,
    birth_timezone TEXT,
    birth_utc_datetime TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS natal_charts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    calc_version TEXT NOT NULL,
    chart_json TEXT NOT NULL,
    computed_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS otp_sessions (
    phone_number TEXT PRIMARY KEY,
    country_code TEXT NOT NULL,
    national_number TEXT NOT NULL,
    otp_hash TEXT NOT NULL,
    otp_sent_at INTEGER NOT NULL,
    otp_expires_at INTEGER NOT NULL,
    resend_available_at INTEGER NOT NULL,
    verification_status INTEGER NOT NULL,
    failed_attempts INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS void_analysis_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    category TEXT NOT NULL,
    question_text TEXT NOT NULL,
    question_type TEXT NOT NULL,
    chart_hash TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    analysis_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_preferences (
    user_id TEXT PRIMARY KEY,
    notify_daily_reading INTEGER NOT NULL DEFAULT 1,
    notify_analysis_done INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    birth_date TEXT NOT NULL,
    birth_hour INTEGER,
    birth_minute INTEGER,
    birth_latitude REAL,
    birth_longitude REAL,
    birth_timezone TEXT,
    birth_utc_datetime TEXT,
    time_known INTEGER NOT NULL DEFAULT 0,
    chart_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS synastry_cache (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    connection_id TEXT NOT NULL,
    owner_chart_hash TEXT NOT NULL,
    analysis_json TEXT NOT NULL,
    computed_at TEXT NOT NULL,
    UNIQUE(owner_user_id, connection_id, owner_chart_hash),
    FOREIGN KEY(connection_id) REFERENCES connections(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    metadata TEXT,
    payment_key TEXT,
    payment_type TEXT,
    analysis_id TEXT,
    paid_at TEXT,
    fail_code TEXT,
    fail_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Friend system tables
db.exec(`
  CREATE TABLE IF NOT EXISTS friendships (
    id TEXT PRIMARY KEY,
    requester_id TEXT NOT NULL,
    addressee_id TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'friend',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(requester_id, addressee_id),
    FOREIGN KEY(requester_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(addressee_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS contact_invites (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    phone_hash TEXT NOT NULL,
    sent_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(sender_id, phone_hash),
    FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS friend_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    event_type TEXT NOT NULL,
    meta TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Analytics tables
db.exec(`
  CREATE TABLE IF NOT EXISTS page_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    session_id TEXT NOT NULL,
    page_path TEXT NOT NULL,
    referrer_path TEXT,
    duration_ms INTEGER,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    session_id TEXT NOT NULL,
    event_name TEXT NOT NULL,
    page_path TEXT,
    properties TEXT,
    created_at TEXT NOT NULL
  );
`);

// Migrate existing onboarding_profiles table — add new columns if missing
const migrateColumns = [
  "ALTER TABLE onboarding_profiles ADD COLUMN birth_date TEXT",
  "ALTER TABLE onboarding_profiles ADD COLUMN birth_latitude REAL",
  "ALTER TABLE onboarding_profiles ADD COLUMN birth_longitude REAL",
  "ALTER TABLE onboarding_profiles ADD COLUMN birth_timezone TEXT",
  "ALTER TABLE onboarding_profiles ADD COLUMN birth_utc_datetime TEXT",
  // orders — report JSON storage (yearly / area products)
  "ALTER TABLE orders ADD COLUMN report_json TEXT",
];
for (const sql of migrateColumns) {
  try { db.exec(sql); } catch { /* column already exists */ }
}

// ── Entitlement system (IAP / subscription state) ─────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS entitlements (
    user_id              TEXT PRIMARY KEY,
    is_vip               INTEGER NOT NULL DEFAULT 0,
    vip_source           TEXT,           -- 'vip_monthly'|'vip_yearly'|'admin'
    vip_expires_at       TEXT,           -- ISO-8601; NULL = indefinite (admin grant)
    vip_grace_until      TEXT,           -- billing grace period end (≤16 days after expiry)
    annual_report_owned  INTEGER NOT NULL DEFAULT 0,
    area_reports_owned   INTEGER NOT NULL DEFAULT 0,
    void_credits         INTEGER NOT NULL DEFAULT 0,
    updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS iap_receipts (
    id                      TEXT PRIMARY KEY,
    user_id                 TEXT NOT NULL,
    platform                TEXT NOT NULL,   -- 'apple' | 'google' | 'toss'
    sku_id                  TEXT NOT NULL,   -- products.ts SkuId
    transaction_id          TEXT NOT NULL,
    original_transaction_id TEXT,
    purchase_token          TEXT,
    status                  TEXT NOT NULL,   -- 'valid'|'invalid'|'expired'|'cancelled'|'refunded'
    purchase_date           TEXT,
    expires_date            TEXT,
    processed_at            TEXT NOT NULL DEFAULT (datetime('now')),
    raw_response            TEXT,
    UNIQUE(platform, transaction_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_iap_receipts_user     ON iap_receipts(user_id);
  CREATE INDEX IF NOT EXISTS idx_iap_receipts_sku      ON iap_receipts(sku_id);
  CREATE INDEX IF NOT EXISTS idx_entitlements_vip      ON entitlements(is_vip);
`);

export { db };
