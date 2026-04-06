/**
 * Yearly Report (연간 보고서) generator — 2026.
 *
 * Computes transit interpretations at the 4 seasonal points of 2026
 * (equinoxes + solstices) and stitches them into a year-long narrative.
 *
 * Same chart → same output (deterministic per year).
 */

import { getOrComputeNatalChart } from "./chart-store";
import {
  interpretNatalChart,
  interpretTransits,
  SIGN_KO,
} from "@/lib/astrology/interpret";
import type { NatalChart } from "@/lib/astrology/types";

// ── Output types ──────────────────────────────────────────────────────────────

export type SeasonEntry = {
  season: "spring" | "summer" | "autumn" | "winter";
  label: string;       // "봄 (3–5월)"
  period: string;      // "3월 20일 – 6월 20일"
  headline: string;
  lede: string;
  keyPhrase: string;
  tone: "strength" | "challenge" | "neutral";
};

export type YearlyReport = {
  generatedAt: string;
  chartHash: string;
  year: number;
  overallTheme: string;
  intro: string;
  seasons: [SeasonEntry, SeasonEntry, SeasonEntry, SeasonEntry];
  yearKeyPhrase: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function deriveTone(
  interp: ReturnType<typeof interpretTransits>,
): "strength" | "challenge" | "neutral" {
  const aspects = interp.activeAspects;
  let pos = 0;
  let neg = 0;
  for (const a of aspects) {
    if (a.aspect === "trine" || a.aspect === "sextile") pos++;
    if (a.aspect === "square" || a.aspect === "opposition") neg++;
  }
  if (pos > neg) return "strength";
  if (neg > pos) return "challenge";
  return "neutral";
}

function keyPlanetLine(chart: NatalChart): string {
  const sun = chart.planets.find((p) => p.planet === "Sun");
  const jup = chart.planets.find((p) => p.planet === "Jupiter");
  if (!sun || !jup) return "";
  const sunKo = SIGN_KO[sun.sign as keyof typeof SIGN_KO] ?? sun.sign;
  const jupKo = SIGN_KO[jup.sign as keyof typeof SIGN_KO] ?? jup.sign;
  return `태양 · ${sunKo} · ${sun.house}영역 / 목성 · ${jupKo} · ${jup.house}영역`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function generateYearlyReport(userId: string): YearlyReport | null {
  const chart = getOrComputeNatalChart(userId);
  if (!chart) return null;

  const natal = interpretNatalChart(chart);

  // Seasonal equinox/solstice dates for 2026
  const springDate = new Date(2026, 2, 20);  // Spring equinox
  const summerDate = new Date(2026, 5, 21);  // Summer solstice
  const autumnDate = new Date(2026, 8, 22);  // Autumn equinox
  const winterDate = new Date(2026, 11, 21); // Winter solstice

  const spring = interpretTransits(chart, springDate);
  const summer = interpretTransits(chart, summerDate);
  const autumn = interpretTransits(chart, autumnDate);
  const winter = interpretTransits(chart, winterDate);

  const overallTheme = natal.dominantPattern;
  const intro = [
    keyPlanetLine(chart),
    "",
    natal.ascSummary,
  ].join("\n");

  // Pick an overall key phrase from the season with the most active aspects
  const allAspects = [spring, summer, autumn, winter];
  const peakSeason = allAspects.reduce(
    (best, cur) => cur.activeAspects.length >= best.activeAspects.length ? cur : best,
    spring,
  );

  return {
    generatedAt: new Date().toISOString(),
    chartHash: chart.chartHash ?? "",
    year: 2026,
    overallTheme,
    intro,
    seasons: [
      {
        season: "spring",
        label: "봄",
        period: "3월 20일 – 6월 20일",
        headline: spring.headline,
        lede: spring.lede,
        keyPhrase: spring.keyPhrase,
        tone: deriveTone(spring),
      },
      {
        season: "summer",
        label: "여름",
        period: "6월 21일 – 9월 21일",
        headline: summer.headline,
        lede: summer.lede,
        keyPhrase: summer.keyPhrase,
        tone: deriveTone(summer),
      },
      {
        season: "autumn",
        label: "가을",
        period: "9월 22일 – 12월 20일",
        headline: autumn.headline,
        lede: autumn.lede,
        keyPhrase: autumn.keyPhrase,
        tone: deriveTone(autumn),
      },
      {
        season: "winter",
        label: "겨울",
        period: "12월 21일 – 2027년 3월",
        headline: winter.headline,
        lede: winter.lede,
        keyPhrase: winter.keyPhrase,
        tone: deriveTone(winter),
      },
    ],
    yearKeyPhrase: peakSeason.keyPhrase,
  };
}
