/**
 * Area Report (영역 보고서) generator.
 *
 * Produces a three-section deep-dive: 자아·에너지 / 관계 / 루틴·일
 * using natal chart + today's domain readings + natal interpretation.
 *
 * Same chart + same transit date → same output (deterministic).
 */

import { getNatalChartForUser } from "./chart-runtime";
import {
  interpretNatalChart,
  interpretDomains,
  SIGN_KO,
  PLANET_KO,
} from "@/lib/astrology/interpret";
import type { NatalChart } from "@/lib/astrology/types";

// ── Output types ──────────────────────────────────────────────────────────────

export type AreaSection = {
  key: "self" | "love" | "work";
  label: string;
  icon: string;
  tone: "strength" | "challenge" | "neutral";
  headline: string;
  body: string;
  keyInsight: string;
};

export type AreaReport = {
  generatedAt: string;
  chartHash: string;
  intro: string;
  sections: [AreaSection, AreaSection, AreaSection];
  synthesis: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function planetLine(chart: NatalChart, name: string): string {
  const p = chart.planets.find((x) => x.planet === name);
  if (!p) return "";
  const pKo = PLANET_KO[name as keyof typeof PLANET_KO] ?? name;
  const sKo = SIGN_KO[p.sign as keyof typeof SIGN_KO] ?? p.sign;
  return `${pKo} · ${sKo} ${p.house}영역${p.retrograde ? " (역행)" : ""}`;
}

function tonePrefix(tone: "strength" | "challenge" | "neutral"): string {
  if (tone === "strength") return "현재 이 영역의 에너지는 순방향으로 흐르고 있습니다.";
  if (tone === "challenge") return "이 영역에는 긴장이 존재하며, 의식적 방향 설정이 필요합니다.";
  return "이 영역의 에너지는 중립적으로 접근하고 있습니다.";
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateAreaReport(userId: string): Promise<AreaReport | null> {
  const chart = await getNatalChartForUser(userId);
  if (!chart) return null;

  const natal = interpretNatalChart(chart);
  const domains = interpretDomains(chart, new Date());

  const selfDomain  = domains.find((d) => d.domain === "나")       ?? domains[0];
  const loveDomain  = domains.find((d) => d.domain === "관계")      ?? domains[1];
  const workDomain  = domains.find((d) => d.domain === "루틴·일")   ?? domains[2];

  const ascSign = SIGN_KO[chart.ascendant.sign as keyof typeof SIGN_KO] ?? chart.ascendant.sign;
  const sunLine  = planetLine(chart, "Sun");
  const moonLine = planetLine(chart, "Moon");
  const venusLine = planetLine(chart, "Venus");
  const saturnLine = planetLine(chart, "Saturn");
  const marsLine = planetLine(chart, "Mars");

  const selfBody = [
    `탄생점 · ${ascSign}`,
    natal.ascSummary,
    "",
    sunLine,
    moonLine,
    "",
    tonePrefix(selfDomain.tone),
    selfDomain.note,
  ].join("\n");

  const loveBody = [
    venusLine,
    "",
    tonePrefix(loveDomain.tone),
    loveDomain.note,
    "",
    natal.keyAspects.length > 0 ? natal.keyAspects[0] : natal.dominantPattern,
  ].join("\n");

  const workBody = [
    saturnLine,
    marsLine,
    "",
    tonePrefix(workDomain.tone),
    workDomain.note,
    "",
    natal.keyAspects.length > 1 ? natal.keyAspects[1] : natal.dominantPattern,
  ].join("\n");

  return {
    generatedAt: new Date().toISOString(),
    chartHash: chart.chartHash ?? "",
    intro: natal.dominantPattern,
    sections: [
      {
        key: "self",
        label: "자아 · 에너지",
        icon: "✦",
        tone: selfDomain.tone,
        headline: selfDomain.headline,
        body: selfBody,
        keyInsight: natal.ascSummary,
      },
      {
        key: "love",
        label: "관계",
        icon: "♡",
        tone: loveDomain.tone,
        headline: loveDomain.headline,
        body: loveBody,
        keyInsight: loveDomain.note,
      },
      {
        key: "work",
        label: "루틴 · 일",
        icon: "▣",
        tone: workDomain.tone,
        headline: workDomain.headline,
        body: workBody,
        keyInsight: workDomain.note,
      },
    ],
    synthesis: natal.keyAspects[0] ?? natal.dominantPattern,
  };
}
