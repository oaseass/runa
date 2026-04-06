import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const raw = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
const env: Record<string, string> = {};
for (const line of raw.split("\n")) {
  const m = line.match(/^([^#=\r\n][^=]*)=(.*)/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/\r$/, "");
}

const SECRET = env.AUTH_SESSION_SECRET!;
const SKIP = env.SKIP_PAYMENT === "true";
console.log("SECRET length:", SECRET.length, "| SKIP_PAYMENT:", SKIP, "\n");

const db = new Database("data/luna.db");

function makeToken(username: string): string {
  const row = db.prepare("SELECT id, username, phone_number FROM users WHERE username = ?").get(username) as {id: string; username: string; phone_number: string} | undefined;
  if (!row) throw new Error("user not found: " + username);
  const now = Math.floor(Date.now() / 1000);
  const claims = { userId: row.id, username: row.username, phoneNumber: row.phone_number, loginMethod: "phone", iat: now, exp: now + 2592000 };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return payload + "." + sig;
}

const TEST_CASES = [
  { username: "test_free",        expect: { isPro: false, isVip: false, voidCredits: 0, annualReportOwned: false, areaReportsOwned: false } },
  { username: "test_vip_monthly", expect: { isPro: true,  isVip: true,  voidCredits: 0, annualReportOwned: false, areaReportsOwned: false } },
  { username: "test_vip_yearly",  expect: { isPro: true,  isVip: true,  voidCredits: 0, annualReportOwned: false, areaReportsOwned: false } },
  { username: "test_annual",      expect: { isPro: false, isVip: false, voidCredits: 0, annualReportOwned: true,  areaReportsOwned: false } },
  { username: "test_area",        expect: { isPro: false, isVip: false, voidCredits: 0, annualReportOwned: false, areaReportsOwned: true  } },
  { username: "test_void",        expect: { isPro: false, isVip: false, voidCredits: 7, annualReportOwned: false, areaReportsOwned: false } },
];

void (async () => {
  let pass = 0; let fail = 0;
  for (const tc of TEST_CASES) {
    const token = makeToken(tc.username);
    const resp = await fetch("http://localhost:3000/api/user/status", { headers: { cookie: "luna_auth=" + token } });
    const body = await resp.json() as Record<string, unknown>;
    const errors: string[] = [];
    if (body.username !== tc.username) errors.push(`username=${body.username}`);
    for (const [k, v] of Object.entries(tc.expect)) {
      // SKIP_PAYMENT forces isVip=true for authenticated users
      if (SKIP && (k === "isPro" || k === "isVip")) continue;
      if (body[k] !== v) errors.push(`${k}: expected=${v} actual=${body[k]}`);
    }
    if (errors.length === 0) {
      console.log(`✓ ${tc.username}`);
      pass++;
    } else {
      console.log(`✗ ${tc.username}: ${errors.join(", ")}`);
      fail++;
    }
  }
  console.log(`\n결과: ${pass}/${pass+fail} 통과`);
  process.exit(fail > 0 ? 1 : 0);
})();
