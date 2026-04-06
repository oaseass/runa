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

const db = new Database("data/luna.db");
function makeToken(username: string): string {
  const row = db.prepare("SELECT id, username, phone_number FROM users WHERE username = ?")
    .get(username) as {id: string; username: string; phone_number: string};
  const now = Math.floor(Date.now() / 1000);
  const claims = { userId: row.id, username: row.username, phoneNumber: row.phone_number, loginMethod: "phone", iat: now, exp: now + 2592000 };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return payload + "." + sig;
}

void (async () => {
  const token = makeToken("test_free");
  const headers = { cookie: `luna_auth=${token}`, "Content-Type": "application/json" };

  // 1. 메트릭 엔드포인트
  const metricsResp = await fetch("http://localhost:3000/api/test/entitlement-metrics");
  const metrics = await metricsResp.json() as Record<string, unknown>;
  console.log("=== entitlement-metrics ===");
  console.log("stats.totalVip:", (metrics.stats as Record<string, unknown>)?.totalVip);
  console.log("stats.totalVoidCredits:", (metrics.stats as Record<string, unknown>)?.totalVoidCredits);
  console.log("metrics.subscriberChurn:", (metrics.metrics as Record<string, unknown>)?.subscriberChurn);

  // 2. 뮤테이션 - use_void_credit
  const before = await fetch("http://localhost:3000/api/user/status", { headers });
  const beforeStatus = await before.json() as Record<string, unknown>;
  console.log("\n=== before use_void_credit ===");
  console.log("voidCredits:", beforeStatus.voidCredits);

  const mutResp = await fetch("http://localhost:3000/api/test/mutate-entitlement", {
    method: "POST", headers,
    body: JSON.stringify({ username: "test_void", action: "use_void_credit" })
  });
  const mutResult = await mutResp.json() as Record<string, unknown>;
  console.log("\n=== mutate result ===");
  console.log("ok:", mutResult.ok);

  // 쿠키를 test_void로 다시 만들어서 확인
  const token2 = makeToken("test_void");
  const h2 = { cookie: `luna_auth=${token2}` };
  const afterResp = await fetch("http://localhost:3000/api/user/status", { headers: h2 });
  const afterStatus = await afterResp.json() as Record<string, unknown>;
  console.log("\n=== after use_void_credit (test_void) ===");
  console.log("voidCredits:", afterStatus.voidCredits);

  // 복원
  await fetch("http://localhost:3000/api/test/mutate-entitlement", {
    method: "POST", headers,
    body: JSON.stringify({ username: "test_void", action: "set_void_credits", value: 7 })
  });
  const restoredResp = await fetch("http://localhost:3000/api/user/status", { headers: h2 });
  const restoredStatus = await restoredResp.json() as Record<string, unknown>;
  console.log("\n=== after restore (test_void) ===");
  console.log("voidCredits:", restoredStatus.voidCredits);
})();
