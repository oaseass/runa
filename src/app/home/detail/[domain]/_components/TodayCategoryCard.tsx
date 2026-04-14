"use client";

// Co–Star-style "Today category card" for /home/detail/love|friends|work|family.
//
// Layout per domain:
//   HERO  — date · headline (Korean, domain+tone editorial) · kicker line · planet obj
//   SEC A — domain section label A + body paragraph
//   SEC B — domain section label B + bullets or secondary text
//   SEC C — domain section label C + 2–4 domain-filtered evidence rows
//   Friends link + feedback

import { useState } from "react";
import Link from "next/link";
import { PLANET_CUTOUT } from "./TodaySpaceScene";
import type {
  TransitInterpretation,
  DomainReading,
  DomainDetail,
  ActiveTransitAspect,
} from "@/lib/astrology/types";

// ── Static maps ───────────────────────────────────────────────────────────

const PLANET_KO: Record<string, string> = {
  Sun:"태양", Moon:"달", Mercury:"수성", Venus:"금성",
  Mars:"화성", Jupiter:"목성", Saturn:"토성", Uranus:"천왕성",
  Neptune:"해왕성", Pluto:"명왕성",
};

const ASPECT_VERB: Record<string, string> = {
  conjunction: "합", sextile: "육분각", square: "긴장각", trine: "조화각", opposition: "대립각",
};

function orbToTiming(planet: string, orb: number): string {
  const o = Math.abs(orb ?? 3);
  if (planet === "Moon") {
    if (o < 1) return "오늘 밤까지";
    if (o < 2) return "내일까지";
    return "이틀 정도 이어집니다";
  }
  if (planet === "Mercury" || planet === "Venus") {
    if (o < 2) return "이번 주 중반까지";
    if (o < 4) return "이번 주까지";
    return "이번 달 안에 여운이 남습니다";
  }
  if (planet === "Sun") {
    if (o < 2) return "며칠 더 이어집니다";
    return "이번 달까지";
  }
  if (planet === "Mars") {
    if (o < 3) return "이번 시즌 동안 이어집니다";
    return "몇 주에 걸쳐 이어집니다";
  }
  if (planet === "Jupiter") return "올해 안에 영향이 드러납니다";
  if (planet === "Saturn")  return "올해까지 이어집니다";
  return "장기적 영향";
}

const TODAY_CARD_REPLACEMENTS: Array<[string, string]> = [
  ["관계 흐름", "관계의 결"],
  ["감정 거리", "감정의 선"],
  ["관계 에너지", "관계의 온도"],
  ["감정 흐름", "감정의 움직임"],
  ["흐름 확장", "관계의 가능성"],
  ["사회적 에너지", "사회적 기운"],
  ["의지 에너지", "의지의 방향"],
  ["오늘의 주요 흐름", "오늘 가장 크게 들어오는 신호"],
  ["관계의 흐름이 열립니다", "관계가 열리는 날입니다"],
  ["목성이 사랑의 에너지를 넓혀줍니다", "목성이 관계의 가능성을 키웁니다"],
  ["목성의 흐름이 관계에 행운과 확장의 에너지를 더합니다", "목성이 관계에 행운과 가능성을 보탭니다"],
  ["5하우스 에너지 상승으로 끌림이 표면으로 드러납니다", "5영역이 강조되며 끌림이 눈에 띄기 시작합니다"],
  ["3하우스 에너지 상승으로 소통이 자연스럽게 열립니다", "3영역이 강조되며 말문이 자연스럽게 열립니다"],
  ["6하우스 에너지 상승으로 실행 리듬이 강해집니다", "6영역이 강조되며 실행 리듬이 또렷해집니다"],
  ["10하우스 강조로 집중력과 성취 에너지가 높아집니다", "10영역이 강조되며 집중력과 성취 욕구가 또렷해집니다"],
  ["4하우스 에너지 상승으로 가족 유대가 활성화됩니다", "4영역이 강조되며 가족과의 유대가 살아납니다"],
  ["8하우스 자극으로 감정 경계가 민감해집니다", "8영역이 건드려지면서 감정의 경계가 예민해집니다"],
  ["지금 흐르는 에너지는 연결을 향해 열려 있습니다.", "지금은 관계 쪽으로 마음이 열리는 날입니다."],
  ["그 에너지를 충동으로 쓰기보다 방향으로 삼아보세요.", "그 마음을 충동으로 쓰기보다 방향으로 삼아보세요."],
  ["감정을 정렬하기 좋은 날입니다.", "감정을 가다듬기 좋은 날입니다."],
  ["자연스러운 흐름을 따르세요.", "억지로 밀지 말고 자연스럽게 따라가세요."],
  ["에너지를 하나에 집중하면 결과가 납니다", "한곳에 힘을 모으면 결과가 납니다"],
  ["이 에너지를 천천히 다루는 것이 유리합니다", "이 감정을 천천히 다루는 편이 유리합니다"],
  ["편안함과 피로가 동시에 작동할 수 있습니다", "편안함과 피로가 함께 올라올 수 있습니다"],
  ["조용히 작동 중입니다", "조용히 이어지고 있습니다"],
  ["작동 중입니다", "이어지고 있습니다"],
];

function polishTodayCardText(text: string): string {
  let next = text;
  for (const [from, to] of TODAY_CARD_REPLACEMENTS) {
    next = next.replaceAll(from, to);
  }
  return next;
}

// ── Domain-specific editorial configs ────────────────────────────────────

/** Section labels [primary-body, secondary-insight, evidence-eyebrow] per domain */
const DOMAIN_SECTIONS: Record<string, [string, string, string]> = {
  love:    ["관계 흐름",     "감정 거리",    "끌림과 경계"],
  friends: ["말의 온도",     "오해 가능성",  "거리 조절"],
  work:    ["집중 축",       "우선순위",     "실행 리듬"],
  family:  ["익숙함의 영향", "정서 반응",    "경계와 돌봄"],
};

/** Korean headline fallback — never show English statusLabel */
const DOMAIN_HEADLINE_FALLBACK: Record<string, Record<string, string>> = {
  love:    { strength: "끌림이 관계를 앞으로 밀어줍니다", challenge: "애매함이 오래 버티지 못하는 날", neutral: "관계의 온도가 미세하게 바뀝니다" },
  friends: { strength: "소통이 자연스럽게 흐릅니다",    challenge: "말보다 분위기가 먼저 엇갈립니다",  neutral: "연결에 조용한 조정이 있습니다" },
  work:    { strength: "방향이 선명한 날",              challenge: "집중이 흩어지기 쉬운 날",          neutral: "흐름을 점검하기 좋은 날" },
  family:  { strength: "익숙한 연결이 따뜻해집니다",    challenge: "익숙한 감정이 다시 올라오는 날",   neutral: "정서 리듬에 변화가 있습니다" },
};

/** Sub-headline kicker — editorial one-liner; variants selected deterministically */
const KICKER_POOL: Record<string, Record<string, string[]>> = {
  love: {
    strength: [
      "끌림이 또렷해집니다. 마음보다 몸이 먼저 압니다",
      "연결이 깊어질 타이밍입니다. 가만히 있으면 지나갑니다",
      "감정이 방향을 줍니다. 오늘은 미묘한 신호도 크게 읽힙니다",
    ],
    challenge: [
      "좋아하는 마음만으로는 부족합니다. 경계가 필요합니다",
      "감정보다 선을 먼저 세워야 덜 흔들립니다",
      "이 에너지는 뜨겁지만, 방향 없이 쓰면 바로 꼬입니다",
    ],
    neutral: [
      "관계가 조용히 움직입니다. 작은 신호를 놓치지 마세요",
      "지금 원하는 연결의 방식이 드러나는 날",
      "잔잔해 보여도 관계의 온도는 이미 달라지고 있습니다",
    ],
  },
  friends: {
    strength: [
      "소통이 자연스럽게 통하는 날",
      "말이 잘 전달되고 연결이 쉬워집니다",
      "표현할수록 관계가 더 가까워집니다",
    ],
    challenge: [
      "의도보다 전달 방식이 관계를 좌우합니다",
      "말보다 듣는 쪽에 집중하는 날",
      "분위기가 먼저 메시지를 전달합니다",
    ],
    neutral: [
      "연결에 작은 조정이 필요할 수 있습니다",
      "거리를 유지하는 것도 소통입니다",
      "지금의 관계 패턴을 관찰하는 날",
    ],
  },
  work: {
    strength: [
      "방향이 선명할 때 움직이세요",
      "집중이 성과를 만드는 날",
      "에너지를 하나에 집중하면 결과가 납니다",
    ],
    challenge: [
      "지금은 많이 하는 것보다 순서를 세우는 편이 유리합니다",
      "속도보다 방향이 오늘의 키워드",
      "완성보다 진행 방향을 먼저 명확히 하세요",
    ],
    neutral: [
      "흐름을 따라가며 유연하게 대응하세요",
      "오늘은 계획을 점검하기 좋은 날",
      "작업 리듬을 재설정하는 기회",
    ],
  },
  family: {
    strength: [
      "익숙한 연결이 따뜻하게 활성화됩니다",
      "가족과의 유대가 자연스럽게 깊어집니다",
      "돌봄의 에너지가 흐르는 날",
    ],
    challenge: [
      "편안함과 피로가 동시에 작동할 수 있습니다",
      "오래된 감정 패턴이 다시 올라올 수 있습니다",
      "경계를 유지하면서도 연결을 놓지 않는 날",
    ],
    neutral: [
      "가족과의 리듬을 점검하는 날",
      "편안함과 독립 사이의 균형을 찾는 날",
      "정서적 거리와 연결을 동시에 조율하세요",
    ],
  },
};

/** Secondary insight text — domain-specific reinterpretation of the same root signal */
const SECONDARY_POOL: Record<string, Record<string, string[]>> = {
  love: {
    strength: [
      "지금 흐름은 연결 쪽으로 열려 있습니다. 기다리는 사람보다 신호를 보내는 사람이 관계의 온도를 잡습니다.",
      "끌림이 선명한 날입니다. 좋아하는 척 숨길수록 더 티가 납니다. 속도는 조절하되 태도는 분명히 하세요.",
      "오늘의 관계 에너지는 살아 있습니다. 호감을 소비하지 말고 어디까지 열 것인지 스스로 정하는 편이 낫습니다.",
    ],
    challenge: [
      "감정이 먼저 튀는 날입니다. 서운함을 사실처럼 믿기 전에, 내 안에서 커진 부분이 무엇인지 구분하세요.",
      "매력적인 장면이 생겨도 경계가 흐려지기 쉽습니다. 좋아하는 마음과 허용 가능한 선은 분리해서 봐야 합니다.",
      "관계의 긴장이 올라오면 상대를 읽기 전에 내 기대치를 먼저 점검하세요. 애매함을 참는 방식은 오늘 잘 통하지 않습니다.",
    ],
    neutral: [
      "큰 사건은 없어도 관계의 온도는 변하고 있습니다. 조용한 신호를 읽는 쪽이 유리합니다.",
      "지금은 밀어붙이기보다 내가 원하는 연결의 형태를 선명하게 보는 시간입니다.",
      "관계가 숨을 고르는 구간입니다. 억지로 답을 만들기보다 진짜 원하는 리듬을 확인하세요.",
    ],
  },
  friends: {
    strength: [
      "말이 잘 통하고 연결이 가벼운 날입니다. 오래 연락 못 한 사람에게 먼저 닿아보기 좋은 타이밍입니다.",
      "소통 에너지가 열려 있어 새로운 사람과의 연결도 수월합니다. 하고 싶은 말이 있다면 오늘 꺼내는 편이 좋습니다.",
      "대화가 자연스럽게 흐르는 날입니다. 평소보다 솔직하게 표현해도 잘 받아들여질 가능성이 높습니다.",
    ],
    challenge: [
      "말 한마디가 의도와 다르게 전달될 수 있는 날입니다. 텍스트보다 직접 대화가, 빠른 답장보다 조금 기다리는 편이 유리합니다.",
      "친구나 지인과의 상호작용에서 엇갈림이 생기더라도 감정적으로 대응하지 않는 것이 중요합니다. 오해는 잠시 뒤 자연스럽게 풀릴 가능성이 있습니다.",
      "분위기가 먼저 관계를 읽습니다. 오늘은 말의 내용보다 톤과 방식이 더 많은 것을 전달합니다.",
    ],
    neutral: [
      "친구와의 관계에서 큰 사건은 없지만, 연결의 온도를 느끼는 날입니다. 조용한 연락 하나가 오늘은 충분합니다.",
      "사회적 에너지가 안정적인 날입니다. 무리하게 연결을 늘리기보다 기존 관계를 가볍게 유지하는 편이 편안합니다.",
      "지금 관계에서 무언가를 해결하려 하기보다, 그냥 있는 그대로 두는 것도 하나의 방법입니다.",
    ],
  },
  work: {
    strength: [
      "집중력이 높고 방향이 선명한 날입니다. 미뤄왔던 작업을 진전시키기 좋은 타이밍입니다.",
      "업무 에너지가 안정적으로 흐르는 날입니다. 우선순위가 잡혀 있다면 오늘 내에 결과를 낼 수 있습니다.",
      "오늘은 추진력이 있는 날입니다. 결정이 필요한 일이 있다면 너무 오래 재지 않는 편이 좋습니다.",
    ],
    challenge: [
      "집중이 흩어지기 쉬운 날입니다. 처음부터 많은 것을 잡으려 하기보다 '오늘 하나만'이라는 기준으로 움직이는 편이 효율적입니다.",
      "업무 흐름이 계획대로 되지 않더라도 조급해하지 않는 것이 중요합니다. 지금은 방향을 재조정하기 좋은 순간입니다.",
      "마찰이 생기는 날일 수 있습니다. 해결보다 관찰이 먼저입니다. 문제를 분명히 보는 것만으로도 충분한 진전입니다.",
    ],
    neutral: [
      "업무 에너지가 안정적인 날입니다. 큰 성과보다는 루틴을 점검하고 흐름을 유지하는 날로 보는 편이 맞습니다.",
      "오늘은 새로운 것을 밀어붙이기보다 기존에 진행 중인 것을 마무리하는 방향이 더 자연스럽습니다.",
      "지금 처리하지 않아도 되는 것은 내려놓으세요. 집중해야 할 것만 남기는 날입니다.",
    ],
  },
  family: {
    strength: [
      "가족이나 가까운 사람과의 연결이 따뜻하게 활성화되는 날입니다. 작은 돌봄의 표현이 큰 의미를 가질 수 있습니다.",
      "가족 간의 유대가 자연스럽게 깊어지는 흐름입니다. 오래된 불편함보다는 지금 이 순간의 연결에 집중하는 편이 좋습니다.",
      "가까운 사람에게 작은 관심을 표현하기 좋은 날입니다. 그 에너지가 상대에게 진심으로 전달됩니다.",
    ],
    challenge: [
      "가족과의 상호작용에서 오래된 패턴이 다시 올라올 수 있습니다. 반응보다 잠시 거리를 두는 것이 더 건강한 선택일 수 있습니다.",
      "익숙한 감정이 다시 표면으로 올라오는 날입니다. 그것이 지금 상황 때문인지, 오래된 기억 때문인지 구분해보는 것이 도움이 됩니다.",
      "가족과의 경계선이 흐릿해지기 쉬운 날입니다. 돌봄과 자기 보호를 동시에 의식하는 것이 중요합니다.",
    ],
    neutral: [
      "가족 관계에서 특별한 변화는 없지만, 정서적 연결을 확인하기 좋은 날입니다.",
      "친숙한 것들이 마음을 안정시켜주는 날입니다. 가까운 사람과의 소소한 시간이 오늘의 충전이 됩니다.",
      "가족 사이의 분위기를 억지로 바꾸기보다 자연스럽게 두는 편이 나은 날입니다.",
    ],
  },
};

/** Domain-preferred transit planets for evidence ordering */
const DOMAIN_PLANET_PRIO: Record<string, string[]> = {
  love:    ["Venus", "Moon", "Mars", "Neptune", "Sun", "Jupiter"],
  friends: ["Mercury", "Moon", "Uranus", "Jupiter", "Venus", "Sun"],
  work:    ["Saturn", "Mercury", "Sun", "Mars", "Jupiter", "Moon"],
  family:  ["Moon", "Saturn", "Venus", "Neptune", "Sun", "Pluto"],
};

// ── Aspect tone + domain sentence tables ─────────────────────────────────

const MALEFIC = new Set(["Saturn", "Mars", "Pluto", "Uranus"]);

function aspectTone(aspect: string, transitPlanet: string): "harmony" | "tension" | "neutral" {
  if (aspect === "trine" || aspect === "sextile") return "harmony";
  if (aspect === "square" || aspect === "opposition") return "tension";
  if (aspect === "conjunction") return MALEFIC.has(transitPlanet) ? "tension" : "harmony";
  return "neutral";
}

/**
 * Domain × transitPlanet × tone → 3-variant natural Korean sentence pool.
 * Picked deterministically via pickVariant to avoid random flicker.
 */
const DOMAIN_TRANSIT_SENTENCES: Record<
  string,
  Partial<Record<string, Record<"harmony" | "tension" | "neutral", [string, string, string]>>>
> = {
  love: {
    Moon:    {
      harmony: ["달의 감정 에너지가 관계를 부드럽게 열어줍니다", "달이 움직여 감정적 연결이 자연스러워집니다", "달의 흐름이 관계의 온도를 높입니다"],
      tension: ["달과의 긴장으로 감정 반응이 빨라지고 예민해집니다", "달이 관계 표면에 감정 파동을 일으킵니다", "달의 자극으로 감정 경계가 민감해집니다"],
      neutral: ["달의 조용한 흐름이 관계에 영향을 줍니다", "달이 감정의 방향을 조용히 가리킵니다", "달의 흐름이 관계 에너지와 섞입니다"],
    },
    Venus:   {
      harmony: ["금성이 활성화돼 끌림과 연결 에너지가 강해집니다", "금성의 흐름이 관계를 부드럽고 매력적으로 만듭니다", "금성이 열려 있어 감정 표현이 쉬워집니다"],
      tension: ["금성의 긴장이 관계 기대치와 현실 사이 간극을 만듭니다", "금성의 마찰로 관계 욕구가 충돌합니다", "금성의 압력이 감정 욕구를 자극합니다"],
      neutral: ["금성이 관계 에너지에 조용히 작동 중입니다", "금성의 흐름이 끌림의 방향을 조율하고 있습니다", "금성이 관계 온도에 영향을 줍니다"],
    },
    Mars:    {
      harmony: ["화성의 에너지가 관계에 열정과 추진력을 더합니다", "화성이 활성화돼 관계에서 행동 욕구가 강해집니다", "화성이 끌림의 강도를 높입니다"],
      tension: ["화성의 긴장으로 관계에서 충동과 경계 조율이 필요합니다", "화성이 관계에 마찰을 만들어 속도 조절이 중요합니다", "화성의 압력이 관계의 긴장을 높입니다"],
      neutral: ["화성이 관계에 에너지를 더하고 있습니다", "화성의 흐름이 끌림의 방향에 영향을 줍니다", "화성이 관계에 조용히 작동합니다"],
    },
    Neptune: {
      harmony: ["해왕성이 관계에 이상과 낭만의 감각을 더합니다", "해왕성의 흐름이 감정적 연결을 깊고 몽환적으로 만듭니다", "해왕성이 열려 관계에서 직관이 강해집니다"],
      tension: ["해왕성의 안개가 관계 현실과 이상 사이 혼란을 만듭니다", "해왕성의 마찰로 상대를 이상화하거나 오해하기 쉽습니다", "해왕성이 관계의 경계를 흐릿하게 만듭니다"],
      neutral: ["해왕성이 관계에 감성적 층위를 더합니다", "해왕성의 조용한 흐름이 관계에 스며들고 있습니다", "해왕성이 이상적 면모를 자극합니다"],
    },
    Saturn:  {
      harmony: ["토성이 관계에 안정과 진지함을 더합니다", "토성의 흐름이 관계 구조를 단단하게 만듭니다", "토성이 관계에 현실적 신뢰를 쌓아줍니다"],
      tension: ["토성의 긴장이 관계에 무게와 책임감을 올려놓습니다", "토성의 압력으로 관계의 현실을 직면하게 됩니다", "토성이 관계에서 경계와 구조를 시험합니다"],
      neutral: ["토성이 관계 에너지에 구조적으로 작동 중입니다", "토성의 흐름이 관계의 방향을 안정시킵니다", "토성이 관계 연결에 영향을 줍니다"],
    },
    Jupiter: {
      harmony: ["목성의 흐름이 관계에 행운과 확장의 에너지를 더합니다", "목성이 활성화돼 관계에서 가능성이 열립니다", "목성이 사랑의 에너지를 넓혀줍니다"],
      tension: ["목성의 과잉이 관계 기대를 높여 조율이 필요합니다", "목성의 팽창 압력이 관계에서 과도한 기대를 만듭니다", "목성의 긴장이 관계 에너지를 과부하시킵니다"],
      neutral: ["목성이 관계에 가능성의 감각을 더합니다", "목성의 흐름이 관계를 조용히 확장합니다", "목성이 관계에 유연한 에너지를 줍니다"],
    },
    Mercury: {
      harmony: ["수성이 활성화돼 관계에서 말과 소통이 자연스럽게 흐릅니다", "수성의 흐름이 감정 표현을 명확하게 도와줍니다", "수성이 관계에서 이해와 연결을 열어줍니다"],
      tension: ["수성의 긴장이 관계에서 말 한마디의 무게를 높입니다", "수성의 마찰로 감정 전달이 의도와 다르게 갈 수 있습니다", "수성의 압력이 관계에서 오해를 만들기 쉽습니다"],
      neutral: ["수성이 관계 소통에 영향을 주고 있습니다", "수성이 관계에서 언어의 방향을 조율합니다", "수성의 흐름이 관계에 소통 에너지를 더합니다"],
    },
    Sun:     {
      harmony: ["태양 에너지가 관계에서 자아 표현을 강화합니다", "태양이 활성화돼 관계에서 존재감이 높아집니다", "태양이 관계 에너지를 밝히고 있습니다"],
      tension: ["태양의 긴장이 관계에서 자아와 상대 방향이 충돌합니다", "태양의 압력이 관계에서 자기중심성을 시험합니다", "태양의 마찰이 관계에서 방향 충돌을 만듭니다"],
      neutral: ["태양이 관계 에너지에 조용히 흐르고 있습니다", "태양의 흐름이 관계에 인식의 밝음을 더합니다", "태양이 관계에서 자아의 방향을 가리킵니다"],
    },
  },
  friends: {
    Mercury: {
      harmony: ["수성이 강해져 말의 온도가 올라가고 소통이 자연스럽게 흐릅니다", "수성의 흐름이 대화와 연결을 쉽게 만듭니다", "수성이 활성화돼 표현이 선명해집니다"],
      tension: ["수성의 긴장으로 말의 뉘앙스가 다르게 전달될 수 있습니다", "수성의 마찰이 소통에 오해를 끌어들입니다", "수성의 압력으로 말의 무게가 달라집니다"],
      neutral: ["수성이 소통 에너지에 영향을 주고 있습니다", "수성의 흐름이 말의 방향을 조용히 조율합니다", "수성이 연결의 언어를 다듬고 있습니다"],
    },
    Moon:    {
      harmony: ["달의 흐름이 친구와의 감성적 공명을 강화합니다", "달이 활성화돼 친구 사이의 분위기가 따뜻해집니다", "달의 에너지가 사회적 연결을 부드럽게 만듭니다"],
      tension: ["달의 긴장으로 분위기가 먼저 엇갈릴 수 있습니다", "달의 파동이 친구 상호작용에 감정 기복을 만듭니다", "달의 자극으로 사회적 예민도가 높아집니다"],
      neutral: ["달이 친구 관계에 감정적 층위를 더합니다", "달의 조용한 흐름이 연결 에너지에 영향을 줍니다", "달이 친구 사이의 분위기를 조율하고 있습니다"],
    },
    Uranus:  {
      harmony: ["천왕성의 에너지가 예기치 않은 연결과 새로운 만남을 만듭니다", "천왕성이 소통에 자유롭고 신선한 흐름을 일으킵니다", "천왕성의 흐름이 관계에 예상치 못한 변화를 가져옵니다"],
      tension: ["천왕성의 자극이 친구 관계에서 예기치 않은 방향 전환을 만듭니다", "천왕성의 긴장이 소통 패턴에 돌발 변수를 넣습니다", "천왕성의 마찰이 관계 리듬을 흔듭니다"],
      neutral: ["천왕성이 소통에 자유로운 에너지를 더합니다", "천왕성의 흐름이 친구 관계에 새로운 방향을 제시합니다", "천왕성이 연결 패턴에 변화를 주고 있습니다"],
    },
    Jupiter: {
      harmony: ["목성이 사회적 에너지를 넓혀 친구와의 연결이 확장됩니다", "목성의 흐름이 친구 관계에 가능성과 유연함을 더합니다", "목성이 소통의 반경을 넓혀줍니다"],
      tension: ["목성의 과잉 에너지가 소셜 상호작용에 압박을 줍니다", "목성의 팽창이 친구 관계에 기대 과부하를 만듭니다", "목성의 긴장이 사회적 에너지를 흩트립니다"],
      neutral: ["목성이 친구 관계에 확장의 에너지를 더합니다", "목성의 흐름이 소통과 연결을 넓히고 있습니다", "목성이 친구 사이의 가능성 감각을 자극합니다"],
    },
    Saturn:  {
      harmony: ["토성이 소통에 신중함과 신뢰를 더합니다", "토성의 흐름이 친구 관계에 안정적 구조를 줍니다", "토성이 거리를 조율하며 관계를 단단하게 만듭니다"],
      tension: ["토성의 긴장이 친구 사이에 거리감을 만듭니다", "토성의 압력이 소통에 무게를 올려 표현을 어렵게 합니다", "토성의 마찰이 친구 관계에 책임 감각을 자극합니다"],
      neutral: ["토성이 친구 관계에 구조적 흐름을 더합니다", "토성의 흐름이 소통 패턴에 영향을 줍니다", "토성이 친구 관계의 경계를 조율하고 있습니다"],
    },
    Mars:    {
      harmony: ["화성의 에너지가 소통에 직접성과 추진력을 더합니다", "화성이 대화의 에너지를 강하게 만듭니다", "화성이 활성화돼 표현이 더 직접적으로 흐릅니다"],
      tension: ["화성의 긴장이 소통에 마찰과 날 선 반응을 만들 수 있습니다", "화성의 압력이 친구 관계에 충돌 가능성을 높입니다", "화성의 마찰이 말의 충동성을 자극합니다"],
      neutral: ["화성이 소통에 에너지를 더하고 있습니다", "화성의 흐름이 친구 관계에 행동 에너지를 줍니다", "화성이 표현 방식에 영향을 주고 있습니다"],
    },
    Venus:   {
      harmony: ["금성이 활성화돼 친구 사이의 따뜻함과 연결 감각이 강해집니다", "금성의 흐름이 소통에 부드러움을 더합니다", "금성이 사회적 연결을 쉽게 만듭니다"],
      tension: ["금성의 긴장이 친구 관계에서 기대와 현실 사이 간극을 만듭니다", "금성의 마찰이 사회적 관계에 미묘한 불균형을 만듭니다", "금성이 친구 관계의 온도를 시험합니다"],
      neutral: ["금성이 친구 관계에 따뜻한 에너지를 더합니다", "금성의 흐름이 연결 감각에 영향을 줍니다", "금성이 소통에 부드러운 층위를 더합니다"],
    },
    Sun:     {
      harmony: ["태양이 자기 표현을 강화해 친구 관계에서 존재감이 높아집니다", "태양의 에너지가 소통에 밝음을 더합니다", "태양이 활성화돼 사회적 에너지가 올라갑니다"],
      tension: ["태양의 긴장이 친구 관계에서 자아 주장과 경청 사이 균형을 요구합니다", "태양의 압력이 소통에서 자기중심성을 자극합니다", "태양의 마찰이 친구 관계에 에너지 충돌을 만듭니다"],
      neutral: ["태양이 소통 에너지에 조용히 흐릅니다", "태양의 흐름이 친구 관계에 인식을 더합니다", "태양이 자기 표현 방식에 영향을 줍니다"],
    },
  },
  work: {
    Saturn:  {
      harmony: ["토성이 업무 구조를 지지해 집중과 실행이 안정됩니다", "토성의 흐름이 일의 우선순위를 더 명확하게 만듭니다", "토성이 활성화돼 체계적 접근이 효과를 냅니다"],
      tension: ["토성의 긴장이 일의 우선순위를 더 엄격하게 만듭니다", "토성의 압력이 업무 구조에 저항과 마찰을 일으킵니다", "토성의 무게가 집중력에 부담을 줍니다"],
      neutral: ["토성이 업무 에너지에 구조적으로 작동 중입니다", "토성이 일의 흐름에 안정적 리듬을 더합니다", "토성이 업무 방향에 영향을 주고 있습니다"],
    },
    Mercury: {
      harmony: ["수성이 강해져 사고 방향이 선명해지고 결정이 쉬워집니다", "수성의 흐름이 업무 계획과 실행을 연결해줍니다", "수성이 활성화돼 업무 소통이 효율적으로 흐릅니다"],
      tension: ["수성의 긴장이 업무에서 판단과 결정을 복잡하게 만듭니다", "수성의 마찰이 집중력을 흩트릴 수 있습니다", "수성의 압력이 업무 소통에 주의를 요구합니다"],
      neutral: ["수성이 업무 사고에 영향을 주고 있습니다", "수성의 흐름이 업무 방향에 조용히 작동합니다", "수성이 업무 집중 에너지에 영향을 줍니다"],
    },
    Sun:     {
      harmony: ["태양 에너지가 업무에서 의지와 방향을 강화합니다", "태양이 활성화돼 집중력과 실행력이 높아집니다", "태양이 업무의 방향을 밝히고 있습니다"],
      tension: ["태양의 긴장이 업무에서 에너지 방향을 충돌시킵니다", "태양의 압력이 집중을 방해하는 요소를 만듭니다", "태양의 마찰이 업무 흐름에 조절을 요구합니다"],
      neutral: ["태양이 업무 에너지에 조용히 흐릅니다", "태양의 흐름이 의지 에너지를 지지합니다", "태양이 업무 방향에 인식의 빛을 더합니다"],
    },
    Mars:    {
      harmony: ["화성이 활성화돼 실행 리듬이 강하고 추진력이 생깁니다", "화성의 에너지가 업무 실행을 가속합니다", "화성이 행동 에너지를 강하게 지지합니다"],
      tension: ["화성의 긴장이 업무에서 조급함과 마찰을 만듭니다", "화성의 압력이 실행 속도를 지나치게 높입니다", "화성의 마찰이 업무에서 충돌 가능성을 높입니다"],
      neutral: ["화성이 업무 에너지에 활기를 더합니다", "화성의 흐름이 실행 리듬에 영향을 줍니다", "화성이 업무 추진력에 영향을 주고 있습니다"],
    },
    Jupiter: {
      harmony: ["목성이 확장의 에너지로 업무 가능성을 넓혀줍니다", "목성의 흐름이 업무에서 새로운 기회를 열어줍니다", "목성이 활성화돼 업무 에너지가 확장됩니다"],
      tension: ["목성의 과잉이 업무에서 집중을 분산시킵니다", "목성의 팽창 압력이 업무 우선순위를 흐릿하게 만듭니다", "목성의 긴장이 업무에서 방향 조율을 요구합니다"],
      neutral: ["목성이 업무 에너지에 가능성을 더합니다", "목성의 흐름이 업무 방향에 조용히 영향을 줍니다", "목성이 업무 확장 에너지에 작동하고 있습니다"],
    },
    Moon:    {
      harmony: ["달의 흐름이 업무 직관을 지지합니다", "달이 감정 에너지를 안정시켜 집중력을 높여줍니다", "달의 에너지가 업무 리듬을 부드럽게 만듭니다"],
      tension: ["달의 파동이 업무 집중력에 감정적 간섭을 만듭니다", "달의 긴장이 업무와 감정 사이 경계를 흐릿하게 합니다", "달의 자극이 업무 흐름에 기복을 만듭니다"],
      neutral: ["달이 업무 에너지에 감정 층위를 더합니다", "달의 흐름이 집중력에 영향을 주고 있습니다", "달이 업무 리듬에 미묘한 영향을 줍니다"],
    },
    Venus:   {
      harmony: ["금성이 업무 가치 정렬을 강화해 방향이 명확해집니다", "금성의 흐름이 협업과 조율을 원활하게 합니다", "금성이 업무에서 가치와 방향을 지지합니다"],
      tension: ["금성의 긴장이 업무에서 가치 충돌과 방향 혼란을 만듭니다", "금성의 마찰이 업무 우선순위를 복잡하게 만듭니다", "금성의 압력이 업무 가치 정렬을 시험합니다"],
      neutral: ["금성이 업무 에너지에 가치의 흐름을 더합니다", "금성의 흐름이 협업 에너지에 영향을 줍니다", "금성이 업무 방향에 조용히 작동합니다"],
    },
  },
  family: {
    Moon:    {
      harmony: ["달이 움직여 익숙한 정서적 연결이 따뜻하게 활성화됩니다", "달의 에너지가 가족 유대를 강화합니다", "달이 가족 감정 흐름을 부드럽게 열어줍니다"],
      tension: ["달의 파동이 익숙한 정서 패턴을 다시 올라오게 합니다", "달의 긴장으로 가족 사이의 감정 반응이 빨라집니다", "달의 자극이 오래된 감정 반응을 촉발합니다"],
      neutral: ["달이 가족 정서 에너지에 영향을 주고 있습니다", "달의 흐름이 가족 간 감정 리듬을 조율합니다", "달이 가족 관계에 정서 층위를 더합니다"],
    },
    Saturn:  {
      harmony: ["토성이 가족 관계에 안정과 구조를 더합니다", "토성의 흐름이 가족 경계와 역할을 명확하게 만듭니다", "토성이 가족 관계에 책임과 신뢰를 쌓아줍니다"],
      tension: ["토성의 긴장이 가족 관계에서 경계와 책임을 시험합니다", "토성의 압력이 가족 관계에 오래된 긴장 패턴을 올려놓습니다", "토성의 무게가 가족 감정에 부담을 줍니다"],
      neutral: ["토성이 가족 관계에 구조적 흐름을 더합니다", "토성의 흐름이 가족 경계에 영향을 줍니다", "토성이 가족 관계 에너지에 조용히 작동합니다"],
    },
    Venus:   {
      harmony: ["금성이 가족 관계에 따뜻함과 돌봄의 에너지를 더합니다", "금성의 흐름이 가족 유대를 부드럽게 만듭니다", "금성이 활성화돼 돌봄과 연결이 자연스러워집니다"],
      tension: ["금성의 긴장이 가족 관계에서 돌봄 욕구와 경계 사이 긴장을 만듭니다", "금성의 마찰이 가족 관계에서 기대와 현실 사이 간극을 만듭니다", "금성의 압력이 가족 관계 에너지를 시험합니다"],
      neutral: ["금성이 가족 관계에 돌봄의 에너지를 더합니다", "금성의 흐름이 가족 유대에 영향을 줍니다", "금성이 가족 연결에 조용히 작동합니다"],
    },
    Neptune: {
      harmony: ["해왕성이 가족 감정에 공감과 연결의 깊이를 더합니다", "해왕성의 흐름이 가족 사이에 감성적 유대를 강화합니다", "해왕성이 가족 관계에 직관적 연결을 열어줍니다"],
      tension: ["해왕성의 안개가 가족 관계에서 경계를 흐릿하게 만듭니다", "해왕성의 긴장이 가족 간 역할과 경계를 모호하게 합니다", "해왕성의 마찰이 가족 감정에 혼란을 만듭니다"],
      neutral: ["해왕성이 가족 감정에 깊이를 더합니다", "해왕성의 흐름이 가족 관계에 감성 층위를 더합니다", "해왕성이 가족 연결에 조용히 흐르고 있습니다"],
    },
    Sun:     {
      harmony: ["태양이 가족 관계에서 자아 표현과 존재감을 강화합니다", "태양의 에너지가 가족 유대에 밝음을 더합니다", "태양이 가족 관계 에너지를 활성화합니다"],
      tension: ["태양의 긴장이 가족 관계에서 자아와 역할 사이 충돌을 만듭니다", "태양의 압력이 가족 내 역할 갈등을 자극합니다", "태양의 마찰이 가족 관계에서 방향 충돌을 만듭니다"],
      neutral: ["태양이 가족 관계 에너지에 영향을 줍니다", "태양의 흐름이 가족 자아 역학에 조용히 작동합니다", "태양이 가족 관계에 존재의 에너지를 더합니다"],
    },
    Mars:    {
      harmony: ["화성이 가족 관계에서 행동 에너지와 추진력을 더합니다", "화성의 흐름이 가족 내 실행력을 강화합니다", "화성이 가족 관계에 활기를 불어넣습니다"],
      tension: ["화성의 긴장이 가족 관계에서 오래된 마찰 패턴을 자극합니다", "화성의 압력이 가족 내 충돌 가능성을 높입니다", "화성이 가족 감정에 날카로움을 더합니다"],
      neutral: ["화성이 가족 관계에 에너지를 더합니다", "화성의 흐름이 가족 관계 리듬에 영향을 줍니다", "화성이 가족 관계 에너지에 조용히 작동합니다"],
    },
    Mercury: {
      harmony: ["수성이 활성화돼 가족 간 소통이 자연스럽고 명확해집니다", "수성의 흐름이 가족 대화를 부드럽게 풀어줍니다", "수성이 가족 관계에서 이해를 높입니다"],
      tension: ["수성의 긴장이 가족 관계에서 말의 온도를 높입니다", "수성의 마찰이 가족 대화에 오해를 만들 수 있습니다", "수성의 압력이 가족 소통에 주의를 요구합니다"],
      neutral: ["수성이 가족 대화 에너지에 영향을 줍니다", "수성의 흐름이 가족 소통 패턴에 영향을 줍니다", "수성이 가족 관계 언어에 조용히 작동합니다"],
    },
  },
};

/** Synthetic supporting rows injected when real aspects < 2 */
const DOMAIN_SYNTHETIC_SUPPORT: Record<string, Record<"strength" | "challenge" | "neutral", [string, string]>> = {
  love:    {
    strength: ["5영역이 강조되며 끌림이 눈에 띄기 시작합니다", "7영역이 강조되며 관계가 한층 또렷해집니다"],
    challenge:["8하우스 자극으로 감정 경계가 민감해집니다", "금성-화성 긴장이 끌림과 충돌 사이를 자극합니다"],
    neutral:  ["관계 행성 흐름이 조용히 재조정 중입니다", "감정 에너지 방향이 천천히 움직이고 있습니다"],
  },
  friends: {
    strength: ["3영역이 강조되며 말문이 자연스럽게 열립니다", "11영역이 강조되며 사람들과의 연결 폭이 넓어집니다"],
    challenge:["수성-화성 긴장이 말의 날카로움을 자극합니다", "분위기가 내용보다 먼저 잘못 읽힐 수 있습니다"],
    neutral:  ["소통 행성 흐름이 조용히 이동 중입니다", "연결 에너지가 새로운 방향을 탐색하고 있습니다"],
  },
  work:    {
    strength: ["6영역이 강조되며 실행 리듬이 또렷해집니다", "10영역이 강조되며 집중력과 성취 욕구가 또렷해집니다"],
    challenge:["토성-화성 긴장이 업무 속도 조절을 요구합니다", "집중이 흩어지기 쉬운 측면 에너지가 활성화됩니다"],
    neutral:  ["업무 행성 흐름이 조용히 재정렬 중입니다", "실행과 계획 에너지가 전환점에 있습니다"],
  },
  family:  {
    strength: ["4영역이 강조되며 가족과의 유대가 살아납니다", "익숙한 사이에서 따뜻함이 다시 살아나는 날입니다"],
    challenge:["4하우스 자극으로 익숙한 감정 반응이 다시 올라옵니다", "달-토성 긴장이 편안함과 책임 사이를 시험합니다"],
    neutral:  ["가족 감정 에너지가 조용히 재조정되고 있습니다", "정서 패턴이 천천히 전환점에 있습니다"],
  },
};

/** Context label for each transit planet within each domain */
const DOMAIN_ASPECT_CTX: Record<string, Record<string, string>> = {
  love: {
    Venus:"관계 에너지", Moon:"감정 흐름", Mars:"끌림과 경계",
    Neptune:"이상과 현실", Sun:"자아 표현", Mercury:"소통 패턴",
    Saturn:"관계 구조", Jupiter:"흐름 확장", Uranus:"예기치 않은 변화", Pluto:"심층 관계",
  },
  friends: {
    Mercury:"말의 온도", Moon:"분위기", Uranus:"예기치 않은 방향",
    Jupiter:"사회적 에너지", Sun:"자기 표현", Venus:"연결 감각",
    Saturn:"거리 조절", Mars:"긴장 가능성", Neptune:"공감 경계", Pluto:"관계 변혁",
  },
  work: {
    Saturn:"집중 구조", Mercury:"사고 방향", Sun:"의지 에너지",
    Mars:"실행 리듬", Jupiter:"확장 기회", Moon:"감정 영향",
    Venus:"가치 정렬", Uranus:"돌발 변수", Neptune:"집중 분산", Pluto:"심층 변화",
  },
  family: {
    Moon:"정서 반응", Saturn:"관계 구조", Venus:"돌봄 에너지",
    Neptune:"경계 흐림", Sun:"자아 영향", Mars:"긴장 포인트",
    Mercury:"대화 방식", Jupiter:"관계 확장", Uranus:"예기치 않은 마찰", Pluto:"오래된 패턴",
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────

/** Deterministic pool selector: same seed → same index, never random */
function pickVariant<T>(pool: T[], seed: string): T {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return pool[h % pool.length];
}

type EvidenceItem = {
  key: string;
  icon: string;
  label: string;
  ctx: string;
  duration: string;
};

/** Stable unique key: kind:planet:aspectType:target:category:role:rank:orb10 */
function evidenceKey(
  a: ActiveTransitAspect,
  domainKey: string,
  rank: number,
): string {
  const orb10 = Math.round((a.orb ?? 0) * 10);
  return `transit:${a.transitPlanet}:${a.aspect}:${a.natalPlanet}:${domainKey}:evidence:${rank}:${orb10}`;
}

function buildDomainEvidence(
  aspects: ActiveTransitAspect[],
  domainKey: string,
  tone: string,
): EvidenceItem[] {
  const prio = DOMAIN_PLANET_PRIO[domainKey] ?? [];
  const ctxMap = (DOMAIN_ASPECT_CTX[domainKey] ?? {}) as Record<string, string>;
  const domainSentences = DOMAIN_TRANSIT_SENTENCES[domainKey] ?? {};

  // Deduplicate by canonical signature before any ordering
  const seen = new Set<string>();
  const deduped = aspects.filter(a => {
    const sig = `${a.transitPlanet}:${a.aspect}:${a.natalPlanet}`;
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });

  const domainFirst = deduped
    .filter(a => prio.includes(a.transitPlanet))
    .sort((a, b) => prio.indexOf(a.transitPlanet) - prio.indexOf(b.transitPlanet));
  const others = deduped.filter(a => !prio.includes(a.transitPlanet));

  // Root = tightest-orb aspect across all (prefer domainFirst, fall back to others)
  const rootCandidates = [...domainFirst, ...others];
  const root = rootCandidates.length > 0
    ? rootCandidates.reduce((best, cur) =>
        Math.abs(cur.orb ?? 99) < Math.abs(best.orb ?? 99) ? cur : best
      )
    : null;

  // Supporting = domain-priority ordered, root excluded, up to 3
  const supporting = [...domainFirst, ...others]
    .filter(a => a !== root)
    .slice(0, 3);

  const merged = root ? [root, ...supporting] : supporting.slice(0, 4);

  // Build label: domain-template sentence > fallback formula
  const makeLabel = (a: ActiveTransitAspect, rank: number): string => {
    const planetTemplates = domainSentences[a.transitPlanet];
    if (planetTemplates) {
      const tone3 = aspectTone(a.aspect, a.transitPlanet);
      const pool = planetTemplates[tone3];
      if (pool) {
        const seed = a.transitPlanet + a.aspect + a.natalPlanet + domainKey + rank;
        return pickVariant(pool, seed);
      }
    }
    // Fallback: readable Korean phrase using existing maps
    const pKo = PLANET_KO[a.transitPlanet] ?? a.transitPlanet;
    const nKo = PLANET_KO[a.natalPlanet] ?? a.natalPlanet;
    const ctx = ctxMap[a.transitPlanet] ?? "흐름";
    const verb = ASPECT_VERB[a.aspect] ?? a.aspect;
    return `${pKo}이 ${nKo}에 ${verb}으로 작용해 ${ctx}이 강해집니다`;
  };

  const items: EvidenceItem[] = merged.map((a, rank) => ({
    key: evidenceKey(a, domainKey, rank),
    icon: PLANET_CUTOUT[a.transitPlanet as keyof typeof PLANET_CUTOUT] ?? PLANET_CUTOUT.Moon,
    label: makeLabel(a, rank),
    ctx: rank === 0 ? "오늘의 주요 흐름" : (ctxMap[a.transitPlanet] ?? "흐름"),
    duration: orbToTiming(a.transitPlanet, a.orb ?? 3),
  }));

  // Inject synthetic supporting rows when real aspects < 2
  if (items.length < 2) {
    const tKey = (tone === "strength" || tone === "challenge" || tone === "neutral")
      ? tone as "strength" | "challenge" | "neutral"
      : "neutral";
    const synthPool = DOMAIN_SYNTHETIC_SUPPORT[domainKey]?.[tKey] ?? DOMAIN_SYNTHETIC_SUPPORT.love.neutral;
    const needed = 2 - items.length;
    for (let i = 0; i < needed && i < synthPool.length; i++) {
      items.push({
        key: `synth:${domainKey}:${tKey}:${i}`,
        icon: PLANET_CUTOUT.Moon,
        label: synthPool[i],
        ctx: ctxMap["Moon"] ?? "흐름",
        duration: "진행 중",
      });
    }
  }

  return items;
}

// ── Component ─────────────────────────────────────────────────────────────

type Props = {
  domainKey:    string;
  interp:       TransitInterpretation | null;
  dr:           DomainReading | undefined | null;
  domainDetail: DomainDetail | null;
  dateStr:      string;
};

export default function TodayCategoryCard({
  domainKey, interp, dr, domainDetail, dateStr,
}: Props) {
  const [feedback, setFeedback] = useState<"accurate" | "not" | null>(null);

  const loading = !interp && !domainDetail && !dr;
  const tone = (domainDetail?.tone ?? dr?.tone) ?? "neutral";

  // Headline: prefer domainDetail.headline (Korean from ELEMENT_HEADLINE_ALTS computed server-side)
  // Never fall through to statusLabel which may still be English in cached data
  const headline = polishTodayCardText(domainDetail?.headline
    ?? DOMAIN_HEADLINE_FALLBACK[domainKey]?.[tone]
    ?? "오늘의 기류");

  // Deterministic seed from primary transit (same user+date+domain → same variant)
  const primaryPlanet = domainDetail?.primaryTransit?.transitPlanet
    ?? interp?.activeAspects?.[0]?.transitPlanet ?? "Moon";
  const primaryAspect = domainDetail?.primaryTransit?.aspectType
    ?? interp?.activeAspects?.[0]?.aspect ?? "conjunction";
  const seed = primaryPlanet + primaryAspect + domainKey;

  // Sub-headline kicker
  const kicker = polishTodayCardText(
    pickVariant(KICKER_POOL[domainKey]?.[tone] ?? KICKER_POOL.love.neutral, seed)
  );

  // Secondary insight text (domain-specific reinterpretation of the same root signal)
  const secondaryText = polishTodayCardText(
    pickVariant(SECONDARY_POOL[domainKey]?.[tone] ?? SECONDARY_POOL.love.neutral, seed + "2")
  );

  // Body paragraph
  const body = polishTodayCardText(domainDetail?.summary ?? dr?.note ?? interp?.lede ?? "");

  // Planet object image (editorial, monochrome)
  const objectSrc = PLANET_CUTOUT[primaryPlanet as keyof typeof PLANET_CUTOUT] ?? PLANET_CUTOUT.Moon;

  // Domain section labels
  const [sec1Raw, sec2Raw, sec3Raw] = DOMAIN_SECTIONS[domainKey] ?? ["흐름", "기류", "근거"];
  const sec1 = polishTodayCardText(sec1Raw);
  const sec2 = polishTodayCardText(sec2Raw);
  const sec3 = polishTodayCardText(sec3Raw);

  // Domain-filtered evidence rows (2–4 items)
  const evidenceItems = buildDomainEvidence(interp?.activeAspects ?? [], domainKey, tone).map((item) => ({
    ...item,
    label: polishTodayCardText(item.label),
    ctx: polishTodayCardText(item.ctx),
    duration: polishTodayCardText(item.duration),
  }));

  // Bullets for secondary section (from server-computed domain detail)
  const bullets: string[] = (domainDetail?.bullets?.slice(0, 3) ?? []).map(polishTodayCardText);

  return (
    <div className="cc-card">

      {/* ── Hero ── */}
      <div className="cc-hero">
        <div className="cc-hero-text">
          <p className="cc-date">{dateStr}</p>
          {loading
            ? <div className="cc-skel cc-skel--headline" />
            : <h1 className="cc-headline">{headline}</h1>
          }
          {!loading && <p className="cc-kicker">{kicker}</p>}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={objectSrc}
          alt=""
          width={92}
          height={92}
          className="cc-object-img"
          aria-hidden="true"
        />
      </div>

      {/* ── Section A: primary domain body ── */}
      <div className="cc-section">
        <p className="cc-section-eyebrow">{sec1}</p>
        {loading ? (
          <div style={{ display:"flex", flexDirection:"column", gap:"0.4rem" }}>
            <div className="cc-skel" /><div className="cc-skel" /><div className="cc-skel cc-skel--short" />
          </div>
        ) : body ? (
          <p className="cc-section-body">{body}</p>
        ) : null}
      </div>

      {/* ── Section B: secondary insight (domain-specific reinterpretation) ── */}
      <div className="cc-section">
        <p className="cc-section-eyebrow">{sec2}</p>
        {loading ? (
          <div style={{ display:"flex", flexDirection:"column", gap:"0.4rem" }}>
            <div className="cc-skel" /><div className="cc-skel cc-skel--short" />
          </div>
        ) : bullets.length > 0 ? (
          <ul className="cc-signal-list">
            {bullets.map((b, i) => (
              <li key={i} className="cc-signal-item">
                <span className="cc-signal-dash">—</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="cc-section-body">{secondaryText}</p>
        )}
      </div>

      {/* ── Section C: domain-filtered evidence rows ── */}
      <section className="cc-forecast">
        <p className="cc-forecast-eyebrow">{sec3}</p>
        {loading ? (
          <div className="cc-forecast-skels">
            {[0, 1, 2].map((i) => <div key={i} className="cc-skel cc-skel--row" />)}
          </div>
        ) : evidenceItems.length === 0 ? (
          <p className="cc-forecast-empty">오늘 활성화된 흐름 없음</p>
        ) : (
          <div className="cc-forecast-list" role="list">
            {evidenceItems.map((item) => (
              <div key={item.key} className="cc-forecast-item" role="listitem">
                <div className="cc-forecast-icon" aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.icon} alt="" width={34} height={34} />
                </div>
                <div className="cc-forecast-content">
                  <span className="cc-forecast-title">{item.label}</span>
                  <div className="cc-forecast-meta">
                    <span className="cc-forecast-ctx">{item.ctx}</span>
                    <span className="cc-forecast-sep">·</span>
                    <span className="cc-forecast-duration">{item.duration}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Add friends ── */}
      <Link href="/connections" className="cc-friends-line">
        친구 추가해서 에너지 비교하기 →
      </Link>

      {/* ── Feedback row ── */}
      <div className="cc-feedback-row">
        <span className="cc-feedback-info" aria-hidden="true">ⓘ</span>
        <button
          type="button"
          className={`cc-feedback-btn${feedback === "not" ? " cc-feedback-btn--sel" : ""}`}
          onClick={() => setFeedback((f) => (f === "not" ? null : "not"))}
        >
          아닌 것 같아요
        </button>
        <button
          type="button"
          className={`cc-feedback-btn${feedback === "accurate" ? " cc-feedback-btn--sel" : ""}`}
          onClick={() => setFeedback((f) => (f === "accurate" ? null : "accurate"))}
        >
          맞아요
        </button>
      </div>

    </div>
  );
}

