/**
 * Distribution audit for the /void decision engine.
 * Run with:
 *   node --experimental-strip-types src/lib/astrology/__tests__/distribution-audit.ts
 *
 * Tests across:
 * - 6 distinct birth charts (different Sun/Moon/Rising combos)
 * - 12 dates spread across the year (different Moon signs ≈ every ~2.5 days)
 * - All 18 question intents
 *
 * Reports:
 * - GO/WAIT/AVOID distribution per intent and overall
 * - Confidence spread (min/max/mean)
 * - Subtype bias: any intent stuck in WAIT >80%?
 * - Keyword classification for 30 real-user Korean phrasings
 */

import { computeNatalChart, localBirthToUtc } from "../calculate.js";
import { computeDecision } from "../../server/void-decision.js";
import { classifyQuestionIntent } from "../../server/void-intent.js";
import type { QuestionIntent } from "../../server/void-intent.js";

type CategoryKey = "self" | "love" | "work" | "social";

// ── Reference charts: 6 distinct birth data sets ─────────────────────────────

const CHARTS = [
  { id: "A-Seoul-1990", chart: computeNatalChart({ birthUtc: localBirthToUtc(1990, 4, 15, 9, 30, "Asia/Seoul"),  latitude: 37.5665, longitude: 126.9780, timezone: "Asia/Seoul" }) },
  { id: "B-Seoul-1985", chart: computeNatalChart({ birthUtc: localBirthToUtc(1985, 8, 22, 14, 0,  "Asia/Seoul"),  latitude: 37.5665, longitude: 126.9780, timezone: "Asia/Seoul" }) },
  { id: "C-Seoul-1973", chart: computeNatalChart({ birthUtc: localBirthToUtc(1973, 11, 29, 3, 15, "Asia/Seoul"),  latitude: 37.5665, longitude: 126.9780, timezone: "Asia/Seoul" }) },
  { id: "D-Tokyo-1995", chart: computeNatalChart({ birthUtc: localBirthToUtc(1995, 2, 7,  6, 45, "Asia/Tokyo"),   latitude: 35.6762, longitude: 139.6503, timezone: "Asia/Tokyo" }) },
  { id: "E-NY-1980",    chart: computeNatalChart({ birthUtc: localBirthToUtc(1980, 6, 21, 22, 0, "America/New_York"), latitude: 40.7128, longitude: -74.0060, timezone: "America/New_York" }) },
  { id: "F-London-1998",chart: computeNatalChart({ birthUtc: localBirthToUtc(1998, 12, 1, 7, 20, "Europe/London"),latitude: 51.5074, longitude: -0.1278,   timezone: "Europe/London" }) },
];

// ── 12 transit dates spread across a year ────────────────────────────────────
// Chosen to cover all Moon signs approx (Moon cycles ~29.5 days, every 2.5d = new sign)

const DATES = [
  new Date("2025-01-05T12:00:00Z"),
  new Date("2025-01-22T12:00:00Z"),
  new Date("2025-03-10T12:00:00Z"),
  new Date("2025-04-01T12:00:00Z"),
  new Date("2025-05-18T12:00:00Z"),
  new Date("2025-06-14T12:00:00Z"),
  new Date("2025-07-29T12:00:00Z"),
  new Date("2025-08-11T12:00:00Z"),
  new Date("2025-09-25T12:00:00Z"),
  new Date("2025-10-17T12:00:00Z"),
  new Date("2025-11-30T12:00:00Z"),
  new Date("2025-12-20T12:00:00Z"),
];

// ── All 18 intents ────────────────────────────────────────────────────────────

const ALL_INTENTS: QuestionIntent[] = [
  "confession", "compatibility", "breakup", "relationship", "trust",
  "quit", "promotion", "conflict", "decision", "direction",
  "identity", "energy", "pattern", "purpose",
  "communication", "friendship", "group", "distance",
];

// ── Distribution matrix ───────────────────────────────────────────────────────

type Row = { rec: string; conf: number };
const results: Record<QuestionIntent, Row[]> = {} as Record<QuestionIntent, Row[]>;

for (const intent of ALL_INTENTS) results[intent] = [];

let totalGO = 0, totalWAIT = 0, totalAVOID = 0;
const totalRuns = CHARTS.length * DATES.length * ALL_INTENTS.length;

for (const { chart } of CHARTS) {
  for (const date of DATES) {
    for (const intent of ALL_INTENTS) {
      const d = computeDecision(chart, intent, date);
      results[intent].push({ rec: d.recommendation, conf: d.confidence });
      if (d.recommendation === "GO")    totalGO++;
      else if (d.recommendation === "WAIT")  totalWAIT++;
      else                               totalAVOID++;
    }
  }
}

// ── Per-intent summary ────────────────────────────────────────────────────────

console.log("\n=== GO / WAIT / AVOID DISTRIBUTION AUDIT ===");
console.log(`Total runs: ${totalRuns}  (${CHARTS.length} charts × ${DATES.length} dates × ${ALL_INTENTS.length} intents)\n`);
console.log(`GLOBAL: GO=${totalGO} (${pct(totalGO, totalRuns)}%)  WAIT=${totalWAIT} (${pct(totalWAIT, totalRuns)}%)  AVOID=${totalAVOID} (${pct(totalAVOID, totalRuns)}%)\n`);

function pct(n: number, total: number): string {
  return ((n / total) * 100).toFixed(1);
}
function mean(arr: number[]): string {
  return (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1);
}

console.log(
  "INTENT".padEnd(18) +
  "GO%".padStart(6) + "WAIT%".padStart(7) + "AVOID%".padStart(8) +
  "  conf-mean".padStart(12) + "  conf-min".padStart(11) + "  conf-max".padStart(11) +
  "  FLAGS"
);
console.log("-".repeat(90));

const ISSUES: string[] = [];

for (const intent of ALL_INTENTS) {
  const rows = results[intent];
  const n = rows.length;
  const go    = rows.filter(r => r.rec === "GO").length;
  const wait  = rows.filter(r => r.rec === "WAIT").length;
  const avoid = rows.filter(r => r.rec === "AVOID").length;
  const confs = rows.map(r => r.conf);
  const minC  = Math.min(...confs);
  const maxC  = Math.max(...confs);
  const meanC = mean(confs);

  const flags: string[] = [];
  const waitPct = (wait / n) * 100;
  const goPct   = (go / n) * 100;
  const avoidPct= (avoid / n) * 100;

  if (waitPct > 80)  { flags.push("⚠ WAIT-DOMINANT"); ISSUES.push(`${intent}: WAIT ${waitPct.toFixed(0)}% — too dominant`); }
  if (goPct === 0)   { flags.push("⚠ NEVER-GO");    ISSUES.push(`${intent}: never reaches GO`); }
  if (avoidPct === 0){ flags.push("⚠ NEVER-AVOID");  ISSUES.push(`${intent}: never reaches AVOID`); }
  if (maxC - minC < 10) { flags.push("⚠ FLAT-CONF"); ISSUES.push(`${intent}: confidence spread < 10 (${minC}–${maxC})`); }

  console.log(
    intent.padEnd(18) +
    pct(go, n).padStart(6) + pct(wait, n).padStart(7) + pct(avoid, n).padStart(8) +
    meanC.padStart(12) + String(minC).padStart(11) + String(maxC).padStart(11) +
    (flags.length ? "  " + flags.join(" ") : "")
  );
}

// ── Per-chart bias check ──────────────────────────────────────────────────────

console.log("\n=== PER-CHART DISTRIBUTION ===");
for (const { id, chart } of CHARTS) {
  let go = 0, wait = 0, avoid = 0, total = 0;
  for (const date of DATES) {
    for (const intent of ALL_INTENTS) {
      const d = computeDecision(chart, intent, date);
      if (d.recommendation === "GO")   go++;
      else if (d.recommendation === "WAIT") wait++;
      else avoid++;
      total++;
    }
  }
  const goLabel   = pct(go, total).padStart(5);
  const waitLabel = pct(wait, total).padStart(5);
  const avoidLabel= pct(avoid, total).padStart(5);
  console.log(`  ${id.padEnd(20)} GO=${goLabel}%  WAIT=${waitLabel}%  AVOID=${avoidLabel}%`);
}

// ── Per-date distribution check ───────────────────────────────────────────────

console.log("\n=== PER-DATE DISTRIBUTION ===");
for (const date of DATES) {
  let go = 0, wait = 0, avoid = 0, total = 0;
  for (const { chart } of CHARTS) {
    for (const intent of ALL_INTENTS) {
      const d = computeDecision(chart, intent, date);
      if (d.recommendation === "GO")   go++;
      else if (d.recommendation === "WAIT") wait++;
      else avoid++;
      total++;
    }
  }
  const ds = date.toISOString().slice(0, 10);
  const goLabel   = pct(go, total).padStart(5);
  const waitLabel = pct(wait, total).padStart(5);
  const avoidLabel= pct(avoid, total).padStart(5);
  console.log(`  ${ds}  GO=${goLabel}%  WAIT=${waitLabel}%  AVOID=${avoidLabel}%`);
}

// ── Intent classification audit ───────────────────────────────────────────────

console.log("\n=== INTENT CLASSIFICATION AUDIT (30 real-user phrasings) ===");

interface TestPhrase { cat: CategoryKey; text: string; expected: QuestionIntent; }

const PHRASE_TESTS: TestPhrase[] = [
  // confession
  { cat: "love", text: "그 사람한테 먼저 연락해도 될까요", expected: "confession" },
  { cat: "love", text: "마음을 직접 표현해도 될지 모르겠어요", expected: "confession" },
  { cat: "love", text: "좋아한다고 말해도 될까요", expected: "confession" },
  // compatibility
  { cat: "love", text: "우리 궁합이 어떤지 알고 싶어요", expected: "compatibility" },
  { cat: "love", text: "저랑 잘 맞는 사람인가요", expected: "compatibility" },
  // breakup
  { cat: "love", text: "헤어지는 게 맞는 것 같아요", expected: "breakup" },
  { cat: "love", text: "이 관계를 정리하고 싶어요", expected: "breakup" },
  { cat: "love", text: "이제 끝내고 싶은데 못 하겠어요", expected: "breakup" },
  // trust
  { cat: "love", text: "이 사람이 진심인지 모르겠어요", expected: "trust" },
  { cat: "love", text: "나를 이용하는 건 아닐까 걱정이에요", expected: "trust" },
  { cat: "love", text: "거짓말하는 거 아닐까요", expected: "trust" },
  // promotion / quit / conflict / direction
  { cat: "work", text: "연봉 협상 지금 해도 될까요", expected: "promotion" },
  { cat: "work", text: "팀장이 될 수 있을까요", expected: "promotion" },
  { cat: "work", text: "회사 그만둬야 할 것 같아요", expected: "quit" },
  { cat: "work", text: "이직 타이밍이 맞는 건지 모르겠어요", expected: "quit" },
  { cat: "work", text: "상사랑 갈등이 심해요", expected: "conflict" },
  { cat: "work", text: "팀장이랑 계속 마찰이 있어요", expected: "conflict" },
  { cat: "work", text: "어떤 방향으로 커리어를 쌓아야 할까요", expected: "direction" },
  { cat: "work", text: "어떤 직업이 저한테 맞을지 모르겠어요", expected: "direction" },
  // distance / friendship / conflict (social)
  { cat: "social", text: "친구가 요즘 달라진 것 같아요", expected: "distance" },
  { cat: "social", text: "예전 같지 않아요 그 친구가", expected: "distance" },
  { cat: "social", text: "친구가 멀어지는 것 같아서 불안해요", expected: "distance" },
  { cat: "social", text: "절친이랑 요즘 연락이 없어요", expected: "distance" },
  { cat: "social", text: "무리에서 소외되는 것 같아요", expected: "conflict" },
  // self: energy / pattern / identity / purpose
  { cat: "self", text: "요즘 너무 지쳐서 아무것도 하기 싫어요", expected: "energy" },
  { cat: "self", text: "에너지가 없어서 무기력해요", expected: "energy" },
  { cat: "self", text: "왜 항상 같은 실수를 반복할까요", expected: "pattern" },
  { cat: "self", text: "나는 왜 이런 사람인가요 — 정체성이 흔들려요", expected: "identity" },
  { cat: "self", text: "삶의 의미를 모르겠어요", expected: "purpose" },
  { cat: "self", text: "앞으로 어떻게 살아야 할지 모르겠어요", expected: "direction" },
];

let pass = 0;
const MISSES: string[] = [];

for (const { cat, text, expected } of PHRASE_TESTS) {
  const r = classifyQuestionIntent(text, cat);
  const ok = r.intent === expected;
  if (ok) { pass++; } else {
    MISSES.push(`  FAIL [${cat}] "${text.slice(0, 45)}" → got "${r.intent}", expected "${expected}"`);
  }
}

console.log(`\nClassification: ${pass}/${PHRASE_TESTS.length} correct (${((pass/PHRASE_TESTS.length)*100).toFixed(0)}%)\n`);
if (MISSES.length) {
  console.log("MISCLASSIFICATIONS:");
  MISSES.forEach(m => console.log(m));
}

// ── Summary ───────────────────────────────────────────────────────────────────

if (ISSUES.length) {
  console.log("\n=== DISTRIBUTION ISSUES ===");
  ISSUES.forEach(i => console.log("  " + i));
} else {
  console.log("\n✓ No distribution issues found.");
}
console.log("");
