/**
 * Synastry (cross-chart compatibility) calculation engine.
 *
 * Computes compatibility between two natal charts by:
 *   1. Finding all significant cross-aspects (Person A planet ↔ Person B planet)
 *   2. Scoring four categories: Resonance, Communication, Tension, Growth
 *   3. Producing Korean interpretation text for each category and an overall synthesis
 *
 * Deterministic: same two charts → same output. No randomness.
 */

import { findAspect } from "@/lib/astrology/calculate";
import type { NatalChart, PlanetName, SignName } from "@/lib/astrology/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CrossAspectTone = "harmony" | "tension" | "neutral";

export type CrossAspect = {
  planetA: PlanetName;
  planetB: PlanetName;
  aspect: string;
  orb: number;
  tone: CrossAspectTone;
  significance: number;
  note: string;
};

export type SynastryCategory = {
  key: "resonance" | "communication" | "tension" | "growth";
  label: string;
  score: number;
  tone: "strength" | "challenge" | "neutral";
  headline: string;
  body: string;
  topAspect: CrossAspect | null;
};

export type SynastryAnalysis = {
  personASign: { sun: SignName; moon: SignName; asc: SignName };
  personBSign: { sun: SignName; moon: SignName; asc: SignName | null };
  personBTimeKnown: boolean;
  crossAspects: CrossAspect[];
  overallScore: number;
  overallTone: "strength" | "challenge" | "neutral";
  resonance: SynastryCategory;
  communication: SynastryCategory;
  tension: SynastryCategory;
  growth: SynastryCategory;
  synthesis: string;
  keyPhrase: string;
  generatedAt: string;
};

// ── Planet pair significance (0–100) ─────────────────────────────────────────
// How astrologically important is this pair in synastry?

type PairKey = string; // "Venus×Mars"

function pk(a: PlanetName, b: PlanetName): PairKey {
  return `${a}×${b}`;
}

const PAIR_SIGNIFICANCE: Partial<Record<PairKey, number>> = {
  [pk("Venus", "Mars")]:   90, [pk("Mars", "Venus")]:   90,
  [pk("Sun",   "Moon")]:   88, [pk("Moon",  "Sun")]:    88,
  [pk("Venus", "Venus")]:  84,
  [pk("Moon",  "Moon")]:   82,
  [pk("Sun",   "Venus")]:  78, [pk("Venus", "Sun")]:    78,
  [pk("Venus", "Moon")]:   78, [pk("Moon",  "Venus")]:  78,
  [pk("Sun",   "Sun")]:    74,
  [pk("Saturn","Moon")]:   74, [pk("Moon",  "Saturn")]: 74,
  [pk("Saturn","Sun")]:    72, [pk("Sun",   "Saturn")]: 72,
  [pk("Mercury","Mercury")]:70,
  [pk("Mars",  "Moon")]:   70, [pk("Moon",  "Mars")]:   70,
  [pk("Mercury","Moon")]:  66, [pk("Moon",  "Mercury")]:66,
  [pk("Mercury","Sun")]:   64, [pk("Sun",   "Mercury")]:64,
  [pk("Jupiter","Venus")]: 64, [pk("Venus", "Jupiter")]:64,
  [pk("Mars",  "Sun")]:    62, [pk("Sun",   "Mars")]:   62,
  [pk("Jupiter","Sun")]:   60, [pk("Sun",   "Jupiter")]:60,
  [pk("Jupiter","Moon")]:  60, [pk("Moon",  "Jupiter")]:60,
  [pk("Saturn","Venus")]:  60, [pk("Venus", "Saturn")]: 60,
  [pk("Mercury","Venus")]: 58, [pk("Venus", "Mercury")]:58,
};

function significance(a: PlanetName, b: PlanetName): number {
  return PAIR_SIGNIFICANCE[pk(a, b)] ?? 20;
}

// ── Category membership ───────────────────────────────────────────────────────

type CategoryKey = "resonance" | "communication" | "tension" | "growth";

const PAIR_CATEGORIES: Partial<Record<PairKey, CategoryKey[]>> = {
  [pk("Venus", "Mars")]:    ["resonance"],
  [pk("Mars",  "Venus")]:   ["resonance"],
  [pk("Sun",   "Moon")]:    ["resonance"],
  [pk("Moon",  "Sun")]:     ["resonance"],
  [pk("Venus", "Venus")]:   ["resonance"],
  [pk("Moon",  "Moon")]:    ["resonance"],
  [pk("Sun",   "Venus")]:   ["resonance"],
  [pk("Venus", "Sun")]:     ["resonance"],
  [pk("Venus", "Moon")]:    ["resonance"],
  [pk("Moon",  "Venus")]:   ["resonance"],
  [pk("Sun",   "Sun")]:     ["resonance", "growth"],
  [pk("Mercury","Mercury")]:["communication"],
  [pk("Mercury","Moon")]:   ["communication"],
  [pk("Moon",  "Mercury")]: ["communication"],
  [pk("Mercury","Sun")]:    ["communication"],
  [pk("Sun",   "Mercury")]: ["communication"],
  [pk("Mercury","Venus")]:  ["communication"],
  [pk("Venus", "Mercury")]: ["communication"],
  [pk("Saturn","Sun")]:     ["tension", "growth"],
  [pk("Sun",   "Saturn")]:  ["tension", "growth"],
  [pk("Saturn","Moon")]:    ["tension", "growth"],
  [pk("Moon",  "Saturn")]:  ["tension", "growth"],
  [pk("Saturn","Venus")]:   ["tension"],
  [pk("Venus", "Saturn")]:  ["tension"],
  [pk("Mars",  "Moon")]:    ["tension"],
  [pk("Moon",  "Mars")]:    ["tension"],
  [pk("Mars",  "Sun")]:     ["tension"],
  [pk("Sun",   "Mars")]:    ["tension"],
  [pk("Jupiter","Venus")]:  ["growth"],
  [pk("Venus", "Jupiter")]: ["growth"],
  [pk("Jupiter","Sun")]:    ["growth"],
  [pk("Sun",   "Jupiter")]: ["growth"],
  [pk("Jupiter","Moon")]:   ["growth"],
  [pk("Moon",  "Jupiter")]: ["growth"],
};

function pairCategories(a: PlanetName, b: PlanetName): CategoryKey[] {
  return PAIR_CATEGORIES[pk(a, b)] ?? [];
}

// ── Aspect tone ───────────────────────────────────────────────────────────────

const CONJUNCTION_TONE: Partial<Record<PairKey, CrossAspectTone>> = {
  [pk("Venus", "Mars")]:    "harmony",
  [pk("Mars",  "Venus")]:   "harmony",
  [pk("Sun",   "Moon")]:    "harmony",
  [pk("Moon",  "Sun")]:     "harmony",
  [pk("Venus", "Venus")]:   "harmony",
  [pk("Moon",  "Moon")]:    "harmony",
  [pk("Sun",   "Venus")]:   "harmony",
  [pk("Venus", "Sun")]:     "harmony",
  [pk("Venus", "Moon")]:    "harmony",
  [pk("Moon",  "Venus")]:   "harmony",
  [pk("Sun",   "Sun")]:     "harmony",
  [pk("Mercury","Mercury")]: "harmony",
  [pk("Mercury","Moon")]:   "harmony",
  [pk("Moon",  "Mercury")]: "harmony",
  [pk("Mercury","Sun")]:    "harmony",
  [pk("Sun",   "Mercury")]: "harmony",
  [pk("Mercury","Venus")]:  "harmony",
  [pk("Venus", "Mercury")]: "harmony",
  [pk("Jupiter","Venus")]:  "harmony",
  [pk("Venus", "Jupiter")]: "harmony",
  [pk("Jupiter","Sun")]:    "harmony",
  [pk("Sun",   "Jupiter")]: "harmony",
  [pk("Jupiter","Moon")]:   "harmony",
  [pk("Moon",  "Jupiter")]: "harmony",
  [pk("Saturn","Sun")]:     "tension",
  [pk("Sun",   "Saturn")]:  "tension",
  [pk("Saturn","Moon")]:    "tension",
  [pk("Moon",  "Saturn")]:  "tension",
  [pk("Saturn","Venus")]:   "tension",
  [pk("Venus", "Saturn")]:  "tension",
  [pk("Mars",  "Moon")]:    "tension",
  [pk("Moon",  "Mars")]:    "tension",
  [pk("Mars",  "Sun")]:     "tension",
  [pk("Sun",   "Mars")]:    "tension",
};

function aspectTone(a: PlanetName, b: PlanetName, aspect: string): CrossAspectTone {
  if (aspect === "trine" || aspect === "sextile") return "harmony";
  if (aspect === "square" || aspect === "opposition") return "tension";
  return CONJUNCTION_TONE[pk(a, b)] ?? "neutral";
}

// ── Korean notes ──────────────────────────────────────────────────────────────

type AspectKind = "conjunction" | "soft" | "hard";

function aspectKind(aspect: string): AspectKind {
  if (aspect === "conjunction") return "conjunction";
  if (aspect === "trine" || aspect === "sextile") return "soft";
  return "hard";
}

const PAIR_NOTES: Partial<Record<PairKey, Record<AspectKind, string>>> = {
  [pk("Venus","Mars")]: {
    conjunction: "자기적 끌림이 강렬합니다. 두 에너지가 강하게 반응합니다.",
    soft:        "끌림과 친밀함이 자연스럽게 조화를 이룹니다. 에너지 교환이 편안합니다.",
    hard:        "강한 끌림과 동시에 마찰이 공존합니다. 에너지 조율이 필요합니다.",
  },
  [pk("Mars","Venus")]: {
    conjunction: "자기적 끌림이 강렬합니다. 두 에너지가 강하게 반응합니다.",
    soft:        "끌림과 친밀함이 자연스럽게 조화를 이룹니다. 에너지 교환이 편안합니다.",
    hard:        "강한 끌림과 동시에 마찰이 공존합니다. 에너지 조율이 필요합니다.",
  },
  [pk("Sun","Moon")]: {
    conjunction: "두 에너지가 깊이 공명합니다. 정서적 이해가 직관적입니다.",
    soft:        "자아와 감성이 자연스럽게 연결됩니다. 함께 있을 때 편안함을 줍니다.",
    hard:        "욕구와 감정의 방향이 어긋납니다. 의식적인 조율이 필요합니다.",
  },
  [pk("Moon","Sun")]: {
    conjunction: "두 에너지가 깊이 공명합니다. 정서적 이해가 직관적입니다.",
    soft:        "자아와 감성이 자연스럽게 연결됩니다. 함께 있을 때 편안함을 줍니다.",
    hard:        "욕구와 감정의 방향이 어긋납니다. 의식적인 조율이 필요합니다.",
  },
  [pk("Venus","Venus")]: {
    conjunction: "가치관과 애정 방식이 닮아있습니다. 서로의 취향이 잘 통합니다.",
    soft:        "심미적 감각과 연결 방식이 자연스럽게 어우러집니다.",
    hard:        "가치관과 애정 표현 방식에 차이가 있습니다. 상대방의 방식을 이해하는 연습이 필요합니다.",
  },
  [pk("Moon","Moon")]: {
    conjunction: "감정의 결이 깊이 닮아있습니다. 서로의 정서를 직관적으로 알아봅니다.",
    soft:        "감정 패턴이 자연스럽게 흐릅니다. 정서적 공명이 깊습니다.",
    hard:        "감정 반응 방식이 달라 오해가 생기기 쉽습니다. 표현 방식을 다듬는 것이 도움이 됩니다.",
  },
  [pk("Saturn","Sun")]: {
    conjunction: "카르마적 연결입니다. 구조와 책임감이 관계의 중심에 자리 잡습니다.",
    soft:        "토성의 안정성이 상대방의 자아 에너지를 지지하고 방향을 잡아줍니다.",
    hard:        "토성의 제약이 상대방의 자아 표현을 시험합니다. 성장을 위한 마찰입니다.",
  },
  [pk("Sun","Saturn")]: {
    conjunction: "카르마적 연결입니다. 구조와 책임감이 관계의 중심에 자리 잡습니다.",
    soft:        "안정적인 구조가 자아 에너지를 지지합니다. 신뢰가 쌓입니다.",
    hard:        "자아 표현이 구조적 압박과 충돌합니다. 자유와 구조의 균형이 과제입니다.",
  },
  [pk("Saturn","Moon")]: {
    conjunction: "감정에 무게와 깊이가 더해집니다. 진지하고 오래가는 연결입니다.",
    soft:        "정서적 안정감을 주는 구조적 연결입니다. 함께 있을 때 안전함을 느낍니다.",
    hard:        "토성이 상대방의 감정을 압박합니다. 정서적 자유가 제한될 수 있습니다.",
  },
  [pk("Moon","Saturn")]: {
    conjunction: "감정에 무게와 깊이가 더해집니다. 진지하고 오래가는 연결입니다.",
    soft:        "감정의 구조적 지지가 관계를 안정시킵니다.",
    hard:        "감정의 자유와 구조적 제약 사이의 긴장이 있습니다.",
  },
  [pk("Mercury","Mercury")]: {
    conjunction: "같은 언어로 세상을 이해합니다. 대화가 즉각적으로 통합니다.",
    soft:        "사고 방식이 잘 맞습니다. 대화가 편안하게 흐릅니다.",
    hard:        "사고 속도와 방식의 차이로 오해가 발생하기 쉽습니다. 상대의 리듬에 맞추는 것이 필요합니다.",
  },
  [pk("Mars","Moon")]: {
    conjunction: "화성이 달의 감정을 강렬하게 활성화합니다. 역동적인 연결입니다.",
    soft:        "행동력이 감정을 자연스럽게 움직입니다. 관계에 활력이 있습니다.",
    hard:        "화성의 충동이 달의 감정에 마찰을 만듭니다. 말과 행동의 온도를 조절하세요.",
  },
  [pk("Moon","Mars")]: {
    conjunction: "화성이 달의 감정을 강렬하게 활성화합니다. 역동적인 연결입니다.",
    soft:        "행동력이 감정을 자연스럽게 움직입니다. 관계에 활력이 있습니다.",
    hard:        "화성의 충동이 달의 감정에 마찰을 만듭니다. 말과 행동의 온도를 조절하세요.",
  },
  [pk("Jupiter","Venus")]: {
    conjunction: "기쁨과 풍요의 에너지가 결합됩니다. 함께 있을 때 세상이 더 넓어집니다.",
    soft:        "관계에서 성장과 기쁨이 자연스럽게 흐릅니다. 서로에게 행운입니다.",
    hard:        "과잉과 방종에 주의가 필요합니다. 경계 설정이 도움이 됩니다.",
  },
  [pk("Venus","Jupiter")]: {
    conjunction: "기쁨과 풍요의 에너지가 결합됩니다. 함께 있을 때 세상이 더 넓어집니다.",
    soft:        "관계에서 성장과 기쁨이 자연스럽게 흐릅니다. 서로에게 행운입니다.",
    hard:        "과잉과 방종에 주의가 필요합니다. 경계 설정이 도움이 됩니다.",
  },
  [pk("Jupiter","Sun")]: {
    conjunction: "목성이 상대방의 자아 에너지를 확장합니다. 서로에게 영감을 줍니다.",
    soft:        "상대방이 자신감과 가능성을 확장하도록 돕습니다.",
    hard:        "과신과 과도한 확장에 주의가 필요합니다.",
  },
  [pk("Sun","Jupiter")]: {
    conjunction: "목성이 상대방의 자아 에너지를 확장합니다. 서로에게 영감을 줍니다.",
    soft:        "상대방이 자신감과 가능성을 확장하도록 돕습니다.",
    hard:        "과신과 과도한 확장에 주의가 필요합니다.",
  },
  [pk("Jupiter","Moon")]: {
    conjunction: "목성이 감정 에너지를 확장합니다. 정서적으로 풍요로운 연결입니다.",
    soft:        "목성이 달의 감정을 따뜻하게 지지합니다. 정서적 여유가 생깁니다.",
    hard:        "감정의 과잉 표현에 주의가 필요합니다.",
  },
  [pk("Moon","Jupiter")]: {
    conjunction: "목성이 감정 에너지를 확장합니다. 정서적으로 풍요로운 연결입니다.",
    soft:        "목성이 달의 감정을 따뜻하게 지지합니다. 정서적 여유가 생깁니다.",
    hard:        "감정의 과잉 표현에 주의가 필요합니다.",
  },
};

function pairNote(a: PlanetName, b: PlanetName, aspect: string): string {
  const note = PAIR_NOTES[pk(a, b)]?.[aspectKind(aspect)];
  if (note) return note;
  const kind = aspectKind(aspect);
  if (kind === "soft") return "두 행성이 조화롭게 에너지를 교환합니다.";
  if (kind === "hard") return "두 행성 사이에 긴장과 마찰이 있습니다. 이 마찰이 성장의 원동력이 됩니다.";
  return "두 행성이 강하게 결합됩니다.";
}

const PLANET_KO: Record<PlanetName, string> = {
  Sun: "태양",
  Moon: "달",
  Mercury: "수성",
  Venus: "금성",
  Mars: "화성",
  Jupiter: "목성",
  Saturn: "토성",
  Uranus: "천왕성",
  Neptune: "해왕성",
  Pluto: "명왕성",
};

const ASPECT_KO: Record<string, string> = {
  conjunction: "합",
  sextile: "육분",
  square: "긴장",
  trine: "조화",
  opposition: "대립",
};

function aspectSummary(aspect: CrossAspect | null): string | null {
  if (!aspect) {
    return null;
  }

  const planetA = PLANET_KO[aspect.planetA] ?? aspect.planetA;
  const planetB = PLANET_KO[aspect.planetB] ?? aspect.planetB;
  const aspectKo = ASPECT_KO[aspect.aspect] ?? aspect.aspect;
  return `${planetA}와 ${planetB}의 ${aspectKo}`;
}

function aspectDetailSentence(aspect: CrossAspect | null): string {
  if (!aspect) {
    return "지금 보이는 흐름은 한두 개의 포인트보다 전체적인 패턴의 평균에서 나온 결과입니다.";
  }

  const summary = aspectSummary(aspect);
  const orb = aspect.orb.toFixed(1);
  return `특히 ${summary}이 핵심 축으로 작동하고 있고, 오차가 ${orb}°로 비교적 가까워 실제 관계 체감에도 영향을 크게 줄 가능성이 높습니다. ${aspect.note}`;
}

function categoryAdvice(key: CategoryKey, score: number, topAspect: CrossAspect | null): string {
  const tone = topAspect?.tone ?? "neutral";

  if (key === "resonance") {
    if (score >= 65) {
      return tone === "harmony"
        ? "서로를 억지로 맞추기보다 자연스럽게 반응하는 방식을 믿어도 되는 조합입니다. 가까워질수록 편안함과 끌림이 함께 커질 가능성이 큽니다."
        : "끌림은 분명하지만 그만큼 예민함도 함께 살아나는 조합입니다. 감정이 올라오는 순간의 말투와 속도를 조절하면 관계의 장점이 훨씬 또렷해집니다.";
    }

    if (score >= 38) {
      return "첫인상보다 시간이 지나며 결이 맞아가는 타입에 가깝습니다. 서로가 편한 애정 표현과 거리감을 빨리 파악할수록 관계의 온도가 안정됩니다.";
    }

    return "자연발생적인 끌림보다 이해와 선택이 중요한 관계입니다. 그래서 더 느리지만, 반대로 어떤 방식이 통하는지 찾으면 관계의 규칙이 분명해질 수 있습니다.";
  }

  if (key === "communication") {
    if (score >= 65) {
      return "대화가 관계를 살리는 축입니다. 일상적인 대화량이 많을수록 오해가 줄고, 생각을 설명하는 과정 자체가 친밀감을 키우는 방식으로 작동할 가능성이 큽니다.";
    }

    if (score >= 38) {
      return "기본적인 대화는 이어지지만, 감정이 실린 주제나 속도감 있는 상황에서는 해석 차이가 생길 수 있습니다. 결론만 말하기보다 맥락을 먼저 공유하면 훨씬 부드러워집니다.";
    }

    return "말의 의도와 받아들이는 방식이 다를 수 있는 구조입니다. 그래서 짧은 반응보다 확인 질문, 요약, 재진술 같은 방식이 관계 유지에 실제로 도움이 됩니다.";
  }

  if (key === "tension") {
    if (score >= 65) {
      return "긴장이 높다는 건 나쁘다는 뜻보다, 서로를 가만히 두지 않는다는 뜻에 가깝습니다. 이 관계는 감정이 격해질 때 멈추는 규칙을 미리 정해두면 훨씬 건강하게 오래 갈 수 있습니다.";
    }

    if (score >= 38) {
      return "결정적인 파열보다는 잔잔한 마찰이 반복될 가능성이 있습니다. 작은 불편을 넘기지 않고 초기에 말하는 습관이 쌓이면 오히려 관계의 안정감이 커집니다.";
    }

    return "전반적으로 큰 충돌보다 흐름이 부드러운 편입니다. 다만 갈등이 적은 만큼 중요한 문제를 미루는 방식으로 가면 답답함이 누적될 수 있으니, 필요한 순간에는 분명하게 말하는 편이 좋습니다.";
  }

  if (score >= 65) {
    return "둘이 함께 있을 때 각자의 가능성이 확장되는 패턴이 분명합니다. 단기 감정보다 장기 방향을 함께 이야기할수록 이 관계의 가치가 더 크게 드러날 수 있습니다.";
  }

  if (score >= 38) {
    return "성장 에너지는 있지만 자동으로 커지는 관계라기보다는, 함께 방향을 만들 때 힘이 붙는 관계에 가깝습니다. 공동 목표나 같이 배우는 경험이 중요하게 작동할 수 있습니다.";
  }

  return "이 관계가 성장으로 이어지려면 의도적인 합의가 먼저 필요합니다. 그냥 흘러가는 관계로 두기보다, 무엇을 함께 만들고 싶은지 분명히 할수록 의미가 생깁니다.";
}

function buildCategoryBody(
  baseBody: string,
  key: CategoryKey,
  score: number,
  topAspect: CrossAspect | null,
): string {
  return `${baseBody} ${aspectDetailSentence(topAspect)} ${categoryAdvice(key, score, topAspect)}`;
}

// ── Planets included in synastry ──────────────────────────────────────────────

const SYNASTRY_PLANETS: PlanetName[] = [
  "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn",
];

// ── Cross-aspect computation ──────────────────────────────────────────────────

function computeCrossAspects(chartA: NatalChart, chartB: NatalChart): CrossAspect[] {
  const byNameA = new Map(chartA.planets.map((p) => [p.planet, p]));
  const byNameB = new Map(chartB.planets.map((p) => [p.planet, p]));

  const aspects: CrossAspect[] = [];

  for (const planetA of SYNASTRY_PLANETS) {
    const pA = byNameA.get(planetA);
    if (!pA) continue;

    for (const planetB of SYNASTRY_PLANETS) {
      const pB = byNameB.get(planetB);
      if (!pB) continue;

      const asp = findAspect(pA.longitude, pB.longitude);
      if (!asp) continue;

      aspects.push({
        planetA,
        planetB,
        aspect: asp.name,
        orb: asp.orb,
        tone: aspectTone(planetA, planetB, asp.name),
        significance: significance(planetA, planetB),
        note: pairNote(planetA, planetB, asp.name),
      });
    }
  }

  // Sort by significance × tightness descending
  aspects.sort((a, b) => {
    const sA = a.significance * Math.max(0, 1 - a.orb / 10);
    const sB = b.significance * Math.max(0, 1 - b.orb / 10);
    return sB - sA;
  });

  return aspects;
}

// ── Category scoring ──────────────────────────────────────────────────────────

function scoreCategoryPositive(
  aspects: CrossAspect[],
  category: CategoryKey,
): { score: number; topAspect: CrossAspect | null } {
  const relevant = aspects.filter((a) =>
    pairCategories(a.planetA, a.planetB).includes(category)
  );
  if (!relevant.length) return { score: 50, topAspect: null };

  let delta = 0;
  let topAspect: CrossAspect | null = null;
  let topImpact = 0;

  for (const a of relevant) {
    const orbFactor = Math.max(0, 1 - a.orb / 10);
    const w = a.significance * orbFactor;
    const contribution =
      a.tone === "harmony" ? w :
      a.tone === "tension" ? -w * 0.3 :
      w * 0.1;
    delta += contribution;
    if (Math.abs(contribution) > topImpact) {
      topImpact = Math.abs(contribution);
      topAspect = a;
    }
  }

  // Scale: ~200 delta → ±24 points
  const score = Math.max(0, Math.min(100, Math.round(50 + delta * 0.12)));
  return { score, topAspect };
}

function scoreCategoryTension(
  aspects: CrossAspect[],
): { score: number; topAspect: CrossAspect | null } {
  const relevant = aspects.filter((a) =>
    pairCategories(a.planetA, a.planetB).includes("tension")
  );
  if (!relevant.length) return { score: 20, topAspect: null };

  let delta = 0;
  let topAspect: CrossAspect | null = null;
  let topW = 0;

  for (const a of relevant) {
    const orbFactor = Math.max(0, 1 - a.orb / 10);
    const w = a.significance * orbFactor;
    if (a.tone === "tension") {
      delta += w;
      if (w > topW) { topW = w; topAspect = a; }
    } else if (a.tone === "harmony") {
      delta -= w * 0.15;
    }
  }

  const score = Math.max(0, Math.min(100, Math.round(20 + delta * 0.15)));
  return { score, topAspect };
}

// ── Category text ─────────────────────────────────────────────────────────────

type TextLevel = "high" | "medium" | "low";

function level(score: number): TextLevel {
  if (score >= 65) return "high";
  if (score >= 38) return "medium";
  return "low";
}

const RESONANCE_TEXT: Record<TextLevel, { headline: string; body: string }> = {
  high: {
    headline: "두 에너지가 강하게 공명합니다",
    body:     "출생 차트 사이에 강한 에너지 끌림이 있습니다. 금성과 화성, 태양과 달의 조화가 이 관계에 자연스러운 친밀감과 매력을 만들어냅니다. 서로에게 편안하게 다가갈 수 있는 조건이 갖춰져 있습니다.",
  },
  medium: {
    headline: "에너지가 조화를 찾아가는 중입니다",
    body:     "두 차트 사이에 공명의 씨앗이 있습니다. 서로의 에너지 방식에 익숙해질수록 관계의 자연스러움이 깊어질 수 있습니다.",
  },
  low: {
    headline: "공명보다 이해가 먼저입니다",
    body:     "두 차트의 에너지 방식이 뚜렷하게 다릅니다. 자연스러운 끌림보다는 의식적인 이해와 노력을 통해 연결이 형성됩니다.",
  },
};

const COMMUNICATION_TEXT: Record<TextLevel, { headline: string; body: string }> = {
  high: {
    headline: "대화가 자연스럽게 흐릅니다",
    body:     "수성과 태양의 연결이 강합니다. 두 사람은 비슷한 방식으로 세상을 이해하고 표현합니다. 대화가 에너지 소모 없이 흐를 수 있는 조건입니다.",
  },
  medium: {
    headline: "소통에 조율이 필요한 부분이 있습니다",
    body:     "대화의 리듬이 어느 정도 맞지만, 특정 주제나 방식에서 조율이 필요할 수 있습니다. 서로의 소통 스타일을 이해하는 것이 핵심입니다.",
  },
  low: {
    headline: "소통 방식에 차이가 있습니다",
    body:     "사고 방식과 표현 스타일에 차이가 있습니다. 이 차이는 오해의 원인이 될 수 있지만, 서로 다른 관점에서 배울 수 있는 기회이기도 합니다.",
  },
};

const TENSION_TEXT: Record<TextLevel, { headline: string; body: string }> = {
  high: {
    headline: "성장을 위한 마찰이 존재합니다",
    body:     "토성과 화성의 긴장이 관계 안에 도전 과제를 만듭니다. 이 마찰은 관계를 약하게 하는 것이 아니라, 두 사람이 서로에게서 성장하도록 밀어붙이는 에너지입니다.",
  },
  medium: {
    headline: "적당한 긴장이 관계를 단단하게 합니다",
    body:     "이 관계에는 건강한 수준의 마찰이 있습니다. 완전히 편안하지 않은 이 긴장이 오히려 서로를 발전시키는 원동력이 될 수 있습니다.",
  },
  low: {
    headline: "마찰이 적은 관계입니다",
    body:     "두 차트 사이에 구조적 긴장이 적습니다. 갈등보다는 흐름이 강한 관계입니다.",
  },
};

const GROWTH_TEXT: Record<TextLevel, { headline: string; body: string }> = {
  high: {
    headline: "함께 있을 때 더 큰 가능성이 열립니다",
    body:     "목성과 토성의 구조적 연결이 이 관계에 장기적 성장 에너지를 부여합니다. 두 사람은 서로의 가능성을 확장하는 역할을 합니다.",
  },
  medium: {
    headline: "성장의 에너지가 잠재되어 있습니다",
    body:     "이 관계에는 성장의 씨앗이 있습니다. 서로의 방향을 지지하고 공간을 줄 때 두 사람 모두 더 나아갈 수 있습니다.",
  },
  low: {
    headline: "방향의 합의가 먼저입니다",
    body:     "성장 에너지의 연결이 약합니다. 관계가 서로를 지지하는 방향으로 의식적인 설계가 필요합니다.",
  },
};

function categoryTone(
  score: number,
  key: CategoryKey,
): "strength" | "challenge" | "neutral" {
  if (key === "tension") {
    return score >= 65 ? "challenge" : score >= 38 ? "neutral" : "strength";
  }
  return score >= 65 ? "strength" : score >= 38 ? "neutral" : "challenge";
}

// ── Overall score ─────────────────────────────────────────────────────────────

function overallScore(
  resonance: number,
  communication: number,
  tension: number,
  growth: number,
): number {
  // Tension is inverted: high tension slightly reduces overall
  return Math.round(
    resonance * 0.35 +
    communication * 0.25 +
    growth * 0.25 +
    (100 - tension) * 0.15,
  );
}

// ── Synthesis text ────────────────────────────────────────────────────────────

function buildSynthesis(
  resonance: SynastryCategory,
  communication: SynastryCategory,
  tension: SynastryCategory,
  growth: SynastryCategory,
  overall: number,
): { synthesis: string; keyPhrase: string } {
  const cats = [resonance, communication, growth].sort((a, b) => b.score - a.score);
  const dominant = cats[0];
  const hasTension = tension.score >= 65;
  const dominantAspect = dominant.topAspect ? aspectSummary(dominant.topAspect) : null;
  const tensionAspect = tension.topAspect ? aspectSummary(tension.topAspect) : null;

  let synthesis: string;
  let keyPhrase: string;

  if (dominant.key === "resonance" && dominant.score >= 65) {
    if (hasTension) {
      synthesis = "두 차트 사이에 강한 에너지 공명이 있습니다. 끌림과 마찰이 공존하는 이 관계는, 서로를 밀어붙이며 성장하는 구조를 가지고 있습니다. 편안함과 자극을 동시에 경험할 수 있는 관계입니다.";
      keyPhrase = "끌림과 마찰이 공존하는 관계";
    } else {
      synthesis = "두 차트 사이에 자연스러운 에너지 흐름이 있습니다. 서로에게 편안함과 끌림을 동시에 줄 수 있는 조건이 갖춰져 있습니다. 관계의 에너지가 억지 없이 움직입니다.";
      keyPhrase = "자연스러운 에너지 공명의 관계";
    }
  } else if (dominant.key === "communication" && dominant.score >= 65) {
    synthesis = "이 관계의 핵심은 소통입니다. 두 사람은 같은 언어로 세상을 바라보는 경향이 있으며, 대화가 관계를 이끌어 나갑니다. 지적 연결이 감정적 친밀함보다 먼저 형성됩니다.";
    keyPhrase = "대화와 지적 공명으로 이어진 관계";
  } else if (dominant.key === "growth" && dominant.score >= 65) {
    synthesis = "장기적 성장 에너지가 강한 관계입니다. 함께 있을 때 두 사람 모두 더 넓어지는 경험을 합니다. 이 관계는 시간이 지날수록 더 깊어지는 구조를 가지고 있습니다.";
    keyPhrase = "함께 성장하는 관계";
  } else if (hasTension && resonance.score < 50) {
    synthesis = "두 차트 사이에는 상당한 긴장이 존재합니다. 이 긴장은 관계를 어렵게 만들 수 있지만, 동시에 서로를 성장시키는 원동력이 됩니다. 의식적인 노력과 이해가 관계를 유지하는 핵심입니다.";
    keyPhrase = "도전과 성장이 공존하는 관계";
  } else if (overall >= 60) {
    synthesis = "두 차트는 전반적으로 균형 잡힌 에너지를 가지고 있습니다. 특정 영역에서 강한 공명이 있으며, 서로의 차이를 이해하는 것이 관계를 더욱 단단하게 만듭니다.";
    keyPhrase = "균형 잡힌 에너지 구조의 관계";
  } else {
    synthesis = "두 차트는 서로 다른 에너지 방식을 가지고 있습니다. 차이를 이해하고 존중하는 것이 이 관계의 가장 중요한 과제입니다. 공통된 방향을 찾을 때 관계는 의미를 갖습니다.";
    keyPhrase = "이해와 조율이 필요한 관계";
  }

  if (dominantAspect) {
    synthesis += ` 현재 이 관계를 가장 강하게 설명하는 축은 ${dominantAspect}이며, 이 포인트가 두 사람 사이의 기본 온도와 반응 속도를 크게 결정합니다.`;
  }

  if (hasTension && tensionAspect) {
    synthesis += ` 동시에 ${tensionAspect}도 민감하게 살아 있어, 가까워질수록 편안함만이 아니라 조율의 필요도 함께 커질 수 있습니다.`;
  } else if (!hasTension) {
    synthesis += " 큰 충돌보다 흐름과 적응이 먼저 오는 구조라서, 시간을 들일수록 관계의 장점이 더 선명하게 보일 가능성이 큽니다.";
  }

  return { synthesis, keyPhrase };
}

// ── Main export ───────────────────────────────────────────────────────────────

export function computeSynastry(
  chartA: NatalChart,
  chartB: NatalChart,
  personBTimeKnown: boolean,
): SynastryAnalysis {
  const sunA  = chartA.planets.find((p) => p.planet === "Sun")!;
  const moonA = chartA.planets.find((p) => p.planet === "Moon")!;
  const sunB  = chartB.planets.find((p) => p.planet === "Sun")!;
  const moonB = chartB.planets.find((p) => p.planet === "Moon")!;

  const crossAspects = computeCrossAspects(chartA, chartB);

  const { score: rScore, topAspect: rTop } = scoreCategoryPositive(crossAspects, "resonance");
  const { score: cScore, topAspect: cTop } = scoreCategoryPositive(crossAspects, "communication");
  const { score: tScore, topAspect: tTop } = scoreCategoryTension(crossAspects);
  const { score: gScore, topAspect: gTop } = scoreCategoryPositive(crossAspects, "growth");

  const resonance: SynastryCategory = {
    key: "resonance", label: "관계",
    score: rScore,
    tone: categoryTone(rScore, "resonance"),
    headline: RESONANCE_TEXT[level(rScore)].headline,
    body: buildCategoryBody(RESONANCE_TEXT[level(rScore)].body, "resonance", rScore, rTop),
    topAspect: rTop,
  };
  const communication: SynastryCategory = {
    key: "communication", label: "대화",
    score: cScore,
    tone: categoryTone(cScore, "communication"),
    headline: COMMUNICATION_TEXT[level(cScore)].headline,
    body: buildCategoryBody(COMMUNICATION_TEXT[level(cScore)].body, "communication", cScore, cTop),
    topAspect: cTop,
  };
  const tension: SynastryCategory = {
    key: "tension", label: "긴장",
    score: tScore,
    tone: categoryTone(tScore, "tension"),
    headline: TENSION_TEXT[level(tScore)].headline,
    body: buildCategoryBody(TENSION_TEXT[level(tScore)].body, "tension", tScore, tTop),
    topAspect: tTop,
  };
  const growth: SynastryCategory = {
    key: "growth", label: "성장",
    score: gScore,
    tone: categoryTone(gScore, "growth"),
    headline: GROWTH_TEXT[level(gScore)].headline,
    body: buildCategoryBody(GROWTH_TEXT[level(gScore)].body, "growth", gScore, gTop),
    topAspect: gTop,
  };

  const overall = overallScore(rScore, cScore, tScore, gScore);
  const overallTone: "strength" | "challenge" | "neutral" =
    overall >= 65 ? "strength" : overall <= 38 ? "challenge" : "neutral";

  const { synthesis, keyPhrase } = buildSynthesis(resonance, communication, tension, growth, overall);

  return {
    personASign: {
      sun: sunA.sign,
      moon: moonA.sign,
      asc: chartA.ascendant.sign,
    },
    personBSign: {
      sun: sunB.sign,
      moon: moonB.sign,
      asc: personBTimeKnown ? chartB.ascendant.sign : null,
    },
    personBTimeKnown,
    crossAspects,
    overallScore: overall,
    overallTone,
    resonance,
    communication,
    tension,
    growth,
    synthesis,
    keyPhrase,
    generatedAt: new Date().toISOString(),
  };
}
