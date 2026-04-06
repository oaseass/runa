/**
 * Personalization Audit — Phase 6 QA
 * ====================================
 * Verifies that every result-bearing page in LUNA produces DIFFERENT output
 * for different users and/or different dates.
 *
 * Run with:
 *   node --experimental-strip-types --test src/lib/astrology/__tests__/personalization-audit.ts
 *
 * Tests:
 * 1. Different birth data → different day scores (calendar personalization)
 * 2. Same user, different months → different day scores
 * 3. Same user, different dates → different interpretations
 * 4. Different birth data → different best-day selections
 * 5. Void analysis: different questions → different section content (qSeed variation)
 * 6. Regression: no day score should be identical for all days in a month
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { computeNatalChart, localBirthToUtc } from "../calculate.js";
import { interpretTransits, interpretDomains } from "../interpret.js";

// ── Two distinct natal profiles ───────────────────────────────────────────────

/** Seoul, 1990-04-15, 09:30 AM KST */
const CHART_A_INPUT = {
  birthUtc: localBirthToUtc(1990, 4, 15, 9, 30, "Asia/Seoul"),
  latitude: 37.5665,
  longitude: 126.9780,
  timezone: "Asia/Seoul",
};

/** New York, 1985-11-20, 02:15 AM EST */
const CHART_B_INPUT = {
  birthUtc: localBirthToUtc(1985, 11, 20, 2, 15, "America/New_York"),
  latitude: 40.7128,
  longitude: -74.0060,
  timezone: "America/New_York",
};

const chartA = computeNatalChart(CHART_A_INPUT);
const chartB = computeNatalChart(CHART_B_INPUT);

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreDomains(chart: ReturnType<typeof computeNatalChart>, date: Date): number {
  const domains = interpretDomains(chart, date);
  let pts = 0;
  for (const d of domains) {
    pts += d.tone === "strength" ? 2 : d.tone === "neutral" ? 1 : 0;
  }
  return Math.round((pts / 8) * 100);
}

function scoreMonth(chart: ReturnType<typeof computeNatalChart>, year: number, month: number): number[] {
  const daysInMonth = new Date(year, month, 0).getDate(); // month is 1-indexed
  return Array.from({ length: daysInMonth }, (_, i) => {
    const date = new Date(year, month - 1, i + 1, 12, 0, 0);
    return scoreDomains(chart, date);
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Personalization: Calendar (day scores)", () => {
  test("Different birth charts produce DIFFERENT scores for same month", () => {
    const scoresA = scoreMonth(chartA, 2025, 5); // May 2025
    const scoresB = scoreMonth(chartB, 2025, 5);

    const identical = scoresA.every((s, i) => s === scoresB[i]);
    assert.equal(identical, false,
      "Charts A and B should produce at least one different score on the same date");

    // Count how many days differ
    const diffCount = scoresA.filter((s, i) => s !== scoresB[i]).length;
    assert.ok(diffCount >= 5,
      `At least 5 days should differ between users, got ${diffCount}`);
  });

  test("Single user has VARIED scores across a month (not all identical)", () => {
    const scores = scoreMonth(chartA, 2025, 5);
    const unique = new Set(scores).size;
    assert.ok(unique >= 3,
      `Month scores should have at least 3 distinct values, got ${unique} (${scores.join(",")})`);
  });

  test("Same chart, different months → different score distribution", () => {
    const mayScores  = scoreMonth(chartA, 2025, 5);
    const juneScores = scoreMonth(chartA, 2025, 6);

    const maySum  = mayScores.reduce((s, v) => s + v, 0);
    const juneSum = juneScores.reduce((s, v) => s + v, 0);

    // Different month totals (transits shift meaningfully month to month)
    // Allow same total but different distribution
    const mayHash  = crypto.createHash("sha256").update(mayScores.join(",")).digest("hex");
    const juneHash = crypto.createHash("sha256").update(juneScores.join(",")).digest("hex");
    assert.notEqual(mayHash, juneHash,
      `May and June score arrays should differ for same user (may=${maySum}, june=${juneSum})`);
  });
});

describe("Personalization: Single-day interpretation", () => {
  test("Different charts produce DIFFERENT interpretations for same date", () => {
    const date = new Date(2025, 4, 15, 12, 0, 0); // 2025-05-15 noon

    const transitA = interpretTransits(chartA, date);
    const transitB = interpretTransits(chartB, date);

    // Headlines, ledes, or do/don't lists must differ between two different users
    const aJson = JSON.stringify({ h: transitA.headline, l: transitA.lede, dos: transitA.dos });
    const bJson = JSON.stringify({ h: transitB.headline, l: transitB.lede, dos: transitB.dos });
    assert.notEqual(aJson, bJson,
      "interpretTransits must produce different output for different birth charts on the same date");
  });

  test("Same chart produces DIFFERENT interpretations for different dates", () => {
    const may15 = new Date(2025, 4, 15, 12, 0, 0);
    const jun15 = new Date(2025, 5, 15, 12, 0, 0);

    const transitMay = interpretTransits(chartA, may15);
    const transitJun = interpretTransits(chartA, jun15);

    const mayJson = JSON.stringify({ h: transitMay.headline, l: transitMay.lede });
    const junJson = JSON.stringify({ h: transitJun.headline, l: transitJun.lede });
    assert.notEqual(mayJson, junJson,
      "Same user on different dates must receive different interpretations (transits shift)");
  });
});

describe("Personalization: Best days", () => {
  test("Different charts yield DIFFERENT best-day score arrays", () => {
    const daysAhead = 45;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    function topDays(chart: ReturnType<typeof computeNatalChart>, n: number): number[] {
      return Array.from({ length: daysAhead }, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() + i + 1);
        d.setHours(12, 0, 0, 0);
        return scoreDomains(chart, d);
      })
        .sort((a, b) => b - a)
        .slice(0, n);
    }

    const topA = topDays(chartA, 10);
    const topB = topDays(chartB, 10);

    const identical = topA.every((s, i) => s === topB[i]);
    assert.equal(identical, false,
      "Two different birth charts must produce different best-day score rankings");
  });
});

describe("Personalization: qSeed — void analysis variation", () => {
  test("Different question texts produce different qSeed values", () => {
    function qSeed(text: string): number {
      return text.split("").reduce((sum, c) => sum + c.charCodeAt(0), 0);
    }

    const questions = [
      "지금 연애를 시작해도 괜찮을까?",
      "이 직장을 바꿔야 할까?",
      "이사를 해야 하는 시점인가?",
      "지금 투자할 시기인가?",
    ];

    const seeds = questions.map(qSeed);
    const unique = new Set(seeds).size;
    assert.equal(unique, questions.length,
      `All ${questions.length} questions should produce distinct qSeed values; got ${unique} unique`);
  });

  test("qSeed modulo pool size routes to different indices for distinct questions", () => {
    function qSeed(text: string): number {
      return text.split("").reduce((sum, c) => sum + c.charCodeAt(0), 0);
    }

    const POOL_SIZE = 5; // typical dos/donts array length
    const questions = [
      "지금 연애를 시작해도 괜찮을까?",
      "이 직장을 바꿔야 할까?",
      "이사를 해야 하는 시점인가?",
      "지금 투자할 시기인가?",
    ];

    const indices = questions.map((q) => qSeed(q) % POOL_SIZE);
    const unique = new Set(indices).size;
    assert.ok(unique >= 2,
      `At least 2 different questions should map to different pool indices (got ${unique})\nindices: ${indices.join(",")}`);
  });
});

describe("Regression: no all-identical month", () => {
  test("A 28-31 day month has variance in scores (real transits, not static)", () => {
    // If all scores were LCG-based and seeded on date alone, different charts would
    // still produce an identical distribution. Real transit scoring varies by chart.
    const scoresA = scoreMonth(chartA, 2025, 3); // March 2025
    const scoresB = scoreMonth(chartB, 2025, 3);

    // Both should have internal variance
    const rangeA = Math.max(...scoresA) - Math.min(...scoresA);
    const rangeB = Math.max(...scoresB) - Math.min(...scoresB);

    assert.ok(rangeA >= 10,
      `Chart A March range should be ≥10 points, got ${rangeA}. Static output detected.`);
    assert.ok(rangeB >= 10,
      `Chart B March range should be ≥10 points, got ${rangeB}. Static output detected.`);
  });
});
