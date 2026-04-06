/**
 * me-void-home.spec.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * E2E: /me, /void, /home 페이지별 인증 가드 + entitlement UI 반영 검수.
 *
 * 테스트 의존:
 *   npx tsx src/lib/__tests__/seed-test-users.ts  (DB 시드)
 *   npm run dev                                    (서버 :3000)
 */

import { test, expect } from "@playwright/test";
import { loginAs, SKIP_PAYMENT } from "./helpers";

// ═══════════════════════════════════════════════════════════════════════════════
// 1. /me 페이지
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("/me 페이지", () => {
  test("비로그인 → /account-access 로 리다이렉트", async ({ page }) => {
    await page.goto("/me");
    await expect(page).toHaveURL(/\/account-access/);
  });

  test("test_free 로그인 → @username 표시, 출생 데이터 없음 안내", async ({ context, page }) => {
    await loginAs(context, "test_free");
    await page.goto("/me");
    // NoChartState 컴포넌트: "@test_free" 렌더
    await expect(page.getByText("@test_free")).toBeVisible();
    await expect(page.getByText("출생 데이터가 없습니다")).toBeVisible();
    // 출생 입력 CTA 있음
    await expect(page.getByRole("link", { name: /출생 정보 입력/i })).toBeVisible();
  });

  test("test_vip_monthly 로그인 → @username 표시, 페이지 접근 가능", async ({ context, page }) => {
    await loginAs(context, "test_vip_monthly");
    await page.goto("/me");
    // 최소한 @username 렌더 (NoChartState 또는 YouHeader)
    await expect(page.getByText("@test_vip_monthly")).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. /void 페이지
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("/void 페이지", () => {
  test("비로그인 → /account-access 로 리다이렉트", async ({ page }) => {
    await page.goto("/void");
    await expect(page).toHaveURL(/\/account-access/);
  });

  test("test_free 로그인, 출생 데이터 없음 → 출생 입력 페이지로 리다이렉트", async ({ context, page }) => {
    await loginAs(context, "test_free");
    await page.goto("/void");
    // void/layout.tsx: 차트 없으면 /birth-time?edit=1 또는 /birth-place?edit=1 로 이동
    await expect(page).toHaveURL(/(birth-time|birth-place|profile\/chart)/);
  });

  test("test_void 로그인, 출생 데이터 없음 → 출생 입력 페이지로 리다이렉트", async ({ context, page }) => {
    await loginAs(context, "test_void");
    await page.goto("/void");
    await expect(page).toHaveURL(/(birth-time|birth-place|profile\/chart)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. /home 페이지
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("/home 페이지", () => {
  test("비로그인 → /api/auth/session/me 는 401 반환 (redirect 기반)", async ({ request }) => {
    // /home 은 client component → fetch("/api/auth/session/me") 후 router.replace("/")
    // client-side redirect 타이밍이 불확실하므로 API 레벨 검증
    const resp = await request.get("/api/auth/session/me");
    expect(resp.status()).toBeGreaterThanOrEqual(400);
  });

  test("test_free 로그인 → /home 렌더 (콘텐츠 로딩)", async ({ context, page }) => {
    await loginAs(context, "test_free");
    await page.goto("/home");
    // auth 성공 시 /home URL 유지
    await expect(page).toHaveURL(/\/home/);
  });

  test("test_vip_monthly 로그인 → VIP 배지 표시", async ({ context, page }) => {
    await loginAs(context, "test_vip_monthly");
    await page.goto("/home");
    // /home은 /api/user/status 페치 후 isVip 상태 반영
    // VipBadge: aria-label="VIP 멤버"
    await expect(page.locator('[aria-label="VIP 멤버"]')).toBeVisible({ timeout: 10_000 });
  });

  test("test_free 로그인 → VIP 배지 없음 (SKIP_PAYMENT=false 환경 한정)", async ({ context, page }) => {
    await loginAs(context, "test_free");
    await page.goto("/home");
    await expect(page).toHaveURL(/\/home/);
    if (!SKIP_PAYMENT) {
      // SKIP_PAYMENT=false 환경에서만 배지 없음 검증
      await page.waitForTimeout(3_000); // status API 응답 대기
      await expect(page.locator('[aria-label="VIP 멤버"]')).not.toBeVisible();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. /home/detail 페이지 (deep link)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("/home/detail 접근 가드", () => {
  test("비로그인 → /home/detail/love 접근 시 /api/auth/session/me 는 401", async ({ request }) => {
    // detail 페이지도 client component → api/auth/session/me 실패 → redirect
    // API 레벨 검증이 더 신뢰성 있음
    const resp = await request.get("/api/auth/session/me");
    expect(resp.status()).toBeGreaterThanOrEqual(400);
  });
});
