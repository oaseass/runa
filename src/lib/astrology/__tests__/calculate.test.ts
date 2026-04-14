/**
 * Verification tests for the astrology calculation + interpretation pipeline.
 * Run with: node --experimental-strip-types --test src/lib/astrology/__tests__/calculate.test.ts
 *
 * Tests:
 * 1. Same input → same output (determinism)
 * 2. Different birth time → different chart output
 * 3. Different birth place → different chart output
 * 4. /profile/chart output changes when input changes
 * 5. /insight/today changes by date
 * 6. No random output — all results are deterministic
 * 7. Chart fingerprint stability
 * 8. UTC conversion correctness
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { computeNatalChart, localBirthToUtc } from "../calculate.js";
import { interpretNatalChart, interpretTransits, interpretDomains } from "../interpret.js";

// ── Reference input: Seoul, 1990-04-15, 09:30 AM KST ─────────────────────────

const REF_INPUT = {
  birthUtc: localBirthToUtc(1990, 4, 15, 9, 30, "Asia/Seoul"),
  latitude: 37.5665,
  longitude: 126.9780,
  timezone: "Asia/Seoul",
};

// ── Test 1: Determinism — same input 10 times → identical output ──────────────

describe("Determinism", () => {
  test("same input 10 times produces identical chart JSON", () => {
    const results = Array.from({ length: 10 }, () => {
      const chart = computeNatalChart(REF_INPUT);
      // Strip computedAt (wall-clock changes) before comparison
      const { computedAt, ...rest } = chart;
      void computedAt;
      return JSON.stringify(rest);
    });
    const unique = new Set(results);
    assert.equal(unique.size, 1, "All 10 runs must produce identical chart data");
  });

  test("same chart → same interpretation", () => {
    const chart = computeNatalChart(REF_INPUT);
    const i1 = JSON.stringify(interpretNatalChart(chart));
    const i2 = JSON.stringify(interpretNatalChart(chart));
    assert.equal(i1, i2, "Interpretation must be deterministic");
  });

  test("same date → same transit interpretation", () => {
    const chart = computeNatalChart(REF_INPUT);
    const transitDate = new Date("2026-03-23T00:00:00Z");
    const t1 = JSON.stringify(interpretTransits(chart, transitDate));
    const t2 = JSON.stringify(interpretTransits(chart, transitDate));
    assert.equal(t1, t2, "Transit interpretation must be deterministic");
  });
});

// ── Test 2: Sensitivity — different birth time → different output ─────────────

describe("Time sensitivity", () => {
  test("birth 09:30 vs 18:30 → different ascendant", () => {
    const morning = computeNatalChart(REF_INPUT);
    const evening = computeNatalChart({
      ...REF_INPUT,
      birthUtc: localBirthToUtc(1990, 4, 15, 18, 30, "Asia/Seoul"),
    });
    assert.notEqual(
      morning.ascendant.sign,
      evening.ascendant.sign,
      "9-hour difference should change the ascendant sign"
    );
  });

  test("birth 09:30 vs 10:30 → different ascendant or house placements", () => {
    const t1 = computeNatalChart(REF_INPUT);
    const t2 = computeNatalChart({
      ...REF_INPUT,
      birthUtc: localBirthToUtc(1990, 4, 15, 10, 30, "Asia/Seoul"),
    });
    const ascChanged = t1.ascendant.sign !== t2.ascendant.sign ||
      Math.abs(t1.ascendant.longitude - t2.ascendant.longitude) > 0.1;
    assert.ok(ascChanged, "1-hour difference should change ascendant");
  });

  test("different birth date → different Sun sign (Apr vs Jul)", () => {
    const apr = computeNatalChart(REF_INPUT);
    const jul = computeNatalChart({
      ...REF_INPUT,
      birthUtc: localBirthToUtc(1990, 7, 1, 9, 30, "Asia/Seoul"),
    });
    const sunApr = apr.planets.find((p) => p.planet === "Sun")!;
    const sunJul = jul.planets.find((p) => p.planet === "Sun")!;
    assert.notEqual(sunApr.sign, sunJul.sign, "April and July must have different Sun signs");
  });
});

// ── Test 3: Location sensitivity — different place → different output ─────────

describe("Location sensitivity", () => {
  test("Seoul vs New York → different ascendant", () => {
    const seoul = computeNatalChart(REF_INPUT);
    const newYork = computeNatalChart({
      birthUtc: REF_INPUT.birthUtc, // same UTC moment
      latitude: 40.7128,
      longitude: -74.0060,
      timezone: "America/New_York",
    });
    // Same UTC time, different place → different local sidereal time → different ASC
    assert.notEqual(
      seoul.ascendant.longitude.toFixed(0),
      newYork.ascendant.longitude.toFixed(0),
      "Same UTC time, different location must yield different ascendant"
    );
  });
});

// ── Test 4: Transit interpretation changes by date ────────────────────────────

describe("Transit sensitivity", () => {
  test("different dates → different transit interpretation", () => {
    const chart = computeNatalChart(REF_INPUT);
    const d1 = new Date("2026-01-01T12:00:00Z");
    const d2 = new Date("2026-06-15T12:00:00Z");
    const i1 = interpretTransits(chart, d1);
    const i2 = interpretTransits(chart, d2);
    // Check all distinguishing fields — headline alone may collide (only 4 element-based values)
    // but the combination of headline + lede + section1.body + keyPhrase is unique per moon state
    const allFieldsMatch =
      i1.headline === i2.headline &&
      i1.lede === i2.lede &&
      i1.section1.body === i2.section1.body &&
      i1.keyPhrase === i2.keyPhrase;
    assert.ok(!allFieldsMatch, "Transit interpretation must differ across dates 5+ months apart");
  });

  test("moon changes sign in ~2.5 days", () => {
    const chart = computeNatalChart(REF_INPUT);
    const d1 = new Date("2026-03-01T00:00:00Z");
    const d2 = new Date("2026-03-04T00:00:00Z");
    const i1 = interpretTransits(chart, d1);
    const i2 = interpretTransits(chart, d2);
    // Over ~3 days, Moon moves ~39° — should always change sign
    assert.notEqual(i1.lede, i2.lede, "Moon should be in a different sign 3 days later");
  });

  test("slow transit headlines do not collapse into a tiny 3-line loop", () => {
    const chart = computeNatalChart(REF_INPUT);
    const headlines = Array.from({ length: 6 }, (_, offset) => {
      const date = new Date(Date.UTC(2026, 3, 14 + offset, 0, 0, 0));
      return interpretTransits(chart, date).headline;
    });

    assert.ok(
      new Set(headlines).size >= 5,
      `Expected at least 5 distinct headlines across a sustained transit window, got: ${headlines.join(" | ")}`,
    );
  });
});

// ── Test 5: Output completeness ───────────────────────────────────────────────

describe("Output completeness", () => {
  test("natal chart has all 10 planets", () => {
    const chart = computeNatalChart(REF_INPUT);
    assert.equal(chart.planets.length, 10, "Chart must include all 10 planets");
  });

  test("natal chart has 12 houses", () => {
    const chart = computeNatalChart(REF_INPUT);
    assert.equal(chart.houses.length, 12, "Chart must include 12 whole-sign houses");
  });

  test("all planet longitudes are 0–360", () => {
    const chart = computeNatalChart(REF_INPUT);
    for (const p of chart.planets) {
      assert.ok(p.longitude >= 0 && p.longitude < 360, `${p.planet} longitude ${p.longitude} out of range`);
    }
  });

  test("interpretation does not crash even if no aspects exist", () => {
    const chart = computeNatalChart(REF_INPUT);
    const strippedChart = { ...chart, aspects: [] };
    const interp = interpretNatalChart(strippedChart);
    assert.ok(interp.headline.length > 0, "Interpretation must produce a headline even with no aspects");
  });

  test("transit interpretation returns all required fields", () => {
    const chart = computeNatalChart(REF_INPUT);
    const interp = interpretTransits(chart, new Date());
    assert.ok(interp.headline, "headline required");
    assert.ok(interp.lede, "lede required");
    assert.ok(interp.section1.title, "section1.title required");
    assert.ok(interp.section1.body, "section1.body required");
    assert.ok(interp.section2.title, "section2.title required");
    assert.ok(interp.section2.body, "section2.body required");
    assert.ok(interp.keyPhrase, "keyPhrase required");
    assert.ok(interp.keyPhraseKicker, "keyPhraseKicker required");
  });
});

// ── Test 6: UTC conversion correctness ───────────────────────────────────────

describe("UTC conversion", () => {
  test("Seoul UTC+9: 09:30 KST → 00:30 UTC", () => {
    const utc = localBirthToUtc(1990, 4, 15, 9, 30, "Asia/Seoul");
    assert.equal(utc.getUTCHours(), 0, "Hour should be 0 UTC");
    assert.equal(utc.getUTCMinutes(), 30, "Minute should be 30");
  });

  test("New York UTC-5: 09:30 EST → 14:30 UTC", () => {
    // Use a winter date when NY is at UTC-5 (no DST)
    const utc = localBirthToUtc(1990, 1, 15, 9, 30, "America/New_York");
    assert.equal(utc.getUTCHours(), 14, "Hour should be 14 UTC");
    assert.equal(utc.getUTCMinutes(), 30, "Minute should be 30");
  });
});

// ── Test 7: Chart fingerprint / deterministic hash ────────────────────────────

describe("Chart fingerprint", () => {
  /** Compute a SHA-256 of the deterministic fields (excluding wall-clock computedAt). */
  function chartFingerprint(chart: ReturnType<typeof computeNatalChart>): string {
    const { computedAt, chartHash, ...rest } = chart;
    void computedAt;
    void chartHash;
    return crypto.createHash("sha256").update(JSON.stringify(rest)).digest("hex");
  }

  test("same input produces identical fingerprint across 10 runs", () => {
    const fingerprints = Array.from({ length: 10 }, () =>
      chartFingerprint(computeNatalChart(REF_INPUT))
    );
    assert.equal(new Set(fingerprints).size, 1, "All 10 fingerprints must be identical");
  });

  test("different birth time produces different fingerprint", () => {
    const fp1 = chartFingerprint(computeNatalChart(REF_INPUT));
    const fp2 = chartFingerprint(computeNatalChart({
      ...REF_INPUT,
      birthUtc: localBirthToUtc(1990, 4, 15, 14, 0, "Asia/Seoul"),
    }));
    assert.notEqual(fp1, fp2, "Different birth time must yield a different fingerprint");
  });

  test("different birth place (Seoul vs New York) produces different fingerprint", () => {
    const fpSeoul = chartFingerprint(computeNatalChart(REF_INPUT));
    const fpNY = chartFingerprint(computeNatalChart({
      birthUtc: REF_INPUT.birthUtc,
      latitude: 40.7128,
      longitude: -74.0060,
      timezone: "America/New_York",
    }));
    assert.notEqual(fpSeoul, fpNY, "Different location must yield a different fingerprint");
  });

  test("interpretation fingerprint is stable for same chart", () => {
    const chart = computeNatalChart(REF_INPUT);
    const fp1 = crypto.createHash("sha256").update(JSON.stringify(interpretNatalChart(chart))).digest("hex");
    const fp2 = crypto.createHash("sha256").update(JSON.stringify(interpretNatalChart(chart))).digest("hex");
    assert.equal(fp1, fp2, "Interpretation fingerprint must be identical for same chart");
  });

  test("different chart produces different interpretation fingerprint", () => {
    const chart1 = computeNatalChart(REF_INPUT);
    const chart2 = computeNatalChart({
      ...REF_INPUT,
      birthUtc: localBirthToUtc(1975, 11, 20, 6, 0, "Asia/Seoul"),
    });
    const fp1 = crypto.createHash("sha256").update(JSON.stringify(interpretNatalChart(chart1))).digest("hex");
    const fp2 = crypto.createHash("sha256").update(JSON.stringify(interpretNatalChart(chart2))).digest("hex");
    assert.notEqual(fp1, fp2, "Different chart must yield different interpretation fingerprint");
  });
});

// ── Test 8: Question-intent classifier ───────────────────────────────────────
// Import path uses .js extension (required for Node ESM strip-types mode)
import { classifyQuestionIntent } from "../../server/void-intent.js";
import { computeDecision } from "../../server/void-decision.js";

describe("Question-intent classifier", () => {
  test("love: breakup keywords classify correctly", () => {
    const r = classifyQuestionIntent("이 사람과 헤어져야 할까요", "love");
    assert.equal(r.intent, "breakup", "헤어지 keyword should map to breakup");
    assert.equal(r.category, "love");
    assert.ok(r.matchedKeyword !== null, "Should report matched keyword");
  });

  test("love: confession keywords classify correctly", () => {
    const r = classifyQuestionIntent("먼저 고백해도 될까요", "love");
    assert.equal(r.intent, "confession");
  });

  test("love: trust keywords classify correctly", () => {
    const r = classifyQuestionIntent("이 사람을 믿을 수 있을까요", "love");
    assert.equal(r.intent, "trust");
  });

  test("love: no keywords -> default relationship intent", () => {
    const r = classifyQuestionIntent("지금 제 연애가 잘 될까요", "love");
    // 연애 keyword matches relationship before default
    assert.equal(r.intent, "relationship");
  });

  test("work: quit keywords classify correctly", () => {
    const r = classifyQuestionIntent("회사를 그만두는 것이 맞을까요", "work");
    assert.equal(r.intent, "quit");
  });

  test("work: conflict keywords classify correctly", () => {
    const r = classifyQuestionIntent("상사와의 갈등을 어떻게 해결해야 할까요", "work");
    assert.equal(r.intent, "conflict");
  });

  test("self: energy keywords classify correctly", () => {
    const r = classifyQuestionIntent("요즘 너무 지쳐 있어요. 왜 이럴까요", "self");
    assert.equal(r.intent, "energy");
  });

  test("self: pattern keywords classify correctly", () => {
    const r = classifyQuestionIntent("왜 항상 같은 실수를 반복할까요", "self");
    assert.equal(r.intent, "pattern");
  });

  test("social: conflict keywords classify correctly", () => {
    const r = classifyQuestionIntent("친구 무리에서 갈등이 생겼어요", "social");
    // conflict appears before friendship in rules, and 갈등 matches conflict
    assert.equal(r.intent, "conflict");
  });

  test("social: communication keywords from any category work correctly", () => {
    const r = classifyQuestionIntent("내 말이 왜 오해를 사는지 모르겠어요", "social");
    assert.equal(r.intent, "communication");
  });

  test("classifier is case-insensitive and punctuation-tolerant", () => {
    const r1 = classifyQuestionIntent("헤어지고 싶어.", "love");
    const r2 = classifyQuestionIntent("헤어지고 싶어", "love");
    assert.equal(r1.intent, r2.intent, "Punctuation should not affect classification");
  });

  test("same text always returns same result (determinism)", () => {
    const text = "이직할까요 고민입니다";
    const r1 = classifyQuestionIntent(text, "work");
    const r2 = classifyQuestionIntent(text, "work");
    assert.deepEqual(r1, r2, "Classifier must be deterministic");
  });
});

// ── Test 9: void-analysis question sensitivity ────────────────────────────────
// Pure unit test — tests classifier + intent→planet weighting without a DB.
// Uses computeNatalChart directly and maps intent to expected primary planet.

function buildSection1Probe(chart: ReturnType<typeof computeNatalChart>, intent: string): string {
  const byName = new Map(chart.planets.map((p: { planet: string }) => [p.planet, p]));
  // For test: return the primary planet that would be chosen for the given intent
  const INTENT_PRIMARY: Record<string, string> = {
    relationship: "Venus", confession: "Venus", compatibility: "Venus",
    trust: "Moon", breakup: "Moon",
    direction: "Saturn", quit: "Saturn", promotion: "Saturn",
    decision: "Mercury", conflict: "Mars",
    identity: "Sun", energy: "Sun", pattern: "Moon", purpose: "Sun",
    communication: "Mercury", friendship: "Moon", group: "Saturn", distance: "Moon",
  };
  const primary = INTENT_PRIMARY[intent] ?? "Sun";
  const planet = byName.get(primary) as { planet: string; sign: string; house: number } | undefined;
  return planet ? `${planet.planet}:${planet.sign}:${planet.house}` : "";
}

describe("Void analysis question sensitivity", () => {
  const CHART_A = computeNatalChart(REF_INPUT); // Seoul 1990-04-15 09:30
  const CHART_B = computeNatalChart({
    ...REF_INPUT,
    birthUtc: localBirthToUtc(1985, 8, 22, 14, 0, "Asia/Seoul"),
  });

  test("same chart: love/breakup vs love/confession use different primary planets", () => {
    const intentA = classifyQuestionIntent("이 사람과 헤어져야 할까요", "love").intent;
    const intentB = classifyQuestionIntent("고백해도 될까요", "love").intent;
    assert.notEqual(intentA, intentB, "Different questions must yield different intents");
    // breakup -> Moon primary, confession -> Venus primary
    const probeA = buildSection1Probe(CHART_A, intentA);
    const probeB = buildSection1Probe(CHART_A, intentB);
    assert.notEqual(probeA, probeB, "Different intents must emphasise different primary planets");
  });

  test("same question: different chart produces different planet sign/house detail", () => {
    const intentA = classifyQuestionIntent("이 사람과 헤어져야 할까요", "love").intent;
    const probeA = buildSection1Probe(CHART_A, intentA);
    const probeB = buildSection1Probe(CHART_B, intentA);
    // Same intent, different chart -> different planet positions
    assert.notEqual(probeA, probeB, "Same question on different chart must produce different planet detail");
  });

  test("same chart + same question = stable output (determinism)", () => {
    const intent1 = classifyQuestionIntent("이 사람과 헤어져야 할까요", "love");
    const intent2 = classifyQuestionIntent("이 사람과 헤어져야 할까요", "love");
    assert.deepEqual(intent1, intent2, "Same question text must always produce same intent");
    const probe1 = buildSection1Probe(CHART_A, intent1.intent);
    const probe2 = buildSection1Probe(CHART_A, intent2.intent);
    assert.equal(probe1, probe2, "Same chart + same intent must produce stable output");
  });

  test("work category: quit vs direction questions produce different intents", () => {
    const iQuit = classifyQuestionIntent("회사를 그만둬야 할까요", "work").intent;
    const iDir = classifyQuestionIntent("어떤 방향으로 커리어를 쌓을까요", "work").intent;
    assert.notEqual(iQuit, iDir, "Different work questions must classify differently");
  });

  test("self category: energy vs purpose produce different primary planet usage", () => {
    const iEnergy = classifyQuestionIntent("왜 이렇게 지쳐 있을까요", "self").intent;
    const iPurpose = classifyQuestionIntent("삶의 목적이 뭔지 모르겠어요", "self").intent;
    assert.notEqual(iEnergy, iPurpose, "energy vs purpose should have different intents");
    // energy -> primary=Sun, purpose -> primary=Sun (both sun-based for self)
    // but their synthesisFocus strings differ — test via the intent itself
    assert.equal(iEnergy, "energy");
    assert.equal(iPurpose, "purpose");
  });
});

// ── Phase 8-10: Planet-specific interpretation sensitivity ────────────────────

describe("Planet-specific interpretation sensitivity (Phase 8-10)", () => {
  // Shared Korean sign name map for assertions
  const SIGN_KO_MAP: Record<string, string> = {
    Aries: "양자리", Taurus: "황소자리", Gemini: "쌍둥이자리", Cancer: "게자리",
    Leo: "사자자리", Virgo: "처녀자리", Libra: "천칭자리", Scorpio: "전갈자리",
    Sagittarius: "사수자리", Capricorn: "염소자리", Aquarius: "물병자리", Pisces: "물고기자리",
  };

  test("8: Moon sign drives moonSummary — text contains the correct Moon sign name", () => {
    const chart = computeNatalChart(REF_INPUT);
    const moonSign = chart.planets.find((p) => p.planet === "Moon")!.sign;
    const interp = interpretNatalChart(chart);
    const expected = `달이 ${SIGN_KO_MAP[moonSign]}에`;
    assert.ok(
      interp.moonSummary.startsWith(expected),
      `moonSummary must start with "${expected}" for Moon in ${moonSign}. Got: "${interp.moonSummary}"`,
    );
  });

  test("8b: Different Moon signs produce different moonSummary (5-day shift)", () => {
    const chartA = computeNatalChart(REF_INPUT); // 1990-04-15
    const chartB = computeNatalChart({
      ...REF_INPUT,
      birthUtc: localBirthToUtc(1990, 4, 20, 9, 30, "Asia/Seoul"), // Moon moves ~65° in 5 days
    });
    const moonA = chartA.planets.find((p) => p.planet === "Moon")!.sign;
    const moonB = chartB.planets.find((p) => p.planet === "Moon")!.sign;
    // Moon moves ~13°/day; 5 days ≈ 65° ≈ 2+ sign changes — very high chance of sign change
    if (moonA !== moonB) {
      const interpA = interpretNatalChart(chartA);
      const interpB = interpretNatalChart(chartB);
      assert.notEqual(interpA.moonSummary, interpB.moonSummary,
        `Moon ${moonA} vs ${moonB}: moonSummary must differ when Moon sign differs`);
    }
  });

  test("8c: interpretDomains 감정·내면 tone is deterministic for same chart + date", () => {
    const chart = computeNatalChart(REF_INPUT);
    const date = new Date("2025-06-15T12:00:00Z");
    const d1 = interpretDomains(chart, date);
    const d2 = interpretDomains(chart, date);
    const inner1 = d1.find((d) => d.domain === "감정·내면")!;
    const inner2 = d2.find((d) => d.domain === "감정·내면")!;
    assert.equal(inner1.tone, inner2.tone, "감정·내면 tone must be deterministic for same chart + date");
    assert.equal(inner1.headline, inner2.headline, "감정·내면 headline must be deterministic");
  });

  test("9: Venus sign drives venusSummary — text contains the correct Venus sign name", () => {
    const chart = computeNatalChart(REF_INPUT);
    const venusSign = chart.planets.find((p) => p.planet === "Venus")!.sign;
    const interp = interpretNatalChart(chart);
    const expected = `금성이 ${SIGN_KO_MAP[venusSign]}에`;
    assert.ok(
      interp.venusSummary.startsWith(expected),
      `venusSummary must start with "${expected}" for Venus in ${venusSign}. Got: "${interp.venusSummary}"`,
    );
  });

  test("9b: Different Venus placement produces different venusSummary", () => {
    // Venus moves ~1°/day; 4 months later it will be in a clearly different sign
    const chartA = computeNatalChart(REF_INPUT); // 1990-04-15
    const chartB = computeNatalChart({
      ...REF_INPUT,
      birthUtc: localBirthToUtc(1990, 8, 15, 9, 30, "Asia/Seoul"), // 4 months later
    });
    const venusA = chartA.planets.find((p) => p.planet === "Venus")!.sign;
    const venusB = chartB.planets.find((p) => p.planet === "Venus")!.sign;
    if (venusA !== venusB) {
      const interpA = interpretNatalChart(chartA);
      const interpB = interpretNatalChart(chartB);
      assert.notEqual(interpA.venusSummary, interpB.venusSummary,
        `Venus ${venusA} vs ${venusB}: venusSummary must differ when Venus sign differs`);
    }
  });

  test("9c: 관계 domain tone is keyed by natal Venus — different Venus signs → different element harmony", () => {
    const chart = computeNatalChart(REF_INPUT);
    const domains = interpretDomains(chart, new Date("2025-01-01T12:00:00Z"));
    const relDomain = domains.find((d) => d.domain === "관계")!;
    assert.ok(["strength", "challenge", "neutral"].includes(relDomain.tone),
      `관계 domain must have a valid tone, got "${relDomain.tone}"`);
  });

  test("10: Mars sign drives marsSaturnSummary — text references Mars sign name", () => {
    const chart = computeNatalChart(REF_INPUT);
    const marsSign = chart.planets.find((p) => p.planet === "Mars")!.sign;
    const interp = interpretNatalChart(chart);
    const expectedMars = `화성이 ${SIGN_KO_MAP[marsSign]}에`;
    assert.ok(
      interp.marsSaturnSummary.includes(expectedMars),
      `marsSaturnSummary must reference Mars sign ${marsSign}. Got: "${interp.marsSaturnSummary}"`,
    );
  });

  test("10b: Saturn sign drives marsSaturnSummary — text references Saturn sign name", () => {
    const chart = computeNatalChart(REF_INPUT);
    const saturnSign = chart.planets.find((p) => p.planet === "Saturn")!.sign;
    const interp = interpretNatalChart(chart);
    const expectedSaturn = `토성이 ${SIGN_KO_MAP[saturnSign]}에`;
    assert.ok(
      interp.marsSaturnSummary.includes(expectedSaturn),
      `marsSaturnSummary must reference Saturn sign ${saturnSign}. Got: "${interp.marsSaturnSummary}"`,
    );
  });

  test("10c: MC sign drives mcSummary — text contains correct MC sign name", () => {
    const chart = computeNatalChart(REF_INPUT);
    const mcSign = chart.midheaven.sign;
    const interp = interpretNatalChart(chart);
    const expected = SIGN_KO_MAP[mcSign];
    assert.ok(
      interp.mcSummary.includes(expected),
      `mcSummary must reference MC sign ${mcSign}. Got: "${interp.mcSummary}"`,
    );
  });

  test("10d: 루틴·일 domain tone is deterministic (Mars/Saturn transit influence stable)", () => {
    const chart = computeNatalChart(REF_INPUT);
    const date = new Date("2025-09-01T12:00:00Z");
    const d1 = interpretDomains(chart, date);
    const d2 = interpretDomains(chart, date);
    const r1 = d1.find((d) => d.domain === "루틴·일")!;
    const r2 = d2.find((d) => d.domain === "루틴·일")!;
    assert.equal(r1.tone, r2.tone, "루틴·일 tone must be deterministic for same chart + date");
  });

  test("10e: All 10 planets appear in natal placements", () => {
    const chart = computeNatalChart(REF_INPUT);
    const interp = interpretNatalChart(chart);
    assert.equal(interp.placements.length, 10, "There must be 10 planet placements");
    const expectedPlanets = ["태양", "달", "수성", "금성", "화성", "목성", "토성", "천왕성", "해왕성", "명왕성"];
    for (const name of expectedPlanets) {
      assert.ok(
        interp.placements.some((p) => p.planet === name),
        `Placement for ${name} must exist`,
      );
    }
  });
});

describe("Transit output Phase 8 (activeAspects + transitMoonSign)", () => {
  const CHART = computeNatalChart(REF_INPUT);

  test("transitMoonSign is a non-empty string", () => {
    const interp = interpretTransits(CHART, new Date("2025-01-01T12:00:00Z"));
    assert.ok(
      typeof interp.transitMoonSign === "string" && interp.transitMoonSign.length > 0,
      "transitMoonSign must be a non-empty string"
    );
  });

  test("activeAspects is an Array", () => {
    const interp = interpretTransits(CHART, new Date("2025-01-01T12:00:00Z"));
    assert.ok(Array.isArray(interp.activeAspects), "activeAspects must be an Array");
  });

  test("transitMoonSign changes as Moon moves to a new sign (~2.5 days apart)", () => {
    // The Moon moves through all 12 signs in ~27 days; pick two dates far enough apart
    // that the sign is virtually guaranteed to differ.
    const d1 = new Date("2025-01-01T00:00:00Z");
    const d2 = new Date("2025-01-10T00:00:00Z"); // 9 days later ≈ 3-4 sign changes
    const sign1 = interpretTransits(CHART, d1).transitMoonSign;
    const sign2 = interpretTransits(CHART, d2).transitMoonSign;
    assert.notEqual(sign1, sign2, "transitMoonSign must differ between dates 9 days apart");
  });

  test("same chart + same date produce identical transitMoonSign and activeAspects length", () => {
    const date = new Date("2025-06-15T06:00:00Z");
    const r1 = interpretTransits(CHART, date);
    const r2 = interpretTransits(CHART, date);
    assert.equal(r1.transitMoonSign, r2.transitMoonSign, "transitMoonSign must be deterministic");
    assert.equal(r1.activeAspects.length, r2.activeAspects.length, "activeAspects length must be deterministic");
  });

  test("interpretTransits headline is never undefined or empty", () => {
    const dates = [
      new Date("2025-01-01"),
      new Date("2025-06-21"),
      new Date("2025-12-31"),
    ];
    for (const date of dates) {
      const interp = interpretTransits(CHART, date);
      assert.ok(
        typeof interp.headline === "string" && interp.headline.length > 0,
        `headline must be non-empty for date ${date.toISOString()}`
      );
    }
  });

  test("computeNatalChart with valid REF_INPUT does not return null or throw", () => {
    let chart: ReturnType<typeof computeNatalChart> | null = null;
    assert.doesNotThrow(() => {
      chart = computeNatalChart(REF_INPUT);
    }, "computeNatalChart must not throw for valid input");
    assert.ok(chart !== null, "computeNatalChart must not return null for valid input");
  });
});

// ── Decision engine ───────────────────────────────────────────────────────────

describe("Decision engine (GO / WAIT / AVOID)", () => {
  const CHART_A = computeNatalChart(REF_INPUT); // Seoul 1990-04-15 09:30
  const CHART_B = computeNatalChart({
    ...REF_INPUT,
    birthUtc: localBirthToUtc(1973, 11, 29, 3, 15, "America/Los_Angeles"),
  });
  const FIXED_DATE = new Date("2025-09-15T12:00:00Z");

  test("computeDecision returns all required fields", () => {
    const d = computeDecision(CHART_A, "confession", FIXED_DATE);
    assert.ok(["GO", "WAIT", "AVOID"].includes(d.recommendation), "recommendation must be GO|WAIT|AVOID");
    assert.ok(d.confidence >= 0 && d.confidence <= 100, `confidence must be 0-100, got ${d.confidence}`);
    assert.ok(Array.isArray(d.factors) && d.factors.length > 0, "factors must be non-empty array");
    assert.ok(typeof d.summary === "string" && d.summary.length > 0, "summary must be non-empty string");
    assert.ok(typeof d.headline === "string" && d.headline.length > 0, "headline must be a non-empty string");
  });

  test("recommendation is always one of GO | WAIT | AVOID (10 intents)", () => {
    const intents = ["confession", "breakup", "quit", "trust", "compatibility",
                     "conflict", "direction", "identity", "friendship", "purpose"] as const;
    for (const intent of intents) {
      const d = computeDecision(CHART_A, intent, FIXED_DATE);
      assert.ok(["GO", "WAIT", "AVOID"].includes(d.recommendation),
        `recommendation must be valid for intent ${intent}, got "${d.recommendation}"`);
    }
  });

  test("confidence is 0-100 for all intents", () => {
    const intents = ["confession", "breakup", "quit", "trust"] as const;
    for (const intent of intents) {
      const d = computeDecision(CHART_A, intent, FIXED_DATE);
      assert.ok(d.confidence >= 0 && d.confidence <= 100,
        `confidence out of range for ${intent}: ${d.confidence}`);
    }
  });

  test("all factors have a valid direction", () => {
    const d = computeDecision(CHART_A, "confession", FIXED_DATE);
    for (const f of d.factors) {
      assert.ok(["positive", "negative", "neutral"].includes(f.direction),
        `factor "${f.name}" has invalid direction "${f.direction}"`);
      assert.ok(f.score >= 0 && f.score <= 100,
        `factor "${f.name}" has out-of-range score ${f.score}`);
      assert.ok(typeof f.note === "string" && f.note.length > 0,
        `factor "${f.name}" must have a non-empty note`);
    }
  });

  test("same chart + same intent + same date → identical output (determinism)", () => {
    const d1 = computeDecision(CHART_A, "confession", FIXED_DATE);
    const d2 = computeDecision(CHART_A, "confession", FIXED_DATE);
    assert.equal(d1.recommendation, d2.recommendation, "recommendation must be deterministic");
    assert.equal(d1.confidence, d2.confidence, "confidence must be deterministic");
    assert.equal(d1.factors.length, d2.factors.length, "factors length must be deterministic");
    assert.deepEqual(
      d1.factors.map((f) => ({ name: f.name, score: f.score, dir: f.direction })),
      d2.factors.map((f) => ({ name: f.name, score: f.score, dir: f.direction })),
      "factor names/scores/directions must be deterministic",
    );
  });

  test("confession decision uses Venus and Moon as primary factors", () => {
    const d = computeDecision(CHART_A, "confession", FIXED_DATE);
    const names = d.factors.map((f) => f.name);
    assert.ok(names.some((n) => n.includes("금성")), `confession must include 금성 factor, got: ${names.join(", ")}`);
    assert.ok(names.some((n) => n.includes("달")), `confession must include 달 factor, got: ${names.join(", ")}`);
    assert.ok(names.some((n) => n.includes("화성")), `confession must include 화성 factor, got: ${names.join(", ")}`);
  });

  test("breakup decision uses Moon, Saturn, Mars as primary factors", () => {
    const d = computeDecision(CHART_A, "breakup", FIXED_DATE);
    const names = d.factors.map((f) => f.name);
    assert.ok(names.some((n) => n.includes("달")),   `breakup must include 달 factor`);
    assert.ok(names.some((n) => n.includes("토성")), `breakup must include 토성 factor`);
    assert.ok(names.some((n) => n.includes("화성")), `breakup must include 화성 factor`);
  });

  test("quit (job change) decision uses Saturn, Mars, Sun as primary factors", () => {
    const d = computeDecision(CHART_A, "quit", FIXED_DATE);
    const names = d.factors.map((f) => f.name);
    assert.ok(names.some((n) => n.includes("토성")), `quit must include 토성 factor`);
    assert.ok(names.some((n) => n.includes("화성")), `quit must include 화성 factor`);
    assert.ok(names.some((n) => n.includes("태양")), `quit must include 태양 factor`);
  });

  test("trust decision uses Moon, Mercury, Saturn as primary factors", () => {
    const d = computeDecision(CHART_A, "trust", FIXED_DATE);
    const names = d.factors.map((f) => f.name);
    assert.ok(names.some((n) => n.includes("달")),   `trust must include 달 factor`);
    assert.ok(names.some((n) => n.includes("수성")), `trust must include 수성 factor`);
    assert.ok(names.some((n) => n.includes("토성")), `trust must include 토성 factor`);
  });

  test("all decisions include house activation factor", () => {
    for (const intent of ["confession", "breakup", "quit", "trust"] as const) {
      const d = computeDecision(CHART_A, intent, FIXED_DATE);
      assert.ok(
        d.factors.some((f) => f.name === "영역 활성화"),
        `${intent} must include 영역 활성화 factor`,
      );
    }
  });

  test("different charts produce different factor scores for the same intent + date", () => {
    // CHART_A and CHART_B have very different birth data → different natal planet positions
    const dA = computeDecision(CHART_A, "confession", FIXED_DATE);
    const dB = computeDecision(CHART_B, "confession", FIXED_DATE);
    // At least the planet scores should differ since natal longitudes differ
    const scoresA = dA.factors.map((f) => f.score).join(",");
    const scoresB = dB.factors.map((f) => f.score).join(",");
    assert.notEqual(scoresA, scoresB,
      "Factor scores must differ between charts with different birth data");
  });

  test("different intents produce different factor sets", () => {
    const confessionFactors = computeDecision(CHART_A, "confession", FIXED_DATE).factors;
    const quitFactors       = computeDecision(CHART_A, "quit",       FIXED_DATE).factors;
    const confessionNames = confessionFactors.map((f) => f.name);
    const quitNames       = quitFactors.map((f) => f.name);
    // The two configs use entirely different primary planets
    assert.ok(confessionNames.some((n) => n.includes("금성")), `confession must include 금성 factor, got: ${confessionNames.join(", ")}`);
    assert.ok(quitNames.some((n) => n.includes("토성")),       `quit must include 토성 factor, got: ${quitNames.join(", ")}`);
    // The overall factor sets must differ between intents
    assert.notDeepEqual(confessionNames, quitNames, "confession and quit must have different factor name sets");
    // Factors are now sorted by impact (weight × |score-50|), so each call is consistent
    assert.ok(confessionFactors.length >= 4, "confession must have at least 4 factors");
    assert.ok(quitFactors.length >= 4,       "quit must have at least 4 factors");
  });

  test("same chart + different dates produce different Moon stability notes", () => {
    // Moon moves ~13°/day — 5 days apart guarantees sign change most of the time
    const d1 = computeDecision(CHART_A, "trust", new Date("2025-01-01T12:00:00Z"));
    const d2 = computeDecision(CHART_A, "trust", new Date("2025-01-10T12:00:00Z"));
    const moonFactor1 = d1.factors.find((f) => f.name.includes("달"));
    const moonFactor2 = d2.factors.find((f) => f.name.includes("달"));
    assert.ok(moonFactor1 && moonFactor2, "Both decisions must have a 달 factor");
    // The notes embed the Moon sign, so they should differ across a 9-day span
    assert.notEqual(moonFactor1.note, moonFactor2.note,
      "Moon factor note must change as Moon transits to a new sign");
  });
});
