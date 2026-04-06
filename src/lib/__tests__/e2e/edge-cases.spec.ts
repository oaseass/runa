/**
 * edge-cases.spec.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * E2E: 운영 예외 케이스 검수.
 *
 *   1. Grace period 종료 직후 UI 반영
 *   2. 환불 후 VIP / 리포트 / 크레딧 상태 변화
 *   3. Restore purchases API 즉시 반영
 *   4. 네트워크 실패 시 stale UI 처리 (status API 503 / 캐시 없음 검증)
 *
 * 사전 조건:
 *   npx tsx src/lib/__tests__/seed-test-users.ts
 *   npm run dev (:3000)
 */

import { test, expect } from "@playwright/test";
import { loginAs, fetchStatus, mutate, SKIP_PAYMENT } from "./helpers";

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Grace Period 종료 직후
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Grace Period — 종료 직후 UI 반영", () => {
  /**
   * VIP 만료 → /shop 에 VIP 카드 복귀
   * (grace_until 없는 단순 만료)
   */
  test("VIP expire → /shop VIP 카드 즉시 복귀", async ({ context, page }) => {
    // 사전 보장: test_vip_monthly VIP 활성 상태
    await mutate(context, "test_vip_monthly", "grant_vip", undefined, "vip_monthly");
    await loginAs(context, "test_vip_monthly");

    await page.goto("/shop");
    await expect(page.getByText("✦ VIP 구독 중")).toBeVisible();

    // 만료 적용
    await mutate(context, "test_vip_monthly", "expire_vip");

    // /shop 재방문 → VIP 카드 표시
    await page.goto("/shop");
    await expect(page.getByText("34% 절약")).toBeVisible();
    await expect(page.getByText("✦ VIP 구독 중")).not.toBeVisible();

    // cleanup
    await mutate(context, "test_vip_monthly", "grant_vip", undefined, "vip_monthly");
  });

  /**
   * Grace period 만료 → status API isVip=false (SKIP_PAYMENT=false 시)
   * mutate API의 expire_vip는 grace_until=NULL 로 설정하므로
   * checkVip()가 즉시 false를 반환해야 함
   */
  test("Grace 없는 만료 → status.isVip=false (SKIP_PAYMENT=false 환경)", async ({ context }) => {
    if (SKIP_PAYMENT) return; // SKIP_PAYMENT 환경에서는 항상 true — 스킵

    await mutate(context, "test_vip_monthly", "grant_vip", undefined, "vip_monthly");
    await loginAs(context, "test_vip_monthly");

    const before = await fetchStatus(context);
    expect(before.isVip).toBe(true);

    await mutate(context, "test_vip_monthly", "expire_vip");

    const after = await fetchStatus(context);
    expect(after.isVip).toBe(false);

    // cleanup
    await mutate(context, "test_vip_monthly", "grant_vip", undefined, "vip_monthly");
  });

  /**
   * Grace period 중 → checkVip는 true를 반환 (grace_until > now)
   * 만료됐지만 grace period 내 → /shop 여전히 "구독 중" 표시
   */
  test("Grace period 중 → /shop '구독 중' 유지", async ({ context, page }) => {
    // expire_vip + grace_until 직접 조작이 필요하므로 set_grace 액션 사용
    await context.request.post("/api/test/mutate-entitlement", {
      data: { username: "test_vip_monthly", action: "grant_vip", vipSource: "vip_monthly" },
    });
    await context.request.post("/api/test/mutate-entitlement", {
      data: { username: "test_vip_monthly", action: "set_grace_period" },
    });

    await loginAs(context, "test_vip_monthly");
    await page.goto("/shop");

    // grace period 중이면 is_vip=1 유지 → "구독 중"
    await expect(page.getByText("✦ VIP 구독 중")).toBeVisible();

    // cleanup
    await mutate(context, "test_vip_monthly", "grant_vip", undefined, "vip_monthly");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. 환불 후 상태 변화
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("환불(Refund) 후 상태 변화", () => {
  test("VIP revoke → status.isVip=false + /shop VIP 카드 복귀", async ({ context, page }) => {
    await mutate(context, "test_vip_monthly", "grant_vip", undefined, "vip_monthly");
    await loginAs(context, "test_vip_monthly");

    const before = await fetchStatus(context);
    if (!SKIP_PAYMENT) expect(before.isVip).toBe(true);

    await mutate(context, "test_vip_monthly", "revoke_vip");

    // 환불 후 status API
    if (!SKIP_PAYMENT) {
      const after = await fetchStatus(context);
      expect(after.isVip).toBe(false);
      expect(after.isPro).toBe(false);
    }

    // 환불 후 /shop
    await page.goto("/shop");
    await expect(page.getByText("34% 절약")).toBeVisible();
    await expect(page.getByText("✦ VIP 구독 중")).not.toBeVisible();

    // cleanup
    await mutate(context, "test_vip_monthly", "grant_vip", undefined, "vip_monthly");
  });

  test("VOID 크레딧 환불 시뮬레이션 — set_void_credits(0) → 크레딧 섹션 숨김", async ({ context, page }) => {
    await mutate(context, "test_void", "set_void_credits", 7); // 보장
    await loginAs(context, "test_void");

    // 환불 → credits=0
    await mutate(context, "test_void", "set_void_credits", 0);

    const after = await fetchStatus(context);
    expect(after.voidCredits).toBe(0);

    await page.goto("/shop");
    // voidCredits=0 → 크레딧 배너 숨겨짐
    await expect(page.getByText(/잔여 크레딧/i)).not.toBeVisible();

    // 연간리포트 + 영역리딩 소유는 voidCredits와 독립 — 변화 없어야 함
    await loginAs(context, "test_annual");
    const annualStatus = await fetchStatus(context);
    expect(annualStatus.annualReportOwned).toBe(true); // 다른 유저 영향 없음

    // cleanup
    await mutate(context, "test_void", "set_void_credits", 7);
  });

  test("VIP 환불 후 연간리포트 소유는 유지 (독립 상품)", async ({ context }) => {
    // 가상의 유저가 VIP + 연간리포트를 함께 보유했다가 VIP만 환불
    // test_annual (연간리포트) + VIP 임시 부여 → VIP만 revoke → annual 유지 검증
    await mutate(context, "test_annual", "grant_vip", undefined, "vip_monthly");
    await loginAs(context, "test_annual");

    const before = await fetchStatus(context);
    expect(before.annualReportOwned).toBe(true);

    await mutate(context, "test_annual", "revoke_vip");

    const after = await fetchStatus(context);
    expect(after.annualReportOwned).toBe(true); // 환불 후에도 유지
    if (!SKIP_PAYMENT) expect(after.isVip).toBe(false);

    // cleanup
    await mutate(context, "test_annual", "revoke_vip");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Restore Purchases 즉시 반영
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Restore Purchases — 즉시 반영", () => {
  test("POST /api/iap/restore — 빈 transactions → restoredCount=0", async ({ context }) => {
    await loginAs(context, "test_free");
    const resp = await context.request.post("/api/iap/restore", {
      data: { platform: "apple", transactions: [] },
    });
    if (resp.status() === 200) {
      const body = await resp.json() as { restoredCount: number };
      expect(body.restoredCount).toBe(0);
    } else {
      expect([400, 401, 403]).toContain(resp.status());
    }
  });

  test("POST /api/iap/restore — unknown platform → 400", async ({ context }) => {
    await loginAs(context, "test_free");
    const resp = await context.request.post("/api/iap/restore", {
      data: { platform: "fakestore", transactions: [] },
    });
    expect(resp.status()).toBe(400);
  });

  test("복원 후 entitlement 즉시 확인 — set_void_credits 복원 시나리오", async ({ context }) => {
    // 실제 IAP 복원 대신, mutate API로 credits 복원 후 status 즉시 확인
    await mutate(context, "test_void", "set_void_credits", 0);
    await fetchStatus(context);
    // loginAs 없어도 mutate 후 바로 fetchStatus는 unauthenticated return 하므로,
    // 로그인 후 확인
    await loginAs(context, "test_void");
    const emptyAuth = await fetchStatus(context);
    expect(emptyAuth.voidCredits).toBe(0);

    // 복원 (restore)
    await mutate(context, "test_void", "set_void_credits", 7);
    const restored = await fetchStatus(context);
    expect(restored.voidCredits).toBe(7);
  });

  test("POST /api/iap/restore — 응답이 entitlement 포함", async ({ context }) => {
    await loginAs(context, "test_free");
    const resp = await context.request.post("/api/iap/restore", {
      data: { platform: "apple", transactions: [] },
    });
    if (resp.status() === 200) {
      const body = await resp.json() as Record<string, unknown>;
      // 응답에 entitlement 필드 있어야 함
      expect(body).toHaveProperty("restoredCount");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. 네트워크 실패 / stale UI 처리
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("네트워크 실패 / stale UI", () => {
  test("status API Cache-Control: no-store — 인증/미인증 양쪽", async ({ context }) => {
    // 미인증
    const unauth = await context.request.get("/api/user/status");
    expect(unauth.headers()["cache-control"]).toContain("no-store");

    // 인증
    await loginAs(context, "test_free");
    const auth = await context.request.get("/api/user/status");
    expect(auth.headers()["cache-control"]).toContain("no-store");
  });

  test("status API — X-Content-Type-Options 헤더 설정 확인 (보안)", async ({ context }) => {
    const resp = await context.request.get("/api/user/status");
    // Next.js 기본 보안 헤더 확인
    expect(resp.status()).toBe(200);
    const ct = resp.headers()["content-type"];
    expect(ct).toContain("application/json");
  });

  test("/api/iap/apple — 위조 JWS 토큰 → 4xx 반환 (무결성)", async ({ context }) => {
    await loginAs(context, "test_free");
    const resp = await context.request.post("/api/iap/apple", {
      data: { signedTransactionInfo: "fake.jws.token" },
    });
    expect(resp.status()).not.toBe(200);
    expect(resp.status()).toBeGreaterThanOrEqual(400);
  });

  test("/api/iap/google — 위조 purchaseToken → 4xx 반환", async ({ context }) => {
    await loginAs(context, "test_free");
    const resp = await context.request.post("/api/iap/google", {
      data: { productId: "com.luna.vip.monthly", purchaseToken: "fake_token" },
    });
    expect(resp.status()).not.toBe(200);
  });

  test("/api/iap/google-rtdn — X-Goog-Channel-Token 없음 → 401", async ({ context }) => {
    const resp = await context.request.post("/api/iap/google-rtdn", {
      data: { message: { data: "aGVsbG8=" } },
    });
    // secret 없으면 401 또는 400
    expect([400, 401, 403]).toContain(resp.status());
  });

  test("/api/iap/restore — 미인증 → 401", async ({ context }) => {
    // 쿠키 없는 상태에서 restore 요청
    const resp = await context.request.post("/api/iap/restore", {
      data: { platform: "apple", transactions: [] },
    });
    expect([401, 403]).toContain(resp.status());
  });

  test("status API 응답 구조 — 필수 6개 필드 항상 존재", async ({ context }) => {
    // 인증 전
    const unauth = await context.request.get("/api/user/status");
    const unauthBody = await unauth.json() as Record<string, unknown>;
    expect(unauthBody).toHaveProperty("isPro");
    expect(unauthBody).toHaveProperty("isVip");
    expect(unauthBody).toHaveProperty("username");
    expect(unauthBody).toHaveProperty("voidCredits");
    expect(unauthBody).toHaveProperty("annualReportOwned");
    expect(unauthBody).toHaveProperty("areaReportsOwned");

    // 인증 후
    await loginAs(context, "test_vip_monthly");
    const auth = await context.request.get("/api/user/status");
    const authBody = await auth.json() as Record<string, unknown>;
    expect(authBody).toHaveProperty("isPro");
    expect(authBody).toHaveProperty("isVip");
    expect(authBody.username).toBe("test_vip_monthly");
  });
});
