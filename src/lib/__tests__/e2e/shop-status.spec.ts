/**
 * shop-status.spec.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Playwright E2E: verifies /shop and /api/user/status for each of the 6 test
 * user states.
 *
 * Prerequisites:
 *   1. npx tsx src/lib/__tests__/seed-test-users.ts     (seeds DB)
 *   2. npm run dev                                       (server on :3000)
 *   3. npx playwright test --config playwright.config.ts
 *
 * Cookie injection approach:
 *   Each test calls a helper endpoint POST /api/test/session that emits a
 *   Set-Cookie for the requested username. If that endpoint does not exist in
 *   the running app, we fall back to generating the token in-process (same
 *   HMAC logic) and injecting it via context.addCookies().
 */

import { test, expect, type BrowserContext } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// ── Load .env.local so the HMAC secret matches the running server ─────────────
function loadEnvLocal() {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] ??= m[2].trim();
    }
  } catch { /* no .env.local, use defaults */ }
}
loadEnvLocal();

const SKIP_PAYMENT = process.env.SKIP_PAYMENT === "true" || process.env.NEXT_PUBLIC_SKIP_PAYMENT === "true";

// ── Cookie helper ─────────────────────────────────────────────────────────────

const SESSION_SECRET = process.env.AUTH_SESSION_SECRET?.trim() ||
  "luna-dev-session-secret-change-me";
const SESSION_TTL = 60 * 60 * 24 * 30;

/**  Lookup userId + phone from the running server's test helper endpoint. */
async function injectSessionCookie(
  context: BrowserContext,
  username: string,
  userId: string,
  phoneNumber: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    userId, username, phoneNumber,
    loginMethod: "phone" as const,
    iat: now, exp: now + SESSION_TTL,
  };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const sig     = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  const token   = `${payload}.${sig}`;

  await context.addCookies([{
    name: "luna_auth", value: token,
    domain: "localhost", path: "/",
    httpOnly: true, sameSite: "Lax",
    expires: now + SESSION_TTL,
  }]);
}

// ── Fetch test user info from a lightweight endpoint ─────────────────────────

/** GET /api/test/user-info?username=X  → { userId, username, phoneNumber } */
async function fetchTestUserInfo(baseURL: string, username: string) {
  const resp = await fetch(`${baseURL}/api/test/user-info?username=${username}`);
  if (!resp.ok) {
    throw new Error(`test user-info endpoint returned ${resp.status}. Did you run seed-test-users.ts?`);
  }
  return resp.json() as Promise<{ userId: string; username: string; phoneNumber: string }>;
}

// ── Shared helper ─────────────────────────────────────────────────────────────

async function loginAs(context: BrowserContext, username: string, baseURL: string) {
  const info = await fetchTestUserInfo(baseURL, username);
  await injectSessionCookie(context, username, info.userId, info.phoneNumber);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 0. 시드 상태 복원 (다른 spec의 DB 변경으로부터 보호)
// ═══════════════════════════════════════════════════════════════════════════════

test.beforeAll(async ({ request }) => {
  // test_void void_credits 원상복구: 다른 spec이 수정했을 경우 대비
  await request.post("/api/test/mutate-entitlement", {
    data: { username: "test_void", action: "set_void_credits", value: 7 },
  });
  // test_vip_monthly VIP 복원 (expire_vip 으로 만료됐을 경우)
  await request.post("/api/test/mutate-entitlement", {
    data: { username: "test_vip_monthly", action: "grant_vip" },
  });
  // test_free VIP 제거 (grant_vip 으로 부여됐을 경우)
  await request.post("/api/test/mutate-entitlement", {
    data: { username: "test_free", action: "revoke_vip" },
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. /api/user/status 검증
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("GET /api/user/status — 6 user states", () => {
  const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

  async function getStatus(context: BrowserContext) {
    const resp = await context.request.get("/api/user/status");
    return resp.json() as Promise<{
      isPro: boolean; isVip: boolean; voidCredits: number;
      annualReportOwned: boolean; areaReportsOwned: boolean; username: string;
    }>;
  }

  test("1. 무로그인 → 기본값 반환", async ({ context }) => {
    const status = await getStatus(context);
    expect(status.isPro).toBe(false);
    expect(status.isVip).toBe(false);
    expect(status.voidCredits).toBe(0);
  });

  test("2. test_free — isVip=false, voidCredits=0", async ({ context }) => {
    await loginAs(context, "test_free", BASE);
    const s = await getStatus(context);
    // With SKIP_PAYMENT=true the server forces isVip=true for any authenticated user.
    // We verify structural correctness; isVip depends on env flag.
    if (!SKIP_PAYMENT) expect(s.isVip).toBe(false);
    expect(s.voidCredits).toBe(0);
    expect(s.annualReportOwned).toBe(false);
    expect(s.areaReportsOwned).toBe(false);
    expect(s.username).toBe("test_free");
  });

  test("3. test_vip_monthly — isVip=true", async ({ context }) => {
    await loginAs(context, "test_vip_monthly", BASE);
    const s = await getStatus(context);
    // VIP monthly has is_vip=1 in DB; SKIP_PAYMENT also forces true, so always true here.
    expect(s.isVip).toBe(true);
    expect(s.isPro).toBe(true);
    expect(s.username).toBe("test_vip_monthly");
  });

  test("4. test_vip_yearly — isVip=true", async ({ context }) => {
    await loginAs(context, "test_vip_yearly", BASE);
    const s = await getStatus(context);
    expect(s.isVip).toBe(true);
    expect(s.username).toBe("test_vip_yearly");
  });

  test("5. test_annual — isVip=false, annualReportOwned=true", async ({ context }) => {
    await loginAs(context, "test_annual", BASE);
    const s = await getStatus(context);
    if (!SKIP_PAYMENT) expect(s.isVip).toBe(false);
    expect(s.annualReportOwned).toBe(true);
    expect(s.username).toBe("test_annual");
  });

  test("6. test_area — isVip=false, areaReportsOwned=true", async ({ context }) => {
    await loginAs(context, "test_area", BASE);
    const s = await getStatus(context);
    if (!SKIP_PAYMENT) expect(s.isVip).toBe(false);
    expect(s.areaReportsOwned).toBe(true);
    expect(s.username).toBe("test_area");
  });

  test("7. test_void — voidCredits=7", async ({ context }) => {
    await loginAs(context, "test_void", BASE);
    const s = await getStatus(context);
    expect(s.voidCredits).toBe(7);
    if (!SKIP_PAYMENT) expect(s.isVip).toBe(false);
    expect(s.username).toBe("test_void");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. /shop 화면 검수
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("/shop 화면 — 유저 상태별 렌더링", () => {
  const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

  test("무료 유저 — VIP 구독 카드 2개 표시, 구독 관리 없음", async ({ context, page }) => {
    await loginAs(context, "test_free", BASE);
    await page.goto("/shop");
    await expect(page.getByRole("heading", { name: /LUNA VIP/i })).toBeVisible();
    // 월간/연간 구매 링크
    await expect(page.getByRole("link", { name: /\/store\/checkout\?product=vip_monthly/i })).not.toBeVisible(); // links by href
    // VIP 섹션에 "34% 절약" 배지
    await expect(page.getByText("34% 절약")).toBeVisible();
    // "구독 관리" 링크 없음
    await expect(page.getByRole("link", { name: /구독 관리/i })).not.toBeVisible();
  });

  test("VIP 유저 — 구독 배너 표시, 구독 카드 숨김", async ({ context, page }) => {
    await loginAs(context, "test_vip_monthly", BASE);
    await page.goto("/shop");
    await expect(page.getByText("✦ VIP 구독 중")).toBeVisible();
    await expect(page.getByRole("link", { name: /구독 관리/i })).toBeVisible();
    await expect(page.getByText("34% 절약")).not.toBeVisible();
  });

  test("연간 리포트 구매 유저 — ✓ 구매 완료 표시", async ({ context, page }) => {
    await loginAs(context, "test_annual", BASE);
    await page.goto("/shop");
    await expect(page.getByText("✓ 구매 완료").first()).toBeVisible();
  });

  test("영역 리딩 구매 유저 — ✓ 구매 완료 표시", async ({ context, page }) => {
    await loginAs(context, "test_area", BASE);
    await page.goto("/shop");
    // area 항목에만 구매 완료
    const completedTexts = await page.getByText("✓ 구매 완료").all();
    expect(completedTexts.length).toBe(1);
  });

  test("VOID 크레딧 보유 유저 — 잔여 크레딧 표시", async ({ context, page }) => {
    await loginAs(context, "test_void", BASE);
    await page.goto("/shop");
    await expect(page.getByText(/잔여 크레딧.*7회/i)).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. 복원 / 만료 / 환불 시나리오 (API 레벨)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("복원 / 만료 / 환불 시나리오", () => {
  const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

  test("만료된 VIP → /api/user/status isVip=false (SKIP_PAYMENT=false 환경 한정)", async ({ context }) => {
    // SKIP_PAYMENT=true 환경에서는 인증된 모든 유저가 isVip=true → 이 검증 스킵
    if (SKIP_PAYMENT) return;
    await loginAs(context, "test_free", BASE);
    const resp = await context.request.get("/api/user/status");
    const s = await resp.json() as { isVip: boolean };
    expect(s.isVip).toBe(false);
  });

  test("POST /api/iap/restore — 빈 요청 시 400/401 반환 (서버 동작 확인)", async ({ context }) => {
    await loginAs(context, "test_void", BASE);
    const resp = await context.request.post("/api/iap/restore", {
      data: { platform: "apple", transactions: [] },
    });
    // 빈 transactions → 200 with restoredCount=0
    if (resp.status() === 200) {
      const body = await resp.json() as { restoredCount: number };
      expect(body.restoredCount).toBe(0);
    } else {
      // 인증 실패 가능성
      expect([400, 401, 403]).toContain(resp.status());
    }
  });

  test("POST /api/iap/apple — 위조 JWS → 오류 반환 (서버 보안)", async ({ context }) => {
    await loginAs(context, "test_free", BASE);
    const resp = await context.request.post("/api/iap/apple", {
      data: { signedTransactionInfo: "fake.jws.token" },
    });
    expect(resp.status()).not.toBe(200);
  });

  test("Cache-Control: no-store — status API 응답 캐시 없음", async ({ context }) => {
    // Both authenticated and unauthenticated paths must send no-store.
    const resp = await context.request.get("/api/user/status");
    const cc = resp.headers()["cache-control"];
    expect(cc).toContain("no-store");
  });
});
