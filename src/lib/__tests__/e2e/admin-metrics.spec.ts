/**
 * admin-metrics.spec.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * E2E: 관리자 지표 smoke test — getEntitlementStats() / getRevenueMetrics()
 * 결과가 시드된 테스트 데이터와 일치하는지, 논리적으로 일관성 있는지 검증.
 *
 * 검증 항목:
 *   ① 구조 검증 — 모든 필드가 숫자(number)
 *   ② 시드 일치 — VIP ≥ 2, annualOwners ≥ 1, areaOwners ≥ 1, totalVoidCredits ≥ 7
 *   ③ 일관성  — vipMonthly + vipYearly ≤ totalVip (중복 없음)
 *   ④ 퍼센트  — subscriberChurn ∈ [0, 100], vipConversion ∈ [0, 100]
 *   ⑤ ARPPU   — buyers > 0 이면 arppu > 0, buyers = 0 이면 arppu = 0
 *   ⑥ 음수 없음 — 모든 지표 ≥ 0
 *
 * 사전 조건:
 *   npx tsx src/lib/__tests__/seed-test-users.ts
 *   npm run dev (:3000)
 */

import { test, expect } from "@playwright/test";
import { fetchMetrics, type EntitlementStats, type RevenueMetrics } from "./helpers";

// ── 테스트 전 시드 상태 보장 ────────────────────────────────────────────────────
// 다른 spec의 뮤테이션으로 DB가 오염됐을 경우 복원
test.beforeAll(async ({ request }) => {
  await request.post("/api/test/mutate-entitlement", {
    data: { username: "test_vip_yearly",  action: "grant_vip", vipSource: "vip_yearly"  },
  });
  await request.post("/api/test/mutate-entitlement", {
    data: { username: "test_vip_monthly", action: "grant_vip", vipSource: "vip_monthly" },
  });
  await request.post("/api/test/mutate-entitlement", {
    data: { username: "test_free", action: "revoke_vip" },
  });
  await request.post("/api/test/mutate-entitlement", {
    data: { username: "test_void", action: "set_void_credits", value: 7 },
  });
});

// ── 헬퍼: 값이 정수 숫자인지 확인 ────────────────────────────────────────────
function assertInteger(label: string, v: unknown) {
  expect(typeof v, `${label} must be number`).toBe("number");
  expect(Number.isFinite(v as number), `${label} must be finite`).toBe(true);
  expect(Number.isNaN(v as number), `${label} must not be NaN`).toBe(false);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. 구조 검증
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("관리자 지표 — 구조 검증", () => {
  test("EntitlementStats 필드가 모두 number 타입", async ({ context }) => {
    const { stats } = await fetchMetrics(context);

    const statsFields: (keyof EntitlementStats)[] = [
      "totalVip", "vipMonthly", "vipYearly", "activeGrace", "expired",
      "annualReportOwners", "areaReadingOwners", "voidPackBuyers", "totalVoidCredits",
    ];
    for (const field of statsFields) {
      assertInteger(`stats.${field}`, stats[field]);
    }
  });

  test("RevenueMetrics 필드가 모두 number 타입", async ({ context }) => {
    const { metrics } = await fetchMetrics(context);

    const metricsFields: (keyof RevenueMetrics)[] = [
      "totalRevenue", "revenueThisMonth", "arppu",
      "vipConversion", "annualAttachRate", "areaAttachRate",
      "voidPackAttachRate", "subscriberChurn",
    ];
    for (const field of metricsFields) {
      assertInteger(`metrics.${field}`, metrics[field]);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. 시드 데이터 일치
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("관리자 지표 — 시드 데이터 일치", () => {
  // 시드 (seed-test-users.ts) 에서 생성한 테스트 유저:
  //   test_vip_monthly  → is_vip=1, vip_source=vip_monthly
  //   test_vip_yearly   → is_vip=1, vip_source=vip_yearly
  //   test_annual       → annual_report_owned=1
  //   test_area         → area_reports_owned=1
  //   test_void         → void_credits=7

  test("totalVip ≥ 2 (test_vip_monthly + test_vip_yearly)", async ({ context }) => {
    const { stats } = await fetchMetrics(context);
    expect(stats.totalVip).toBeGreaterThanOrEqual(2);
  });

  test("vipMonthly ≥ 1 (test_vip_monthly)", async ({ context }) => {
    const { stats } = await fetchMetrics(context);
    expect(stats.vipMonthly).toBeGreaterThanOrEqual(1);
  });

  test("vipYearly ≥ 1 (test_vip_yearly)", async ({ context }) => {
    const { stats } = await fetchMetrics(context);
    expect(stats.vipYearly).toBeGreaterThanOrEqual(1);
  });

  test("annualReportOwners ≥ 1 (test_annual)", async ({ context }) => {
    const { stats } = await fetchMetrics(context);
    expect(stats.annualReportOwners).toBeGreaterThanOrEqual(1);
  });

  test("areaReadingOwners ≥ 1 (test_area)", async ({ context }) => {
    const { stats } = await fetchMetrics(context);
    expect(stats.areaReadingOwners).toBeGreaterThanOrEqual(1);
  });

  test("totalVoidCredits ≥ 7 (test_void)", async ({ context }) => {
    const { stats } = await fetchMetrics(context);
    expect(stats.totalVoidCredits).toBeGreaterThanOrEqual(7);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. 내부 일관성
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("관리자 지표 — 내부 일관성", () => {
  test("vipMonthly + vipYearly ≤ totalVip (중복 없음)", async ({ context }) => {
    const { stats } = await fetchMetrics(context);
    // vipMonthly + vipYearly 는 source 별 집계 → totalVip 이하여야 함
    // (관리자 수동 부여 VIP는 source=null → 합계가 totalVip보다 작을 수 있음)
    expect(stats.vipMonthly + stats.vipYearly).toBeLessThanOrEqual(stats.totalVip);
  });

  test("expired ≤ totalVip (만료자는 VIP 서브셋)", async ({ context }) => {
    const { stats } = await fetchMetrics(context);
    // expired: is_vip=1 이면서 만료된 유저 (grace-period도 지난)
    expect(stats.expired).toBeLessThanOrEqual(stats.totalVip);
  });

  test("activeGrace ≤ totalVip", async ({ context }) => {
    const { stats } = await fetchMetrics(context);
    expect(stats.activeGrace).toBeLessThanOrEqual(stats.totalVip);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. 퍼센트 범위 검증 (0 ~ 100)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("관리자 지표 — 퍼센트 범위", () => {
  const percentFields: (keyof RevenueMetrics)[] = [
    "vipConversion", "annualAttachRate", "areaAttachRate",
    "voidPackAttachRate", "subscriberChurn",
  ];

  for (const field of percentFields) {
    test(`${field} ∈ [0, 100]`, async ({ context }) => {
      const { metrics } = await fetchMetrics(context);
      expect(metrics[field]).toBeGreaterThanOrEqual(0);
      expect(metrics[field]).toBeLessThanOrEqual(100);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. 음수 없음
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("관리자 지표 — 음수 없음", () => {
  test("EntitlementStats 모든 필드 ≥ 0", async ({ context }) => {
    const { stats } = await fetchMetrics(context);
    for (const [key, val] of Object.entries(stats)) {
      expect(val as number, `stats.${key} should be ≥ 0`).toBeGreaterThanOrEqual(0);
    }
  });

  test("RevenueMetrics 모든 필드 ≥ 0", async ({ context }) => {
    const { metrics } = await fetchMetrics(context);
    for (const [key, val] of Object.entries(metrics)) {
      expect(val as number, `metrics.${key} should be ≥ 0`).toBeGreaterThanOrEqual(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. ARPPU 일관성
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("관리자 지표 — ARPPU", () => {
  test("totalRevenue = 0 이면 arppu = 0", async ({ context }) => {
    const { metrics } = await fetchMetrics(context);
    if (metrics.totalRevenue === 0) {
      expect(metrics.arppu).toBe(0);
    }
  });

  test("totalRevenue > 0 이면 arppu > 0", async ({ context }) => {
    const { metrics } = await fetchMetrics(context);
    if (metrics.totalRevenue > 0) {
      expect(metrics.arppu).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. VIP 건수 변경 → 지표 즉시 반영 (entitlement ↔ metrics 일치)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("지표 실시간 반영 — VIP 건수", () => {
  test("VIP 부여 → totalVip 증가, revoke → totalVip 복귀", async ({ context }) => {
    const before = await fetchMetrics(context);
    const initialVip = before.stats.totalVip;

    // test_free에 VIP 임시 부여 (source: vip_monthly)
    const mutResp = await context.request.post("/api/test/mutate-entitlement", {
      data: { username: "test_free", action: "grant_vip", vipSource: "vip_monthly" },
    });
    expect(mutResp.ok()).toBe(true);

    const afterGrant = await fetchMetrics(context);
    expect(afterGrant.stats.totalVip).toBe(initialVip + 1);

    // revoke (source 복원 불필요 - revoke 후 re-seed된 상태와 동일)
    await context.request.post("/api/test/mutate-entitlement", {
      data: { username: "test_free", action: "revoke_vip" },
    });

    const afterRevoke = await fetchMetrics(context);
    expect(afterRevoke.stats.totalVip).toBe(initialVip);
  });

  test("voidCredits 변경 → totalVoidCredits 반영", async ({ context }) => {
    // 먼저 현재 상태 확인 후 test_void를 알려진 값으로 설정
    await context.request.post("/api/test/mutate-entitlement", {
      data: { username: "test_void", action: "set_void_credits", value: 7 },
    });

    const before = await fetchMetrics(context);
    const initialTotal = before.stats.totalVoidCredits;

    await context.request.post("/api/test/mutate-entitlement", {
      data: { username: "test_void", action: "use_void_credit" },
    });

    const afterUse = await fetchMetrics(context);
    expect(afterUse.stats.totalVoidCredits).toBe(initialTotal - 1);

    // 복원
    await context.request.post("/api/test/mutate-entitlement", {
      data: { username: "test_void", action: "set_void_credits", value: 7 },
    });

    const afterRestore = await fetchMetrics(context);
    expect(afterRestore.stats.totalVoidCredits).toBe(initialTotal);
  });
});
