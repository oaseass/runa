/**
 * gen-session-cookie.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates a luna_auth cookie value for a given test user.
 * Run:  npx tsx src/lib/__tests__/gen-session-cookie.ts <username>
 *
 * Output: cookie string → paste into DevTools → Application → Cookies
 */

import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";

const dbPath = process.env.LUNA_DB_PATH?.trim() ||
  path.join(process.cwd(), "data", "luna.db");
const db = new Database(dbPath);

// Load .env.local so AUTH_SESSION_SECRET matches the running server
function loadEnvLocal() {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] ??= m[2].trim();
    }
  } catch { /* ignore */ }
}
loadEnvLocal();

const username = process.argv[2];
if (!username) {
  console.error("Usage: npx tsx src/lib/__tests__/gen-session-cookie.ts <username>");
  process.exit(1);
}

const row = db.prepare("SELECT id, username, phone_number FROM users WHERE username = ?")
  .get(username) as { id: string; username: string; phone_number: string } | undefined;

if (!row) {
  console.error(`User '${username}' not found. Run seed-test-users.ts first.`);
  process.exit(1);
}

const SESSION_SECRET = process.env.AUTH_SESSION_SECRET?.trim() || "luna-dev-session-secret-change-me";
const SESSION_TTL    = 60 * 60 * 24 * 30;

function b64url(s: string) { return Buffer.from(s, "utf8").toString("base64url"); }
function sign(data: string) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(data).digest("base64url");
}

const now = Math.floor(Date.now() / 1000);
const claims = {
  userId: row.id, username: row.username, phoneNumber: row.phone_number,
  loginMethod: "phone" as const, iat: now, exp: now + SESSION_TTL,
};
const payload = b64url(JSON.stringify(claims));
const token   = `${payload}.${sign(payload)}`;

console.log(`\nluna_auth cookie for '${username}':\n`);
console.log(`  Name:  luna_auth`);
console.log(`  Value: ${token}\n`);
console.log("DevTools → Application → Cookies → + → paste above");
console.log(`URL: http://localhost:3000\n`);
