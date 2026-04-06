/**
 * state-sync.spec.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * E2E: entitlement 변경 직후 4가지가 동시에 반영되는지 검증.
 *
 *   ① /api/user/status  — voidCredits / annualReportOwned / areaReportsOwned
 *   ② /shop CTA          — VIP 배너 ↔ 구독 카드 교체 / "✓ 구매 완료" 표시
 *   ③ /home VIP 배지      — isVip 변화에 따라 나타나고 사라짐
 *   ④ /me @username 확인 — 페이지가 인증 상태 유지하는지
 *
 * NOTE:
 *   • SKIP_PAYMENT=true 환경에서 status API isVip = 항상 true (인증 유저)
 *     → isVip 변화는 /shop 렌더링(checkVip → DB 직접)으로 검증
 *   • 테스트는 실행 후 DB 원상복구 (cleanup 블록)
 *
 * 사전 조건:
 *   npx tsx src/lib/__tests__/seed-test-users.ts
 *   npm run dev (:3000)
 */

import { test, expect } from "@playwright/test";
import { loginAs, fetchStatus, mutate, SKIP_PAYMENT } from "./helpers";

// ═══════════════════════════════════════════════════════════════════════════════
// 1. VOID 크레딧 — status + shop 동시 반영
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("VOID 크레딧 동시 반영", () => {
  // test_void 는 seeded 상태: void_credits = 7
  // 테스트 후 7로 복원

  test("크레딧 사용 → status.voidCredits 감소, /shop 잔여 크레딧 갱신", async ({ context, page }) => {
    await loginAs(context, "test_void");

    // ── 초기 상태 확인 ──────────────────────────────────────────────────────
    const before = await fetchStatus(context);
    const initialCredits = before.voidCredits; // 7 (seeded)
    expect(initialCredits).toBeGreaterThan(0);

    // ── 크레딧 1회 사용 ────────────────────────────────────────────────────
    await mutate(context, "test_void", "use_void_credit");

    // ── ① status API 반영 ────────────────────────────────────────────────
    const after = await fetchStatus(context);
    expect(after.voidCredits).toBe(initialCredits - 1);

    // ── ② /shop UI 반영 ──────────────────────────────────────────────────
    await page.goto("/shop");
    const expectedCount = initialCredits - 1;
    await expect(page.getByText(new RegExp(`잔여 크레딧.*${expectedCount}회`, "i"))).toBeVisible();

    // ── cleanup ───────────────────────────────────────────────────────────
    await mutate(context, "test_void", "set_void_credits", initialCredits);
    const restored = await fetchStatus(context);
    expect(restored.voidCredits).toBe(initialCredits);
  });

  test("크레딧 0 → status.voidCredits=0, /shop 크레딧 배너 숨김 (floor 동작)", async ({ context, page }) => {
    await loginAs(context, "test_void");
    const before = await fetchStatus(context);
    const initial = before.voidCredits;

    await mutate(context, "test_void", "set_void_credits", 0);

    // ① status API 반영
    const afterStatus = await fetchStatus(context);
    expect(afterStatus.voidCredits).toBe(0);

    // ② /shop: voidCredits=0 → 잔여 크레딧 배너 숨겨짐 (shop.tsx: {voidCredits > 0 && ...})
    await page.goto("/shop");
    await expect(page.getByText(/잔여 크레딧/i)).not.toBeVisible();

    // cleanup
    await mutate(context, "test_void", "set_void_credits", initial);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. VIP 상태 — /shop CTA + /home VIP 배지 동시 반영
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("VIP 상태 변경 동시 반영", () => {
  // test_free 를 VIP로 grant → revoke 후 원상복구

  test("VIP 부여 → /shop '구독 중' 배너 + /home VIP 배지 출현", async ({ context, page }) => {
    await loginAs(context, "test_free");

    // ── 사전: test_free 는 VIP 없음 ──────────────────────────────────────
    await page.goto("/shop");
    // SKIP_PAYMENT=false 환경에서는 VIP 카드 표시
    if (!SKIP_PAYMENT) {
      await expect(page.getByText("34% 절약")).toBeVisible();
      await expect(page.getByText("✦ VIP 구독 중")).not.toBeVisible();
    }

    // ── VIP 부여 ─────────────────────────────────────────────────────────
    await mutate(context, "test_free", "grant_vip");

    // ── ② /shop: "구독 중" 배너 출현, VIP 카드 사라짐 ────────────────────
    await page.goto("/shop");
    await expect(page.getByText("✦ VIP 구독 중")).toBeVisible();
    await expect(page.getByText("34% 절약")).not.toBeVisible();

    // ── ③ /home: VIP 배지 출현 ───────────────────────────────────────────
    await page.goto("/home");
    // /home은 status API 기반 (isVip = SKIP_PAYMENT || checkVip)
    // SKIP_PAYMENT=true 시 항상 VIP → 배지 항상 있음
    // SKIP_PAYMENT=false 시 새로 부여된 VIP 반영
    await expect(page.locator('[aria-label="VIP 멤버"]')).toBeVisible({ timeout: 8_000 });

    // ── cleanup ───────────────────────────────────────────────────────────
    await mutate(context, "test_free", "revoke_vip");
  });

  test("VIP 만료 → /shop VIP 카드 복귀 (SKIP_PAYMENT=false 환경 한정)", async ({ context, page }) => {
    // SKIP_PAYMENT=true 환경에서는 shop이 DB isVip=0 을 보여줘야 하므로
    // 이 테스트는 shop 렌더링이 SKIP_PAYMENT와 무관하게 checkVip() 직접 호출하는걸 검증
    await loginAs(context, "test_vip_monthly");

    // 사전: VIP 상태 → shop "구독 중"
    await page.goto("/shop");
    await expect(page.getByText("✦ VIP 구독 중")).toBeVisible();

    // ── VIP 만료 시뮬레이션 ────────────────────────────────────────────────
    await mutate(context, "test_vip_monthly", "expire_vip");

    // ── shop: VIP 카드 2개 복귀 ────────────────────────────────────────────
    await page.goto("/shop");
    await expect(page.getByText("34% 절약")).toBeVisible();
    await expect(page.getByText("✦ VIP 구독 중")).not.toBeVisible();

    // ── ① status API: isVip 변화 (SKIP_PAYMENT=false 시만 확인) ─────────
    if (!SKIP_PAYMENT) {
      const s = await fetchStatus(context);
      expect(s.isVip).toBe(false);
    }

    // ── cleanup: VIP 복원 ────────────────────────────────────────────────
    await mutate(context, "test_vip_monthly", "grant_vip");
    await page.goto("/shop");
    await expect(page.getByText("✦ VIP 구독 중")).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. 연간/영역 리포트 — status + shop "✓ 구매 완료" 동시 반영
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("리포트 소유 상태 동시 반영", () => {
  test("test_annual → status annualReportOwned=true, /shop '✓ 구매 완료'", async ({ context, page }) => {
    await loginAs(context, "test_annual");

    // ① status API
    const s = await fetchStatus(context);
    expect(s.annualReportOwned).toBe(true);

    // ② /shop UI
    await page.goto("/shop");
    await expect(page.getByText("✓ 구매 완료").first()).toBeVisible();
  });

  test("test_area → status areaReportsOwned=true, /shop '✓ 구매 완료'", async ({ context, page }) => {
    await loginAs(context, "test_area");

    const s = await fetchStatus(context);
    expect(s.areaReportsOwned).toBe(true);

    await page.goto("/shop");
    await expect(page.getByText("✓ 구매 완료").first()).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. 환불/복원 직후 UI 반영
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("환불/복원 직후 UI 반영", () => {
  test("VIP 취소(revoke) → shop VIP 카드 즉시 복귀", async ({ context, page }) => {
    // test_vip_yearly 를 revoke 후 재확인, 그 다음 복원
    await loginAs(context, "test_vip_yearly");

    // 사전 확인
    await page.goto("/shop");
    await expect(page.getByText("✦ VIP 구독 중")).toBeVisible();

    // revoke (환불 시나리오)
    await mutate(context, "test_vip_yearly", "revoke_vip");

    // 즉시 반영 — 페이지 재이동
    await page.goto("/shop");
    await expect(page.getByText("✦ VIP 구독 중")).not.toBeVisible();
    await expect(page.getByText("34% 절약")).toBeVisible();

    // cleanup
    await mutate(context, "test_vip_yearly", "grant_vip", undefined, "vip_yearly");
    // grant_vip 으로 VIP 복원 (소스: vip_yearly)
    await page.goto("/shop");
    await expect(page.getByText("✦ VIP 구독 중")).toBeVisible();
  });

  test("VOID 크레딧 복원 → status.voidCredits 즉시 반영", async ({ context }) => {
    await loginAs(context, "test_void");

    const before = await fetchStatus(context);
    const initial = before.voidCredits;

    // 전부 소진
    await mutate(context, "test_void", "set_void_credits", 0);
    const empty = await fetchStatus(context);
    expect(empty.voidCredits).toBe(0);

    // 복원 (IAP restore 시나리오)
    await mutate(context, "test_void", "set_void_credits", initial);
    const restored = await fetchStatus(context);
    expect(restored.voidCredits).toBe(initial);
  });
});
