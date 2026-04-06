/**
 * Deterministic interpretation engine.
 * Input: computed NatalChart. Output: structured Korean interpretation text.
 * No random generation. Same chart always produces same output.
 */

import {
  type NatalChart,
  type NatalInterpretation,
  type TransitInterpretation,
  type TodayDeepReport,
  type ActiveTransitAspect,
  type DomainReading,
  type DomainDetail,
  type TransitDeepDetail,
  type SignName,
  type PlanetName,
  type AspectName,
} from "./types";
import { computeTransitPositions, findAspect, norm360, signFromLongitude } from "./calculate";

// ── Static lookup tables ──────────────────────────────────────────────────────

const SIGN_KO: Record<SignName, string> = {
  Aries: "양자리", Taurus: "황소자리", Gemini: "쌍둥이자리",
  Cancer: "게자리", Leo: "사자자리", Virgo: "처녀자리",
  Libra: "천칭자리", Scorpio: "전갈자리", Sagittarius: "사수자리",
  Capricorn: "염소자리", Aquarius: "물병자리", Pisces: "물고기자리",
};

const PLANET_KO: Record<PlanetName, string> = {
  Sun: "태양", Moon: "달", Mercury: "수성", Venus: "금성", Mars: "화성",
  Jupiter: "목성", Saturn: "토성", Uranus: "천왕성", Neptune: "해왕성", Pluto: "명왕성",
};

/** 받침 여부에 따라 올바른 한국어 조사를 반환합니다. */
function josa(word: string, type: "이/가" | "을/를" | "와/과" | "은/는"): string {
  const code = word.charCodeAt(word.length - 1);
  const hasBatchim = code >= 0xAC00 && ((code - 0xAC00) % 28) !== 0;
  switch (type) {
    case "이/가": return hasBatchim ? "이" : "가";
    case "을/를": return hasBatchim ? "을" : "를";
    case "와/과": return hasBatchim ? "과" : "와";
    case "은/는": return hasBatchim ? "은" : "는";
  }
}

const ASPECT_KO: Record<AspectName, string> = {
  conjunction: "합", sextile: "육분", square: "긴장", trine: "조화", opposition: "대립",
};

const SIGN_ELEMENT: Record<SignName, "불" | "흙" | "공기" | "물"> = {
  Aries: "불", Leo: "불", Sagittarius: "불",
  Taurus: "흙", Virgo: "흙", Capricorn: "흙",
  Gemini: "공기", Libra: "공기", Aquarius: "공기",
  Cancer: "물", Scorpio: "물", Pisces: "물",
};

// ── Sun sign descriptions (natal) ─────────────────────────────────────────────

const SUN_SUMMARY: Record<SignName, string> = {
  Aries: "에너지가 빠르게 움직이고, 멈추는 것을 불편해합니다. 선택보다 행동이 먼저입니다.",
  Taurus: "안정된 것에서 의미를 찾고, 변화에 신중하게 반응합니다. 지속성이 힘입니다.",
  Gemini: "정보와 연결이 활력의 원천입니다. 하나의 방향으로 고정되길 거부합니다.",
  Cancer: "감정의 기억이 판단보다 오래 남습니다. 공간과 신뢰가 전제가 됩니다.",
  Leo: "인정과 표현이 에너지를 만듭니다. 무대가 없으면 직접 만들어냅니다.",
  Virgo: "정확함과 실용성이 안정감을 줍니다. 비효율은 가장 큰 스트레스입니다.",
  Libra: "균형과 공정함이 핵심 기준입니다. 갈등보다 해소를 선택하는 에너지입니다.",
  Scorpio: "표면보다 심층을 읽습니다. 깊이 없는 관계는 오래 지속되기 어렵습니다.",
  Sagittarius: "의미와 확장이 동기를 만듭니다. 반복과 제한을 견디기 어렵습니다.",
  Capricorn: "구조와 결과가 신뢰를 만듭니다. 효율적인 경로를 자연스럽게 찾습니다.",
  Aquarius: "비관습적 연결이 흥미를 만듭니다. 집단보다 아이디어에 헌신합니다.",
  Pisces: "경계가 유동적입니다. 감정과 상상 사이를 자유롭게 이동합니다.",
};

// ── Moon sign descriptions ─────────────────────────────────────────────────────

const MOON_SUMMARY: Record<SignName, string> = {
  Aries: "달이 양자리에 있습니다. 감정이 충동과 가깝게 연결되어 있습니다.",
  Taurus: "달이 황소자리에 있습니다. 안정된 환경에서 감정이 살아납니다.",
  Gemini: "달이 쌍둥이자리에 있습니다. 다양한 자극 속에서 감정이 활성화됩니다.",
  Cancer: "달이 게자리에 있습니다. 깊은 공감과 기억 속에서 감정이 형성됩니다.",
  Leo: "달이 사자자리에 있습니다. 인정받을 때 정서적 충족이 일어납니다.",
  Virgo: "달이 처녀자리에 있습니다. 질서와 역할 속에서 내면의 안정을 찾습니다.",
  Libra: "달이 천칭자리에 있습니다. 관계가 조화로울 때 내면이 편안합니다.",
  Scorpio: "달이 전갈자리에 있습니다. 감정의 깊이가 깊고, 새겨진 것은 오래 남습니다.",
  Sagittarius: "달이 사수자리에 있습니다. 자유와 탐색 속에서 감정이 흘러갑니다.",
  Capricorn: "달이 염소자리에 있습니다. 목표와 성취 속에서 정서적 안정을 만듭니다.",
  Aquarius: "달이 물병자리에 있습니다. 독립성이 정서적 균형의 핵심입니다.",
  Pisces: "달이 물고기자리에 있습니다. 감정의 층위가 섬세하고, 공명의 깊이가 있습니다.",
};

// ── ASC sign descriptions ──────────────────────────────────────────────────────

const ASC_SUMMARY: Record<SignName, string> = {
  Aries: "처음 만나면 에너지 넘치고 직접적인 사람으로 읽힙니다.",
  Taurus: "차분하고 신뢰할 수 있는 인상을 줍니다.",
  Gemini: "가볍고 재치 있어 보이지만 내면은 더 복잡합니다.",
  Cancer: "따뜻하고 돌보는 인상이지만 경계를 설정할 줄 압니다.",
  Leo: "존재감이 또렷하고, 방에 들어서면 먼저 보입니다.",
  Virgo: "조심스럽고 체계적인 인상을 줍니다.",
  Libra: "우아하고 사교적이며, 갈등을 자연스럽게 흡수합니다.",
  Scorpio: "강렬하고 침묵이 많으며, 쉽게 속을 보이지 않습니다.",
  Sagittarius: "낙관적이고 직관적이며, 탐색하는 분위기를 풍깁니다.",
  Capricorn: "절제되고 진지하며, 신뢰를 먼저 보여줍니다.",
  Aquarius: "독특하고 개인적인 분위기가 있으며, 쉽게 분류되지 않습니다.",
  Pisces: "부드럽고 공감 능력이 높아 보이며, 관계에 자연스럽게 흘러들어옵니다.",
};

// ── Aspect key phrases (natal, tight < 3°) ───────────────────────────────────

const TIGHT_ASPECT_PHRASES: Array<{
  p1: PlanetName; p2: PlanetName; aspect: AspectName; orbMax: number; text: string;
}> = [
  { p1: "Sun", p2: "Moon", aspect: "conjunction", orbMax: 3, text: "태양과 달의 합: 의지와 감정이 같은 방향으로 움직입니다. 목표가 명확할 때 강한 흐름이 만들어집니다." },
  { p1: "Sun", p2: "Moon", aspect: "opposition", orbMax: 3, text: "태양과 달의 대립: 의지와 감정이 다른 방향을 향합니다. 이 긴장이 내적 동기의 원천입니다." },
  { p1: "Sun", p2: "Moon", aspect: "square", orbMax: 3, text: "태양과 달의 격각: 의식과 무의식 사이에 마찰이 있습니다. 그 마찰이 행동 에너지를 만듭니다." },
  { p1: "Sun", p2: "Mars", aspect: "conjunction", orbMax: 4, text: "태양과 화성의 합: 행동성과 자아 표현이 연결되어 있습니다. 직접적이고 빠릅니다." },
  { p1: "Moon", p2: "Saturn", aspect: "conjunction", orbMax: 4, text: "달과 토성의 합: 감정이 억제되거나 천천히 표출됩니다. 깊은 책임감이 있습니다." },
  { p1: "Moon", p2: "Saturn", aspect: "square", orbMax: 4, text: "달과 토성의 격각: 감정 표현에 제한이 있습니다. 그 억압이 장기적 집중력으로 전환됩니다." },
  { p1: "Venus", p2: "Mars", aspect: "conjunction", orbMax: 4, text: "금성과 화성의 합: 매력과 행동이 하나로 작동합니다. 관계에서 에너지가 강합니다." },
  { p1: "Mercury", p2: "Saturn", aspect: "conjunction", orbMax: 4, text: "수성과 토성의 합: 언어가 신중하고 구조적입니다. 생각이 깊고 오래갑니다." },
  { p1: "Sun", p2: "Jupiter", aspect: "trine", orbMax: 5, text: "태양과 목성의 삼각: 확장과 자아 표현이 자연스럽게 연결됩니다. 낙관적 흐름입니다." },
  { p1: "Moon", p2: "Venus", aspect: "trine", orbMax: 5, text: "달과 금성의 삼각: 감정과 관계가 자연스럽게 통합됩니다. 따뜻한 에너지입니다." },
];

// ── Planet note for chart display ─────────────────────────────────────────────

const PLANET_NOTES: Record<PlanetName, Record<SignName, string>> = {
  Sun: {
    Aries: "강한 자아 표현, 행동의 충동", Taurus: "안정과 소유에 대한 강한 의지", Gemini: "다양성과 소통의 필요",
    Cancer: "감정적 자아, 돌봄의 충동", Leo: "표현과 인정의 에너지", Virgo: "분석과 완성의 충동",
    Libra: "균형과 관계 조율의 에너지", Scorpio: "깊이와 변환의 자아", Sagittarius: "확장과 탐색의 에너지",
    Capricorn: "목표와 구조의 자아", Aquarius: "독립성과 혁신의 에너지", Pisces: "감수성과 유동의 자아",
  },
  Moon: {
    Aries: "즉각적 감정 반응, 독립성", Taurus: "감각적 안정, 느린 감정 처리", Gemini: "감정의 지적 처리, 가변성",
    Cancer: "깊은 감정 기억, 공감", Leo: "인정 욕구, 감정의 표현성", Virgo: "감정의 질서화, 분석",
    Libra: "균형적 감정, 관계 의존", Scorpio: "강렬한 감정 깊이, 변환", Sagittarius: "자유로운 감정 흐름, 낙관",
    Capricorn: "절제된 감정, 책임감", Aquarius: "독립적 감정 구조, 분리", Pisces: "섬세한 공명, 경계 용해",
  },
  Mercury: {
    Aries: "빠른 판단, 직접적 언어", Taurus: "느리지만 확실한 언어 패턴", Gemini: "다방면 학습, 빠른 연결",
    Cancer: "감정적 사고, 기억 중심", Leo: "극적이고 표현적인 언어", Virgo: "정밀하고 분석적인 언어",
    Libra: "외교적 언어, 균형 탐색", Scorpio: "심층 탐구, 핵심 파악", Sagittarius: "광범위한 사고, 직관적 언어",
    Capricorn: "실용적이고 구조적인 언어", Aquarius: "독창적 아이디어, 비선형 사고", Pisces: "직관적이고 유동적인 사고",
  },
  Venus: {
    Aries: "직접적이고 빠른 매력", Taurus: "감각적이고 지속적인 매력", Gemini: "다양한 관계, 지적 매력",
    Cancer: "돌봄과 정서적 연결", Leo: "드라마틱하고 표현적인 매력", Virgo: "섬세하고 실용적인 관계 패턴",
    Libra: "균형과 우아함, 파트너십 지향", Scorpio: "강렬하고 깊은 연결", Sagittarius: "자유로운 관계, 열린 매력",
    Capricorn: "신뢰와 안정 기반의 관계", Aquarius: "독립적이고 비관습적 관계", Pisces: "이상적이고 감수성 높은 관계",
  },
  Mars: {
    Aries: "탐색과 행동의 충동", Taurus: "느리지만 지속적인 행동", Gemini: "다방면적 행동, 분산 에너지",
    Cancer: "감정 기반 행동, 방어적 에너지", Leo: "표현적이고 강한 행동 에너지", Virgo: "정밀하고 분석적인 행동",
    Libra: "협력적 행동, 갈등 회피", Scorpio: "집중적이고 변환적인 행동 에너지", Sagittarius: "탐색과 행동의 충동",
    Capricorn: "목표 지향적이고 지속적인 행동", Aquarius: "혁신적이고 독립적인 행동", Pisces: "유동적이고 직관적인 행동",
  },
  Jupiter: {
    Aries: "행동과 탐험에서 성장", Taurus: "물질적 확장, 감각적 성장", Gemini: "다양한 지식에서 성장",
    Cancer: "감정과 돌봄에서 확장", Leo: "표현과 창의성에서 성장", Virgo: "분석과 서비스에서 확장",
    Libra: "관계와 균형에서 성장", Scorpio: "깊이와 변환에서 확장", Sagittarius: "철학과 탐험에서 성장",
    Capricorn: "구조와 성취에서 확장", Aquarius: "혁신과 공동체에서 성장", Pisces: "영성과 감수성에서 확장",
  },
  Saturn: {
    Aries: "행동의 조절과 책임", Taurus: "물질적 안정에 대한 엄격함", Gemini: "언어와 사고의 구조화",
    Cancer: "감정적 경계와 책임", Leo: "표현의 절제와 구조", Virgo: "완벽주의적 기준",
    Libra: "관계의 책임과 균형", Scorpio: "심층 구조와 통제", Sagittarius: "자유의 제한과 집중",
    Capricorn: "목표 추구의 엄격한 구조", Aquarius: "혁신의 책임과 제한", Pisces: "이상의 현실화",
  },
  Uranus: {
    Aries: "혁명적 자아 표현", Taurus: "물질 구조의 혁신", Gemini: "언어와 소통의 혁신",
    Cancer: "가정 구조의 변혁", Leo: "창의적 표현의 혁신", Virgo: "방법론의 혁신",
    Libra: "관계 패턴의 혁신", Scorpio: "심층 구조의 변혁", Sagittarius: "철학과 신념의 혁신",
    Capricorn: "조직 구조의 혁신", Aquarius: "사회 변혁 에너지", Pisces: "영적 구조의 해체와 재구성",
  },
  Neptune: {
    Aries: "행동 충동의 용해", Taurus: "물질 경계의 용해", Gemini: "정보 경계의 유동",
    Cancer: "감정 경계의 확장", Leo: "자아 경계의 유동", Virgo: "분석 기준의 이상화",
    Libra: "관계 이상의 추구", Scorpio: "심층 의식의 유동", Sagittarius: "신념 경계의 확장",
    Capricorn: "구조 이상의 추구", Aquarius: "집단 의식의 유동", Pisces: "경계 용해의 극대화",
  },
  Pluto: {
    Aries: "자아 변환의 에너지", Taurus: "물질 변환의 에너지", Gemini: "언어 변환의 에너지",
    Cancer: "내면 구조의 변환", Leo: "표현 구조의 변환", Virgo: "방법론의 변환",
    Libra: "관계 구조의 변환", Scorpio: "심층 변환 에너지", Sagittarius: "신념 구조의 변환",
    Capricorn: "조직 변환 에너지", Aquarius: "사회 변환 에너지", Pisces: "의식 구조의 변환",
  },
};

// ── Daily moon energy ──────────────────────────────────────────────────────────

const DAILY_MOON_ENERGY: Record<SignName, string> = {
  Aries: "오늘은 즉각적인 행동이 에너지가 됩니다. 충동을 방향으로 전환하세요.",
  Taurus: "오늘은 안정과 감각이 핵심입니다. 느린 흐름이 더 멀리 갑니다.",
  Gemini: "오늘은 정보와 연결이 활발합니다. 너무 많은 방향에 주의하세요.",
  Cancer: "오늘은 감정의 흐름이 강합니다. 공간이 필요한 날입니다.",
  Leo: "오늘은 표현이 중요합니다. 보이는 것이 전달되는 날입니다.",
  Virgo: "오늘은 정밀함이 결과를 만듭니다. 세부에 집중할수록 유리합니다.",
  Libra: "오늘은 판단이 느려지는 날입니다. 그것이 더 정확할 수 있습니다.",
  Scorpio: "오늘은 표면 아래를 읽는 감각이 날카롭습니다. 직관을 신뢰하세요.",
  Sagittarius: "오늘은 확장이 동력입니다. 더 큰 맥락이 행동 방향을 줍니다.",
  Capricorn: "오늘은 결과와 효율이 초점입니다. 불필요한 것을 제거할 수 있는 날입니다.",
  Aquarius: "오늘은 비관습적 사고가 유리합니다. 패턴 밖에 답이 있습니다.",
  Pisces: "오늘은 경계가 흐려지는 날입니다. 감수성을 자원으로 사용하세요.",
};
// Moon-sign headline pool: 3 variants per sign, selected by the Moon's 10°-band within the sign.
// Band 0: 0–9°, Band 1: 10–19°, Band 2: 20–29°. Shifts ~every 20 h → adjacent days in same sign diverge.
const HEADLINE_BY_MOON_SIGN_POOL: Record<SignName, [string, string, string]> = {
  Aries:       ["오늘은 충동과 시작의 에너지가 흐릅니다.", "오늘은 먼저 움직이는 쪽이 유리합니다.", "오늘은 두려움 없이 시작할 수 있는 날입니다."],
  Taurus:      ["오늘은 안정과 감각을 따르세요.", "오늘은 천천히 쌓아가는 것이 힘이 됩니다.", "오늘은 감각과 현실이 나침반입니다."],
  Gemini:      ["오늘은 연결과 다양성이 활발합니다.", "오늘은 정보의 흐름이 열려 있습니다.", "오늘은 아이디어가 여러 방향으로 뻗습니다."],
  Cancer:      ["오늘은 감정이 흐름을 만듭니다.", "오늘은 내면의 목소리가 크게 들립니다.", "오늘은 돌보는 에너지가 중심에 있습니다."],
  Leo:         ["오늘은 표현 에너지가 높습니다.", "오늘은 무대가 당신을 기다립니다.", "오늘은 자신을 드러내는 힘이 있습니다."],
  Virgo:       ["오늘은 정밀함과 분석이 유리합니다.", "오늘은 세부사항이 전체를 만듭니다.", "오늘은 질서에서 명확함이 나옵니다."],
  Libra:       ["오늘은 균형과 조율이 중심입니다.", "오늘은 판단보다 조율이 먼저입니다.", "오늘은 관계에서 조화를 찾는 날입니다."],
  Scorpio:     ["오늘은 심층 에너지가 흐릅니다.", "오늘은 표면 아래를 읽는 날입니다.", "오늘은 직관이 진실을 가리킵니다."],
  Sagittarius: ["오늘은 탐색과 확장의 흐름입니다.", "오늘은 큰 그림이 방향을 줍니다.", "오늘은 의미를 향해 나아갑니다."],
  Capricorn:   ["오늘은 목표와 구조가 힘을 줍니다.", "오늘은 결과에 초점을 맞추세요.", "오늘은 기반이 단단해지는 날입니다."],
  Aquarius:    ["오늘은 독립과 혁신이 활발합니다.", "오늘은 패턴 밖에서 답을 찾습니다.", "오늘은 비관습적 관점이 유리합니다."],
  Pisces:      ["오늘은 감수성과 직관이 흐릅니다.", "오늘은 경계가 열리는 날입니다.", "오늘은 느끼는 것이 나침반이 됩니다."],
};

// Transit-driven headline overrides — score-based, highest-scoring active transit wins.
// Expanded from 18 to 65 entries; covers Mercury/Venus/Mars/Jupiter/Saturn to all key natal points.
const TRANSIT_HEADLINE_MAP: Array<{
  transitPlanet: PlanetName; natalPlanet: PlanetName;
  aspect: AspectName; orbMax: number; headline: string;
}> = [
  // ── Moon transits ──────────────────────────────────────────────────────────
  { transitPlanet: "Moon", natalPlanet: "Sun",     aspect: "conjunction", orbMax: 3, headline: "자아와 감정이 하나가 되는 날입니다." },
  { transitPlanet: "Moon", natalPlanet: "Moon",    aspect: "conjunction", orbMax: 3, headline: "감정의 기억이 다시 활성화됩니다." },
  { transitPlanet: "Moon", natalPlanet: "Venus",   aspect: "conjunction", orbMax: 3, headline: "관계와 감수성이 오늘 중심입니다." },
  { transitPlanet: "Moon", natalPlanet: "Mars",    aspect: "conjunction", orbMax: 3, headline: "감정과 행동 에너지가 연결됩니다." },
  { transitPlanet: "Moon", natalPlanet: "Sun",     aspect: "opposition",  orbMax: 3, headline: "감정과 의지가 다른 방향을 향합니다." },
  { transitPlanet: "Moon", natalPlanet: "Sun",     aspect: "square",      orbMax: 3, headline: "내면의 긴장이 행동 충동을 만듭니다." },
  { transitPlanet: "Moon", natalPlanet: "Saturn",  aspect: "square",      orbMax: 3, headline: "제한과 무게감이 오늘 감정을 누릅니다." },
  { transitPlanet: "Moon", natalPlanet: "Jupiter", aspect: "trine",       orbMax: 4, headline: "낙관적 감정 흐름이 흐릅니다." },
  { transitPlanet: "Moon", natalPlanet: "Moon",    aspect: "trine",       orbMax: 4, headline: "감정이 안정되어 있습니다." },
  { transitPlanet: "Moon", natalPlanet: "Moon",    aspect: "opposition",  orbMax: 3, headline: "감정의 파도가 높아집니다. 균형이 오늘의 과제입니다." },
  { transitPlanet: "Moon", natalPlanet: "Mars",    aspect: "square",      orbMax: 3, headline: "감정적 충동이 강해집니다. 행동 전에 한 번 더 확인하세요." },
  { transitPlanet: "Moon", natalPlanet: "Mercury", aspect: "conjunction", orbMax: 3, headline: "직관과 언어가 만납니다. 느낀 것을 표현하기 좋은 날입니다." },
  { transitPlanet: "Moon", natalPlanet: "Mercury", aspect: "trine",       orbMax: 4, headline: "감정과 생각이 연결됩니다. 소통이 자연스러운 날입니다." },
  { transitPlanet: "Moon", natalPlanet: "Mars",    aspect: "trine",       orbMax: 4, headline: "감정과 행동이 일치합니다. 원하는 것으로 움직이기 좋습니다." },
  { transitPlanet: "Moon", natalPlanet: "Venus",   aspect: "opposition",  orbMax: 3, headline: "관계에서 감정의 균형이 필요합니다. 양쪽을 조율하세요." },
  { transitPlanet: "Moon", natalPlanet: "Venus",   aspect: "trine",       orbMax: 4, headline: "따뜻한 감정 에너지가 관계를 부드럽게 합니다." },
  { transitPlanet: "Moon", natalPlanet: "Jupiter", aspect: "conjunction", orbMax: 4, headline: "감정적 낙관이 높아집니다. 넓은 시야로 하루를 시작하세요." },
  { transitPlanet: "Moon", natalPlanet: "Jupiter", aspect: "square",      orbMax: 3, headline: "과도한 기대가 감정을 흔들 수 있습니다. 현실적으로 조율하세요." },
  { transitPlanet: "Moon", natalPlanet: "Saturn",  aspect: "conjunction", orbMax: 3, headline: "오늘 감정에 진지함이 실립니다. 깊은 것들을 직면하는 날입니다." },
  // ── Sun transits ──────────────────────────────────────────────────────────
  { transitPlanet: "Sun",  natalPlanet: "Sun",     aspect: "conjunction", orbMax: 5, headline: "태양 귀환 — 새로운 에너지 사이클이 시작됩니다." },
  { transitPlanet: "Sun",  natalPlanet: "Moon",    aspect: "conjunction", orbMax: 4, headline: "에너지가 내면의 감정 구조를 활성화합니다." },
  { transitPlanet: "Sun",  natalPlanet: "Moon",    aspect: "opposition",  orbMax: 4, headline: "자아 표현과 감정적 욕구 사이에 긴장이 있습니다." },
  // ── Mercury transits ───────────────────────────────────────────────────────
  { transitPlanet: "Mercury", natalPlanet: "Sun",     aspect: "conjunction", orbMax: 3, headline: "사고와 언어가 자아 표현과 연결됩니다." },
  { transitPlanet: "Mercury", natalPlanet: "Sun",     aspect: "trine",       orbMax: 4, headline: "생각과 자아 표현이 조화롭습니다. 중요한 대화에 좋은 날입니다." },
  { transitPlanet: "Mercury", natalPlanet: "Sun",     aspect: "square",      orbMax: 4, headline: "표현과 자아 사이에 긴장이 있습니다. 말하기 전에 의도를 확인하세요." },
  { transitPlanet: "Mercury", natalPlanet: "Moon",    aspect: "conjunction", orbMax: 3, headline: "사고와 감정이 연결됩니다. 내면의 이야기를 말로 꺼내보세요." },
  { transitPlanet: "Mercury", natalPlanet: "Moon",    aspect: "trine",       orbMax: 4, headline: "감정을 이해하고 표현하는 능력이 높아집니다." },
  { transitPlanet: "Mercury", natalPlanet: "Moon",    aspect: "square",      orbMax: 3, headline: "생각과 감정 사이에 마찰이 있습니다. 논리가 감정을 무시하지 않도록 하세요." },
  { transitPlanet: "Mercury", natalPlanet: "Venus",   aspect: "conjunction", orbMax: 3, headline: "말이 관계를 열어주는 날입니다. 감정을 언어로 표현하세요." },
  { transitPlanet: "Mercury", natalPlanet: "Mars",    aspect: "conjunction", orbMax: 3, headline: "사고와 행동이 빠르게 연결됩니다. 결정이 명확해집니다." },
  // ── Venus transits ─────────────────────────────────────────────────────────
  { transitPlanet: "Venus", natalPlanet: "Sun",       aspect: "conjunction", orbMax: 4, headline: "매력과 관계 에너지가 자아와 연결됩니다." },
  { transitPlanet: "Venus", natalPlanet: "Sun",       aspect: "trine",       orbMax: 4, headline: "자아와 매력이 자연스럽게 빛납니다. 관계에 좋은 에너지입니다." },
  { transitPlanet: "Venus", natalPlanet: "Sun",       aspect: "square",      orbMax: 4, headline: "관계와 자아 표현 사이에 긴장이 있습니다. 원하는 것을 명확히 하세요." },
  { transitPlanet: "Venus", natalPlanet: "Sun",       aspect: "opposition",  orbMax: 4, headline: "자아와 관계 사이 균형이 필요합니다. 나와 상대 모두를 고려하세요." },
  { transitPlanet: "Venus", natalPlanet: "Moon",      aspect: "conjunction", orbMax: 4, headline: "따뜻한 감정 에너지와 관계 조화의 날입니다." },
  { transitPlanet: "Venus", natalPlanet: "Moon",      aspect: "trine",       orbMax: 4, headline: "감정적 조화로움이 흐릅니다. 사랑과 공감이 자연스럽습니다." },
  { transitPlanet: "Venus", natalPlanet: "Moon",      aspect: "square",      orbMax: 4, headline: "관계에서 감정적 불일치가 있을 수 있습니다. 원하는 것을 명확히 소통하세요." },
  { transitPlanet: "Venus", natalPlanet: "Mercury",   aspect: "conjunction", orbMax: 3, headline: "아름다운 말이 관계를 가깝게 합니다. 감사를 표현하세요." },
  { transitPlanet: "Venus", natalPlanet: "Mars",      aspect: "conjunction", orbMax: 4, headline: "사랑과 욕망이 연결됩니다. 행동하는 열정이 관계를 움직입니다." },
  // ── Mars transits ──────────────────────────────────────────────────────────
  { transitPlanet: "Mars", natalPlanet: "Sun",        aspect: "conjunction", orbMax: 4, headline: "드라이브와 에너지가 집중됩니다." },
  { transitPlanet: "Mars", natalPlanet: "Sun",        aspect: "square",      orbMax: 4, headline: "좌절이나 긴장을 생산적 에너지로 전환할 수 있습니다." },
  { transitPlanet: "Mars", natalPlanet: "Sun",        aspect: "trine",       orbMax: 4, headline: "행동 에너지가 자아와 일치합니다. 결단력 있게 움직이기 좋은 날입니다." },
  { transitPlanet: "Mars", natalPlanet: "Sun",        aspect: "opposition",  orbMax: 4, headline: "의지와 행동 에너지가 서로 당깁니다. 방향을 통합하면 강력해집니다." },
  { transitPlanet: "Mars", natalPlanet: "Moon",       aspect: "conjunction", orbMax: 3, headline: "감정과 행동 에너지가 강렬하게 연결됩니다. 충동 조절이 중요합니다." },
  { transitPlanet: "Mars", natalPlanet: "Moon",       aspect: "square",      orbMax: 3, headline: "감정이 충동적으로 반응할 수 있습니다." },
  { transitPlanet: "Mars", natalPlanet: "Mercury",    aspect: "conjunction", orbMax: 3, headline: "생각과 행동이 날카롭게 연결됩니다. 빠른 결정이 가능한 날입니다." },
  { transitPlanet: "Mars", natalPlanet: "Mercury",    aspect: "square",      orbMax: 3, headline: "사고와 행동 사이 긴장이 있습니다. 성급한 판단에 주의하세요." },
  { transitPlanet: "Mars", natalPlanet: "Venus",      aspect: "conjunction", orbMax: 4, headline: "열정과 매력이 하나로 작동합니다. 관계에서 에너지가 강합니다." },
  { transitPlanet: "Mars", natalPlanet: "Venus",      aspect: "square",      orbMax: 4, headline: "관계에서 갈등이나 긴장이 생길 수 있습니다. 직접 소통으로 해소하세요." },
  // ── Jupiter transits ───────────────────────────────────────────────────────
  { transitPlanet: "Jupiter", natalPlanet: "Sun",     aspect: "conjunction", orbMax: 5, headline: "확장과 기회의 사이클이 열립니다." },
  { transitPlanet: "Jupiter", natalPlanet: "Sun",     aspect: "trine",       orbMax: 5, headline: "성장과 흐름이 자연스럽게 연결됩니다." },
  { transitPlanet: "Jupiter", natalPlanet: "Moon",    aspect: "conjunction", orbMax: 5, headline: "감정적 풍요로움이 흐릅니다. 낙관적인 에너지가 내면을 채웁니다." },
  { transitPlanet: "Jupiter", natalPlanet: "Moon",    aspect: "trine",       orbMax: 5, headline: "내면에서 확장의 흐름이 느껴집니다. 감정이 넓어지는 날입니다." },
  { transitPlanet: "Jupiter", natalPlanet: "Mercury", aspect: "conjunction", orbMax: 5, headline: "사고와 소통이 확장됩니다. 큰 아이디어가 떠오르는 날입니다." },
  { transitPlanet: "Jupiter", natalPlanet: "Mercury", aspect: "trine",       orbMax: 5, headline: "생각이 넓게 연결됩니다. 통찰과 배움에 좋은 날입니다." },
  { transitPlanet: "Jupiter", natalPlanet: "Venus",   aspect: "conjunction", orbMax: 5, headline: "관계와 풍요로움이 만납니다. 사랑과 연결에 행운의 흐름이 있습니다." },
  // ── Saturn transits ────────────────────────────────────────────────────────
  { transitPlanet: "Saturn", natalPlanet: "Sun",      aspect: "conjunction", orbMax: 4, headline: "구조와 책임이 자아에 집중합니다." },
  { transitPlanet: "Saturn", natalPlanet: "Sun",      aspect: "trine",       orbMax: 4, headline: "구조와 의지가 자연스럽게 정렬됩니다. 체계적인 진전을 만들기 좋습니다." },
  { transitPlanet: "Saturn", natalPlanet: "Sun",      aspect: "square",      orbMax: 4, headline: "긴장이 구조를 시험합니다. 책임감 있는 선택이 오늘의 무게입니다." },
  { transitPlanet: "Saturn", natalPlanet: "Moon",     aspect: "conjunction", orbMax: 4, headline: "감정에 무게감이 실립니다. 천천히, 진지하게 접근하세요." },
  { transitPlanet: "Saturn", natalPlanet: "Moon",     aspect: "square",      orbMax: 3, headline: "감정적 제한이나 무게감이 있을 수 있습니다." },
  { transitPlanet: "Saturn", natalPlanet: "Moon",     aspect: "trine",       orbMax: 4, headline: "감정적 안정과 현실감이 균형을 이룹니다. 기반이 단단합니다." },
  { transitPlanet: "Saturn", natalPlanet: "Mercury",  aspect: "conjunction", orbMax: 4, headline: "신중한 사고가 중요합니다. 말과 결정에 책임이 따릅니다." },
  { transitPlanet: "Saturn", natalPlanet: "Mercury",  aspect: "square",      orbMax: 4, headline: "표현이 막히거나 무거울 수 있습니다. 핵심만 전달하세요." },
  { transitPlanet: "Saturn", natalPlanet: "Venus",    aspect: "conjunction", orbMax: 4, headline: "관계에 현실적인 질문이 제기됩니다. 진지한 대화가 필요할 수 있습니다." },
  { transitPlanet: "Saturn", natalPlanet: "Venus",    aspect: "square",      orbMax: 4, headline: "관계에서 제한이나 거리감이 느껴집니다. 인내가 필요한 시기입니다." },
];

// ── Generic transit headlines: fire for any transit-to-natal aspect ───────────
// Broadens daily coverage when TRANSIT_HEADLINE_MAP has no specific entry.
// 3 variants per planet × polarity, picked by dailyVar % 3.
const GENERIC_TRANSIT_HEADLINES: Partial<Record<PlanetName, {
  soft: [string, string, string];
  hard: [string, string, string];
}>> = {
  Moon: {
    soft: [
      "달이 오늘 차트에 부드러운 흐름을 만들어냅니다.",
      "감정 에너지가 오늘 자연스러운 방향을 가리킵니다.",
      "달의 흐름이 오늘 내면의 균형을 지지합니다.",
    ],
    hard: [
      "달의 각이 오늘 내면의 마찰을 일으킵니다.",
      "감정 에너지가 도전을 향하고 있습니다. 의식적으로 조율하세요.",
      "오늘 달의 긴장이 무언가를 재정렬하도록 요구합니다.",
    ],
  },
  Sun: {
    soft: [
      "태양 에너지가 오늘 차트에 활력을 불어넣습니다.",
      "의지와 자아의 흐름이 오늘 방향을 밝혀줍니다.",
      "태양의 조화가 오늘 잠재된 힘을 활성화합니다.",
    ],
    hard: [
      "태양의 긴장이 오늘 핵심을 시험합니다.",
      "의지와 저항이 오늘 마주칩니다. 방향 점검이 필요합니다.",
      "태양이 도전을 통해 명확함을 요구하는 날입니다.",
    ],
  },
  Mercury: {
    soft: [
      "수성이 오늘 생각과 연결의 흐름을 열어줍니다.",
      "언어와 사고가 오늘 날카롭게 작동합니다.",
      "소통의 에너지가 오늘 차트를 활성화합니다.",
    ],
    hard: [
      "수성의 각이 오늘 소통에 주의를 요청합니다.",
      "생각과 표현 사이에 마찰이 있는 날입니다.",
      "말보다 의도를 먼저 확인해야 하는 날입니다.",
    ],
  },
  Venus: {
    soft: [
      "금성이 오늘 관계와 조화의 흐름을 만듭니다.",
      "연결과 매력의 에너지가 오늘 차트에 흐릅니다.",
      "금성의 부드러운 각이 오늘 따뜻한 에너지를 활성화합니다.",
    ],
    hard: [
      "금성의 긴장이 관계에서 명확함을 요구합니다.",
      "원하는 것과 현실 사이 조율이 오늘 필요합니다.",
      "관계 에너지에서 균형점을 찾아야 하는 날입니다.",
    ],
  },
  Mars: {
    soft: [
      "화성이 오늘 행동 에너지를 차트에 불어넣습니다.",
      "의지와 드라이브가 오늘 방향을 만들어냅니다.",
      "화성의 흐름이 오늘 결단력을 높여줍니다.",
    ],
    hard: [
      "화성의 각이 오늘 행동에 마찰을 만듭니다.",
      "충동과 방향을 구분해야 하는 날입니다.",
      "에너지가 강하게 올라옵니다. 방향이 중요합니다.",
    ],
  },
  Jupiter: {
    soft: [
      "목성이 오늘 확장과 가능성의 흐름을 만듭니다.",
      "성장 에너지가 오늘 차트를 통해 흐릅니다.",
      "목성의 각이 큰 그림을 향한 신뢰를 지지합니다.",
    ],
    hard: [
      "목성의 긴장이 오늘 과잉 확장을 경고합니다.",
      "큰 기대와 현실 사이 조율이 오늘 필요합니다.",
      "목성이 도전을 통해 성장의 방향을 보여줍니다.",
    ],
  },
  Saturn: {
    soft: [
      "토성이 오늘 구조와 안정의 에너지를 지지합니다.",
      "책임과 의지가 오늘 단단히 정렬됩니다.",
      "토성의 흐름이 오늘 기반을 강화합니다.",
    ],
    hard: [
      "토성의 각이 오늘 책임을 중심에 올려놓습니다.",
      "구조와 한계가 오늘의 과제를 만듭니다.",
      "토성이 오늘 제한을 통해 핵심을 가리킵니다.",
    ],
  },
};

// ── Broad transit scan config ──────────────────────────────────────────────────
// Wider orbs and more planets — ensures something fires on days when the narrow
// TRANSIT_HEADLINE_MAP misses all natal planet positions.
const BROAD_SCAN_ORB: Partial<Record<PlanetName, number>> = {
  Moon: 5, Sun: 6, Mercury: 5, Venus: 5, Mars: 5, Jupiter: 7, Saturn: 7,
};
const BROAD_SCAN_PLANETS: PlanetName[] = ["Moon", "Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"];
const BROAD_NATAL_TARGETS: PlanetName[] = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"];

// ── Variant headline pools for slow-moving planets ────────────────────────────
// Slow transits (Jupiter, Saturn) can stay active for weeks; a single headline
// string repeats every day they're active. These 3-variant pools break that
// repetition using dailyVar (derived from Moon degree + Mars position).
const TRANSIT_HEADLINE_POOLS: Record<string, [string, string, string]> = {
  "Jupiter_Sun_conjunction":     ["확장과 기회의 사이클이 열립니다.", "오늘 목성이 태양을 확장합니다. 큰 그림으로 나아가세요.", "성장 에너지가 자아에 집중됩니다. 행동할 준비를 하세요."],
  "Jupiter_Sun_trine":           ["성장과 흐름이 자연스럽게 연결됩니다.", "목성이 오늘 태양에 가능성을 열어줍니다.", "자아와 확장이 조화롭게 흐릅니다. 신뢰하며 움직이세요."],
  "Jupiter_Moon_conjunction":    ["감정적 풍요로움이 흐릅니다. 낙관적인 에너지가 내면을 채웁니다.", "목성이 감정 에너지를 확장합니다. 내면이 열리는 날입니다.", "풍요로운 감정의 흐름 속에 있습니다. 그 에너지를 신뢰하세요."],
  "Jupiter_Moon_trine":          ["내면에서 확장의 흐름이 느껴집니다. 감정이 넓어지는 날입니다.", "목성과 달의 조화가 내면을 부드럽게 확장합니다.", "감정이 자유롭고 넉넉한 날입니다. 자연스럽게 흐르세요."],
  "Jupiter_Mercury_conjunction": ["사고와 소통이 확장됩니다. 큰 아이디어가 떠오르는 날입니다.", "목성이 수성에 닿습니다. 생각의 범위가 넓어집니다.", "언어와 사고의 확장이 일어납니다. 크게 생각하세요."],
  "Jupiter_Mercury_trine":       ["생각이 넓게 연결됩니다. 통찰과 배움에 좋은 날입니다.", "목성과 수성의 조화가 사고를 확장합니다.", "오늘 배우는 것이 크게 연결됩니다. 탐구하세요."],
  "Jupiter_Venus_conjunction":   ["관계와 풍요로움이 만납니다. 사랑과 연결에 행운의 흐름이 있습니다.", "목성이 금성에 닿습니다. 관계 에너지가 풍요로워집니다.", "연결과 매력이 확장되는 날입니다. 먼저 다가가세요."],
  "Saturn_Sun_conjunction":      ["구조와 책임이 자아에 집중합니다.", "토성이 태양에 닿습니다. 목표와 한계를 직면하는 날입니다.", "자아와 구조가 만나는 지점입니다. 진지하게 접근하세요."],
  "Saturn_Sun_trine":            ["구조와 의지가 자연스럽게 정렬됩니다. 체계적인 진전을 만들기 좋습니다.", "토성과 태양의 조화가 안정적인 흐름을 만듭니다.", "기반이 단단해지는 날입니다. 장기적인 것에 투자하세요."],
  "Saturn_Sun_square":           ["긴장이 구조를 시험합니다. 책임감 있는 선택이 오늘의 무게입니다.", "토성이 태양에 도전합니다. 한계를 정직하게 보는 날입니다.", "구조의 마찰이 있습니다. 기본에 집중하면 길이 보입니다."],
  "Saturn_Moon_conjunction":     ["감정에 무게감이 실립니다. 천천히, 진지하게 접근하세요.", "토성이 달에 닿습니다. 감정과 책임이 교차합니다.", "내면의 무게를 느끼는 날입니다. 억누르지 말고 받아들이세요."],
  "Saturn_Moon_square":          ["감정적 제한이나 무게감이 있을 수 있습니다.", "토성이 달을 긴장시킵니다. 감정 표현에 인내가 필요합니다.", "감정의 구조가 시험받는 날입니다. 하나씩 정리하세요."],
  "Saturn_Moon_trine":           ["감정적 안정과 현실감이 균형을 이룹니다. 기반이 단단합니다.", "토성과 달의 조화가 감정을 차분하게 안정시킵니다.", "오늘 감정이 단단하고 명확합니다. 그것을 신뢰하세요."],
  "Saturn_Mercury_conjunction":  ["신중한 사고가 중요합니다. 말과 결정에 책임이 따릅니다.", "토성이 수성에 닿습니다. 핵심만 말하는 날입니다.", "언어에 무게감이 실립니다. 신중하게 표현하세요."],
  "Saturn_Mercury_square":       ["표현이 막히거나 무거울 수 있습니다. 핵심만 전달하세요.", "토성이 수성을 긴장시킵니다. 말보다 행동으로 보여주세요.", "소통의 구조에 마찰이 있는 날입니다. 간결하게 접근하세요."],
  "Saturn_Venus_conjunction":    ["관계에 현실적인 질문이 제기됩니다. 진지한 대화가 필요할 수 있습니다.", "토성이 금성에 닿습니다. 관계에 책임이 요구됩니다.", "사랑과 현실 사이 균형을 찾아야 하는 날입니다."],
  "Saturn_Venus_square":         ["관계에서 제한이나 거리감이 느껴집니다. 인내가 필요한 시기입니다.", "토성이 금성을 긴장시킵니다. 관계의 현실을 직면하는 날입니다.", "연결에서 구조적 도전이 있습니다. 진지하게 대화하세요."],
  // ── Moon transit pools ──
  "Moon_Sun_conjunction":       ["자아와 감정이 하나가 됩니다. 원하는 것이 선명해집니다.", "감정이 의지와 같은 방향을 가리킵니다.", "내면과 자아가 오늘 하나의 신호로 연결됩니다."],
  "Moon_Moon_conjunction":      ["감정의 기억이 다시 활성화됩니다.", "오래된 감정 패턴이 표면으로 올라옵니다.", "감정이 과거와 현재를 연결하는 날입니다."],
  "Moon_Venus_conjunction":     ["관계와 감수성이 오늘의 중심입니다.", "사랑의 감정이 표면으로 올라오는 날입니다.", "연결하고 싶은 마음이 강해집니다."],
  "Moon_Mars_conjunction":      ["감정과 행동 에너지가 연결됩니다.", "내면의 충동이 행동으로 이어지려 합니다.", "감정이 행동을 강하게 자극합니다."],
  "Moon_Sun_opposition":        ["감정과 의지가 다른 방향을 향합니다.", "자아와 내면 욕구 사이 균형이 필요합니다.", "원하는 것과 느끼는 것이 충돌하는 날입니다."],
  "Moon_Sun_square":            ["내면의 긴장이 행동 충동을 만듭니다.", "감정과 의지 사이에서 선택을 요구받습니다.", "긴장이 무언가를 명확하게 하도록 압박합니다."],
  "Moon_Saturn_square":         ["제한과 무게감이 오늘 감정을 누릅니다.", "감정적 표현에 저항이 느껴지는 날입니다.", "감정을 억압하기보다 인정하는 것이 중요합니다."],
  "Moon_Jupiter_trine":         ["낙관적 감정 흐름이 흐릅니다.", "감정이 자연스럽게 확장되는 날입니다.", "내면이 넓어지고 풍요로워집니다."],
  "Moon_Moon_trine":            ["감정이 안정되어 있습니다.", "내면의 리듬이 오늘 균형을 이루고 있습니다.", "감정 에너지가 편안하게 흐릅니다."],
  "Moon_Moon_opposition":       ["감정의 파도가 높아집니다. 균형이 오늘의 과제입니다.", "내면의 요구와 외부 현실이 마주칩니다.", "감정적 조율이 필요한 날입니다."],
  "Moon_Mars_square":           ["감정적 충동이 강해집니다. 행동 전에 한 번 더 확인하세요.", "내면의 불꽃이 강해집니다. 방향을 잡으세요.", "충동적 반응보다 의식적 선택이 필요합니다."],
  "Moon_Mercury_conjunction":   ["직관과 언어가 만납니다. 느낀 것을 표현하기 좋은 날입니다.", "생각이 감정과 연결되는 날입니다.", "내면의 말이 언어로 나오기 쉬운 날입니다."],
  "Moon_Mercury_trine":         ["감정과 생각이 연결됩니다. 소통이 자연스러운 날입니다.", "감정을 논리로 표현하기 좋은 날입니다.", "직관과 언어가 부드럽게 흐릅니다."],
  "Moon_Mars_trine":            ["감정과 행동이 일치합니다. 원하는 것으로 움직이기 좋습니다.", "의지와 감정이 같은 방향입니다. 지금 움직이세요.", "행동 에너지가 감정과 자연스럽게 연결됩니다."],
  "Moon_Venus_opposition":      ["관계에서 감정의 균형이 필요합니다. 양쪽을 조율하세요.", "원하는 연결과 현실 사이에 긴장이 있습니다.", "감정과 관계 에너지가 서로 당기고 있습니다."],
  "Moon_Venus_trine":           ["따뜻한 감정 에너지가 관계를 부드럽게 합니다.", "관계에서 공감과 연결이 자연스럽습니다.", "감정적 따뜻함이 오늘 관계를 열어줍니다."],
  "Moon_Jupiter_conjunction":   ["감정적 낙관이 높아집니다. 넓은 시야로 하루를 시작하세요.", "감정이 풍요롭고 열려 있는 날입니다.", "내면의 기대치가 높아지는 날입니다."],
  "Moon_Jupiter_square":        ["과도한 기대가 감정을 흔들 수 있습니다. 현실적으로 조율하세요.", "감정적 과잉이 현실 판단을 흐릴 수 있습니다.", "낙관과 현실을 균형 있게 보는 것이 필요합니다."],
  "Moon_Saturn_conjunction":    ["오늘 감정에 진지함이 실립니다. 깊은 것들을 직면하는 날입니다.", "감정에 무게감이 있는 날입니다. 억압하지 마세요.", "내면의 책임감이 감정과 교차합니다."],
  // ── Sun transit pools ──
  "Sun_Sun_conjunction":        ["태양 귀환 — 새로운 에너지 사이클이 시작됩니다.", "자아가 자신을 마주하는 날입니다. 새로운 의도를 설정하세요.", "생일 에너지 — 새 사이클의 출발점입니다."],
  "Sun_Moon_conjunction":       ["에너지가 내면의 감정 구조를 활성화합니다.", "자아와 감정 기억이 연결되는 날입니다.", "내면을 밝히는 에너지가 감지됩니다."],
  "Sun_Moon_opposition":        ["자아 표현과 감정적 욕구 사이에 긴장이 있습니다.", "의지와 감정이 서로 다른 방향을 보고 있습니다.", "내면 욕구와 외부 표현 사이 균형이 필요합니다."],
  "Sun_Moon_square":            ["에너지와 감정 사이에 마찰이 있습니다. 방향을 통합하세요.", "자아 에너지가 감정과 충돌합니다.", "내면과 외부 사이에서 선택이 필요한 날입니다."],
  // ── Mercury transit pools ──
  "Mercury_Sun_conjunction":    ["사고와 언어가 자아 표현과 연결됩니다.", "생각을 말로 꺼내기 좋은 날입니다.", "수성이 자아에 닿습니다. 표현이 선명해집니다."],
  "Mercury_Sun_trine":          ["생각과 자아 표현이 조화롭습니다. 중요한 대화에 좋은 날입니다.", "소통이 자연스럽게 자아를 드러냅니다.", "언어와 의지가 같은 방향으로 흐릅니다."],
  "Mercury_Sun_square":         ["표현과 자아 사이에 긴장이 있습니다. 말하기 전에 의도를 확인하세요.", "생각이 자아를 압박하는 날입니다. 한 박자 쉬세요.", "언어와 의지 사이에 마찰이 있습니다."],
  "Mercury_Moon_conjunction":   ["사고와 감정이 연결됩니다. 내면의 이야기를 말로 꺼내보세요.", "생각이 감정과 만나는 날입니다.", "직관적 이해가 언어로 표현되는 날입니다."],
  "Mercury_Moon_trine":         ["감정을 이해하고 표현하는 능력이 높아집니다.", "내면의 언어가 자연스럽게 흘러나옵니다.", "감정을 논리로 표현하기 좋은 날입니다."],
  "Mercury_Moon_square":        ["생각과 감정 사이에 마찰이 있습니다. 논리가 감정을 무시하지 않도록 하세요.", "감정과 이성 사이에서 균형이 필요합니다.", "언어가 감정을 방어하는 방식으로 작동할 수 있습니다."],
  "Mercury_Venus_conjunction":  ["말이 관계를 열어주는 날입니다. 감정을 언어로 표현하세요.", "연결하고 싶은 것을 말로 꺼낼 수 있는 날입니다.", "수성과 금성이 만납니다. 아름다운 소통이 가능합니다."],
  "Mercury_Mars_conjunction":   ["사고와 행동이 빠르게 연결됩니다. 결정이 명확해집니다.", "말과 행동이 동시에 움직이는 날입니다.", "생각을 즉각 행동으로 연결하는 에너지가 있습니다."],
  // ── Venus transit pools ──
  "Venus_Sun_conjunction":      ["매력과 관계 에너지가 자아와 연결됩니다.", "자아와 매력이 하나가 되는 날입니다.", "금성이 태양에 닿습니다. 관계에서 빛나는 날입니다."],
  "Venus_Sun_trine":            ["자아와 매력이 자연스럽게 빛납니다. 관계에 좋은 에너지입니다.", "금성이 자아를 지지합니다. 편안하게 연결하세요.", "매력이 자아와 조화롭게 흐릅니다."],
  "Venus_Sun_square":           ["관계와 자아 표현 사이에 긴장이 있습니다. 원하는 것을 명확히 하세요.", "자아 표현과 관계 욕구가 충돌합니다.", "나와 상대 사이의 균형이 필요한 날입니다."],
  "Venus_Sun_opposition":       ["자아와 관계 사이 균형이 필요합니다. 나와 상대 모두를 고려하세요.", "나의 필요와 상대의 필요가 마주치고 있습니다.", "관계와 자아 사이에서 선택이 필요합니다."],
  "Venus_Moon_conjunction":     ["따뜻한 감정 에너지와 관계 조화의 날입니다.", "사랑과 내면이 연결되는 날입니다.", "금성과 달이 만납니다. 감정이 관계를 채웁니다."],
  "Venus_Moon_trine":           ["감정적 조화로움이 흐릅니다. 사랑과 공감이 자연스럽습니다.", "감정과 관계 에너지가 부드럽게 연결됩니다.", "금성이 달을 지지합니다. 연결이 쉬워지는 날입니다."],
  "Venus_Moon_square":          ["관계에서 감정적 불일치가 있을 수 있습니다. 원하는 것을 명확히 소통하세요.", "감정과 관계 욕구 사이에 마찰이 있습니다.", "연결에서 기대가 충돌하는 날입니다."],
  "Venus_Mercury_conjunction":  ["아름다운 말이 관계를 가깝게 합니다. 감사를 표현하세요.", "소통이 관계를 열어주는 날입니다.", "언어가 연결의 다리가 됩니다."],
  "Venus_Mars_conjunction":     ["사랑과 욕망이 연결됩니다. 행동하는 열정이 관계를 움직입니다.", "금성과 화성이 만납니다. 강한 관계 에너지가 흐릅니다.", "매력과 행동이 하나로 연결되는 날입니다."],
  // ── Mars transit pools ──
  "Mars_Sun_conjunction":       ["드라이브와 에너지가 집중됩니다.", "화성이 자아에 닿습니다. 강한 추진력이 있습니다.", "행동 에너지와 의지가 하나가 됩니다."],
  "Mars_Sun_square":            ["좌절이나 긴장을 생산적 에너지로 전환할 수 있습니다.", "자아와 행동 에너지 사이에 마찰이 있습니다.", "저항이 방향을 찾으면 강력해집니다."],
  "Mars_Sun_trine":             ["행동 에너지가 자아와 일치합니다. 결단력 있게 움직이기 좋은 날입니다.", "의지와 행동이 자연스럽게 연결됩니다.", "화성이 자아를 지지합니다. 지금 행동하세요."],
  "Mars_Sun_opposition":        ["의지와 행동 에너지가 서로 당깁니다. 방향을 통합하면 강력해집니다.", "자아와 행동 욕구가 충돌합니다. 균형점을 찾으세요.", "에너지가 분산됩니다. 방향을 하나로 모으면 됩니다."],
  "Mars_Moon_conjunction":      ["감정과 행동 에너지가 강렬하게 연결됩니다. 충동 조절이 중요합니다.", "감정이 행동을 강하게 자극합니다.", "화성이 달에 닿습니다. 행동 전에 한 박자 더 확인하세요."],
  "Mars_Moon_square":           ["감정이 충동적으로 반응할 수 있습니다.", "감정과 행동 에너지 사이에 긴장이 있습니다.", "충동보다 의도를 선택하는 연습이 필요합니다."],
  "Mars_Mercury_conjunction":   ["생각과 행동이 날카롭게 연결됩니다. 빠른 결정이 가능한 날입니다.", "화성이 수성에 닿습니다. 말과 행동이 함께 움직입니다.", "언어가 행동 에너지를 담아냅니다."],
};

// ── Natal-planet lede pools (for lede independence from headline planet) ───────
// When headline is driven by transit planet X, lede comes from the natal planet
// being aspected. Different axis → different flavor → no same-family repetition.
const NATAL_PLANET_LEDE: Partial<Record<PlanetName, { soft: string[]; hard: string[] }>> = {
  Sun:     { soft: ["자아 표현 에너지가 오늘 자연스럽게 흐릅니다. 중요한 것으로 나아가세요.", "의지가 방향을 만드는 날입니다. 원하는 것을 선언하세요.", "태양 에너지가 오늘 활성화됩니다. 자신감 있게 움직이세요."], hard: ["자아와 저항이 마주치는 날입니다. 방향을 점검하세요.", "의지와 외부 요구 사이에 긴장이 있습니다. 핵심을 지키세요.", "에너지가 강하지만 방향이 필요합니다. 충동보다 의도를 따르세요."] },
  Moon:    { soft: ["감정이 오늘 선명하게 흐릅니다. 내면의 신호를 신뢰하세요.", "내면 에너지가 조화롭습니다. 느끼는 것을 정보로 사용하세요.", "감정의 흐름이 방향을 가리킵니다. 그것을 따르세요."], hard: ["감정의 파도가 높아집니다. 반응하기 전에 멈추는 것이 현명합니다.", "내면의 긴장이 표면으로 올라옵니다. 그것을 이해하려 하세요.", "감정이 충동과 가까워지는 날입니다. 의식적인 조율이 필요합니다."] },
  Mercury: { soft: ["사고가 오늘 명확하게 작동합니다. 중요한 대화를 시작하세요.", "언어와 연결이 오늘 자연스럽게 흐릅니다.", "아이디어가 방향을 만드는 날입니다. 생각한 것을 표현하세요."], hard: ["사고와 표현 사이에 마찰이 있습니다. 의도를 먼저 확인하세요.", "소통이 복잡해질 수 있는 날입니다. 핵심에만 집중하세요.", "정보 과부하가 올 수 있습니다. 하나에만 집중하면 풀립니다."] },
  Venus:   { soft: ["관계 에너지가 오늘 따뜻하게 흐릅니다. 먼저 다가가세요.", "연결과 조화가 오늘의 흐름입니다. 감사를 표현하세요.", "사랑과 매력의 에너지가 높습니다. 관계에 투자하세요."], hard: ["관계에서 원하는 것을 명확히 해야 합니다.", "기대와 현실 사이에 균형이 필요한 날입니다.", "연결에서 마찰이 있습니다. 직접 소통으로 해소하세요."] },
  Mars:    { soft: ["행동 에너지가 오늘 집중됩니다. 결단력 있게 움직이세요.", "의지와 행동이 일치합니다. 미뤄온 것을 밀어붙이세요.", "에너지 흐름이 자연스럽습니다. 지금이 행동할 때입니다."], hard: ["충동이 강해집니다. 행동 전에 의도를 확인하는 한 박자가 필요합니다.", "긴장이 행동을 자극합니다. 저항을 방향 전환에 사용하세요.", "에너지가 마찰로 변할 수 있습니다. 방향을 잡고 움직이세요."] },
  Jupiter: { soft: ["확장의 흐름이 열립니다. 지금 크게 생각하고 움직이는 것이 맞습니다.", "성장 에너지가 자연스럽게 흐릅니다. 새로운 가능성에 열려 있으세요.", "기회가 가까이 있습니다. 열린 마음으로 접근하세요."], hard: ["과잉 확장의 유혹이 있습니다. 크게 보되 현실 점검도 함께 하세요.", "기대와 현실 사이 간극이 있습니다. 실행 가능한 것부터 시작하세요.", "큰 그림이 세부를 가릴 수 있습니다. 균형을 유지하세요."] },
  Saturn:  { soft: ["구조와 의지가 정렬됩니다. 체계적으로 접근하면 단단한 진전을 만들 수 있습니다.", "안정적인 에너지가 흐릅니다. 루틴과 기초가 오늘 든든합니다.", "기반이 단단해지는 날입니다. 장기적인 것에 집중하세요."], hard: ["책임이 중심에 옵니다. 중요한 것을 먼저 하고 나머지를 결정하세요.", "구조가 재정렬되는 중입니다. 흔들려도 무너지는 게 아닙니다.", "저항이 있는 날입니다. 강행보다 단계적 접근이 효과적입니다."] },
  Uranus:  { soft: ["예상을 벗어난 통찰이 올 수 있습니다. 유연하게 받아들이세요.", "변화와 혁신의 에너지가 흐릅니다. 기존 방식 밖에서 답을 찾아보세요.", "직관적인 번뜩임이 있는 날입니다. 그 신호를 무시하지 마세요."], hard: ["돌발적인 상황이 생길 수 있습니다. 유연하게 대응하세요.", "변화가 갑자기 찾아올 수 있습니다. 저항보다 적응이 낫습니다.", "불안정한 에너지가 흐릅니다. 기본에 집중하면 됩니다."] },
  Neptune: { soft: ["직관과 감수성이 높아지는 날입니다. 느끼는 것을 신뢰하세요.", "창의적 에너지가 흐릅니다. 상상력을 자원으로 활용하세요.", "경계가 부드러워지는 날입니다. 공감과 연결에 좋습니다."], hard: ["현실과 이상 사이에 주의가 필요합니다. 판단을 흐리지 마세요.", "혼란이 올 수 있습니다. 명확한 사실에 집중하세요.", "경계가 흐려지는 날입니다. 책임을 회피하지 마세요."] },
  Pluto:   { soft: ["깊은 변환 에너지가 흐릅니다. 오래된 것을 내려놓을 준비를 하세요.", "본질적인 것이 드러나는 날입니다. 그것과 함께 움직이세요.", "변화의 에너지가 집중됩니다. 저항하지 않고 흘러가세요."], hard: ["통제할 수 없는 것이 드러납니다. 수용하는 것이 오늘의 전략입니다.", "깊은 긴장이 있는 날입니다. 집착보다 내려놓음이 효과적입니다.", "변환의 압력이 강합니다. 두려운 것을 정면으로 보세요."] },
};

// Scoring weights for score-based headline + DO/DON'T selection
const HEADLINE_PLANET_WEIGHT: Partial<Record<PlanetName, number>> = {
  Saturn: 8, Jupiter: 7, Mars: 6, Venus: 5, Sun: 4, Mercury: 3, Moon: 2,
};
const HEADLINE_ASPECT_WEIGHT: Record<AspectName, number> = {
  conjunction: 5, opposition: 4, square: 4, trine: 3, sextile: 2,
};

// Mercury/Venus sign context for section body variety
const MERCURY_SIGN_CONTEXT: Record<SignName, string> = {
  Aries:       "수성이 양자리에 있습니다. 직접적인 소통이 유리합니다.",
  Taurus:      "수성이 황소자리에 있습니다. 신중한 말이 효과적입니다.",
  Gemini:      "수성이 쌍둥이자리에 있습니다. 아이디어 흐름이 빠릅니다.",
  Cancer:      "수성이 게자리에 있습니다. 감정 중심의 언어가 앞섭니다.",
  Leo:         "수성이 사자자리에 있습니다. 이야기하는 힘이 오늘 높습니다.",
  Virgo:       "수성이 처녀자리에 있습니다. 정확한 표현이 오해를 막습니다.",
  Libra:       "수성이 천칭자리에 있습니다. 양면을 보는 사고가 작동합니다.",
  Scorpio:     "수성이 전갈자리에 있습니다. 핵심을 파고드는 날입니다.",
  Sagittarius: "수성이 사수자리에 있습니다. 광범위한 사고가 연결됩니다.",
  Capricorn:   "수성이 염소자리에 있습니다. 체계적 분석이 오늘의 강점입니다.",
  Aquarius:    "수성이 물병자리에 있습니다. 패턴 밖의 해법이 떠오릅니다.",
  Pisces:      "수성이 물고기자리에 있습니다. 직관적 흐름을 따르세요.",
};

const VENUS_SIGN_CONTEXT: Record<SignName, string> = {
  Aries:       "금성이 양자리에 있습니다. 직접적인 매력이 관계를 약동시킵니다.",
  Taurus:      "금성이 황소자리에 있습니다. 감각적 안정과 충성이 관계를 구조화합니다.",
  Gemini:      "금성이 쌍둥이자리에 있습니다. 다양한 연결이 관계를 열어줍니다.",
  Cancer:      "금성이 게자리에 있습니다. 돌보는 에너지가 사랑의 언어입니다.",
  Leo:         "금성이 사자자리에 있습니다. 인정과 선물이 관계를 강화합니다.",
  Virgo:       "금성이 처녀자리에 있습니다. 세심한 배려가 촘촘한 연결을 만듭니다.",
  Libra:       "금성이 천칭자리에 있습니다. 조화와 공정함이 관계를 잡아줍니다.",
  Scorpio:     "금성이 전갈자리에 있습니다. 깊은 연결과 신뢰가 중심입니다.",
  Sagittarius: "금성이 사수자리에 있습니다. 자유롭고 열린 관계가 매력을 만듭니다.",
  Capricorn:   "금성이 염소자리에 있습니다. 신뢰와 시간이 관계를 정의합니다.",
  Aquarius:    "금성이 물병자리에 있습니다. 독립적 공간이 관계를 유지합니다.",
  Pisces:      "금성이 물고기자리에 있습니다. 공감과 직관이 연결의 언어입니다.",
};
const MOON_PHASE_PHRASE: Array<{ maxDeg: number; text: string }> = [
  { maxDeg: 45, text: "새로운 사이클의 시작 에너지가 있습니다." },
  { maxDeg: 90, text: "방향을 설정하고 의도를 강화할 수 있는 때입니다." },
  { maxDeg: 135, text: "긴장과 결정의 구간입니다. 선택이 명확해지는 시기입니다." },
  { maxDeg: 180, text: "완성으로 가는 흐름입니다. 마무리 작업이 유리합니다." },
  { maxDeg: 225, text: "충만과 드러남의 시기입니다. 감정이 표면으로 올라옵니다." },
  { maxDeg: 270, text: "통합과 정리의 에너지가 있습니다." },
  { maxDeg: 315, text: "해소와 재평가의 구간입니다." },
  { maxDeg: 360, text: "내려놓음과 침묵의 에너지입니다." },
];

function moonPhasePhrase(moonPhase: number): string {
  for (const { maxDeg, text } of MOON_PHASE_PHRASE) {
    if (moonPhase < maxDeg) return text;
  }
  return MOON_PHASE_PHRASE[MOON_PHASE_PHRASE.length - 1].text;
}

// ── Transit aspect key phrases ────────────────────────────────────────────────

const TRANSIT_KEY_PHRASES: Array<{
  transitPlanet: PlanetName; natalPlanet: PlanetName;
  aspect: AspectName; orbMax: number; text: string;
}> = [
  // ── Moon transits ──
  { transitPlanet: "Moon", natalPlanet: "Sun",     aspect: "conjunction", orbMax: 3, text: "달이 태양과 합을 이룹니다. 자아와 감정이 하나가 되는 날입니다." },
  { transitPlanet: "Moon", natalPlanet: "Moon",    aspect: "conjunction", orbMax: 3, text: "달이 출생 달과 만납니다. 감정적 민감도가 높습니다." },
  { transitPlanet: "Moon", natalPlanet: "Sun",     aspect: "opposition",  orbMax: 3, text: "달이 태양과 대립합니다. 감정과 의지가 다른 방향을 향합니다." },
  { transitPlanet: "Moon", natalPlanet: "Sun",     aspect: "square",      orbMax: 3, text: "달이 태양과 격각입니다. 내면의 긴장이 행동 충동을 만듭니다." },
  { transitPlanet: "Moon", natalPlanet: "Sun",     aspect: "trine",       orbMax: 4, text: "달이 태양과 삼각입니다. 에너지의 흐름이 자연스럽습니다." },
  { transitPlanet: "Moon", natalPlanet: "Moon",    aspect: "trine",       orbMax: 4, text: "달이 출생 달과 삼각입니다. 감정이 안정되어 있습니다." },
  { transitPlanet: "Moon", natalPlanet: "Moon",    aspect: "opposition",  orbMax: 3, text: "달이 출생 달과 대립합니다. 감정의 파고가 높아지는 날입니다." },
  { transitPlanet: "Moon", natalPlanet: "Moon",    aspect: "square",      orbMax: 3, text: "달이 출생 달과 격각입니다. 감정 흐름에 마찰이 있습니다." },
  { transitPlanet: "Moon", natalPlanet: "Mars",    aspect: "conjunction", orbMax: 3, text: "달이 화성과 합을 이룹니다. 감정이 행동 에너지와 연결됩니다." },
  { transitPlanet: "Moon", natalPlanet: "Mars",    aspect: "trine",       orbMax: 4, text: "달이 출생 화성과 삼각입니다. 감정이 행동에 자연스럽게 연결됩니다." },
  { transitPlanet: "Moon", natalPlanet: "Saturn",  aspect: "square",      orbMax: 3, text: "달이 토성과 격각입니다. 감정 표현에 저항이 있는 날입니다." },
  { transitPlanet: "Moon", natalPlanet: "Saturn",  aspect: "conjunction", orbMax: 3, text: "달이 출생 토성과 합입니다. 감정이 무겁고 신중해지는 날입니다." },
  { transitPlanet: "Moon", natalPlanet: "Venus",   aspect: "conjunction", orbMax: 3, text: "달이 금성과 합을 이룹니다. 감수성과 관계 에너지가 높아집니다." },
  { transitPlanet: "Moon", natalPlanet: "Venus",   aspect: "trine",       orbMax: 4, text: "달이 출생 금성과 삼각입니다. 감정과 관계 에너지가 조화롭습니다." },
  { transitPlanet: "Moon", natalPlanet: "Jupiter", aspect: "trine",       orbMax: 4, text: "달이 목성과 삼각입니다. 낙관적 감정 흐름입니다." },
  { transitPlanet: "Moon", natalPlanet: "Jupiter", aspect: "conjunction", orbMax: 3, text: "달이 출생 목성과 합입니다. 감정적으로 확장되고 낙관적인 날입니다." },
  { transitPlanet: "Moon", natalPlanet: "Mercury", aspect: "conjunction", orbMax: 3, text: "달이 출생 수성과 합입니다. 감정과 사고가 가깝게 연결됩니다." },
  // ── Sun transits ──
  { transitPlanet: "Sun",  natalPlanet: "Sun",     aspect: "conjunction", orbMax: 5, text: "태양이 출생 태양과 합을 이룹니다. 태양 귀환 — 새로운 사이클이 시작됩니다." },
  { transitPlanet: "Sun",  natalPlanet: "Moon",    aspect: "conjunction", orbMax: 4, text: "현재 태양이 출생 달과 합을 이룹니다. 에너지가 내면 감정을 활성화합니다." },
  { transitPlanet: "Sun",  natalPlanet: "Moon",    aspect: "opposition",  orbMax: 4, text: "현재 태양이 출생 달과 대립합니다. 자아 표현과 감정적 욕구 사이 긴장이 있습니다." },
  { transitPlanet: "Sun",  natalPlanet: "Venus",   aspect: "conjunction", orbMax: 4, text: "태양이 출생 금성과 합입니다. 관계와 자아 표현이 자연스럽게 연결됩니다." },
  { transitPlanet: "Sun",  natalPlanet: "Mars",    aspect: "conjunction", orbMax: 4, text: "태양이 출생 화성과 합입니다. 의지와 행동 에너지가 강하게 집중됩니다." },
  { transitPlanet: "Sun",  natalPlanet: "Mercury", aspect: "trine",       orbMax: 4, text: "태양이 출생 수성과 삼각입니다. 의지와 언어가 자연스럽게 흐릅니다." },
  { transitPlanet: "Sun",  natalPlanet: "Mercury", aspect: "sextile",     orbMax: 4, text: "태양이 출생 수성과 육분입니다. 표현 에너지가 소통으로 연결됩니다." },
  { transitPlanet: "Sun",  natalPlanet: "Jupiter", aspect: "trine",       orbMax: 5, text: "태양이 출생 목성과 삼각입니다. 의지와 성장 에너지가 조화롭게 흐릅니다." },
  { transitPlanet: "Sun",  natalPlanet: "Saturn",  aspect: "conjunction", orbMax: 4, text: "태양이 출생 토성과 합입니다. 의지와 구조가 교차하는 날입니다." },
  { transitPlanet: "Sun",  natalPlanet: "Saturn",  aspect: "square",      orbMax: 4, text: "태양이 출생 토성과 격각입니다. 방향에 저항이 걸리는 날입니다." },
  // ── Mercury transits ──
  { transitPlanet: "Mercury", natalPlanet: "Sun",     aspect: "conjunction", orbMax: 3, text: "수성이 태양을 지납니다. 언어와 사고가 자아 표현과 연결됩니다." },
  { transitPlanet: "Mercury", natalPlanet: "Moon",    aspect: "conjunction", orbMax: 3, text: "수성이 출생 달과 합입니다. 감정을 언어로 정리하기 좋은 날입니다." },
  { transitPlanet: "Mercury", natalPlanet: "Venus",   aspect: "conjunction", orbMax: 3, text: "수성이 출생 금성과 합입니다. 언어가 관계를 여는 열쇠가 됩니다." },
  { transitPlanet: "Mercury", natalPlanet: "Mars",    aspect: "conjunction", orbMax: 3, text: "수성이 출생 화성과 합입니다. 생각이 빠르게 행동으로 연결됩니다." },
  { transitPlanet: "Mercury", natalPlanet: "Saturn",  aspect: "conjunction", orbMax: 3, text: "수성이 출생 토성과 합입니다. 신중하고 체계적인 사고가 필요합니다." },
  // ── Venus transits ──
  { transitPlanet: "Venus",   natalPlanet: "Sun",     aspect: "conjunction", orbMax: 4, text: "금성이 태양과 합입니다. 매력과 관계 에너지가 자아와 연결됩니다." },
  { transitPlanet: "Venus",   natalPlanet: "Moon",    aspect: "conjunction", orbMax: 4, text: "금성이 출생 달과 합입니다. 따뜻한 감정 에너지와 관계 조화의 날입니다." },
  { transitPlanet: "Venus",   natalPlanet: "Moon",    aspect: "trine",       orbMax: 4, text: "금성이 출생 달과 삼각입니다. 감정과 관계 에너지가 자연스럽게 흐릅니다." },
  { transitPlanet: "Venus",   natalPlanet: "Moon",    aspect: "sextile",     orbMax: 4, text: "금성이 출생 달과 육분입니다. 감정적 연결과 관계 기회가 열립니다." },
  { transitPlanet: "Venus",   natalPlanet: "Moon",    aspect: "square",      orbMax: 3, text: "금성이 출생 달과 격각입니다. 감정 욕구와 관계 기대 사이 마찰이 있습니다." },
  { transitPlanet: "Venus",   natalPlanet: "Moon",    aspect: "opposition",  orbMax: 4, text: "금성이 출생 달과 대립합니다. 관계와 내면 감정 사이 균형이 필요합니다." },
  { transitPlanet: "Venus",   natalPlanet: "Mercury", aspect: "conjunction", orbMax: 3, text: "금성이 출생 수성과 합입니다. 언어와 관계 에너지가 연결됩니다." },
  { transitPlanet: "Venus",   natalPlanet: "Mars",    aspect: "conjunction", orbMax: 4, text: "금성이 출생 화성과 합입니다. 관계 에너지와 행동 욕구가 강하게 연결됩니다." },
  { transitPlanet: "Venus",   natalPlanet: "Mars",    aspect: "trine",       orbMax: 4, text: "금성이 출생 화성과 삼각입니다. 관계와 행동 에너지가 조화롭게 흐릅니다." },
  { transitPlanet: "Venus",   natalPlanet: "Jupiter", aspect: "sextile",     orbMax: 4, text: "금성이 출생 목성과 육분입니다. 관계에서 성장과 기회의 흐름이 있습니다." },
  { transitPlanet: "Venus",   natalPlanet: "Jupiter", aspect: "trine",       orbMax: 5, text: "금성이 출생 목성과 삼각입니다. 관계와 성장 에너지가 자연스럽게 연결됩니다." },
  { transitPlanet: "Venus",   natalPlanet: "Saturn",  aspect: "trine",       orbMax: 4, text: "금성이 출생 토성과 삼각입니다. 관계에서 안정과 신뢰가 강화됩니다." },
  { transitPlanet: "Venus",   natalPlanet: "Saturn",  aspect: "conjunction", orbMax: 4, text: "금성이 출생 토성과 합입니다. 관계에서 진지함과 책임이 요구됩니다." },
  // ── Mars transits ──
  { transitPlanet: "Mars",    natalPlanet: "Sun",     aspect: "conjunction", orbMax: 4, text: "화성이 태양과 합입니다. 드라이브와 에너지가 집중됩니다. 행동을 위한 날입니다." },
  { transitPlanet: "Mars",    natalPlanet: "Sun",     aspect: "trine",       orbMax: 4, text: "화성이 출생 태양과 삼각입니다. 행동 에너지가 의지와 자연스럽게 흐릅니다." },
  { transitPlanet: "Mars",    natalPlanet: "Sun",     aspect: "square",      orbMax: 4, text: "화성이 태양과 격각입니다. 좌절이나 긴장을 생산적 에너지로 전환할 수 있습니다." },
  { transitPlanet: "Mars",    natalPlanet: "Moon",    aspect: "square",      orbMax: 3, text: "화성이 출생 달과 격각입니다. 감정이 충동적으로 반응할 수 있습니다." },
  { transitPlanet: "Mars",    natalPlanet: "Venus",   aspect: "conjunction", orbMax: 4, text: "화성이 출생 금성과 합입니다. 행동과 관계 에너지가 강하게 연결됩니다." },
  { transitPlanet: "Mars",    natalPlanet: "Venus",   aspect: "trine",       orbMax: 4, text: "화성이 출생 금성과 삼각입니다. 행동 에너지가 관계를 활성화합니다." },
  { transitPlanet: "Mars",    natalPlanet: "Saturn",  aspect: "sextile",     orbMax: 4, text: "화성이 출생 토성과 육분입니다. 행동 에너지가 구조를 따라 안정적으로 흐릅니다." },
  { transitPlanet: "Mars",    natalPlanet: "Saturn",  aspect: "square",      orbMax: 4, text: "화성이 출생 토성과 격각입니다. 행동 충동과 구조적 제약 사이 마찰이 있습니다." },
  { transitPlanet: "Mars",    natalPlanet: "Jupiter", aspect: "trine",       orbMax: 4, text: "화성이 출생 목성과 삼각입니다. 행동 에너지가 성장 방향으로 흐릅니다." },
  { transitPlanet: "Mars",    natalPlanet: "Jupiter", aspect: "sextile",     orbMax: 4, text: "화성이 출생 목성과 육분입니다. 에너지와 가능성이 가볍게 연결됩니다." },
  { transitPlanet: "Mars",    natalPlanet: "Mercury", aspect: "conjunction", orbMax: 3, text: "화성이 출생 수성과 합입니다. 생각이 즉각 행동으로 연결됩니다." },
  // ── Jupiter transits ──
  { transitPlanet: "Jupiter", natalPlanet: "Sun",     aspect: "conjunction", orbMax: 5, text: "목성이 태양과 합입니다. 확장과 기회의 사이클이 열립니다." },
  { transitPlanet: "Jupiter", natalPlanet: "Sun",     aspect: "trine",       orbMax: 5, text: "목성이 태양과 삼각입니다. 성장과 흐름이 자연스럽게 연결됩니다." },
  { transitPlanet: "Jupiter", natalPlanet: "Sun",     aspect: "sextile",     orbMax: 5, text: "목성이 출생 태양과 육분입니다. 성장 에너지가 자아에 열려 있습니다." },
  { transitPlanet: "Jupiter", natalPlanet: "Moon",    aspect: "conjunction", orbMax: 5, text: "목성이 출생 달과 합입니다. 감정 에너지가 크게 확장되는 날입니다." },
  { transitPlanet: "Jupiter", natalPlanet: "Moon",    aspect: "trine",       orbMax: 5, text: "목성이 출생 달과 삼각입니다. 감정이 낙관적이고 넓게 흐릅니다." },
  { transitPlanet: "Jupiter", natalPlanet: "Moon",    aspect: "square",      orbMax: 5, text: "목성이 출생 달과 격각입니다. 감정적 기대와 현실 사이 조율이 필요합니다." },
  { transitPlanet: "Jupiter", natalPlanet: "Venus",   aspect: "conjunction", orbMax: 5, text: "목성이 출생 금성과 합입니다. 관계와 매력 에너지가 강하게 활성화됩니다." },
  { transitPlanet: "Jupiter", natalPlanet: "Venus",   aspect: "trine",       orbMax: 5, text: "목성이 출생 금성과 삼각입니다. 관계와 성장 에너지가 자연스럽게 연결됩니다." },
  { transitPlanet: "Jupiter", natalPlanet: "Venus",   aspect: "sextile",     orbMax: 5, text: "목성이 출생 금성과 육분입니다. 관계에서 기회의 흐름이 열립니다." },
  { transitPlanet: "Jupiter", natalPlanet: "Mars",    aspect: "conjunction", orbMax: 5, text: "목성이 출생 화성과 합입니다. 행동 에너지가 크게 확장됩니다." },
  { transitPlanet: "Jupiter", natalPlanet: "Mars",    aspect: "trine",       orbMax: 5, text: "목성이 출생 화성과 삼각입니다. 행동과 성장이 같은 방향을 가리킵니다." },
  { transitPlanet: "Jupiter", natalPlanet: "Mars",    aspect: "square",      orbMax: 5, text: "목성이 출생 화성과 격각입니다. 행동 충동이 과잉 확장될 수 있습니다." },
  { transitPlanet: "Jupiter", natalPlanet: "Mercury", aspect: "trine",       orbMax: 5, text: "목성이 출생 수성과 삼각입니다. 사고와 소통에 확장의 흐름이 있습니다." },
  { transitPlanet: "Jupiter", natalPlanet: "Mercury", aspect: "sextile",     orbMax: 5, text: "목성이 출생 수성과 육분입니다. 아이디어와 연결의 기회가 열립니다." },
  { transitPlanet: "Jupiter", natalPlanet: "Saturn",  aspect: "conjunction", orbMax: 5, text: "목성이 출생 토성과 합입니다. 확장과 구조가 만나는 전환점입니다." },
  // ── Saturn transits ──
  { transitPlanet: "Saturn",  natalPlanet: "Sun",     aspect: "conjunction", orbMax: 4, text: "토성이 태양과 합입니다. 구조와 책임이 자아에 집중됩니다." },
  { transitPlanet: "Saturn",  natalPlanet: "Sun",     aspect: "square",      orbMax: 4, text: "토성이 출생 태양과 격각입니다. 방향과 구조 사이 긴장이 있습니다." },
  { transitPlanet: "Saturn",  natalPlanet: "Moon",    aspect: "square",      orbMax: 3, text: "토성이 출생 달과 격각입니다. 감정적 제한이나 무게감이 있을 수 있습니다." },
  { transitPlanet: "Saturn",  natalPlanet: "Moon",    aspect: "conjunction", orbMax: 4, text: "토성이 출생 달과 합입니다. 감정에 진지함과 책임이 더해집니다." },
  { transitPlanet: "Saturn",  natalPlanet: "Venus",   aspect: "conjunction", orbMax: 4, text: "토성이 출생 금성과 합입니다. 관계에서 진지함과 책임이 요구됩니다." },
  { transitPlanet: "Saturn",  natalPlanet: "Venus",   aspect: "square",      orbMax: 4, text: "토성이 출생 금성과 격각입니다. 관계 기대와 현실 사이 마찰이 있습니다." },
  { transitPlanet: "Saturn",  natalPlanet: "Mercury", aspect: "conjunction", orbMax: 4, text: "토성이 출생 수성과 합입니다. 사고와 소통에 신중함이 요구됩니다." },
  { transitPlanet: "Saturn",  natalPlanet: "Mars",    aspect: "conjunction", orbMax: 4, text: "토성이 출생 화성과 합입니다. 행동 에너지가 구조 속에서 작동합니다." },
  { transitPlanet: "Saturn",  natalPlanet: "Mars",    aspect: "square",      orbMax: 4, text: "토성이 출생 화성과 격각입니다. 행동 충동과 제약 사이 긴장이 있습니다." },
  // ── Neptune, Pluto, Uranus (slow, high-impact) ──
  { transitPlanet: "Neptune", natalPlanet: "Moon",    aspect: "conjunction", orbMax: 4, text: "해왕성이 출생 달과 합입니다. 감정과 직관의 경계가 녹아드는 에너지입니다." },
  { transitPlanet: "Neptune", natalPlanet: "Sun",     aspect: "conjunction", orbMax: 4, text: "해왕성이 출생 태양과 합입니다. 자아와 이상이 교차하는 시기입니다." },
  { transitPlanet: "Neptune", natalPlanet: "Venus",   aspect: "conjunction", orbMax: 4, text: "해왕성이 출생 금성과 합입니다. 관계에서 이상과 현실이 교차합니다." },
  { transitPlanet: "Neptune", natalPlanet: "Mercury", aspect: "conjunction", orbMax: 4, text: "해왕성이 출생 수성과 합입니다. 직관이 논리보다 앞서는 시기입니다." },
  { transitPlanet: "Pluto",   natalPlanet: "Moon",    aspect: "square",      orbMax: 4, text: "명왕성이 출생 달과 격각입니다. 감정의 심층 구조가 압력을 받고 있습니다." },
  { transitPlanet: "Pluto",   natalPlanet: "Moon",    aspect: "conjunction", orbMax: 4, text: "명왕성이 출생 달과 합입니다. 감정이 심층에서 변환을 겪고 있습니다." },
  { transitPlanet: "Pluto",   natalPlanet: "Sun",     aspect: "square",      orbMax: 4, text: "명왕성이 출생 태양과 격각입니다. 자아가 심층 변화의 압력을 받고 있습니다." },
  { transitPlanet: "Pluto",   natalPlanet: "Mercury", aspect: "square",      orbMax: 4, text: "명왕성이 출생 수성과 격각입니다. 사고와 소통이 심층적인 전환을 경험합니다." },
  { transitPlanet: "Pluto",   natalPlanet: "Venus",   aspect: "square",      orbMax: 4, text: "명왕성이 출생 금성과 격각입니다. 관계의 심층 패턴이 부상합니다." },
  { transitPlanet: "Uranus",  natalPlanet: "Sun",     aspect: "conjunction", orbMax: 4, text: "천왕성이 출생 태양과 합입니다. 자아의 방향이 급격하게 전환되는 시기입니다." },
  { transitPlanet: "Uranus",  natalPlanet: "Moon",    aspect: "conjunction", orbMax: 4, text: "천왕성이 출생 달과 합입니다. 감정과 일상에 예상치 못한 변화가 있습니다." },
  { transitPlanet: "Uranus",  natalPlanet: "Mercury", aspect: "conjunction", orbMax: 4, text: "천왕성이 출생 수성과 합입니다. 사고 방식에 급격한 전환이 일어납니다." },
];

// ── Dominant element analysis ─────────────────────────────────────────────────

function dominantElement(chart: NatalChart): string {
  const counts: Record<string, number> = { 불: 0, 흙: 0, 공기: 0, 물: 0 };
  for (const p of chart.planets) {
    counts[SIGN_ELEMENT[p.sign]] += 1;
  }
  const maxEl = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const phrases: Record<string, string> = {
    불: "불의 원소가 지배적입니다. 행동성과 표현 에너지가 차트를 이끕니다.",
    흙: "흙의 원소가 지배적입니다. 실용성과 지속성이 차트를 이끕니다.",
    공기: "공기의 원소가 지배적입니다. 언어와 연결이 차트를 이끕니다.",
    물: "물의 원소가 지배적입니다. 감정과 깊이가 차트를 이끕니다.",
  };
  return phrases[maxEl];
}

// ── Key aspect finder ─────────────────────────────────────────────────────────

function findKeyNatalAspects(chart: NatalChart): string[] {
  const result: string[] = [];
  for (const row of TIGHT_ASPECT_PHRASES) {
    const found = chart.aspects.find(
      (a) => a.planet1 === row.p1 && a.planet2 === row.p2 && a.aspect === row.aspect && a.orb <= row.orbMax,
    );
    if (found) result.push(row.text);
    if (result.length >= 3) break;
  }
  // Fallback: describe the tightest aspect in the chart
  if (result.length === 0 && chart.aspects.length > 0) {
    const top = chart.aspects[0];
    result.push(
      `${PLANET_KO[top.planet1]}과 ${PLANET_KO[top.planet2]}의 ${ASPECT_KO[top.aspect]} (${top.orb}°): 차트에서 가장 두드러진 에너지 구조입니다.`,
    );
  }
  return result;
}

// ── Pullquote synthesis ───────────────────────────────────────────────────────

const PULLQUOTE_BY_ASC: Record<SignName, { kicker: string; text: string }> = {
  Aries: { kicker: "상승궁", text: "처음엔 직접적이고 에너지 넘치는 사람으로 기억됩니다.\n그 아래에 더 복잡한 내면이 있습니다." },
  Taurus: { kicker: "상승궁", text: "처음엔 편안하고 신뢰할 수 있는 사람으로 기억됩니다.\n그 아래에 강한 의지가 있습니다." },
  Gemini: { kicker: "상승궁", text: "처음엔 가볍고 연결이 많은 사람으로 보입니다.\n그 아래에 훨씬 깊은 층위가 있습니다." },
  Cancer: { kicker: "상승궁", text: "처음엔 따뜻하고 돌보는 인상을 줍니다.\n그 아래에 섬세한 경계 구조가 있습니다." },
  Leo: { kicker: "상승궁", text: "처음엔 존재감부터 전달됩니다.\n그 아래에 진지한 에너지가 있습니다." },
  Virgo: { kicker: "상승궁", text: "처음엔 조심스럽고 분석적인 인상을 줍니다.\n그 아래에 예리한 감각이 있습니다." },
  Libra: { kicker: "상승궁", text: "처음엔 우아하고 균형 잡힌 사람으로 읽힙니다.\n그 아래에 분명한 기준이 있습니다." },
  Scorpio: { kicker: "상승궁", text: "처음엔 강렬하고 침묵이 많아 보입니다.\n그 아래에 더 넓은 세계가 있습니다." },
  Sagittarius: { kicker: "상승궁", text: "처음엔 낙관적이고 탐색하는 분위기를 풍깁니다.\n그 아래에 더 깊은 철학이 있습니다." },
  Capricorn: { kicker: "상승궁", text: "처음엔 절제되고 진지한 인상을 줍니다.\n그 아래에 따뜻하고 지속적인 에너지가 있습니다." },
  Aquarius: { kicker: "상승궁", text: "처음엔 독특하고 쉽게 분류되지 않아 보입니다.\n그 아래에 깊은 헌신이 있습니다." },
  Pisces: { kicker: "상승궁", text: "처음엔 부드럽고 흘러드는 인상을 줍니다.\n그 아래에 섬세한 판단력이 있습니다." },
};

// ── Midheaven (MC) sign interpretation ───────────────────────────────────────

const MC_SUMMARY: Record<SignName, string> = {
  Aries:       "중천이 양자리에 있습니다. 개척자적이고 직접적인 방식으로 공적 에너지를 표현합니다. 첫 번째가 되는 방향이 자연스럽습니다.",
  Taurus:      "중천이 황소자리에 있습니다. 안정적이고 지속 가능한 성과가 공적 목표입니다. 신뢰와 일관성이 평판을 만듭니다.",
  Gemini:      "중천이 쌍둥이자리에 있습니다. 소통과 다양한 역할이 공적 방향입니다. 유연성이 커리어의 자산입니다.",
  Cancer:      "중천이 게자리에 있습니다. 돌봄과 감정적 지지가 공적 역할의 중심입니다. 무엇을 집처럼 만드느냐가 방향을 정합니다.",
  Leo:         "중천이 사자자리에 있습니다. 표현과 리더십이 공적 방향의 핵심입니다. 무대 위에서 에너지가 증폭됩니다.",
  Virgo:       "중천이 처녀자리에 있습니다. 정밀함과 서비스가 공적 성과를 만드는 방식입니다. 세부 실행력이 강점입니다.",
  Libra:       "중천이 천칭자리에 있습니다. 균형과 파트너십이 공적 역할을 구조화합니다. 조율 능력이 인정받습니다.",
  Scorpio:     "중천이 전갈자리에 있습니다. 깊이와 변환이 공적 영향력의 원천입니다. 권력 구조를 직관적으로 읽습니다.",
  Sagittarius: "중천이 사수자리에 있습니다. 탐험과 확장이 공적 방향을 이끕니다. 큰 그림이 동기를 만들고 실행을 지속합니다.",
  Capricorn:   "중천이 염소자리에 있습니다. 구조와 목표 달성이 공적 방향의 기준입니다. 장기적 추진력이 핵심 강점입니다.",
  Aquarius:    "중천이 물병자리에 있습니다. 혁신과 집단적 기여가 공적 에너지를 이끕니다. 시스템 변화가 방향이 됩니다.",
  Pisces:      "중천이 물고기자리에 있습니다. 창의성과 감수성이 공적 역할을 형성합니다. 경계를 초월하는 작업이 진로가 됩니다.",
};

// ── Venus natal: relationship & attraction pattern ────────────────────────────

const VENUS_NATAL_SUMMARY: Record<SignName, string> = {
  Aries:       "금성이 양자리에 있습니다. 관계에서 직접성과 에너지가 매력을 만듭니다. 열정으로 시작하고, 자율성이 유지될 때 관계가 살아있습니다.",
  Taurus:      "금성이 황소자리에 있습니다. 감각적 안정과 지속성이 관계의 기반입니다. 신뢰가 쌓이는 데 시간이 걸리지만, 한번 형성된 연결은 깊습니다.",
  Gemini:      "금성이 쌍둥이자리에 있습니다. 지적 자극과 다양성이 관계를 열어줍니다. 멈추지 않고 발전하는 연결이 오래 지속됩니다.",
  Cancer:      "금성이 게자리에 있습니다. 감정적 안전감이 관계의 전제입니다. 돌봄과 기억을 통해 연결이 깊어집니다.",
  Leo:         "금성이 사자자리에 있습니다. 진심 어린 인정과 표현이 관계를 강화합니다. 서로를 빛나게 하는 연결이 지속됩니다.",
  Virgo:       "금성이 처녀자리에 있습니다. 세심한 배려가 관계의 언어입니다. 작은 실용적 도움이 깊은 감정적 의미를 가집니다.",
  Libra:       "금성이 천칭자리에 있습니다. 조화와 공정함이 연결의 기준입니다. 파트너십의 균형이 관계를 유지시킵니다.",
  Scorpio:     "금성이 전갈자리에 있습니다. 깊이 없는 관계는 의미가 없습니다. 신뢰와 변환을 함께 경험한 연결이 핵심입니다.",
  Sagittarius: "금성이 사수자리에 있습니다. 자유와 성장이 공존하는 관계가 지속됩니다. 함께 탐험하는 에너지가 연결을 유지합니다.",
  Capricorn:   "금성이 염소자리에 있습니다. 신뢰와 시간이 관계를 정의합니다. 책임감이 있는 파트너십이 장기적으로 유지됩니다.",
  Aquarius:    "금성이 물병자리에 있습니다. 독립적 공간이 오히려 관계를 유지합니다. 비관습적 연결 방식이 오래가는 패턴입니다.",
  Pisces:      "금성이 물고기자리에 있습니다. 이상적 사랑과 공감이 연결의 핵심입니다. 경계가 흐려질 때 깊이가 생겨납니다.",
};

// ── Mars natal: action drive / pursuit ────────────────────────────────────────

const MARS_NATAL_SUMMARY: Record<SignName, string> = {
  Aries:       "화성이 양자리에 있습니다. 행동 에너지가 즉각적입니다. 결정하면 바로 움직이고, 멈추는 것이 더 어렵습니다.",
  Taurus:      "화성이 황소자리에 있습니다. 행동이 느리지만 지속적입니다. 한 번 시작한 것은 끝을 봅니다.",
  Gemini:      "화성이 쌍둥이자리에 있습니다. 다방면에 에너지가 분산됩니다. 여러 방향에서 동시에 움직이는 방식이 자연스럽습니다.",
  Cancer:      "화성이 게자리에 있습니다. 감정이 행동을 유발합니다. 방어적 에너지가 강하고, 중요한 것을 지키기 위해 움직입니다.",
  Leo:         "화성이 사자자리에 있습니다. 표현과 인정이 행동을 촉진합니다. 눈에 보이는 결과가 동기를 만듭니다.",
  Virgo:       "화성이 처녀자리에 있습니다. 정밀하게 움직입니다. 방법이 맞지 않으면 시작을 늦추는 경향이 있습니다.",
  Libra:       "화성이 천칭자리에 있습니다. 협력적이고 조율된 방식으로 에너지가 흐릅니다. 갈등보다 협의를 선호합니다.",
  Scorpio:     "화성이 전갈자리에 있습니다. 집중적이고 변환적인 행동 에너지입니다. 목표를 향한 집중이 강렬합니다.",
  Sagittarius: "화성이 사수자리에 있습니다. 탐색과 확장이 행동 동기입니다. 규칙보다 가능성이 에너지를 만듭니다.",
  Capricorn:   "화성이 염소자리에 있습니다. 목표를 향한 지속적이고 구조화된 행동입니다. 효율적인 경로를 찾아 움직입니다.",
  Aquarius:    "화성이 물병자리에 있습니다. 혁신적이고 독립적인 행동 에너지입니다. 패턴을 바꾸는 방향으로 움직입니다.",
  Pisces:      "화성이 물고기자리에 있습니다. 유동적이고 직관적인 행동입니다. 논리보다 감각이 방향을 이끕니다.",
};

// ── Saturn natal: structure / discipline / delay ──────────────────────────────

const SATURN_NATAL_SUMMARY: Record<SignName, string> = {
  Aries:       "토성이 양자리에 있습니다. 행동 충동을 조절하고 책임감을 통합하는 에너지입니다.",
  Taurus:      "토성이 황소자리에 있습니다. 물질적 안정에 대한 엄격한 기준이 있습니다.",
  Gemini:      "토성이 쌍둥이자리에 있습니다. 언어와 사고에 구조를 부여하는 에너지입니다.",
  Cancer:      "토성이 게자리에 있습니다. 감정 표현에 제한이 있으며, 책임감이 관계를 구조화합니다.",
  Leo:         "토성이 사자자리에 있습니다. 표현의 절제와 인정 욕구의 규율을 통해 성장합니다.",
  Virgo:       "토성이 처녀자리에 있습니다. 완벽주의적 기준이 높습니다. 분석이 완성되어야 행동합니다.",
  Libra:       "토성이 천칭자리에 있습니다. 관계에서의 책임과 공정함을 엄격하게 요구합니다.",
  Scorpio:     "토성이 전갈자리에 있습니다. 심층 구조와 통제 에너지가 강합니다.",
  Sagittarius: "토성이 사수자리에 있습니다. 탐험과 자유를 구조화하는 에너지입니다.",
  Capricorn:   "토성이 염소자리에 있습니다. 목표 구조가 엄격합니다. 성과 없이는 안도감이 없습니다.",
  Aquarius:    "토성이 물병자리에 있습니다. 혁신에 대한 책임 의식이 있습니다.",
  Pisces:      "토성이 물고기자리에 있습니다. 이상을 현실로 구조화하는 에너지입니다.",
};

// ── Main interpretation functions ─────────────────────────────────────────────

export function interpretNatalChart(chart: NatalChart): NatalInterpretation {
  const sunSign  = chart.planets.find((p) => p.planet === "Sun")!.sign;
  const moonSign = chart.planets.find((p) => p.planet === "Moon")!.sign;
  const ascSign  = chart.ascendant.sign;
  const mcSign   = chart.midheaven.sign;

  const venusPlanet  = chart.planets.find((p) => p.planet === "Venus")!;
  const marsPlanet   = chart.planets.find((p) => p.planet === "Mars")!;
  const saturnPlanet = chart.planets.find((p) => p.planet === "Saturn")!;

  const pullquote  = PULLQUOTE_BY_ASC[ascSign];
  const keyAspects = findKeyNatalAspects(chart);
  const dominant   = dominantElement(chart);

  // Venus summary: sign base + tight Venus-Moon aspect if present
  let venusAspectLine = "";
  const venusAspect = chart.aspects.find(
    (a) => (a.planet1 === "Venus" && a.planet2 === "Moon") ||
            (a.planet1 === "Moon"  && a.planet2 === "Venus"),
  );
  if (venusAspect && venusAspect.orb <= 5) {
    const harmonious: AspectName[] = ["trine", "sextile", "conjunction"];
    venusAspectLine = harmonious.includes(venusAspect.aspect)
      ? ` 금성과 달의 ${ASPECT_KO[venusAspect.aspect]}이 관계와 감정을 자연스럽게 통합합니다.`
      : ` 금성과 달의 ${ASPECT_KO[venusAspect.aspect]}이 관계에서 감정적 긴장을 만들지만, 그것이 성장의 동력이 됩니다.`;
  }
  const venusSummary = `${VENUS_NATAL_SUMMARY[venusPlanet.sign]}${venusAspectLine}`;

  // MC summary — direction / public role
  const mcSummary = MC_SUMMARY[mcSign];

  // Mars + Saturn synthesis — action drive, structural pressure, 10th house context
  const tenthHousePlanets = chart.planets.filter((p) => p.house === 10);
  const tenthContext = tenthHousePlanets.length > 0
    ? `\n${tenthHousePlanets.map((p) => PLANET_KO[p.planet]).join(", ")}이 10영역에 위치해 공적 방향과 직접 연결됩니다.`
    : "";
  const marsSaturnSummary =
    `${MARS_NATAL_SUMMARY[marsPlanet.sign]}\n${SATURN_NATAL_SUMMARY[saturnPlanet.sign]}${tenthContext}`;

  // All 10 planets in placements (not just 5)
  const allPlanets: PlanetName[] = [
    "Sun", "Moon", "Mercury", "Venus", "Mars",
    "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
  ];
  const placements = allPlanets.map((pName) => {
    const p = chart.planets.find((x) => x.planet === pName)!;
    return {
      planet: PLANET_KO[pName],
      sign: SIGN_KO[p.sign],
      house: p.house,
      note: PLANET_NOTES[pName][p.sign],
    };
  });

  return {
    headline: "당신의 에너지 지형",
    lede: `${SIGN_KO[sunSign]} 태양, ${SIGN_KO[ascSign]} 탄생점 — 배치는 성격이 아니라 에너지의 방향입니다.`,
    sunSummary: SUN_SUMMARY[sunSign],
    moonSummary: MOON_SUMMARY[moonSign],
    ascSummary: ASC_SUMMARY[ascSign],
    mcSummary,
    venusSummary,
    marsSaturnSummary,
    dominantPattern: dominant,
    keyAspects,
    pullquoteText: pullquote.text,
    pullquoteKicker: pullquote.kicker,
    placements,
  };
}

// ── Transit-driven lede pools ─────────────────────────────────────────────────
// Keyed by transit planet → soft (benefic/flowing) or hard (tense/malefic) polarity.
// Selected by (moonDegInSign * 3 + PLANET_IDX[natalPlanet] * 7) % pool.length → unique per day + chart.
const TRANSIT_LEDE_MAP: Partial<Record<PlanetName, { soft: string[]; hard: string[] }>> = {
  Mercury: {
    soft: [
      "사고가 흐름을 탑니다. 미뤄온 대화나 결정을 지금 꺼내보세요.",
      "언어가 도구가 되는 하루입니다. 명확하게 전달하면 원하는 것을 얻을 수 있습니다.",
      "아이디어를 바로 연결하고 행동으로 이어가세요. 말하지 않은 것은 전달되지 않습니다.",
    ],
    hard: [
      "말과 생각 사이 마찰이 있습니다. 의도를 먼저 확인하고 표현하세요.",
      "소통이 엇나갈 수 있는 날입니다. 섣부른 결론을 내리지 마세요.",
      "정보 과부하 상태입니다. 핵심 하나에 집중하면 풀립니다.",
    ],
  },
  Venus: {
    soft: [
      "관계에서 따뜻한 에너지가 흐릅니다. 먼저 다가가는 쪽이 오늘 유리합니다.",
      "감사와 애정을 표현하기 좋습니다. 말하지 않으면 상대는 모릅니다.",
      "연결이 자연스럽게 만들어집니다. 오늘 관계에 투자한 것은 돌아옵니다.",
    ],
    hard: [
      "관계에서 원하는 것이 충돌할 수 있습니다. 타협보다 명확한 소통이 먼저입니다.",
      "기대와 현실 사이 긴장이 있습니다. 원하는 것을 직접 말하세요.",
      "내가 원하는 것과 상대가 원하는 것이 다릅니다. 균형점을 찾는 것이 오늘 과제입니다.",
    ],
  },
  Mars: {
    soft: [
      "행동 에너지가 집중됩니다. 결단이 필요한 일에 지금 움직이세요.",
      "에너지 흐름이 자연스럽습니다. 미뤄온 것을 밀어붙이면 진전이 됩니다.",
      "의지와 행동이 일치합니다. 원하는 방향으로 움직이기 가장 좋은 날입니다.",
    ],
    hard: [
      "충동이 강해집니다. 행동 전에 의도를 확인하는 한 번의 멈춤이 필요합니다.",
      "긴장이 행동을 자극합니다. 저항을 무시하지 말고 방향을 바꾸는 데 쓰세요.",
      "에너지가 폭발적으로 올라옵니다. 방향을 잡지 않으면 마찰로 변합니다.",
    ],
  },
  Jupiter: {
    soft: [
      "확장의 흐름이 열립니다. 지금 크게 생각하고 움직이는 것이 맞습니다.",
      "성장 에너지가 자연스럽게 흐릅니다. 노력한 것이 오늘 더 쉽게 결실을 맺습니다.",
      "기회 에너지가 집중됩니다. 새로운 방향에 열린 마음으로 접근하세요.",
    ],
    hard: [
      "과잉 확장의 유혹이 있습니다. 크게 보되 현실 점검도 함께 하세요.",
      "기대와 현실 사이 간극이 있습니다. 목표를 조율하면 길이 보입니다.",
      "큰 그림이 세부를 가릴 수 있습니다. 실행 가능한 것부터 시작하세요.",
    ],
  },
  Saturn: {
    soft: [
      "구조와 의지가 정렬됩니다. 체계적으로 접근하면 단단한 진전을 만들 수 있습니다.",
      "안정적인 에너지가 흐릅니다. 루틴과 기초가 오늘 든든한 토대가 됩니다.",
      "규칙을 따르는 것이 오늘 가장 효율적인 경로입니다. 기본에 집중하세요.",
    ],
    hard: [
      "책임이 중심에 옵니다. 중요한 것을 먼저 하고 나머지를 결정하세요.",
      "구조가 흔들리는 것처럼 느껴집니다. 무너지는 게 아니라 재정렬되는 중입니다.",
      "저항이 있는 날입니다. 강행보다 단계적 접근이 오늘 더 효과적입니다.",
    ],
  },
  Moon: {
    soft: [
      "감정 에너지가 안정적으로 흐릅니다. 가까운 사람과 연결하기 좋은 날입니다.",
      "내면이 조화롭습니다. 직관을 믿고 자연스럽게 움직이세요.",
      "감정이 선명합니다. 지금 느끼는 것을 무시하지 말고 정보로 활용하세요.",
    ],
    hard: [
      "감정의 마찰이 있는 날입니다. 반응하기 전에 멈추는 것이 오늘 가장 현명합니다.",
      "내면의 긴장이 높아집니다. 그 에너지를 생산적인 방향으로 전환하세요.",
      "감정이 충동과 가까워집니다. 느끼는 것과 행동 사이에 한 박자를 두세요.",
    ],
  },
  Sun: {
    soft: [
      "활력이 자연스럽게 흐릅니다. 오늘 시작한 것은 자연스럽게 진전됩니다.",
      "의지와 자아가 집중됩니다. 중요한 것을 지금 선택하세요.",
      "에너지의 흐름이 당신 쪽으로 기울어 있습니다. 원하는 것으로 움직이세요.",
    ],
    hard: [
      "의지와 저항이 마주칩니다. 방향 조정이 필요한 신호입니다.",
      "자아와 외부 요구 사이에 긴장이 있습니다. 타협점을 찾되 핵심은 지키세요.",
      "에너지가 집중되지만 방향이 중요합니다. 충동과 의도를 구분하세요.",
    ],
  },
};

// Moon-sign fallback lede pool — 3 variants per sign, selected by moonDegBand (0/1/2).
// Only used when no strong transit is active. Replaces the generic "달이 X자리 Y°에 있습니다." template.
const MOON_LEDE_BY_SIGN: Record<SignName, [string, string, string]> = {
  Aries:       ["오늘 에너지는 빠르게 움직입니다. 먼저 행동하고 나서 조율하세요.", "즉각적인 반응이 강해집니다. 충동을 방향으로 전환하는 의식이 필요합니다.", "달이 양자리를 지납니다. 오늘 느끼는 것이 곧 행동의 연료입니다."],
  Taurus:      ["오늘의 에너지는 느리지만 지속됩니다. 감각을 믿고 천천히 움직이세요.", "안정된 것에서 힘을 얻는 날입니다. 서두르지 않아도 충분합니다.", "달이 황소자리를 지납니다. 실질적인 것에만 집중하면 됩니다."],
  Gemini:      ["생각이 여러 방향으로 뻗습니다. 가장 중요한 하나를 먼저 고르세요.", "정보와 연결이 활발합니다. 대화가 오늘 답을 만들어줄 수 있습니다.", "달이 쌍둥이자리를 지납니다. 아이디어를 탐색하되 판단을 서두르지 마세요."],
  Cancer:      ["감정이 깊게 흐릅니다. 내면의 신호에 귀 기울이세요.", "오늘은 돌봄의 에너지가 중심에 있습니다. 자신을 먼저 채우세요.", "달이 게자리를 지납니다. 공간과 경계가 오늘 필요할 수 있습니다."],
  Leo:         ["표현 에너지가 높습니다. 보이는 곳에서 빛나는 날입니다.", "인정받고 싶은 욕구가 강해집니다. 그것을 창의적으로 표현하세요.", "달이 사자자리를 지납니다. 자신이 원하는 것을 소리 내어 말하세요."],
  Virgo:       ["정밀함이 결과를 만드는 날입니다. 세부 사항에 집중할수록 유리합니다.", "분석적 에너지가 높습니다. 불필요한 것을 정리하고 핵심만 남기세요.", "달이 처녀자리를 지납니다. 작은 완성이 오늘 큰 만족을 줍니다."],
  Libra:       ["균형을 찾는 에너지가 흐릅니다. 판단보다 조율이 오늘 더 효과적입니다.", "관계에서 공정함이 중심이 됩니다. 상대의 관점도 들어보세요.", "달이 천칭자리를 지납니다. 결정을 미루는 것도 하나의 선택입니다."],
  Scorpio:     ["표면 아래를 읽는 감각이 날카롭습니다. 직관을 신뢰하세요.", "깊이 있는 에너지가 흐릅니다. 진짜 중요한 것에만 집중하세요.", "달이 전갈자리를 지납니다. 진실을 직면할 준비가 되어 있는 날입니다."],
  Sagittarius: ["확장이 동력입니다. 큰 맥락이 오늘 행동 방향을 줍니다.", "자유와 탐색의 에너지가 흐릅니다. 새로운 가능성에 마음을 여세요.", "달이 사수자리를 지납니다. 의미를 향해 나아가는 것이 오늘의 에너지입니다."],
  Capricorn:   ["결과와 효율이 초점입니다. 불필요한 것을 제거할 수 있는 날입니다.", "목표 지향적 에너지가 강합니다. 하나씩 완성하는 것이 오늘의 전략입니다.", "달이 염소자리를 지납니다. 기반이 단단해지는 날입니다."],
  Aquarius:    ["비관습적 사고가 유리합니다. 패턴 밖에 답이 있습니다.", "독립적 에너지가 흐릅니다. 집단보다 자신의 판단을 신뢰하세요.", "달이 물병자리를 지납니다. 거리를 두고 보면 보이지 않던 것이 보입니다."],
  Pisces:      ["경계가 흐려지는 날입니다. 감수성을 자원으로 사용하세요.", "직관이 안내자가 됩니다. 논리보다 느끼는 것이 더 정확한 날입니다.", "달이 물고기자리를 지납니다. 조용한 시간이 내면을 회복시킵니다."],
};

const INTERPRET_COPY_REPLACEMENTS: Array<[string, string]> = [
  ["감정의 파도가 관계를 흔들 수 있습니다. 자신의 감정과 상대의 감정을 구분하는 경계가 필요합니다. 감정적 거리를 유지하면서도 연결될 수 있습니다.", "감정이 쉽게 번지는 날입니다. 내 감정과 상대의 감정이 뒤섞이지 않도록 선을 세우는 게 중요합니다. 거리를 두더라도 연결은 끊기지 않습니다."],
  ["목성이 사랑의 에너지를 넓혀줍니다", "목성이 관계의 가능성을 키웁니다"],
  ["태양과 금성의 각도가 요구하는 것들", "태양과 금성의 각이 말해주는 것"],
  ["움직임이 요구되는 날입니다. 정체보다 시도가 낫습니다.", "멈춰 있기보다 작게라도 움직여야 하는 날입니다. 망설임보다 시도가 낫습니다."],
  ["각도가 만들어내는 긴장이 당신을 움직이게 합니다. 그 움직임의 방향을 정하세요.", "긴장이 올라온다면 피하지 말고, 그 힘을 어디에 쓸지 정하세요."],
  ["연애 에너지 상승", "연애 힘이 붙는 날"],
  ["사고 에너지 상승", "말과 생각이 살아나는 날"],
  ["업무 에너지 상승", "일에 힘이 붙는 날"],
  ["감정 에너지 상승", "감정이 또렷해지는 날"],
  ["자아 에너지 상승", "자아가 또렷해지는 날"],
  ["올해 안에 작동합니다", "올해 안에 영향이 드러납니다"],
  ["몇 주에 걸쳐 작동합니다", "몇 주에 걸쳐 이어집니다"],
  ["조용히 작동 중입니다", "조용히 이어지고 있습니다"],
  ["조용히 작동합니다", "조용히 스며듭니다"],
  ["하나로 작동합니다", "하나로 맞물립니다"],
  ["움직임을 요구합니다.", "작은 행동을 요구합니다."],
];

function polishInterpretCopy(text: string): string {
  let next = text;
  for (const [from, to] of INTERPRET_COPY_REPLACEMENTS) {
    next = next.replaceAll(from, to);
  }
  return next;
}

export function interpretTransits(natal: NatalChart, transitDate: Date): TransitInterpretation {
  const transitLons = computeTransitPositions(transitDate);

  // Moon's current sign
  const moonLon = transitLons.get("Moon")!;
  const moonSign = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"][Math.floor(((moonLon % 360) + 360) % 360 / 30)] as SignName;

  // Mercury and Venus signs for daily body variety
  const mercurySign = signFromLongitude(transitLons.get("Mercury")!);
  const venusSign   = signFromLongitude(transitLons.get("Venus")!);

  // Moon phase today
  const sunLon  = transitLons.get("Sun")!;
  const phase   = ((moonLon - sunLon) % 360 + 360) % 360;
  const phaseText = moonPhasePhrase(phase);

  // Build natal planet longitude map
  const natalByName = new Map<PlanetName, number>(
    natal.planets.map((p) => [p.planet, p.longitude])
  );

  // Scan all transit phrases and collect active aspects
  const rawActiveAspects: ActiveTransitAspect[] = [];
  let transitPhrase: string | null = null;

  for (const row of TRANSIT_KEY_PHRASES) {
    const tLon = transitLons.get(row.transitPlanet);
    const nLon = natalByName.get(row.natalPlanet) ?? null;
    if (tLon == null || nLon == null) continue;
    const found = findAspect(tLon, nLon);
    if (found && found.name === row.aspect && found.orb <= row.orbMax) {
      rawActiveAspects.push({
        transitPlanet: row.transitPlanet,
        natalPlanet: row.natalPlanet,
        aspect: row.aspect,
        orb: found.orb,
        phrase: row.text,
      });
      if (!transitPhrase) transitPhrase = row.text;
    }
  }

  // Deduplicate: remove reverse-direction pairs (e.g., keep "Sun trine Jupiter" OR
  // "Jupiter trine Sun" — same angle — not both. Keep the tighter-orb entry.
  const pairSeen = new Set<string>();
  const allActiveAspects: ActiveTransitAspect[] = [];
  for (const a of rawActiveAspects.sort((x, y) => x.orb - y.orb)) {
    const fwd = `${a.transitPlanet}__${a.natalPlanet}`;
    const rev = `${a.natalPlanet}__${a.transitPlanet}`;
    if (pairSeen.has(fwd) || pairSeen.has(rev)) continue;
    pairSeen.add(fwd);
    allActiveAspects.push(a);
  }

  // Fallback: when no TRANSIT_KEY_PHRASES rule matched, derive from buildTransitDeepList
  // so "이 해석의 근거" in /me page is never blank.
  if (allActiveAspects.length === 0) {
    const deepFallback = buildTransitDeepList(natal, transitDate);
    for (const d of deepFallback.slice(0, 3)) {
      allActiveAspects.push({
        transitPlanet: d.transitPlanet,
        natalPlanet:   d.natalPlanet,
        aspect:        d.aspectType,
        orb:           d.orb,
        phrase:        d.fullPhrase,
      });
    }
    if (!transitPhrase && allActiveAspects.length > 0) {
      transitPhrase = allActiveAspects[0].phrase;
    }
  }

  // Moon degree within sign (0–29) — changes ~13° per day, makes every date unique.
  // Computed early so headline + lede loops can use it.
  const moonDegInSign = Math.floor(norm360(moonLon) % 30);
  const moonDegBand = Math.floor(moonDegInSign / 10) as 0 | 1 | 2;

  // Daily variety index: Moon degree + Mars degree-within-sign (both change every day).
  // Ensures slow-planet transit headlines vary even when the same aspect is active for multiple days.
  const marsLon = transitLons.get("Mars") ?? 0;
  const dailyVar = moonDegInSign + Math.floor(norm360(marsLon) % 30 / 3);

  // ── Headline selection ────────────────────────────────────────────────────
  // Step 1: scan TRANSIT_HEADLINE_MAP (specific transit+natal combos).
  // Step 2: if nothing fires, run broad scan of ALL transit×natal aspects.
  // Track top-2 transits (by different tPlanet) so lede can use 2nd for independence.
  let headline = HEADLINE_BY_MOON_SIGN_POOL[moonSign][moonDegBand];
  let headlineBestScore = 0;
  let secondBestScore = 0;
  let bestTransit: { tPlanet: PlanetName; nPlanet: PlanetName; aspect: AspectName; orb: number } | null = null;
  let secondBestTransit: { tPlanet: PlanetName; nPlanet: PlanetName; aspect: AspectName; orb: number } | null = null;

  for (const row of TRANSIT_HEADLINE_MAP) {
    const tLon = transitLons.get(row.transitPlanet);
    const nLon = natalByName.get(row.natalPlanet) ?? null;
    if (tLon == null || nLon == null) continue;
    const found = findAspect(tLon, nLon);
    if (!found || found.name !== row.aspect || found.orb > row.orbMax) continue;
    const score = (HEADLINE_PLANET_WEIGHT[row.transitPlanet] ?? 1)
      + HEADLINE_ASPECT_WEIGHT[row.aspect]
      + (row.orbMax - found.orb);
    if (score > headlineBestScore) {
      if (bestTransit && bestTransit.tPlanet !== row.transitPlanet) {
        secondBestScore = headlineBestScore;
        secondBestTransit = bestTransit;
      }
      headlineBestScore = score;
      headline = row.headline;
      bestTransit = { tPlanet: row.transitPlanet, nPlanet: row.natalPlanet, aspect: row.aspect, orb: found.orb };
    } else if (score > secondBestScore && row.transitPlanet !== bestTransit?.tPlanet) {
      secondBestScore = score;
      secondBestTransit = { tPlanet: row.transitPlanet, nPlanet: row.natalPlanet, aspect: row.aspect, orb: found.orb };
    }
  }

  // For slow-planet winners (Jupiter/Saturn), apply dailyVar to TRANSIT_HEADLINE_POOLS
  // so the same transit doesn't repeat the exact same text day after day.
  if (bestTransit) {
    const poolKey = `${bestTransit.tPlanet}_${bestTransit.nPlanet}_${bestTransit.aspect}`;
    const variants = TRANSIT_HEADLINE_POOLS[poolKey];
    if (variants) headline = variants[dailyVar % 3];
  }

  // Step 2: broad scan — fires for any transit×natal aspect, even if not in TRANSIT_HEADLINE_MAP.
  // Ensures the headline is always transit-driven, not just Moon-sign-bucketed.
  if (headlineBestScore === 0) {
    const hardAspectNames: AspectName[] = ["square", "opposition"];
    for (const tPlanet of BROAD_SCAN_PLANETS) {
      const tLon = transitLons.get(tPlanet);
      if (tLon == null) continue;
      const orbMax = BROAD_SCAN_ORB[tPlanet] ?? 5;
      for (const nPlanet of BROAD_NATAL_TARGETS) {
        const nLon = natalByName.get(nPlanet);
        if (nLon == null) continue;
        const found = findAspect(tLon, nLon);
        if (!found || found.orb > orbMax) continue;
        const isMaleficConj = found.name === "conjunction"
          && (["Mars", "Saturn"] as PlanetName[]).includes(tPlanet);
        const isHard = hardAspectNames.includes(found.name) || isMaleficConj;
        const score = (HEADLINE_PLANET_WEIGHT[tPlanet] ?? 1)
          + HEADLINE_ASPECT_WEIGHT[found.name]
          + (orbMax - found.orb);
        if (score > headlineBestScore) {
          if (bestTransit && bestTransit.tPlanet !== tPlanet) {
            secondBestScore = headlineBestScore;
            secondBestTransit = bestTransit;
          }
          headlineBestScore = score;
          const pool = GENERIC_TRANSIT_HEADLINES[tPlanet]?.[isHard ? "hard" : "soft"];
          headline = pool ? pool[dailyVar % 3] : HEADLINE_BY_MOON_SIGN_POOL[moonSign][moonDegBand];
          bestTransit = { tPlanet, nPlanet, aspect: found.name, orb: found.orb };
        } else if (score > secondBestScore && tPlanet !== bestTransit?.tPlanet) {
          secondBestScore = score;
          secondBestTransit = { tPlanet, nPlanet, aspect: found.name, orb: found.orb };
        }
      }
    }
  }

  const dateStr = transitDate.toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
  });

  // Section 1: natal Sun + Moon sign + phase + Mercury context
  const natalSunSign = natal.planets.find((p) => p.planet === "Sun")!.sign;
  const section1Body = `${SIGN_KO[moonSign]}의 달이 오늘 감정의 결을 이끌고 있습니다. ${phaseText} ${SIGN_KO[natalSunSign]} 태양으로서 타고난 기질이 어떻게 반응하는지 살펴보세요. ${MERCURY_SIGN_CONTEXT[mercurySign]}`;

  // Section 2: transit phrase + Venus context, or Moon energy + Venus context
  const section2Body = transitPhrase
    ? `${transitPhrase} ${VENUS_SIGN_CONTEXT[venusSign]}`
    : `오늘 달은 ${SIGN_KO[moonSign]}에 위치합니다. ${DAILY_MOON_ENERGY[moonSign]} ${VENUS_SIGN_CONTEXT[venusSign]}`;

  const keyPhrase = transitPhrase ?? DAILY_MOON_ENERGY[moonSign];

  // ── Lede selection (independent from headline planet) ────────────────────
  // When headline is driven by transit planet X, lede uses:
  //   1. secondBestTransit planet pool (different planet → different flavor), OR
  //   2. natal planet lede pool (keyed on which natal point is being aspected), OR
  //   3. headline transit planet pool (original fallback).
  // This prevents headline + lede from collapsing into the same template family.
  let lede: string;
  if (bestTransit) {
    const hardAspects: AspectName[] = ["square", "opposition"];
    const isBestHard = hardAspects.includes(bestTransit.aspect)
      || (bestTransit.aspect === "conjunction" && (["Mars", "Saturn"] as PlanetName[]).includes(bestTransit.tPlanet));

    let ledePool: string[] | null = null;

    // Prefer 2nd-best transit from a DIFFERENT planet → ensures headline ≠ lede family
    if (secondBestTransit && secondBestTransit.tPlanet !== bestTransit.tPlanet) {
      const isSecondHard = hardAspects.includes(secondBestTransit.aspect)
        || (secondBestTransit.aspect === "conjunction" && (["Mars", "Saturn"] as PlanetName[]).includes(secondBestTransit.tPlanet));
      ledePool = TRANSIT_LEDE_MAP[secondBestTransit.tPlanet]?.[isSecondHard ? "hard" : "soft"] ?? null;
    }

    // Fallback: natal planet lede (specific to which natal point is activated)
    if (!ledePool) {
      ledePool = NATAL_PLANET_LEDE[bestTransit.nPlanet]?.[isBestHard ? "hard" : "soft"] ?? null;
    }

    // Last fallback: same transit planet as headline (original behavior)
    if (!ledePool) {
      ledePool = TRANSIT_LEDE_MAP[bestTransit.tPlanet]?.[isBestHard ? "hard" : "soft"] ?? null;
    }

    if (ledePool && ledePool.length > 0) {
      // ledeSeed uses moonDegInSign (changes ~13°/day) + nPlanet for date+natal uniqueness
      const ledeSeed = moonDegInSign * 3 + PLANET_IDX[bestTransit.nPlanet] * 7;
      lede = ledePool[ledeSeed % ledePool.length];
      if (bestTransit.orb <= 1.5) lede += " 지금이 가장 강한 시점입니다.";
    } else {
      lede = MOON_LEDE_BY_SIGN[moonSign][moonDegBand];
    }
  } else {
    lede = MOON_LEDE_BY_SIGN[moonSign][moonDegBand];
  }

  // Natal-aware DO / DON'T derived from today's active benefic/malefic transits.
  const { dos, donts } = computeDosDonts(natal, transitLons, moonSign, transitDate);

  return {
    date: dateStr,
    headline: polishInterpretCopy(headline),
    lede: polishInterpretCopy(lede),
    section1: { title: "오늘의 기류", body: polishInterpretCopy(section1Body) },
    section2: { title: "지금 필요한 선택", body: polishInterpretCopy(section2Body) },
    keyPhrase: polishInterpretCopy(keyPhrase),
    keyPhraseKicker: "오늘의 문장",
    transitMoonSign: moonSign,
    activeAspects: allActiveAspects.map((aspect) => ({
      ...aspect,
      phrase: polishInterpretCopy(aspect.phrase),
    })),
    dos: dos.map(polishInterpretCopy),
    donts: donts.map(polishInterpretCopy),
  };
}

// ── Planet reading for "나의 별 지도" page ────────────────────────────────────

const HOUSE_DOMAIN: Record<number, string> = {
  1:  "자아와 첫인상의 영역에서 이 에너지가 작동합니다.",
  2:  "가치와 자원의 영역에서 드러납니다.",
  3:  "소통과 일상 학습의 영역과 연결됩니다.",
  4:  "내면 기반과 가정의 영역에서 활성화됩니다.",
  5:  "창의성과 표현의 영역에서 흘러나옵니다.",
  6:  "루틴, 건강, 일상의 영역에서 작동합니다.",
  7:  "관계와 파트너십의 영역에서 패턴을 만듭니다.",
  8:  "변환과 심층의 영역에서 작동합니다.",
  9:  "탐험과 신념의 영역에서 확장됩니다.",
  10: "공적 역할과 방향의 영역에서 드러납니다.",
  11: "공동체와 미래 비전의 영역에서 작동합니다.",
  12: "무의식과 내면 세계의 영역에서 흘러나옵니다.",
};

export type PlanetReading = {
  planetEn: PlanetName;
  planet: string;   // Korean
  sign: string;     // Korean
  house: number;
  retrograde: boolean;
  body: string;     // newline-separated paragraphs
};

export function getPlanetReadings(chart: NatalChart): PlanetReading[] {
  const ORDER: PlanetName[] = [
    "Sun", "Moon", "Mercury", "Venus", "Mars",
    "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
  ];
  return ORDER.map((pName) => {
    const p = chart.planets.find((x) => x.planet === pName)!;
    const pKo   = PLANET_KO[pName];
    const sKo   = SIGN_KO[p.sign];

    let mainLine: string;
    if (pName === "Sun")       mainLine = SUN_SUMMARY[p.sign];
    else if (pName === "Moon") mainLine = MOON_SUMMARY[p.sign];
    else {
      const note = PLANET_NOTES[pName][p.sign];
      mainLine = `${pKo}이 ${sKo}에 있습니다. ${note}.`;
    }

    const houseLine = `${p.house}영역 — ${HOUSE_DOMAIN[p.house]}`;
    const rxLine = p.retrograde
      ? `${pKo}이 역행 중입니다. 에너지가 외부보다 내면으로 향하며, 과거의 주제가 재처리됩니다.`
      : "";

    return {
      planetEn: pName,
      planet:   pKo,
      sign:     sKo,
      house:    p.house,
      retrograde: p.retrograde,
      body: [mainLine, houseLine, rxLine].filter(Boolean).join("\n"),
    };
  });
}

export { SIGN_KO, PLANET_KO, PLANET_NOTES };

// ── Life-domain lookup tables (Moon-sign keyed) ───────────────────────────────

type DomainNote = { headline: string; note: string };

const DOMAIN_NA: Record<SignName, DomainNote> = {
  Aries:       { headline: "직접 움직이는 날",         note: "에너지가 앞으로 나섭니다. 행동이 자아를 또렷하게 합니다." },
  Taurus:      { headline: "감각을 따르는 날",          note: "안정된 환경이 자아를 명확하게 드러냅니다." },
  Gemini:      { headline: "연결하고 탐색하는 날",      note: "다양한 방향에서 자신을 표현하는 에너지가 있습니다." },
  Cancer:      { headline: "내면이 앞서는 날",          note: "감정이 오늘의 자아 나침반이 됩니다." },
  Leo:         { headline: "존재감이 강한 날",          note: "자신을 표현하는 에너지가 높습니다." },
  Virgo:       { headline: "정밀하게 움직이는 날",      note: "디테일이 자아 표현의 재료가 됩니다." },
  Libra:       { headline: "관계 속에서 자신을 보는 날", note: "타인의 반응이 오늘의 자기 이해를 촉진합니다." },
  Scorpio:     { headline: "깊이가 드러나는 날",        note: "심층에서 자아가 움직입니다." },
  Sagittarius: { headline: "경계 밖을 탐색하는 날",    note: "익숙한 것을 넘어서는 에너지가 자아를 확장합니다." },
  Capricorn:   { headline: "목표로 향하는 날",          note: "결과와 방향 속에서 자아가 확인됩니다." },
  Aquarius:    { headline: "관습에서 벗어나는 날",      note: "독립적 관점이 자아를 또렷하게 합니다." },
  Pisces:      { headline: "경계가 부드러운 날",        note: "직관과 감수성 속에서 자아가 흐릅니다." },
};

const DOMAIN_RELATIONSHIP: Record<SignName, DomainNote> = {
  Aries:       { headline: "직접적 에너지가 관계에 흐릅니다",      note: "솔직한 접근이 오늘 관계를 움직입니다." },
  Taurus:      { headline: "안정이 연결을 만드는 날",               note: "신뢰를 천천히 쌓는 에너지가 있습니다." },
  Gemini:      { headline: "말과 연결이 활발한 날",                 note: "대화가 관계를 여는 열쇠입니다." },
  Cancer:      { headline: "감정이 관계를 이끄는 날",               note: "공감과 돌봄이 오늘의 연결 언어입니다." },
  Leo:         { headline: "존재감이 관계에 흐릅니다",              note: "진심 어린 인정이 연결을 강하게 합니다." },
  Virgo:       { headline: "세심함이 연결이 되는 날",               note: "작은 배려가 관계를 단단하게 합니다." },
  Libra:       { headline: "조화를 찾는 날",                        note: "균형과 공정함이 관계를 안정시킵니다." },
  Scorpio:     { headline: "깊은 연결이 가능한 날",                 note: "표면을 넘는 대화가 오늘 열립니다." },
  Sagittarius: { headline: "자유로운 에너지가 관계에 흐릅니다",    note: "열린 태도가 새로운 연결을 만듭니다." },
  Capricorn:   { headline: "신뢰 기반의 관계 에너지",               note: "구조와 책임이 관계를 견고하게 합니다." },
  Aquarius:    { headline: "공간이 연결이 되는 날",                 note: "독립성을 존중하는 방식이 오늘의 연결입니다." },
  Pisces:      { headline: "공명의 에너지가 흐릅니다",              note: "직관적 이해가 오늘 관계에서 작동합니다." },
};

const DOMAIN_ROUTINE: Record<SignName, DomainNote> = {
  Aries:       { headline: "빠르게 실행하는 날",          note: "계획보다 시작이 앞서는 에너지입니다." },
  Taurus:      { headline: "천천히 그러나 확실하게",       note: "지속 가능한 속도로 진행하세요." },
  Gemini:      { headline: "다방면에서 처리하는 날",       note: "여러 작업을 짧게 순환하는 방식이 유리합니다." },
  Cancer:      { headline: "내면 중심으로 일하는 날",      note: "집중이 필요한 혼자 작업에 좋은 환경입니다." },
  Leo:         { headline: "표현과 성취가 맞물리는 날",    note: "보이는 결과를 만드는 에너지가 높습니다." },
  Virgo:       { headline: "정밀도가 높은 날",             note: "세부 검토와 수정 작업에 유리합니다." },
  Libra:       { headline: "조율이 필요한 날",             note: "판단보다 협의가 오늘 더 효율적입니다." },
  Scorpio:     { headline: "집중력이 깊어지는 날",         note: "복잡한 문제를 파고드는 에너지가 있습니다." },
  Sagittarius: { headline: "큰 그림을 보는 날",           note: "전략적 사고가 세부를 앞섭니다." },
  Capricorn:   { headline: "효율과 구조의 날",             note: "우선순위를 정하고 순서대로 처리하세요." },
  Aquarius:    { headline: "새로운 방법을 시도하는 날",    note: "기존 방식을 벗어난 접근이 효과적입니다." },
  Pisces:      { headline: "직관이 앞서는 날",             note: "논리보다 감각이 방향을 이끕니다." },
};

const DOMAIN_EXPRESSION: Record<SignName, DomainNote> = {
  Aries:       { headline: "즉각적 표현의 에너지",       note: "말이 빠르고 직접적입니다. 편집은 나중에 하세요." },
  Taurus:      { headline: "신중한 언어의 날",            note: "말수는 적어도 핵심이 담깁니다." },
  Gemini:      { headline: "아이디어가 빠르게 흐르는 날", note: "다양한 연결이 활발합니다. 기록을 남기세요." },
  Cancer:      { headline: "감정이 언어에 스며드는 날",   note: "느낌 중심의 소통이 오늘 더 잘 전달됩니다." },
  Leo:         { headline: "표현이 강해지는 날",          note: "이야기하는 힘이 오늘 높습니다." },
  Virgo:       { headline: "정밀한 언어의 날",            note: "정확한 표현이 오해를 막습니다." },
  Libra:       { headline: "균형 잡힌 언어의 날",         note: "양면을 보는 사고가 오늘 작동합니다." },
  Scorpio:     { headline: "핵심을 파고드는 날",          note: "표면적 대화보다 깊은 통찰이 가능합니다." },
  Sagittarius: { headline: "광범위한 사고의 날",          note: "연결되지 않던 개념들이 이어집니다." },
  Capricorn:   { headline: "구조적 사고의 날",            note: "체계적 분석이 오늘의 강점입니다." },
  Aquarius:    { headline: "비선형적 아이디어의 날",      note: "패턴 밖의 해법이 오늘 떠오릅니다." },
  Pisces:      { headline: "유동적 사고의 날",            note: "직관적 흐름을 따르세요. 논리는 나중에 옵니다." },
};

const DOMAIN_INNER: Record<SignName, DomainNote> = {
  Aries:       { headline: "감정이 빠르게 움직이는 날",       note: "충동적 반응에 주의하되, 에너지를 방향으로 전환하세요." },
  Taurus:      { headline: "안정을 찾는 내면의 날",            note: "고요함이 내면을 회복시킵니다." },
  Gemini:      { headline: "감정이 가변적인 날",               note: "다양한 감정이 교차합니다. 중심을 유지하세요." },
  Cancer:      { headline: "감정의 깊이가 드러나는 날",        note: "내면의 필요를 인식하고 공간을 만드세요." },
  Leo:         { headline: "감정이 풍성한 날",                 note: "감정을 표현하는 것이 오늘 내면을 정리합니다." },
  Virgo:       { headline: "내면을 정리하는 날",               note: "감정을 분류하고 이해하는 에너지가 있습니다." },
  Libra:       { headline: "내면이 균형을 찾는 날",            note: "갈등보다 조화를 향해 내면이 움직입니다." },
  Scorpio:     { headline: "내면이 깊어지는 날",               note: "표면 아래의 감정이 활성화됩니다. 천천히 탐색하세요." },
  Sagittarius: { headline: "자유를 원하는 내면의 날",         note: "넓은 관점이 감정적 부담을 줄입니다." },
  Capricorn:   { headline: "내면이 절제되는 날",               note: "방향과 구조가 감정을 안정시킵니다." },
  Aquarius:    { headline: "감정적 거리의 날",                 note: "분리는 냉담이 아닙니다. 필요한 공간입니다." },
  Pisces:      { headline: "감수성이 높은 날",                 note: "외부 영향을 흡수하기 쉽습니다. 경계를 의식하세요." },
};

// Compatible element pairings:
// fire↔fire, earth↔earth, air↔air, water↔water → strength
// fire↔air, earth↔water → strength (classical trine/sextile affinity)
// all other cross-element → challenge
type Element = "불" | "흙" | "공기" | "물";

function elementHarmony(e1: Element, e2: Element): "strength" | "challenge" | "neutral" {
  if (e1 === e2) return "strength";
  if ((e1 === "불" && e2 === "공기") || (e1 === "공기" && e2 === "불")) return "strength";
  if ((e1 === "흙" && e2 === "물") || (e1 === "물" && e2 === "흙")) return "strength";
  if ((e1 === "불" && e2 === "흙") || (e1 === "흙" && e2 === "불")) return "neutral";
  return "challenge";
}

// ── Domain rule engine ────────────────────────────────────────────────────────

/** Short status label per domain × tone — shared by DomainReading and DomainDetail */
const DOMAIN_STATUS: Record<string, Record<"strength"|"challenge"|"neutral", string>> = {
  love:    { strength: "관계의 흐름이 열립니다",      challenge: "감정이 앞서기 쉬운 날",        neutral: "관계에 조용한 변화가 있습니다" },
  friends: { strength: "소통이 자연스럽게 흐릅니다",  challenge: "말보다 분위기가 먼저 엇갈립니다", neutral: "연결에 조용한 조정이 있습니다" },
  work:    { strength: "방향이 선명한 날",            challenge: "집중이 흩어지기 쉬운 날",      neutral: "흐름을 점검하기 좋은 날" },
  family:  { strength: "익숙한 연결이 따뜻해집니다",  challenge: "익숙한 감정이 다시 올라오는 날", neutral: "정서 리듬에 변화가 있습니다" },
  self:    { strength: "자아 에너지가 선명한 날",     challenge: "정체성에 압력이 걸립니다",     neutral: "자기 방향을 탐색하는 날" },
};

/** Planets that govern each domain, in priority order */
const DOMAIN_PLANETS: Record<string, PlanetName[]> = {
  "관계":    ["Venus", "Mars", "Moon"],
  "사고·표현": ["Mercury", "Moon", "Uranus"],
  "루틴·일":  ["Saturn", "Mercury", "Sun", "Mars"],
  "감정·내면": ["Moon", "Saturn"],
  "나":      ["Sun", "Mars"],
};

/** Headline: keyed by [element][tone] — varies per user's natal planet element */
const ELEMENT_HEADLINE: Record<string, Record<"불"|"흙"|"공기"|"물", Record<string, string>>> = {
  "관계": {
    "불": { strength: "열정이 관계를 이끄는 날", challenge: "충동이 관계에 마찰을 만듭니다", neutral: "관계에 활기찬 변화가 있습니다" },
    "흙": { strength: "신뢰가 관계의 토대를 다집니다", challenge: "고집이 연결을 막을 수 있습니다", neutral: "관계에 실질적 변화가 있습니다" },
    "공기": { strength: "대화가 관계를 열어줍니다", challenge: "과잉 분석이 관계를 냉각시킵니다", neutral: "관계에 새로운 관점이 필요합니다" },
    "물": { strength: "감성적 연결이 깊어지는 날", challenge: "감정의 파도가 관계를 흔듭니다", neutral: "관계에서 직관이 중요합니다" },
  },
  "사고·표현": {
    "불": { strength: "활기찬 아이디어가 쏟아집니다", challenge: "섣부른 말이 오해를 낳을 수 있습니다", neutral: "표현에 새로운 시도가 있습니다" },
    "흙": { strength: "실용적 소통이 결과를 만듭니다", challenge: "경직된 시각이 소통을 막습니다", neutral: "신중한 표현이 필요한 날" },
    "공기": { strength: "소통이 물 흐르듯 자연스럽습니다", challenge: "정보 과부하로 판단이 흐려집니다", neutral: "다양한 관점을 탐색하는 날" },
    "물": { strength: "직관적 통찰이 말에 실립니다", challenge: "감정이 논리적 표현을 방해합니다", neutral: "내면의 언어에 귀 기울이는 날" },
  },
  "루틴·일": {
    "불": { strength: "추진력이 업무를 가속합니다", challenge: "조급함이 실수를 유발할 수 있습니다", neutral: "새로운 방향을 시도하기 좋은 날" },
    "흙": { strength: "꾸준함이 성과를 만드는 날", challenge: "과도한 완벽주의가 진행을 막습니다", neutral: "루틴을 점검하고 정비하는 날" },
    "공기": { strength: "유연한 접근이 업무를 풀어줍니다", challenge: "집중력 분산에 주의하세요", neutral: "협업과 아이디어 교환이 유익합니다" },
    "물": { strength: "직감이 업무의 방향을 잡아줍니다", challenge: "감정 기복이 집중력에 영향을 줍니다", neutral: "흐름을 느끼며 유연하게 진행하세요" },
  },
  "감정·내면": {
    "불": { strength: "내면의 열정이 방향을 밝힙니다", challenge: "감정이 과열되어 판단을 흐릅니다", neutral: "내면에서 새로운 동력이 싹틉니다" },
    "흙": { strength: "내면의 안정감이 회복됩니다", challenge: "감정을 눌러두면 오히려 더 커집니다", neutral: "현실 기반에서 감정을 점검하세요" },
    "공기": { strength: "감정을 명확히 이해하는 날", challenge: "지나친 합리화가 감정을 막습니다", neutral: "내면의 목소리를 언어화해보세요" },
    "물": { strength: "감수성이 내면을 깊이 적십니다", challenge: "감정의 경계가 흐릿해질 수 있습니다", neutral: "직관과 감정이 교차하는 날" },
  },
  "나": {
    "불": { strength: "자아가 선명하게 빛나는 날", challenge: "자기중심성이 갈등을 만듭니다", neutral: "정체성의 새로운 면이 드러납니다" },
    "흙": { strength: "자신의 가치가 확인되는 날", challenge: "완고함이 성장을 막을 수 있습니다", neutral: "실질적 자기 점검이 필요합니다" },
    "공기": { strength: "자아 표현이 자유롭게 흐릅니다", challenge: "방향성 없는 에너지가 분산됩니다", neutral: "다양한 자아 면모를 탐색하는 날" },
    "물": { strength: "내면과 외면이 조화롭게 연결됩니다", challenge: "외부 영향에 자아가 흔들릴 수 있습니다", neutral: "감성이 자아를 색칠하는 날" },
  },
};

// ── Headline variant pools (moonDegInSign % 3 selects variant) ────────────────
// Variant 0 = same text as ELEMENT_HEADLINE; variants 1–2 provide daily rotation.
// Using Moon degree as selector: Moon travels ~13°/day so consecutive dates in the
// same sign get different variants without introducing any randomness.

const ELEMENT_HEADLINE_ALTS: Record<string, Record<string, Record<string, [string, string, string]>>> = {
  "관계": {
    "불": {
      strength:  ["열정이 관계를 이끄는 날", "활기찬 에너지가 관계를 살립니다", "행동이 관계를 깨우는 날"],
      challenge: ["충동이 관계에 마찰을 만듭니다", "강한 에너지가 관계를 압박합니다", "마찰 속에서 관계가 시험받습니다"],
      neutral:   ["관계에 활기찬 변화가 있습니다", "관계에 새로운 흐름이 시작됩니다", "관계의 방향이 바뀌고 있습니다"],
    },
    "흙": {
      strength:  ["신뢰가 관계의 토대를 다집니다", "꾸준한 관심이 관계를 단단하게 합니다", "안정이 오늘 연결의 기초가 됩니다"],
      challenge: ["고집이 연결을 막을 수 있습니다", "완고함이 관계의 유연성을 막습니다", "변화에 저항하면 연결이 끊깁니다"],
      neutral:   ["관계에 실질적 변화가 있습니다", "관계에서 실질적 점검이 필요합니다", "신중한 접근이 오늘 관계를 지킵니다"],
    },
    "공기": {
      strength:  ["대화가 관계를 열어줍니다", "열린 소통이 오늘 관계를 열어줍니다", "지적 연결이 감정을 강화합니다"],
      challenge: ["과잉 분석이 관계를 냉각시킵니다", "분석이 감정을 밀어낼 수 있습니다", "머릿속에만 있는 관계는 식어갑니다"],
      neutral:   ["관계에 새로운 관점이 필요합니다", "관계에 새로운 시각이 들어옵니다", "가벼운 대화가 오늘의 시작점입니다"],
    },
    "물": {
      strength:  ["감성적 연결이 깊어지는 날", "공감이 오늘 관계를 깊게 합니다", "말 없이도 연결되는 에너지가 있습니다"],
      challenge: ["감정의 파도가 관계를 흔듭니다", "감정이 관계의 경계를 흐릿하게 합니다", "감정 파동이 오늘 관계에 영향을 줍니다"],
      neutral:   ["관계에서 직관이 중요합니다", "직관이 관계의 방향을 가리킵니다", "느낌을 신뢰하며 연결에 다가가세요"],
    },
  },
  "사고·표현": {
    "불": {
      strength:  ["활기찬 아이디어가 쏟아집니다", "빠른 생각이 오늘 강점입니다", "표현 에너지가 높아지는 날"],
      challenge: ["섣부른 말이 오해를 낳을 수 있습니다", "충동적 발언이 오해를 만들 수 있습니다", "말보다 듣는 것이 오늘 유리합니다"],
      neutral:   ["표현에 새로운 시도가 있습니다", "새로운 표현 방식을 탐색하는 날", "아이디어를 행동으로 연결하세요"],
    },
    "흙": {
      strength:  ["실용적 소통이 결과를 만듭니다", "명확한 언어가 오늘 결과를 만듭니다", "신중한 표현이 신뢰를 쌓습니다"],
      challenge: ["경직된 시각이 소통을 막습니다", "고집스러운 언어가 소통을 막습니다", "다른 관점을 수용하는 유연성이 필요합니다"],
      neutral:   ["신중한 표현이 필요한 날", "말의 무게를 의식하는 날", "구체적 표현이 오늘 효과적입니다"],
    },
    "공기": {
      strength:  ["소통이 물 흐르듯 자연스럽습니다", "아이디어가 자유롭게 흐릅니다", "열린 사고가 새로운 통찰을 만듭니다"],
      challenge: ["정보 과부하로 판단이 흐려집니다", "방향이 너무 많아 집중이 어렵습니다", "핵심에 집중하는 것이 오늘 중요합니다"],
      neutral:   ["다양한 관점을 탐색하는 날", "다양한 방향을 탐색하고 정리하는 날", "대화가 오늘 생각을 명확하게 합니다"],
    },
    "물": {
      strength:  ["직관적 통찰이 말에 실립니다", "감성적 표현이 깊은 공명을 만듭니다", "직관이 말에 힘을 실어줍니다"],
      challenge: ["감정이 논리적 표현을 방해합니다", "감정과 논리 사이에서 균형이 필요합니다", "과민한 반응이 소통을 복잡하게 합니다"],
      neutral:   ["내면의 언어에 귀 기울이는 날", "내면의 언어를 꺼내보는 날", "느낌을 언어화하는 시도가 유익합니다"],
    },
  },
  "루틴·일": {
    "불": {
      strength:  ["추진력이 업무를 가속합니다", "에너지가 업무를 이끄는 날", "새로운 프로젝트를 시작하기 좋습니다"],
      challenge: ["조급함이 실수를 유발할 수 있습니다", "빠름보다 정확함이 오늘 중요합니다", "충동적 결정이 나중에 수정 작업을 만듭니다"],
      neutral:   ["새로운 방향을 시도하기 좋은 날", "루틴에 작은 변화를 주는 날", "에너지를 집중할 목표를 정하세요"],
    },
    "흙": {
      strength:  ["꾸준함이 성과를 만드는 날", "체계적 접근이 오늘 성과를 만듭니다", "신뢰할 수 있는 결과가 만들어집니다"],
      challenge: ["과도한 완벽주의가 진행을 막습니다", "'충분히 좋은 것'을 인정하는 것도 필요합니다", "완성에 집중하는 것이 오늘의 과제입니다"],
      neutral:   ["루틴을 점검하고 정비하는 날", "지속 가능한 속도가 오늘의 원칙입니다", "불필요한 것을 정리하는 날"],
    },
    "공기": {
      strength:  ["유연한 접근이 업무를 풀어줍니다", "협업이 오늘 특히 효과적입니다", "유연한 접근이 막혔던 것을 풀어줍니다"],
      challenge: ["집중력 분산에 주의하세요", "산만함이 오늘 가장 큰 도전입니다", "하나의 작업에 집중하는 의도가 필요합니다"],
      neutral:   ["협업과 아이디어 교환이 유익합니다", "소통이 오늘 업무의 핵심입니다", "아이디어를 교환하고 방향을 정하세요"],
    },
    "물": {
      strength:  ["직감이 업무의 방향을 잡아줍니다", "흐름을 느끼며 일할 때 효율이 높아집니다", "내면의 신호를 따르는 것이 현명합니다"],
      challenge: ["감정 기복이 집중력에 영향을 줍니다", "감정과 업무 사이의 경계가 필요합니다", "무드에 따라 결정하지 마세요"],
      neutral:   ["흐름을 느끼며 유연하게 진행하세요", "직관과 계획을 함께 활용하세요", "내면의 리듬에 맞게 속도를 조율하세요"],
    },
  },
  "감정·내면": {
    "불": {
      strength:  ["내면의 열정이 방향을 밝힙니다", "감정이 선명하고 방향이 됩니다", "내면의 불씨가 새로운 흐름을 만듭니다"],
      challenge: ["감정이 과열되어 판단을 흐릅니다", "충동적 반응보다 잠시의 여유가 도움됩니다", "강한 감정이 옳은 방향을 가리는 경우가 있습니다"],
      neutral:   ["내면에서 새로운 동력이 싹틉니다", "작은 열망이 방향을 가리키고 있습니다", "감정 에너지를 창의적으로 표현하세요"],
    },
    "흙": {
      strength:  ["내면의 안정감이 회복됩니다", "자기 돌봄이 오늘 특히 효과적입니다", "내면의 필요를 명확히 인식하는 날"],
      challenge: ["감정을 눌러두면 오히려 더 커집니다", "안전하다고 느껴지는 자리에서 감정을 천천히 풀어보세요", "표현하지 못한 감정이 쌓여 있을 수 있습니다"],
      neutral:   ["현실 기반에서 감정을 점검하세요", "안정된 환경이 내면 회복에 도움됩니다", "작은 자기 돌봄이 오늘 의미 있습니다"],
    },
    "공기": {
      strength:  ["감정을 명확히 이해하는 날", "자기 이해가 깊어지는 날", "내면을 언어로 표현하는 것이 치유가 됩니다"],
      challenge: ["지나친 합리화가 감정을 막습니다", "분석보다 경험이 오늘 필요합니다", "느껴지는 감정을 밀어내지 마세요"],
      neutral:   ["내면의 목소리를 언어화해보세요", "감정 일기나 기록이 오늘 도움됩니다", "생각과 감정을 구분하는 연습을 하세요"],
    },
    "물": {
      strength:  ["감수성이 내면을 깊이 적십니다", "자신의 감정과 진실하게 연결됩니다", "공감 능력이 오늘 자기 이해로 이어집니다"],
      challenge: ["감정의 경계가 흐릿해질 수 있습니다", "외부 감정을 자신의 것으로 흡수하지 않도록 하세요", "이 감정이 나의 것인지 구분하세요"],
      neutral:   ["직관과 감정이 교차하는 날", "자신의 리듬을 따르는 것이 오늘 현명합니다", "조용한 시간이 내면을 회복시킵니다"],
    },
  },
};

// ── Richer domain status labels: keyed by (domainKey × tone × lead transit planet) ──
// "_" is the fallback when no specific planet key matches.
// This replaces the 3-label DOMAIN_STATUS for the home screen, giving 3–5× more variety.

const DOMAIN_STATUS_RICH: Record<string, Record<string, Record<string, string>>> = {
  love: {
    strength: {
      Venus:   "금성 상승 · 연애",
      Jupiter: "목성 행운 · 연애",
      Moon:    "달이 연애를 열다",
      Sun:     "태양 에너지 · 연애",
      _:       "연애에 힘이 붙는 날",
    },
    challenge: {
      Saturn:  "토성 긴장 · 연애",
      Mars:    "화성 마찰 · 연애",
      Pluto:   "심층 변화 · 연애",
      Moon:    "감정 파동 · 연애",
      _:       "연애 주의 필요",
    },
    neutral: {
      Mercury: "소통이 열쇠 · 연애",
      Sun:     "안정된 연애 흐름",
      _:       "연애 흐름 안정",
    },
  },
  friends: {
    strength: {
      Mercury: "수성 흐름 · 소통",
      Jupiter: "아이디어 확장",
      Venus:   "따뜻한 연결",
      Moon:    "직관이 말한다",
      Sun:     "자아 표현 상승",
      _:       "말과 생각이 살아나는 날",
    },
    challenge: {
      Saturn:  "토성 긴장 · 소통",
      Mars:    "날카로운 교류",
      Pluto:   "심층 변화 · 사고",
      _:       "소통 주의 필요",
    },
    neutral: {
      Mercury: "안정된 사고 흐름",
      _:       "사고 흐름 안정",
    },
  },
  work: {
    strength: {
      Jupiter: "목성 확장 · 업무",
      Sun:     "강한 업무 에너지",
      Mars:    "추진력 상승",
      Venus:   "원활한 업무 흐름",
      Saturn:  "구조적 진전",
      _:       "일에 힘이 붙는 날",
    },
    challenge: {
      Saturn:  "토성 속도 조절",
      Mars:    "업무 마찰 주의",
      Pluto:   "권력 구조 변화",
      _:       "업무 주의 필요",
    },
    neutral: {
      Mercury: "안정된 업무 신호",
      _:       "업무 흐름 안정",
    },
  },
  family: {
    strength: {
      Moon:    "내면 명료",
      Venus:   "내면 따뜻함",
      Jupiter: "내면 확장",
      Saturn:  "안정된 내면",
      _:       "감정이 또렷해지는 날",
    },
    challenge: {
      Saturn:  "내면 무게감",
      Moon:    "감정 파동",
      Mars:    "내면 긴장",
      Pluto:   "심층 내면 변화",
      _:       "감정 주의 필요",
    },
    neutral: {
      Moon:    "잔잔한 내면 조류",
      _:       "감정 흐름 안정",
    },
  },
  self: {
    strength: {
      Sun:     "자아가 또렷해지는 날",
      Jupiter: "자기 신뢰 상승",
      Mars:    "강한 드라이브",
      Venus:   "자아 매력 상승",
      _:       "자아가 또렷해지는 날",
    },
    challenge: {
      Saturn:  "정체성 시험",
      Mars:    "에너지 마찰",
      Pluto:   "자아 심층 탐구",
      _:       "정체성 주의 필요",
    },
    neutral: {
      _: "자아 흐름 안정",
    },
  },
};

// ── Transit-driven domain headline: overrides element headline when a tight transit is active ──
// Keyed by [internalDomain][transitPlanet][tone] → 3-variant pool
// Applied when lead aspect orb ≤ 3°, making the home preview specific to today's planet signal.
const DOMAIN_TRANSIT_HEADLINE: Record<string, Partial<Record<PlanetName, Record<"strength"|"challenge"|"neutral", [string, string, string]>>>> = {
  "관계": {
    Venus: {
      strength:  ["금성이 오늘 관계의 에너지를 열어줍니다", "연결과 매력이 흐르는 날", "금성이 활성화됩니다. 관계에서 빛나는 하루"],
      challenge: ["금성의 긴장이 관계에 질문을 던집니다", "원하는 것과 현실 사이 — 균형을 찾는 날", "관계 에너지에서 명확함이 필요합니다"],
      neutral:   ["금성이 관계에 조용히 흐릅니다", "연결의 에너지가 잔잔하게 있습니다", "관계에서 금성의 흐름을 느껴보세요"],
    },
    Mars: {
      strength:  ["화성이 관계에 행동 에너지를 불어넣습니다", "행동으로 관계를 움직이는 날", "열정과 추진력이 관계를 깨웁니다"],
      challenge: ["화성이 관계에 마찰을 만들고 있습니다", "충동보다 의도로 관계를 이끄는 날", "긴장이 오늘 관계의 시험대입니다"],
      neutral:   ["화성 에너지가 관계에 흐릅니다", "관계에서 행동 신호가 감지됩니다", "화성이 관계의 방향을 가리킵니다"],
    },
    Moon: {
      strength:  ["달이 오늘 감정적 연결을 열어줍니다", "내면의 파장이 관계를 부드럽게 합니다", "감정이 관계와 자연스럽게 연결됩니다"],
      challenge: ["달의 파동이 관계에 영향을 줍니다", "감정 기복이 관계에 반영되는 날", "내면의 긴장이 관계 표면에 나타납니다"],
      neutral:   ["달이 관계에 조용한 흐름을 만듭니다", "감정의 조수가 관계 에너지를 조율합니다", "달의 흐름이 관계에 스며듭니다"],
    },
    Saturn: {
      strength:  ["토성이 관계에 진지한 에너지를 더합니다", "관계에서 구조와 신뢰가 강화됩니다", "책임이 관계를 단단하게 만드는 날"],
      challenge: ["토성이 관계에 현실적 무게를 올려놓습니다", "관계에서 책임과 경계가 시험받습니다", "토성의 긴장 — 관계의 현실을 직면하는 날"],
      neutral:   ["토성이 관계에 안정적 흐름을 만듭니다", "관계에서 현실적 점검이 유익합니다", "구조가 관계를 지지하는 날"],
    },
    Jupiter: {
      strength:  ["목성이 오늘 관계 에너지를 확장합니다", "사랑과 연결에 행운의 흐름이 있습니다", "관계가 넓어지는 목성의 날"],
      challenge: ["목성의 과잉이 관계 기대를 높입니다", "큰 기대와 현실 사이 균형이 필요합니다", "관계에서 과잉 확장의 유혹이 있습니다"],
      neutral:   ["목성이 관계의 가능성을 열어줍니다", "관계에서 새로운 가능성을 탐색하는 날", "목성의 흐름이 관계에 스며듭니다"],
    },
  },
  "사고·표현": {
    Mercury: {
      strength:  ["수성이 오늘 언어와 연결을 활성화합니다", "사고와 소통이 날카롭게 작동하는 날", "수성의 흐름 — 말이 힘을 갖는 날"],
      challenge: ["수성의 긴장이 소통에 주의를 요청합니다", "말하기 전 의도를 확인해야 하는 날", "소통의 마찰 — 핵심에 집중하세요"],
      neutral:   ["수성이 오늘 꾸준히 흐릅니다", "안정된 사고 에너지가 있는 날", "수성의 조용한 흐름 속에 있습니다"],
    },
    Mars: {
      strength:  ["화성이 사고에 날카로운 에너지를 더합니다", "빠른 결정과 표현이 가능한 날", "화성의 드라이브가 언어를 활성화합니다"],
      challenge: ["화성이 소통에 마찰을 만들고 있습니다", "충동적 발언이 오해를 만들 수 있는 날", "강한 에너지 — 말의 방향이 중요합니다"],
      neutral:   ["화성이 사고에 에너지를 불어넣습니다", "행동 에너지가 표현으로 이어지는 날", "화성의 흐름이 언어에 힘을 줍니다"],
    },
    Saturn: {
      strength:  ["토성이 언어에 무게와 신중함을 더합니다", "신중한 표현이 신뢰를 만드는 날", "구조적 사고가 소통을 명확하게 합니다"],
      challenge: ["토성이 표현을 억제하거나 무겁게 합니다", "말과 생각 사이에 저항이 있는 날", "소통의 구조에 긴장이 있습니다"],
      neutral:   ["토성이 사고에 안정적 흐름을 만듭니다", "신중하고 체계적인 표현이 유익합니다", "토성의 흐름이 언어를 지지합니다"],
    },
  },
  "루틴·일": {
    Saturn: {
      strength:  ["토성이 오늘 업무에 구조를 지지합니다", "체계적 접근이 성과를 만드는 날", "토성의 안정 에너지 — 기반이 단단합니다"],
      challenge: ["토성이 업무에 현실적 한계를 올려놓습니다", "저항이 있는 날 — 기본에 집중하면 풀립니다", "구조의 마찰이 업무를 시험합니다"],
      neutral:   ["토성이 업무에 안정적 흐름을 만듭니다", "꾸준함이 오늘의 전략입니다", "토성의 흐름이 업무를 지지합니다"],
    },
    Jupiter: {
      strength:  ["목성이 오늘 업무 에너지를 확장합니다", "성장과 가능성이 업무에 흐릅니다", "목성의 날 — 크게 생각하고 행동하세요"],
      challenge: ["목성의 과잉이 업무에 산만함을 만듭니다", "큰 그림이 세부를 가릴 수 있는 날", "확장의 유혹 — 현실적 점검이 필요합니다"],
      neutral:   ["목성이 업무의 가능성을 조용히 확장합니다", "업무에서 새로운 방향이 감지됩니다", "목성의 흐름이 업무에 스며듭니다"],
    },
    Mars: {
      strength:  ["화성이 업무에 강한 추진력을 더합니다", "행동 에너지가 높아지는 날", "화성의 드라이브 — 지금 실행하세요"],
      challenge: ["화성의 마찰이 업무에 긴장을 만듭니다", "조급함이 실수를 유발할 수 있는 날", "에너지 방향이 중요합니다 — 지금 확인하세요"],
      neutral:   ["화성이 업무에 에너지를 더합니다", "행동 신호가 업무에 감지됩니다", "화성의 흐름이 업무를 이끕니다"],
    },
    Sun: {
      strength:  ["태양 에너지가 업무를 밝힙니다", "의지와 집중이 업무를 이끄는 날", "강한 자아 에너지가 업무를 지지합니다"],
      challenge: ["자아 에너지와 업무 구조 사이 긴장이 있습니다", "방향 점검이 필요한 날", "집중이 분산될 수 있는 날 — 핵심을 잡으세요"],
      neutral:   ["태양이 업무에 안정적 에너지를 줍니다", "꾸준한 집중이 오늘의 전략입니다", "태양의 흐름이 업무를 지지합니다"],
    },
  },
  "감정·내면": {
    Moon: {
      strength:  ["달이 오늘 내면의 감정을 크게 열어놓습니다", "감정이 선명하고 깊어지는 날", "달의 에너지가 내면을 활성화합니다"],
      challenge: ["달의 파동이 내면을 흔들고 있습니다", "감정이 크게 올라오는 날 — 천천히 받아들이세요", "내면의 파도 — 균형이 오늘의 과제입니다"],
      neutral:   ["달이 내면에 조용한 흐름을 만듭니다", "내면의 조수가 오늘 잔잔합니다", "달의 흐름이 내면을 부드럽게 이끕니다"],
    },
    Saturn: {
      strength:  ["토성이 내면에 안정과 구조를 더합니다", "감정이 차분하고 명확해지는 날", "내면의 기반이 단단해지는 날"],
      challenge: ["토성이 감정에 무게감을 올려놓습니다", "내면의 책임감이 감정과 교차합니다", "감정을 억압하기보다 직면하는 것이 필요합니다"],
      neutral:   ["토성이 내면에 현실적 흐름을 만듭니다", "감정과 현실 사이 균형을 찾는 날", "토성의 흐름이 내면을 안정시킵니다"],
    },
    Pluto: {
      strength:  ["명왕성이 내면의 심층 에너지를 활성화합니다", "오래된 패턴이 표면으로 올라오는 날", "심층 변환 에너지가 내면을 움직입니다"],
      challenge: ["명왕성의 압력이 내면을 강하게 자극합니다", "통제할 수 없는 것이 드러나는 날", "내면의 깊은 긴장 — 저항보다 인정이 필요합니다"],
      neutral:   ["명왕성이 내면에 조용히 흐릅니다", "심층 에너지가 잔잔하게 감지됩니다", "명왕성의 흐름이 내면을 이끕니다"],
    },
    Venus: {
      strength:  ["금성이 내면에 따뜻함을 더합니다", "자기 돌봄과 감정적 충만함의 날", "내면이 아름답게 열리는 날"],
      challenge: ["금성의 긴장이 감정 욕구를 시험합니다", "원하는 것과 현실 사이 내면 조율이 필요합니다", "감정 기대와 현실 사이 균형을 찾는 날"],
      neutral:   ["금성이 내면에 부드러운 흐름을 만듭니다", "자기 돌봄 에너지가 오늘 있습니다", "금성의 흐름이 내면을 지지합니다"],
    },
  },
  "나": {
    Sun: {
      strength:  ["태양이 자아를 강하게 비춥니다", "에너지와 의지가 높아지는 날", "자아가 선명하게 드러나는 하루"],
      challenge: ["태양의 긴장이 자아를 시험합니다", "에너지와 저항이 마주치는 날", "방향을 점검해야 하는 날입니다"],
      neutral:   ["태양이 자아에 안정적으로 흐릅니다", "꾸준한 에너지가 자아를 지지합니다", "태양의 흐름이 오늘 조용합니다"],
    },
    Mars: {
      strength:  ["화성이 자아에 강한 드라이브를 더합니다", "행동 에너지와 의지가 하나가 됩니다", "추진력이 자아를 이끄는 날"],
      challenge: ["화성이 자아에 마찰 에너지를 만듭니다", "충동과 방향 사이 — 선택이 필요합니다", "강한 에너지를 의식적으로 조율하는 날"],
      neutral:   ["화성이 자아에 흐릅니다", "행동 에너지가 자아에 감지됩니다", "화성의 흐름이 자아를 이끕니다"],
    },
    Jupiter: {
      strength:  ["목성이 자아에 확장 에너지를 더합니다", "성장과 가능성이 자아에 흐릅니다", "자기 신뢰가 높아지는 목성의 날"],
      challenge: ["목성의 과잉이 자아를 팽창시킵니다", "큰 기대와 현실 사이 균형이 필요합니다", "과잉 확장의 유혹 — 현실 점검이 필요합니다"],
      neutral:   ["목성이 자아에 조용히 흐릅니다", "자아에서 성장 에너지가 감지됩니다", "목성의 흐름이 자아를 지지합니다"],
    },
  },
};

// ── Natal-planet DO / DON'T pools (for transit-aware home screen copy) ─────────
// Selected deterministically: seed = (day*7 + month*11 + natalPlanetIdx*13 + transitPlanetIdx*17)

const NATAL_PLANET_DO: Record<PlanetName, string[]> = {
  Sun:     ["자신이 원하는 것을 솔직히 표현하기", "중요한 결정에서 주도권 잡기", "에너지를 창의적으로 쏟기", "원하는 방향을 선언하기"],
  Moon:    ["감정에 정직하게 반응하기", "내면의 신호를 신뢰하기", "가까운 사람과 진솔하게 연결하기", "감정을 기록하거나 표현하기"],
  Mercury: ["명확하게 소통하기", "중요한 대화 먼저 시작하기", "아이디어를 행동으로 연결하기", "미뤄온 메시지 보내기"],
  Venus:   ["관계에서 먼저 다가가기", "감사를 직접 표현하기", "연결하고 싶은 사람에게 손 내밀기", "아름다운 것에 시간 쓰기"],
  Mars:    ["결단력 있게 행동하기", "에너지를 하나의 목표에 집중하기", "미뤄온 행동 시작하기", "필요한 경계 설정하기"],
  Jupiter: ["큰 그림을 신뢰하기", "새로운 기회를 열린 마음으로 보기", "배우거나 탐색하기", "낙관적 에너지 유지하기"],
  Saturn:  ["책임 있는 선택하기", "장기적 관점으로 결정하기", "기초를 단단히 다지기", "중요한 일에만 집중하기"],
  Uranus:  ["틀을 벗어난 해결책 탐색하기", "직관적 통찰을 신뢰하기", "변화를 저항하지 않기", "예상과 다른 방향 시도하기"],
  Neptune: ["창의성을 자유롭게 표현하기", "공감으로 연결하기", "직관을 나침반으로 사용하기", "영감이 오는 활동 하기"],
  Pluto:   ["변화를 받아들이기", "깊이 있는 것에 집중하기", "두려운 것을 정면으로 보기", "오래된 패턴 내려놓기"],
};

const NATAL_PLANET_DONT: Record<PlanetName, string[]> = {
  Sun:     ["자아를 과도하게 주장하기", "충동적으로 결정하기", "인정에 집착하기", "에너지를 여러 방향에 분산하기"],
  Moon:    ["감정적으로 즉각 반응하기", "과거 패턴 반복하기", "감정 기복에 휩쓸리기", "방어적으로 행동하기"],
  Mercury: ["섣부른 판단 내리기", "중요한 합의 서두르기", "확인 없이 정보 공유하기", "과잉 분석으로 결정 미루기"],
  Venus:   ["관계에서 무리하게 요구하기", "감정적 소비", "비교나 질투에 빠지기", "기대에 집착하기"],
  Mars:    ["충동적으로 행동하기", "갈등을 직접 대결로 풀기", "화를 즉각 표출하기", "에너지를 과소비하기"],
  Jupiter: ["과도한 낙관으로 리스크 무시하기", "과잉 확장하기", "현실을 외면한 계획 세우기", "한계를 무시하기"],
  Saturn:  ["완벽주의로 진행을 막기", "경직된 규칙에 집착하기", "두려움으로 행동 멈추기", "기준을 지나치게 높이기"],
  Uranus:  ["예측 불가한 변화 강행하기", "돌발 행동하기", "일관성 무시하기", "안정을 갑자기 깨뜨리기"],
  Neptune: ["현실 도피하기", "경계 없이 타인 에너지 흡수하기", "희망적 사고로 판단 흐리기", "책임을 회피하기"],
  Pluto:   ["통제 욕구 강행하기", "지나친 집착", "변화를 억지로 막기", "집착적으로 분석하기"],
};

// ── Transit × natal cross DO: more signal-specific than natal-only pool ────────
// Keyed by [transitPlanet][natalPlanet] — picked before NATAL_PLANET_DO when available.
const TRANSIT_CROSS_DO: Partial<Record<PlanetName, Partial<Record<PlanetName, string[]>>>> = {
  Venus: {
    Sun:     ["자신의 매력을 자연스럽게 표현하기", "좋아하는 사람에게 먼저 손 내밀기", "창의적 표현으로 자아를 드러내기", "오늘 자신감 있게 연결하기"],
    Moon:    ["감정을 따뜻하게 표현하기", "가까운 사람과 감정 나누기", "관계에서 감사 말로 전달하기", "내면의 따뜻함을 관계로 흘려보내기"],
    Mars:    ["관심 있는 사람에게 직접 다가가기", "열정을 관계 에너지로 전환하기", "원하는 연결을 위해 행동하기", "매력과 행동을 하나로 연결하기"],
    Mercury: ["감정을 솔직하게 언어로 표현하기", "아름다운 말로 관계 여는 날", "따뜻한 메시지 먼저 보내기", "말로 감사 전달하기"],
    Saturn:  ["관계에서 진지한 대화 시작하기", "오래된 관계에서 감사 표현하기", "관계에 책임 있는 말 하기", "관계에서 신뢰 쌓는 행동하기"],
    Jupiter: ["새로운 연결 가능성 열기", "이미 있는 관계에 감사 표현하기", "관계에서 관대함 표현하기", "좋아하는 마음을 아끼지 않고 표현하기"],
  },
  Mars: {
    Sun:     ["에너지를 하나의 목표에 집중하기", "오늘 미뤄온 결단 내리기", "행동으로 의지 증명하기", "강한 에너지로 시작하기"],
    Moon:    ["감정이 이끄는 방향으로 움직이기", "깊이 느낀 후 행동하기", "에너지를 소중한 것에 쏟기", "충동이 아닌 감정 신호를 따르기"],
    Mercury: ["빠른 결정이 필요한 일 처리하기", "생각을 즉각 행동으로 연결하기", "망설이던 연락 먼저 시작하기", "언어를 행동과 연결하기"],
    Saturn:  ["저항을 에너지로 전환하기", "해야 할 것을 먼저 처리하기", "미뤄온 책임 완수하기", "구조 안에서 힘 있게 움직이기"],
    Venus:   ["관심 있는 사람에게 직접 표현하기", "매력과 자신감을 동시에 표현하기", "원하는 것 위해 먼저 행동하기", "행동이 관계를 만드는 날"],
    Jupiter: ["큰 목표를 향한 첫 걸음 내딛기", "에너지를 확장의 방향으로 쓰기", "크게 행동하기", "도전적인 일에 에너지 투자하기"],
  },
  Jupiter: {
    Sun:     ["큰 목표를 향한 첫 걸음 내딛기", "가능성을 크게 보고 행동하기", "오늘 성장의 기회를 놓치지 않기", "자아 에너지를 확장의 방향으로 쓰기"],
    Moon:    ["감정적 여유를 가지고 하루 시작하기", "마음이 조금 가벼워지는 쪽을 받아들이기", "감정을 억누르지 말고 충분히 느껴보기", "기대에 열려 있기"],
    Mercury: ["새로운 아이디어 탐구하기", "학습하거나 배우는 활동 하기", "크게 생각하고 기록하기", "지적 확장의 기회 잡기"],
    Venus:   ["새로운 관계 가능성 열기", "이미 있는 관계에 감사하기", "관계에서 관대하게 표현하기", "좋아하는 마음을 아끼지 않고 표현하기"],
    Saturn:  ["장기적 관점으로 결정하기", "기회를 구조화해 실행하기", "현실적 계획과 함께 확장하기", "목성 에너지를 토성 구조로 담기"],
  },
  Saturn: {
    Sun:     ["하루 중 가장 중요한 것 먼저 처리하기", "결과를 만드는 행동에 집중하기", "책임 있는 선택으로 장기 신뢰 쌓기", "에너지를 구조 안에서 사용하기"],
    Moon:    ["감정을 차분하게 처리하기", "내면의 무게를 인정하고 받아들이기", "자기 돌봄을 루틴에 넣기", "감정 경계 부드럽게 지키기"],
    Mercury: ["핵심만 간결하게 전달하기", "중요한 것에만 에너지 쏟기", "계획한 것을 체계적으로 실행하기", "말의 무게를 의식하며 소통하기"],
    Venus:   ["관계에서 진지한 대화 시작하기", "약속한 것 지키기", "관계에서 구조와 신뢰 만들기", "현실적 관계 점검하기"],
    Mars:    ["에너지를 한 방향으로 쏟기", "충동보다 계획으로 행동하기", "필요한 일을 미루지 않기", "구조적 행동으로 결과 만들기"],
  },
  Moon: {
    Sun:     ["감정이 이끄는 것을 자아와 연결하기", "내면의 신호를 자아 표현으로 이어가기", "감정과 의지가 같은 방향인지 확인하기", "오늘 감정을 통해 원하는 것 발견하기"],
    Moon:    ["오늘 감정의 공명에 귀 기울이기", "가까운 사람과 감정적으로 연결하기", "내면의 신호를 신뢰하기", "감정 기록하기"],
    Venus:   ["감정을 관계 언어로 표현하기", "따뜻한 감정을 주변에 나누기", "애정을 행동으로 표현하기", "감정이 관계를 열어주는 방식으로 표현하기"],
    Mars:    ["감정 에너지를 행동으로 전환하기", "원하는 것을 감정에 기반해 선택하기", "충동이 아닌 느낌으로 행동하기", "감정 신호를 행동의 나침반으로 쓰기"],
    Mercury: ["내면의 목소리를 말로 꺼내기", "감정 일기 쓰기", "중요한 감정을 메모로 정리하기", "느낀 것을 언어화하기"],
    Saturn:  ["감정을 억누르지 않고 안전하게 표현하기", "자기 돌봄을 루틴에 넣기", "감정 경계를 부드럽게 지키기", "내면의 무게를 인정하기"],
  },
  Mercury: {
    Sun:     ["하고 싶은 말을 직접 표현하기", "중요한 결정을 말로 선언하기", "아이디어를 자아 표현으로 연결하기", "표현이 자아를 드러내는 날"],
    Moon:    ["감정을 언어로 표현하기", "내면의 언어에 귀 기울이기", "느꼈지만 말 못 했던 것 꺼내기", "감정 기록하거나 표현하기"],
    Venus:   ["감사를 언어로 전달하기", "관계에서 필요한 것을 직접 표현하기", "따뜻한 메시지 보내기", "말이 관계를 잇는 날"],
    Mars:    ["결단력 있는 소통 시작하기", "망설이던 대화 먼저 시작하기", "말을 행동과 연결하기", "표현을 빠르고 명확하게 하기"],
    Saturn:  ["핵심만 간결하게 전달하기", "말의 무게를 의식하며 소통하기", "오랜 숙제였던 연락 처리하기", "신중하게 그러나 표현은 하기"],
  },
};

// ── Transit × natal cross DON'T: signal-specific cautions ────────────────────
const TRANSIT_CROSS_DONT: Partial<Record<PlanetName, Partial<Record<PlanetName, string[]>>>> = {
  Venus: {
    Moon:    ["감정적 소비", "기대에 집착하기", "관계에서 무리한 요구", "불필요한 감정 지출"],
    Mars:    ["열정을 관계에 강요하기", "즉흥적 관계 결정", "충동적 감정 표현", "관계를 즉각 행동으로 해결하려 하기"],
    Saturn:  ["관계를 너무 엄격하게 판단하기", "연결 욕구 억압하기", "관계에서 감정 차단하기", "현실만 보고 감정 무시하기"],
    Sun:     ["관계로 자존감 채우기", "인정에 의존하기", "자아를 관계에만 투자하기", "승인 욕구에 집착하기"],
    Jupiter: ["관계 기대를 지나치게 높이기", "과잉 감정 확장", "이상적 관계에 집착하기", "현실 관계를 외면하기"],
  },
  Mars: {
    Sun:     ["에너지를 여러 방향에 분산하기", "충동적 결정하기", "결과를 서두르기", "강한 의지를 주변에 강요하기"],
    Moon:    ["감정을 즉각 분출하기", "충동을 행동으로 즉시 표출하기", "화를 즉각 표출하기", "감정 충동에 따라 행동하기"],
    Saturn:  ["구조를 강제로 무너뜨리기", "조급한 실행", "저항을 공격으로 풀기", "계획 없이 실행하기"],
    Mercury: ["섣부른 결론 내리기", "확인 없이 즉각 반응하기", "말과 행동을 너무 빠르게 연결하기", "충동적 발언하기"],
    Venus:   ["관계를 정복 대상으로 보기", "욕망을 즉각 강행하기", "강한 에너지로 상대 압박하기", "관계에서 속도 강요하기"],
  },
  Jupiter: {
    Sun:     ["과도한 낙관으로 리스크 무시하기", "현실을 외면한 큰 계획", "자아를 과잉 확장하기", "근거 없는 자신감"],
    Moon:    ["감정적 과잉 확장", "기대를 지나치게 높이기", "감정을 과장하기", "미래 감정에 집착하기"],
    Saturn:  ["한계를 무시하고 과잉 확장하기", "기반 없는 계획 실행", "현실 점검 없이 도전하기", "구조를 무시한 확장"],
    Mercury: ["과잉 정보 수집으로 행동 미루기", "너무 많은 것을 동시에 탐구하기", "아이디어에만 머물기", "현실 실행 없는 계획"],
  },
  Saturn: {
    Sun:     ["완벽주의로 진행을 막기", "두려움으로 행동 멈추기", "기준을 지나치게 높이기", "에너지를 억압하기"],
    Moon:    ["감정을 억압하기", "자기 비판 과잉", "감정적 표현 차단하기", "내면의 신호를 무시하기"],
    Venus:   ["관계에서 냉정하게만 판단하기", "감정 없이 현실만 보기", "관계에서 기대를 완전히 낮추기", "감정적 연결 차단하기"],
    Mars:    ["행동 충동을 과도하게 억제하기", "두려움으로 시작을 미루기", "필요한 행동을 무기한 연기하기", "에너지를 구조로 막기"],
    Mercury: ["말을 지나치게 억제하기", "필요한 말을 두려워 안 하기", "핵심 소통을 완벽해질 때까지 미루기", "표현에 과도한 제한 걸기"],
  },
  Moon: {
    Sun:     ["기분에 따라 정체성을 바꾸기", "감정적 충동을 즉각 자아에 투영하기", "감정적 반응을 결정으로 삼기", "감정 기복에 자아를 맡기기"],
    Mars:    ["충동적으로 행동하기", "감정을 즉각 분출하기", "화를 내고 나서 후회하기", "감정 폭발로 상황 악화하기"],
    Saturn:  ["감정을 억압하기", "내면의 신호를 무시하기", "자기 판단 과잉", "감정 필요를 외면하기"],
    Mercury: ["감정적 언어로 공격하기", "과민 반응을 말로 표출하기", "감정 기복에 소통을 맡기기", "감정 상태로 판단하기"],
    Venus:   ["감정적 소비", "불필요한 관계 기대", "감정 기복으로 관계 불안정하게 하기", "감정과 관계를 혼동하기"],
  },
  Mercury: {
    Sun:     ["섣부른 판단을 자아에 투영하기", "확인 없이 결정 공개하기", "표현을 충동적으로 하기", "말로 자아를 과잉 방어하기"],
    Moon:    ["감정을 논리로 부정하기", "과잉 분석으로 감정 회피하기", "감정 신호를 합리화로 무시하기", "느낌을 언어로만 처리하기"],
    Venus:   ["관계에서 논리만 앞세우기", "말로만 관계 유지하기", "감정 없는 소통 고집하기", "연결을 분석으로 대체하기"],
    Mars:    ["말을 즉각 행동으로 강행하기", "섣부른 약속하기", "확인 없이 결정 전달하기", "빠른 소통이 오해를 만들기"],
    Saturn:  ["소통을 완벽해질 때까지 미루기", "필요한 말을 두려워 안 하기", "말을 지나치게 억제하기", "표현에 과도한 제한 걸기"],
  },
};

// Moon-sign fallbacks (same content as was previously in page.tsx)
const MOON_DO_BASE: Record<string, string[]> = {
  Aries:       ["먼저 행동하기","에너지 발산하기","주도권 잡기"],
  Taurus:      ["천천히 결정하기","감각 즐기기","안정 유지하기"],
  Gemini:      ["정보 수집하기","대화 나누기","여러 가능성 열기"],
  Cancer:      ["내면 돌보기","감정 기록하기","가까운 사람과 시간"],
  Leo:         ["자신 표현하기","창의성 발휘하기","자신감 보이기"],
  Virgo:       ["작은 것 완성하기","정리·정돈하기","세부사항 점검"],
  Libra:       ["균형 찾기","협의하기","타인 배려하기"],
  Scorpio:     ["깊이 들여다보기","진실 확인하기","본질에 집중"],
  Sagittarius: ["큰 그림 보기","새 계획 구상","자유롭게 움직이기"],
  Capricorn:   ["목표 점검하기","실질적 행동하기","책임 완수하기"],
  Aquarius:    ["혁신적으로 접근","집단 관점으로 보기","거리 두고 생각"],
  Pisces:      ["직관 따르기","창의적으로 표현","감사 기록하기"],
};

const MOON_DONT_BASE: Record<string, string[]> = {
  Aries:       ["섣부른 결론","충동적 약속","다툼 시작"],
  Taurus:      ["급격한 변화","무리한 소비","흐름 거스르기"],
  Gemini:      ["판단 서두르기","과잉 분석","과도한 약속"],
  Cancer:      ["방어적 반응","감정적 판단","경계 무너뜨리기"],
  Leo:         ["과도한 관심 욕구","인정에 집착","드라마 만들기"],
  Virgo:       ["과잉 비판","완벽주의 집착","사소함에 소진"],
  Libra:       ["결정 미루기","관계에만 의존","우유부단함"],
  Scorpio:     ["의심 과잉","집착하기","보복 심리 키우기"],
  Sagittarius: ["과도한 자신감","무책임한 약속","세부 무시"],
  Capricorn:   ["경직된 태도","감정 억압","과도한 통제"],
  Aquarius:    ["감정 차단","고집 부리기","냉담한 반응"],
  Pisces:      ["현실 도피","희망적 사고만","경계 그냥 두기"],
};

const DO_BASE_FALLBACK   = ["느린 답장","한 사람에게 집중","기록하기"];
const DONT_BASE_FALLBACK = ["즉흥 결론","감정적 소비","늦은 밤 확신"];

// ── Natal-aware DO / DON'T computation ────────────────────────────────────────

const PLANET_IDX: Record<PlanetName, number> = {
  Sun:0,Moon:1,Mercury:2,Venus:3,Mars:4,Jupiter:5,Saturn:6,Uranus:7,Neptune:8,Pluto:9,
};

/**
 * Derive home-screen DO / DON'T from active benefic/malefic transit-to-natal aspects.
 * Falls back to Moon-sign table when no strong transits are active.
 * Deterministic: same natal chart + same date = same output.
 */
function computeDosDonts(
  natal: NatalChart,
  transitLons: Map<PlanetName, number>,
  moonSign: SignName,
  date: Date,
): { dos: string[]; donts: string[] } {
  // Expanded transit planets: benefic + neutral soft = DO; malefic + neutral hard = DON'T
  const doTransitPairs: Array<{ planet: PlanetName; aspects: AspectName[] }> = [
    { planet: "Venus",   aspects: ["trine", "sextile", "conjunction"] },
    { planet: "Jupiter", aspects: ["trine", "sextile", "conjunction"] },
    { planet: "Sun",     aspects: ["trine", "sextile"] },
    { planet: "Mercury", aspects: ["trine", "sextile", "conjunction"] },
    { planet: "Moon",    aspects: ["trine", "sextile", "conjunction"] },
  ];
  const dontTransitPairs: Array<{ planet: PlanetName; aspects: AspectName[] }> = [
    { planet: "Mars",    aspects: ["square", "opposition", "conjunction"] },
    { planet: "Saturn",  aspects: ["square", "opposition", "conjunction"] },
    { planet: "Sun",     aspects: ["square", "opposition"] },
    { planet: "Mercury", aspects: ["square", "opposition"] },
    { planet: "Moon",    aspects: ["square", "opposition"] },
  ];
  // Expanded natal targets: add Jupiter/Saturn to catch outer-planet natal sensitivity
  const keyNatals: PlanetName[] = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"];
  // Per-planet orb thresholds
  const ORB_BY_PLANET: Partial<Record<PlanetName, number>> = {
    Moon: 3, Sun: 5, Mercury: 5, Venus: 5, Mars: 5, Jupiter: 6, Saturn: 6,
  };

  const natalLons = new Map<PlanetName, number>(
    natal.planets
      .filter((p) => keyNatals.includes(p.planet))
      .map((p) => [p.planet, p.longitude]),
  );

  type Hit = { natalPlanet: PlanetName; transitPlanet: PlanetName; orb: number; score: number };
  const doHits: Hit[] = [];
  const dontHits: Hit[] = [];

  for (const { planet: tPlanet, aspects } of doTransitPairs) {
    const tLon = transitLons.get(tPlanet);
    if (tLon == null) continue;
    const orbMax = ORB_BY_PLANET[tPlanet] ?? 5;
    for (const [nPlanet, nLon] of natalLons.entries()) {
      const asp = findAspect(tLon, nLon);
      if (!asp || asp.orb > orbMax || !aspects.includes(asp.name)) continue;
      const score = (HEADLINE_PLANET_WEIGHT[tPlanet] ?? 1) + (orbMax - asp.orb);
      doHits.push({ natalPlanet: nPlanet, transitPlanet: tPlanet, orb: asp.orb, score });
    }
  }

  for (const { planet: tPlanet, aspects } of dontTransitPairs) {
    const tLon = transitLons.get(tPlanet);
    if (tLon == null) continue;
    const orbMax = ORB_BY_PLANET[tPlanet] ?? 5;
    for (const [nPlanet, nLon] of natalLons.entries()) {
      const asp = findAspect(tLon, nLon);
      if (!asp || asp.orb > orbMax || !aspects.includes(asp.name)) continue;
      const score = (HEADLINE_PLANET_WEIGHT[tPlanet] ?? 1) + (orbMax - asp.orb);
      dontHits.push({ natalPlanet: nPlanet, transitPlanet: tPlanet, orb: asp.orb, score });
    }
  }

  // Sort by score desc, then orb asc (tightest, most important transit first)
  doHits.sort((a, b) => b.score - a.score || a.orb - b.orb);
  dontHits.sort((a, b) => b.score - a.score || a.orb - b.orb);

  const day = date.getDate();
  const month = date.getMonth();
  // moonBand (0/1/2 per 10° of Moon's position in sign) adds a third dimension to pool selection.
  // Shifts ~every 20 h → two days with same Moon sign but different degree band pick different items.
  const moonBand = Math.floor(norm360(transitLons.get("Moon")!) % 30 / 10);

  // orb shifts daily as the transit moves → same transit, different day → different item
  function pickItem(pool: string[], nPlanet: PlanetName, tPlanet: PlanetName, orb: number): string {
    const seed = day * 7 + month * 11 + PLANET_IDX[nPlanet] * 13 + PLANET_IDX[tPlanet] * 17 + moonBand * 5 + Math.round(orb * 10) * 3;
    return pool[seed % pool.length];
  }

  const dos: string[] = [];
  const doSeen = new Set<string>();
  for (const hit of doHits) {
    if (dos.length >= 3) break;
    // Check signal-specific cross table first; fall back to natal-planet generic pool
    const crossPool = TRANSIT_CROSS_DO[hit.transitPlanet]?.[hit.natalPlanet];
    const item = crossPool
      ? pickItem(crossPool, hit.natalPlanet, hit.transitPlanet, hit.orb)
      : pickItem(NATAL_PLANET_DO[hit.natalPlanet], hit.natalPlanet, hit.transitPlanet, hit.orb);
    if (!doSeen.has(item)) { dos.push(item); doSeen.add(item); }
  }
  for (const item of [...(MOON_DO_BASE[moonSign] ?? DO_BASE_FALLBACK), ...DO_BASE_FALLBACK]) {
    if (dos.length >= 3) break;
    if (!doSeen.has(item)) { dos.push(item); doSeen.add(item); }
  }

  const donts: string[] = [];
  const dontSeen = new Set<string>();
  for (const hit of dontHits) {
    if (donts.length >= 3) break;
    // Check signal-specific cross table first; fall back to natal-planet generic pool
    const crossPool = TRANSIT_CROSS_DONT[hit.transitPlanet]?.[hit.natalPlanet];
    const item = crossPool
      ? pickItem(crossPool, hit.natalPlanet, hit.transitPlanet, hit.orb)
      : pickItem(NATAL_PLANET_DONT[hit.natalPlanet], hit.natalPlanet, hit.transitPlanet, hit.orb);
    if (!dontSeen.has(item)) { donts.push(item); dontSeen.add(item); }
  }
  for (const item of [...(MOON_DONT_BASE[moonSign] ?? DONT_BASE_FALLBACK), ...DONT_BASE_FALLBACK]) {
    if (donts.length >= 3) break;
    if (!dontSeen.has(item)) { donts.push(item); dontSeen.add(item); }
  }

  return { dos, donts };
}

/** Note templates based on strongest active transit type */
const TRANSIT_NOTE: Record<AspectName, Record<"beneficial"|"malefic", string>> = {
  conjunction: {
    beneficial: "강한 에너지가 집중되어 있습니다. 지금 행동하기 좋은 시점입니다.",
    malefic:    "강한 압력이 느껴지는 날입니다. 무리하지 않는 것이 좋습니다.",
  },
  trine: {
    beneficial: "에너지가 자연스럽게 흐릅니다. 흐름을 믿고 진행하세요.",
    malefic:    "긴장이 서서히 누적될 수 있습니다. 조기에 해소하세요.",
  },
  sextile: {
    beneficial: "가벼운 기회의 창이 열려 있습니다. 작은 시도가 효과적입니다.",
    malefic:    "미묘한 어긋남이 느껴집니다. 가볍게 넘기지 마세요.",
  },
  square: {
    beneficial: "긴장이 성장의 동력이 됩니다. 직면하면 해결됩니다.",
    malefic:    "강한 긴장이 흐름을 방해합니다. 강행보다 조율이 낫습니다.",
  },
  opposition: {
    beneficial: "균형을 찾는 에너지가 있습니다. 양쪽을 통합해보세요.",
    malefic:    "상반된 힘이 충돌합니다. 한쪽에만 치우치지 마세요.",
  },
};

/** Classify transit planet as beneficial or malefic */
function transitClass(planet: PlanetName): "beneficial" | "malefic" | "neutral" {
  if (["Venus", "Jupiter", "Moon"].includes(planet)) return "beneficial";
  if (["Mars", "Saturn"].includes(planet)) return "malefic";
  return "neutral";
}

/** Tone from a single transit aspect */
function aspectToneFromPair(aspect: AspectName, transitPlanet: PlanetName): "strength" | "challenge" | "neutral" {
  const cls = transitClass(transitPlanet);
  const soft: AspectName[] = ["trine", "sextile", "conjunction"];
  const hard: AspectName[] = ["square", "opposition"];
  if (cls === "beneficial" && soft.includes(aspect)) return "strength";
  if (cls === "malefic"    && hard.includes(aspect)) return "challenge";
  if (cls === "beneficial" && hard.includes(aspect)) return "neutral";
  if (cls === "malefic"    && soft.includes(aspect)) return "challenge";
  return "neutral";
}

/** Build a single domain reading from natal chart + transits */
function buildDomainReading(
  domain: string,
  natal: NatalChart,
  transitLons: Map<PlanetName, number>,
  moonSign: SignName,
  date: Date,
): DomainReading {
  const domainPlanets = DOMAIN_PLANETS[domain] ?? ["Sun"];

  // Collect natal planet positions for this domain
  const natalPlanets = domainPlanets
    .map((p) => natal.planets.find((np) => np.planet === p))
    .filter((p): p is NonNullable<typeof p> => p !== undefined);

  const primaryNatal = natalPlanets[0];
  const primaryElement = (SIGN_ELEMENT[primaryNatal.sign] ?? "공기") as "불" | "흙" | "공기" | "물";
  const moonElement    = (SIGN_ELEMENT[moonSign] ?? "공기")          as "불" | "흙" | "공기" | "물";

  // Scan ALL transits → domain natal planets; collect active aspects
  type ActiveAsp = {
    transitPlanet: PlanetName;
    natalPlanet:   PlanetName;
    aspect:        AspectName;
    orb:           number;
    tone:          "strength" | "challenge" | "neutral";
  };
  const active: ActiveAsp[] = [];

  for (const np of natalPlanets) {
    for (const [tPlanet, tLon] of transitLons.entries()) {
      const asp = findAspect(tLon, np.longitude);
      if (!asp || asp.orb > 5.5) continue;
      active.push({
        transitPlanet: tPlanet as PlanetName,
        natalPlanet:   np.planet,
        aspect:        asp.name,
        orb:           asp.orb,
        tone:          aspectToneFromPair(asp.name, tPlanet as PlanetName),
      });
    }
  }

  // Sort tightest orb first
  active.sort((a, b) => a.orb - b.orb);

  // Tone calculation: active transits take priority over background element harmony.
  // Logic:
  //   1. If active transit says "challenge"  → challenge (real planetary pressure wins)
  //   2. If active transit says "strength"   → strength  (positive transit overrides bad element)
  //   3. No decisive transit → fall back to element harmony (natal sign vs Moon sign)
  // This prevents element harmony from vetoing a clear benefic transit signal.
  const elementTone = elementHarmony(primaryElement, moonElement);
  const transitTones = active.map((a) => a.tone);
  const hasTransitChallenge = transitTones.includes("challenge");
  const hasTransitStrength  = transitTones.includes("strength");
  const tone: "strength" | "challenge" | "neutral" =
    hasTransitChallenge ? "challenge" :
    hasTransitStrength  ? "strength"  :
    elementTone;

  // Headline: element × tone with date+moonDeg based daily variant rotation.
  // seed = (moonDegForVariant + date.getDate() * 13) % 3  → varies strongly with both
  // Moon position and day-of-month, giving within-month date differentiation.
  const moonLonForDeg = transitLons.get("Moon") ?? 0;
  const moonDegForVariant = Math.floor(norm360(moonLonForDeg) % 30);
  const headlineVariantIdx = (moonDegForVariant + date.getDate() * 13) % 3;

  // When a tight transit (orb ≤ 3°) is driving the reading, use the transit-specific
  // headline table — makes the home preview name the actual planet signal.
  const lead = active.find((a) => a.tone !== "neutral") ?? active[0];
  const tightLead = lead && lead.orb <= 3 ? lead : null;
  const transitPoolVariant = tightLead
    ? DOMAIN_TRANSIT_HEADLINE[domain]?.[tightLead.transitPlanet]?.[tone]
    : null;
  const headlinePool = ELEMENT_HEADLINE_ALTS[domain]?.[primaryElement]?.[tone];
  const headline =
    (transitPoolVariant ? transitPoolVariant[headlineVariantIdx] : null)
    ?? (headlinePool ? headlinePool[headlineVariantIdx] : null)
    ?? ELEMENT_HEADLINE[domain]?.[primaryElement]?.[tone]
    ?? DOMAIN_RELATIONSHIP[moonSign]?.headline
    ?? "오늘의 에너지를 살펴보세요";
  // Note: driven by strongest transit aspect, or moon-sign table fallback
  let note: string;
  if (lead) {
    const cls = transitClass(lead.transitPlanet) === "neutral" ? "beneficial" : (transitClass(lead.transitPlanet) as "beneficial" | "malefic");
    note = TRANSIT_NOTE[lead.aspect][cls];
  } else {
    // Fall back to moon-sign static tables
    const fallbackMap: Record<string, Record<SignName, DomainNote>> = {
      "관계":    DOMAIN_RELATIONSHIP,
      "루틴·일":  DOMAIN_ROUTINE,
      "사고·표현": DOMAIN_EXPRESSION,
      "감정·내면": DOMAIN_INNER,
      "나":      DOMAIN_NA,
    };
    note = fallbackMap[domain]?.[moonSign]?.note ?? "오늘 상황이 어떻게 움직이는지 잘 보세요.";
  }

  // Reasons: human-readable transit descriptions
  const reasons = active.slice(0, 3).map((a) =>
    `${PLANET_KO[a.transitPlanet]} ${ASPECT_KO[a.aspect]} 출생 ${PLANET_KO[a.natalPlanet]} (${a.orb.toFixed(1)}°)`,
  );

  const domainKey = DOMAIN_INTERNAL_TO_KEY[domain] ?? "";
  // Use richer label that varies by lead transit planet, not just tone.
  const leadPlanet = lead?.transitPlanet;
  const statusLabel =
    DOMAIN_STATUS_RICH[domainKey]?.[tone]?.[leadPlanet ?? "_"] ??
    DOMAIN_STATUS_RICH[domainKey]?.[tone]?.["_"] ??
    DOMAIN_STATUS[domainKey]?.[tone] ??
    undefined;

  return {
    domain,
    headline: polishInterpretCopy(headline),
    note: polishInterpretCopy(note),
    tone,
    reasons,
    statusLabel: statusLabel ? polishInterpretCopy(statusLabel) : undefined,
  };
}

/**
 * Derive per-domain daily readings from a natal chart + date.
 * Headline and tone are personalized by natal planet element + transit aspects.
 * Same natal chart → same result for same date.
 * Different natal chart → different headline / tone / reasons for same date.
 */
export function interpretDomains(natal: NatalChart, transitDate: Date): DomainReading[] {
  const transitLons = computeTransitPositions(transitDate);
  const moonLon = transitLons.get("Moon")!;
  const moonSign = signFromLongitude(moonLon);

  return ["나", "관계", "루틴·일", "사고·표현", "감정·내면"].map((domain) =>
    buildDomainReading(domain, natal, transitLons, moonSign, transitDate),
  );
}

// ── Domain detail ─────────────────────────────────────────────────────────────

const DOMAIN_KEY_TO_INTERNAL: Record<string, string> = {
  love:    "관계",
  friends: "사고·표현",
  work:    "루틴·일",
  family:  "감정·내면",
  self:    "나",
  today:   "나",   // today = general daily reading keyed on self/vitality (Sun + Mars)
};

const DOMAIN_INTERNAL_TO_KEY: Record<string, string> = {
  "관계":    "love",
  "사고·표현": "friends",
  "루틴·일":  "work",
  "감정·내면": "family",
  "나":      "self",
};

// Re-use the single source-of-truth defined earlier in this file
const STATUS_LABELS = DOMAIN_STATUS;

type Elem = "불" | "흙" | "공기" | "물";
type Tone = "strength" | "challenge" | "neutral";

const BULLETS_BASE: Record<string, Record<Elem, Record<Tone, string[]>>> = {
  "관계": {
    "불": {
      strength:  ["직접적 표현이 관계에 활기를 줍니다", "솔직한 접근이 오늘 연결을 강화합니다", "행동으로 감정을 전달하는 에너지가 있습니다", "관계에서 주도적 역할이 자연스럽습니다"],
      challenge: ["충동적 반응이 오해를 만들 수 있습니다", "상대방의 속도를 존중하는 것이 필요합니다", "감정 과잉이 관계에 마찰을 일으킬 수 있습니다", "잠시 멈추고 다시 접근하는 것이 좋습니다"],
      neutral:   ["관계에서 새로운 에너지가 감지됩니다", "활기찬 대화가 오늘 연결을 만들 수 있습니다", "변화를 두려워하지 않는 접근이 도움됩니다", "적극적 태도가 관계에 긍정적입니다"],
    },
    "흙": {
      strength:  ["신뢰가 오늘 관계의 토대를 다집니다", "꾸준한 관심이 연결을 깊게 합니다", "안정적 존재감이 상대에게 안도감을 줍니다", "실질적 배려가 관계를 단단하게 합니다"],
      challenge: ["고집이 상대와의 타협을 어렵게 합니다", "변화에 저항하면 관계가 정체될 수 있습니다", "상대의 관점을 유연하게 수용할 필요가 있습니다", "완고함보다 열린 태도가 오늘 필요합니다"],
      neutral:   ["관계에 실질적 변화가 있을 수 있습니다", "신중한 접근이 오해를 막습니다", "지속성 있는 관심이 연결을 유지합니다", "감정보다 행동으로 표현하는 날입니다"],
    },
    "공기": {
      strength:  ["대화가 오늘 관계를 여는 열쇠입니다", "지적 연결이 감정적 유대를 강화합니다", "열린 소통이 관계의 깊이를 더합니다", "새로운 관점을 나누는 것이 연결을 만듭니다"],
      challenge: ["과잉 분석이 오히려 관계를 냉각시킵니다", "감정보다 논리가 앞서면 상대가 멀어질 수 있습니다", "머릿속에서만 정리하면 오해가 쌓입니다", "연결은 이해보다 느낌에서 시작됩니다"],
      neutral:   ["관계에서 새로운 관점이 필요합니다", "열린 대화가 오늘 연결의 시작점입니다", "가벼운 소통이 관계를 가깝게 할 수 있습니다", "아이디어 교환이 관계를 활성화합니다"],
    },
    "물": {
      strength:  ["감성적 연결이 오늘 깊어집니다", "공감 능력이 관계를 단단하게 합니다", "말하지 않아도 느끼는 연결이 있습니다", "직관적 이해가 관계를 부드럽게 합니다"],
      challenge: ["감정의 파도가 관계를 흔들 수 있습니다", "과도한 감수성이 오해를 만들 수 있습니다", "감정 경계를 유지하는 것이 필요합니다", "상대방 에너지에 지나치게 흡수되지 않도록 주의하세요"],
      neutral:   ["관계에서 직관이 중요합니다", "느낌을 신뢰하며 연결에 접근하세요", "감정적 여유가 관계를 부드럽게 합니다", "공감이 오늘의 연결 언어입니다"],
    },
  },
  "사고·표현": {
    "불": {
      strength:  ["활기찬 아이디어가 쏟아지는 날입니다", "빠른 판단이 오늘 효과적입니다", "즉흥적 표현이 설득력을 가집니다", "열정이 말에 실리면 전달력이 높아집니다"],
      challenge: ["섣부른 말이 오해를 낳을 수 있습니다", "말하기 전에 한 번 더 생각이 필요합니다", "빠른 반응보다 신중한 표현이 오늘 유리합니다", "충동적 발언이 관계에 영향을 줄 수 있습니다"],
      neutral:   ["표현에 새로운 시도가 있습니다", "짧고 직접적인 소통이 오늘 효과적입니다", "아이디어를 먼저 행동으로 표현해보세요", "에너지를 언어로 전환하는 날입니다"],
    },
    "흙": {
      strength:  ["실용적 소통이 결과를 만드는 날입니다", "신중한 표현이 신뢰를 구축합니다", "구체적이고 명확한 언어가 효과적입니다", "계획된 소통이 오늘 성과를 만듭니다"],
      challenge: ["경직된 시각이 소통을 막을 수 있습니다", "다른 관점을 수용하는 유연성이 필요합니다", "고집스러운 표현이 상대를 멀어지게 합니다", "실용성만 강조하면 감정이 빠질 수 있습니다"],
      neutral:   ["신중한 표현이 필요한 날입니다", "말의 무게를 의식하며 소통하세요", "구체적인 예시가 소통을 명확하게 합니다", "천천히 그러나 확실하게 표현하는 날입니다"],
    },
    "공기": {
      strength:  ["소통이 물 흐르듯 자연스러운 날입니다", "다양한 아이디어가 연결되는 에너지가 있습니다", "언어가 오늘 강력한 도구가 됩니다", "열린 사고가 새로운 통찰을 만듭니다"],
      challenge: ["정보 과부하로 판단이 흐려질 수 있습니다", "너무 많은 방향에 주의가 분산됩니다", "결정을 내리지 못하면 기회를 놓칩니다", "핵심에 집중하는 것이 오늘 중요합니다"],
      neutral:   ["다양한 관점을 탐색하는 날입니다", "아이디어를 메모하고 정리하세요", "대화를 통해 생각을 정리할 수 있습니다", "열린 마음이 오늘의 강점입니다"],
    },
    "물": {
      strength:  ["직관적 통찰이 말에 실리는 날입니다", "감성적 표현이 깊은 공명을 만듭니다", "느낌을 언어화하는 능력이 높아집니다", "무의식의 지혜가 표현에 담깁니다"],
      challenge: ["감정이 논리적 표현을 방해할 수 있습니다", "직관만으로는 설득이 어려울 수 있습니다", "감정과 사실을 분리해서 표현하는 연습이 필요합니다", "과민한 반응이 소통을 복잡하게 만듭니다"],
      neutral:   ["내면의 언어에 귀 기울이는 날입니다", "직관적 표현을 신뢰해보세요", "감정을 정직하게 언어화하면 연결이 됩니다", "느낌과 논리 사이에서 균형을 찾으세요"],
    },
  },
  "루틴·일": {
    "불": {
      strength:  ["추진력이 업무를 가속하는 날입니다", "빠른 실행이 오늘 성과를 만듭니다", "새로운 프로젝트를 시작하기 좋은 에너지입니다", "열정이 팀에 활기를 불어넣습니다"],
      challenge: ["조급함이 실수를 유발할 수 있습니다", "세부 사항을 확인하는 과정이 필요합니다", "빠름보다 정확함을 우선하세요", "충동적 결정이 나중에 수정 작업을 만듭니다"],
      neutral:   ["새로운 방향을 시도하기 좋은 날입니다", "루틴에 활기를 더하는 작은 변화를 시도해보세요", "에너지를 집중할 한 가지 목표를 정하세요", "행동 중심의 접근이 오늘 효과적입니다"],
    },
    "흙": {
      strength:  ["꾸준함이 성과를 만드는 날입니다", "체계적인 접근이 업무 완성도를 높입니다", "신뢰할 수 있는 성과가 만들어지는 날입니다", "지속적인 노력이 오늘 결실을 맺습니다"],
      challenge: ["과도한 완벽주의가 진행을 막을 수 있습니다", "완성보다 진행이 오늘 더 중요합니다", "기준은 유지하되 유연성이 필요합니다", "세부에 집착하면 큰 그림을 잃을 수 있습니다"],
      neutral:   ["루틴을 점검하고 정비하는 날입니다", "지속 가능한 속도로 진행하세요", "안정된 흐름을 유지하는 것이 핵심입니다", "작은 개선이 장기적으로 큰 차이를 만듭니다"],
    },
    "공기": {
      strength:  ["유연한 접근이 업무를 풀어줍니다", "협업이 오늘 특히 효과적입니다", "아이디어 교환이 새로운 해결책을 만듭니다", "다양한 관점을 통합하는 능력이 빛납니다"],
      challenge: ["집중력 분산에 주의하세요", "여러 방향에 에너지를 나누면 완성이 늦어집니다", "하나의 작업에 집중하는 의도적 노력이 필요합니다", "산만함이 업무 흐름을 방해합니다"],
      neutral:   ["협업과 아이디어 교환이 유익합니다", "다양한 방향을 탐색한 뒤 하나를 선택하세요", "소통이 오늘 업무의 핵심 도구입니다", "유연한 스케줄이 오늘 더 효과적입니다"],
    },
    "물": {
      strength:  ["직감이 업무의 방향을 잡아줍니다", "흐름을 느끼며 일할 때 효율이 높아집니다", "직관적 판단이 오늘 정확합니다", "내면의 신호를 따르는 것이 현명합니다"],
      challenge: ["감정 기복이 집중력에 영향을 줄 수 있습니다", "외부 환경의 에너지에 지나치게 영향받지 않도록 하세요", "감정과 업무를 분리하는 경계가 필요합니다", "무드에 따라 진행 여부를 결정하지 마세요"],
      neutral:   ["흐름을 느끼며 유연하게 진행하세요", "직관과 계획을 함께 활용하는 날입니다", "감각을 믿으되 확인을 놓치지 마세요", "내면의 리듬에 맞게 업무 속도를 조율하세요"],
    },
  },
  "나": {
    "불": {
      strength:  ["에너지가 강하게 집중되는 날입니다", "자신이 원하는 것이 선명하게 느껴집니다", "결단력이 높아지고 행동과 의도가 정렬됩니다", "움직이기 좋은 에너지가 가득합니다"],
      challenge: ["충동이 에너지를 낭비하게 만들 수 있습니다", "강한 자기주장이 주변과 마찰을 일으킬 수 있습니다", "행동 전에 의도를 한 번 더 확인하세요", "에너지를 한 방향으로 집중하는 것이 중요합니다"],
      neutral:   ["활기찬 에너지가 감지되는 날입니다", "새로운 방향을 탐색하기 좋은 날입니다", "적극적인 태도가 오늘 효과적입니다", "에너지를 의식적으로 사용하세요"],
    },
    "흙": {
      strength:  ["안정된 에너지가 꾸준한 성과를 만들어냅니다", "자신의 가치와 연결되는 날입니다", "지속성이 오늘의 강점입니다", "묵묵히 쌓아온 것이 결실을 맺습니다"],
      challenge: ["변화에 대한 저항이 에너지를 막을 수 있습니다", "완고함보다 유연성을 선택하세요", "안전지대 밖으로 한 걸음 나가는 용기가 필요합니다", "집착이 성장을 방해할 수 있습니다"],
      neutral:   ["안정적인 리듬을 유지하는 날입니다", "꾸준한 진행이 오늘 핵심입니다", "지속 가능한 방식으로 에너지를 사용하세요", "자신의 페이스를 존중하세요"],
    },
    "공기": {
      strength:  ["자기 표현이 명확하고 자연스럽게 흐릅니다", "소통이 에너지를 높여주는 날입니다", "아이디어가 정체성을 확장합니다", "지적 연결이 오늘 당신을 이끌어갑니다"],
      challenge: ["과도한 분석이 행동을 막을 수 있습니다", "머릿속에서 순환하는 생각을 현실과 구분하세요", "결정을 미루지 말고 하나씩 움직이세요", "방향성 없는 에너지가 분산될 수 있습니다"],
      neutral:   ["자신에 대한 새로운 관점이 열립니다", "다양한 방향을 탐색하되 하나를 선택하세요", "소통이 자기 이해를 깊게 합니다", "유연한 자아 표현이 오늘 도움됩니다"],
    },
    "물": {
      strength:  ["직관이 자아의 방향을 선명하게 안내합니다", "내면의 감각과 연결될 때 에너지가 깊어집니다", "자신에 대한 깊은 이해가 열리는 날입니다", "감성이 지혜를 가져옵니다"],
      challenge: ["감정이 자아를 압도할 수 있습니다", "타인의 에너지를 자신의 것으로 흡수하지 마세요", "경계를 의식적으로 설정하는 것이 오늘 필요합니다", "내면의 소음과 거리를 두는 시간이 필요합니다"],
      neutral:   ["직관과 이성이 교차하는 날입니다", "내면의 흐름에 귀 기울이세요", "자신의 감각을 신뢰하되 현실을 확인하세요", "조용한 자기 관찰이 오늘 유익합니다"],
    },
  },
  "감정·내면": {
    "불": {
      strength:  ["내면의 열정이 오늘 방향을 밝힙니다", "자신이 원하는 것이 명확하게 느껴지는 날입니다", "감정이 선명하고 행동 에너지가 됩니다", "내면의 불씨가 새로운 흐름을 만들어냅니다"],
      challenge: ["감정이 과열되어 판단을 흐릴 수 있습니다", "충동적 반응보다 잠시의 여유가 도움됩니다", "강한 감정이 옳은 방향을 가리는 경우가 있습니다", "에너지를 내면으로 향하게 하는 시간이 필요합니다"],
      neutral:   ["내면에서 새로운 동력이 싹틉니다", "작은 흥미와 열정이 방향을 가리킵니다", "자신을 돌아보는 짧은 시간이 유익합니다", "감정 에너지를 창의적으로 표현해보세요"],
    },
    "흙": {
      strength:  ["내면의 안정감이 회복되는 날입니다", "현실 기반에서 감정을 점검할 수 있습니다", "자신의 필요를 명확히 인식하는 에너지가 있습니다", "지속적인 내면 작업이 오늘 결실을 맺습니다"],
      challenge: ["감정을 눌러두면 결국 더 크게 올라옵니다", "편한 쪽만 찾다 보면 감정도 멈춰버립니다", "익숙하고 편한 방식에만 머물지 않도록 보세요", "표현하지 못한 감정이 쌓여 있을 수 있습니다"],
      neutral:   ["현실 기반에서 감정을 점검하세요", "안정된 환경이 내면 정리에 도움됩니다", "작은 자기 돌봄이 오늘 효과적입니다", "천천히 자신의 필요를 확인하는 날입니다"],
    },
    "공기": {
      strength:  ["감정을 명확히 이해하는 날입니다", "내면의 언어화가 오늘 치유가 됩니다", "감정을 분석하고 통합하는 능력이 높아집니다", "자기 이해가 깊어지는 날입니다"],
      challenge: ["지나친 합리화가 감정을 막습니다", "논리로 감정을 통제하려 하면 오히려 복잡해집니다", "감정을 느끼는 것을 허용하는 것이 필요합니다", "머리로만 해결하려 하지 마세요"],
      neutral:   ["내면의 목소리를 언어화해보세요", "감정 일기나 기록이 오늘 도움됩니다", "자신을 관찰하는 거리감이 이해를 높입니다", "생각과 감정을 구분하는 연습을 해보세요"],
    },
    "물": {
      strength:  ["감수성이 내면을 깊이 적시는 날입니다", "자신의 감정과 진실하게 연결됩니다", "직관이 내면의 방향을 안내합니다", "공감 능력이 자기 이해로 이어집니다"],
      challenge: ["감정의 경계가 흐릿해질 수 있습니다", "외부 감정을 자신의 것으로 흡수하지 않도록 주의하세요", "감정의 파도에 휩쓸리지 않는 닻이 필요합니다", "이 감정이 나의 것인지 타인의 것인지 구분하세요"],
      neutral:   ["직관과 감정이 교차하는 날입니다", "자신의 리듬을 따르는 것이 오늘 현명합니다", "조용한 시간이 내면을 회복시킵니다", "감수성을 자원으로 사용하는 방법을 찾으세요"],
    },
  },
};

const SUMMARY_TEMPLATES: Record<string, Record<Elem, Record<Tone, string>>> = {
  "관계": {
    "불": {
      strength:  "오늘 당신의 관계 에너지는 직접적이고 활기찹니다. 행동으로 감정을 표현하는 것이 자연스럽습니다. 망설이지 말고 먼저 다가가세요.",
      challenge: "관계에서 충동적 반응이 마찰을 만들 수 있습니다. 상대방의 속도와 감정 상태를 한 번 더 확인하세요. 에너지가 강한 만큼 방향을 조절하는 것이 중요합니다.",
      neutral:   "관계에 새로운 에너지가 감지됩니다. 적극적인 태도가 오늘 긍정적인 변화를 만들 수 있습니다. 원하는 연결에 작은 움직임을 시도해보세요.",
    },
    "흙": {
      strength:  "관계의 토대가 오늘 단단해집니다. 꾸준하고 실질적인 관심이 상대에게 전달됩니다. 화려한 제스처보다 진심 어린 일관성이 오늘의 강점입니다.",
      challenge: "관계에서 고집이 타협을 어렵게 만들 수 있습니다. 내가 옳다는 확신을 잠시 내려놓고 상대의 관점을 들어보세요. 유연성이 오늘 관계를 지키는 방법입니다.",
      neutral:   "관계에 실질적이고 안정적인 에너지가 있습니다. 신중하게 접근하되 표현하는 것을 미루지 마세요. 지속성 있는 관심이 연결을 유지합니다.",
    },
    "공기": {
      strength:  "대화가 오늘 관계의 문을 열어줍니다. 지적 연결과 열린 소통이 감정적 유대를 강화합니다. 말하지 않았던 것들을 솔직하게 나눠보세요.",
      challenge: "관계를 머릿속에서만 굴리면 실제 연결은 식어갑니다. 감정을 논리로 눌러 담기보다, 느껴지는 대로 차분히 표현해보세요.",
      neutral:   "새로운 관점이 관계를 열어줄 수 있습니다. 대화를 통해 서로를 새롭게 발견하는 기회가 있습니다. 열린 질문이 연결을 만드는 날입니다.",
    },
    "물": {
      strength:  "오늘 관계에서 깊은 감성적 연결이 가능합니다. 말하지 않아도 느끼는 공명이 있습니다. 직관을 신뢰하고 감정 에너지를 상대에게 흘려보내세요.",
      challenge: "감정의 파도가 관계를 흔들 수 있습니다. 자신의 감정과 상대의 감정을 구분하는 경계가 필요합니다. 감정적 거리를 유지하면서도 연결될 수 있습니다.",
      neutral:   "직관이 관계에서 안내 역할을 합니다. 논리보다 느낌을 신뢰하되, 표현을 통해 상대와 연결을 확인하세요.",
    },
  },
  "사고·표현": {
    "불": {
      strength:  "오늘 생각이 빠르고 명확합니다. 즉흥적 표현에 설득력이 있습니다. 아이디어가 떠오르면 바로 실행으로 연결하세요.",
      challenge: "빠른 생각이 섣부른 말을 만들 수 있습니다. 표현하기 전에 한 번 더 의도를 확인하세요. 오늘은 말하는 것보다 듣는 것이 유리할 수 있습니다.",
      neutral:   "새로운 아이디어를 탐색하기 좋은 날입니다. 행동하면서 생각을 정리하는 방식이 오늘 효과적입니다.",
    },
    "흙": {
      strength:  "실용적이고 구체적인 소통이 오늘 결과를 만듭니다. 신중한 표현이 신뢰를 구축하고 오해를 막습니다. 명확한 언어가 오늘의 강점입니다.",
      challenge: "경직된 사고가 새로운 아이디어를 막을 수 있습니다. 다른 방식이나 관점에 마음을 열어보세요. 유연성이 오늘 소통의 핵심입니다.",
      neutral:   "신중하고 체계적인 표현이 필요한 날입니다. 말의 무게를 의식하며 명확하게 전달하세요.",
    },
    "공기": {
      strength:  "소통이 물 흐르듯 자연스럽습니다. 다양한 아이디어가 연결되고 확장됩니다. 오늘 언어는 당신의 강력한 도구입니다.",
      challenge: "너무 많은 정보와 방향이 판단을 흐릴 수 있습니다. 가장 중요한 한 가지에 집중하세요. 산만함이 오늘의 가장 큰 도전입니다.",
      neutral:   "다양한 관점을 탐색하고 정리하는 날입니다. 대화를 통해 생각을 명확하게 할 수 있습니다.",
    },
    "물": {
      strength:  "직관적 통찰이 말에 실리는 날입니다. 감성적 표현이 깊은 공명을 만들어냅니다. 느낌을 언어로 변환하는 능력이 오늘 높아집니다.",
      challenge: "감정이 논리적 표현을 방해할 수 있습니다. 말하려는 내용과 느끼는 감정을 분리하는 연습이 필요합니다.",
      neutral:   "내면의 목소리를 언어화하는 날입니다. 직관을 신뢰하되 표현을 통해 확인하세요.",
    },
  },
  "루틴·일": {
    "불": {
      strength:  "오늘 업무 추진력이 강합니다. 새로운 프로젝트를 시작하거나 정체된 일을 밀어붙이기 좋은 에너지입니다. 행동이 성과를 만드는 날입니다.",
      challenge: "조급함이 오늘 가장 큰 함정입니다. 빠르게 진행하고 싶은 충동을 조절하고 세부 사항을 확인하세요. 정확함이 속도보다 중요한 날입니다.",
      neutral:   "루틴에 활기를 더하는 좋은 날입니다. 익숙한 방식에 작은 변화를 주면 효율이 높아질 수 있습니다.",
    },
    "흙": {
      strength:  "꾸준한 노력이 오늘 결실을 맺습니다. 체계적인 접근이 업무의 완성도를 높입니다. 신뢰할 수 있는 성과가 만들어지는 날입니다.",
      challenge: "완벽을 추구하다 진행이 멈출 수 있습니다. '충분히 좋은 것'을 인정하는 것도 오늘 필요한 기술입니다. 완성에 집중하세요.",
      neutral:   "루틴을 점검하고 최적화하기 좋은 날입니다. 지속 가능한 속도로 진행하며 불필요한 것을 정리하세요.",
    },
    "공기": {
      strength:  "유연하고 창의적인 접근이 오늘 업무를 풀어줍니다. 협업이 특히 효과적입니다. 다양한 아이디어가 새로운 해결책을 만들어냅니다.",
      challenge: "집중력이 여러 방향으로 분산될 수 있습니다. 우선순위를 명확히 정하고 하나씩 완성하는 의도적 노력이 필요합니다.",
      neutral:   "협업과 아이디어 교환이 유익한 날입니다. 소통을 통해 막혔던 업무 흐름을 풀어낼 수 있습니다.",
    },
    "물": {
      strength:  "직감이 업무 방향을 잡아줍니다. 흐름을 느끼며 일할 때 효율이 높아집니다. 내면의 신호를 따르는 것이 오늘 현명한 선택입니다.",
      challenge: "감정 기복이 집중력에 영향을 줄 수 있습니다. 감정과 업무를 분리하는 명확한 경계가 필요합니다.",
      neutral:   "직관과 계획을 함께 활용하는 날입니다. 흐름을 느끼며 유연하게 진행하세요.",
    },
  },
  "나": {
    "불": {
      strength:  "오늘 당신의 에너지는 강하게 집중됩니다. 자신이 원하는 것이 선명하게 느껴지고 행동 에너지가 방향을 찾습니다. 결단이 필요한 일에 움직이기 좋은 날입니다.",
      challenge: "충동과 조급함이 에너지를 분산시킬 수 있습니다. 행동하기 전에 의도를 확인하세요. 강한 에너지를 올바른 방향으로 조율하는 것이 오늘의 과제입니다.",
      neutral:   "활기찬 에너지가 감지되는 날입니다. 새로운 방향을 탐색하거나 정체된 일에 작은 움직임을 더하세요. 에너지를 의식적으로 사용하는 것이 오늘 효과적입니다.",
    },
    "흙": {
      strength:  "안정된 에너지가 꾸준한 성과를 만들어냅니다. 자신의 가치와 연결되며 지속성이 오늘의 강점입니다. 묵묵히 쌓아온 것이 결실을 맺는 날입니다.",
      challenge: "변화에 대한 저항이 오늘 에너지를 막을 수 있습니다. 완고함보다 유연성을 선택하세요. 안전지대 밖으로 한 걸음 나가는 것이 성장을 만듭니다.",
      neutral:   "안정적인 리듬을 유지하는 날입니다. 꾸준한 진행이 핵심이며 자신의 페이스를 존중하세요. 지속 가능한 방식으로 에너지를 사용하는 것이 중요합니다.",
    },
    "공기": {
      strength:  "자기 표현이 명확하고 자연스러운 날입니다. 소통과 아이디어 탐색이 정체성을 확장합니다. 지적 연결이 오늘 당신의 에너지를 이끌어갑니다.",
      challenge: "과도한 분석이 행동을 막을 수 있습니다. 머릿속에서 순환하는 생각을 현실과 구분하세요. 결정을 미루지 말고 하나씩 움직이는 것이 필요합니다.",
      neutral:   "자신에 대한 새로운 관점이 열리는 날입니다. 다양한 방향을 탐색하되 하나를 선택하는 용기가 필요합니다. 소통이 자기 이해를 깊게 합니다.",
    },
    "물": {
      strength:  "직관이 자아의 방향을 선명하게 안내합니다. 내면의 감각과 연결될 때 에너지가 깊어집니다. 자신에 대한 깊은 이해가 오늘 열립니다.",
      challenge: "감정이 자아를 압도할 수 있습니다. 타인의 에너지를 자신의 것으로 흡수하지 않도록 경계를 설정하세요. 내면의 소음과 거리를 두는 시간이 필요합니다.",
      neutral:   "직관과 이성이 교차하는 날입니다. 내면의 흐름에 귀 기울이며 자신의 감각을 신뢰하세요. 조용한 자기 관찰이 오늘 가장 유익합니다.",
    },
  },
  "감정·내면": {
    "불": {
      strength:  "내면의 열정이 오늘 방향을 밝혀줍니다. 자신이 원하는 것이 선명하게 느껴집니다. 이 에너지를 행동으로 연결하면 강력한 변화가 시작됩니다.",
      challenge: "감정이 과열되면 판단이 흐려집니다. 잠시 멈추고 호흡을 정리하세요. 충동적 결정보다 내면의 중심을 먼저 찾는 것이 오늘 중요합니다.",
      neutral:   "내면에서 새로운 움직임이 시작됩니다. 작게 올라오는 열망과 흥미가 방향을 알려주고 있습니다. 그 신호를 그냥 지나치지 마세요.",
    },
    "흙": {
      strength:  "내면이 안정적으로 회복됩니다. 현실 기반에서 자신의 필요를 명확히 인식할 수 있습니다. 자기 돌봄이 오늘 특히 효과적입니다.",
      challenge: "감정을 눌러두면 결국 더 크게 올라옵니다. 혼자 편하게 있을 수 있는 자리에서 감정을 천천히 마주해보세요. 무엇이 마음을 막고 있는지도 같이 보세요.",
      neutral:   "내면을 점검하고 정리하기 좋은 날입니다. 안정된 환경이 내면 회복에 도움됩니다. 작은 자기 돌봄이 오늘 의미 있습니다.",
    },
    "공기": {
      strength:  "감정을 명확히 이해하고 언어화하는 능력이 높아집니다. 자기 이해가 깊어지는 날입니다. 내면의 목소리를 글로 적거나 누군가와 나눠보세요.",
      challenge: "논리로 감정을 눌러 담으려 할수록 오히려 더 복잡해집니다. 느껴지는 감정을 밀어내지 마세요. 오늘은 분석보다 직접 느끼는 쪽이 더 중요합니다.",
      neutral:   "내면의 목소리를 언어로 표현해보세요. 감정 일기나 대화가 오늘 내면을 정리하는 데 도움됩니다.",
    },
    "물": {
      strength:  "감수성이 내면을 깊이 적시는 날입니다. 자신의 감정과 진실하게 연결되어 있습니다. 직관을 신뢰하고 내면의 지혜를 따르세요.",
      challenge: "감정의 경계가 흐릿해질 수 있습니다. 다른 사람의 에너지를 자신의 것으로 흡수하지 않도록 주의하세요. 의식적으로 경계를 설정하는 것이 오늘 필요합니다.",
      neutral:   "직관과 감정이 교차하는 날입니다. 자신의 리듬에 귀 기울이며 필요한 공간을 만드세요. 조용한 시간이 내면을 회복시킵니다.",
    },
  },
};

/**
 * Build a full DomainDetail for a specific domain key (love/friends/work/family).
 * Personalised by natal chart element + transit tone for the given date.
 */
export function buildDomainDetail(
  domainKey: string,
  natal: NatalChart,
  transitDate: Date,
): DomainDetail {
  const domain = DOMAIN_KEY_TO_INTERNAL[domainKey] ?? "관계";
  const transitLons = computeTransitPositions(transitDate);
  const moonLon = transitLons.get("Moon")!;
  const moonSign = signFromLongitude(moonLon);

  const reading = buildDomainReading(domain, natal, transitLons, moonSign, transitDate);

  const domainPlanets = DOMAIN_PLANETS[domain] ?? ["Sun"];
  const primaryNatal = natal.planets.find((p) => p.planet === domainPlanets[0]);
  const primaryElement = ((primaryNatal ? SIGN_ELEMENT[primaryNatal.sign] : "공기") ?? "공기") as Elem;
  const tone = reading.tone;

  const bullets = BULLETS_BASE[domain]?.[primaryElement]?.[tone] ?? [];
  const summary = SUMMARY_TEMPLATES[domain]?.[primaryElement]?.[tone] ?? reading.note;
  const statusLabel = STATUS_LABELS[domainKey]?.[tone] ?? "오늘의 에너지";

  // Find the transit most relevant to this domain's key natal planets
  const deepList = buildTransitDeepList(natal, transitDate);
  const primaryTransit =
    deepList.find((d) => (domainPlanets as PlanetName[]).includes(d.natalPlanet))
    ?? deepList[0];

  return {
    domainKey,
    domain,
    statusLabel,
    headline: reading.headline,
    bullets,
    summary,
    reasons: reading.reasons ?? [],
    tone,
    primaryTransit,
  };
}

// ── Transit deep-detail engine ────────────────────────────────────────────────

const ASPECT_ANGLE: Record<AspectName, number> = {
  conjunction: 0, sextile: 60, square: 90, trine: 120, opposition: 180,
};

const TRANSIT_FREQ: Record<PlanetName, string> = {
  Moon:    "며칠마다 한 번씩",
  Mercury: "3~4주마다 한 번씩",
  Venus:   "약 6개월마다 한 번씩",
  Sun:     "1년에 한 번씩",
  Mars:    "약 2년마다 한 번씩",
  Jupiter: "약 12년마다 한 번씩",
  Saturn:  "약 30년마다 한 번씩",
  Uranus:  "일생에 한 번씩",
  Neptune: "일생에 한 번씩",
  Pluto:   "일생에 한 번씩",
};

const NATAL_DOMAIN_TAGS: Record<PlanetName, string[]> = {
  Sun:     ["자아", "정체성", "의지"],
  Moon:    ["감정", "직관", "내면"],
  Mercury: ["사고", "소통", "언어"],
  Venus:   ["관계", "사랑", "가치"],
  Mars:    ["행동", "욕구", "에너지"],
  Jupiter: ["성장", "확장", "가능성"],
  Saturn:  ["구조", "책임", "한계"],
  Uranus:  ["변화", "혁신", "자유"],
  Neptune: ["꿈", "초월", "영감"],
  Pluto:   ["변혁", "심층", "권력"],
};

/** Subject phrase — varies by tag and tone */
const SUBJECT_BY_TAG_TONE: Record<string, Record<"strength"|"challenge"|"neutral", string>> = {
  "자아":  {
    strength:  "당신의 자아 에너지가 강렬하게 빛을 발하며",
    challenge: "당신의 정체성에 긴장이 집중되며",
    neutral:   "당신의 자아 표현 방식이",
  },
  "감정":  {
    strength:  "감정의 흐름이 또렷하게 정렬되며",
    challenge: "감정의 파도가 표면으로 밀려오며",
    neutral:   "감정과 직관이",
  },
  "사고":  {
    strength:  "사고가 선명해지고 소통의 문이 열리며",
    challenge: "사고 패턴에 마찰이 생기며",
    neutral:   "사고 방식과 언어가",
  },
  "관계":  {
    strength:  "관계의 에너지가 따뜻하게 활성화되며",
    challenge: "관계에서 긴장이 수면 위로 드러나며",
    neutral:   "관계의 흐름과 교감이",
  },
  "행동":  {
    strength:  "행동 에너지가 강하게 집중되며",
    challenge: "행동 충동에 저항이 걸리며",
    neutral:   "행동과 욕구의 방향이",
  },
  "성장":  {
    strength:  "성장과 확장의 문이 열리며",
    challenge: "성장 과정에서 마찰이 생기며",
    neutral:   "성장과 가능성의 감각이",
  },
  "구조":  {
    strength:  "구조와 책임 감각이 단단해지며",
    challenge: "구조에 압력이 가해지며",
    neutral:   "당신의 구조와 책임 감각이",
  },
  "변화":  {
    strength:  "변화의 에너지가 자연스럽게 흐르며",
    challenge: "변화에 대한 저항이 긴장을 만들며",
    neutral:   "변화와 혁신의 흐름이",
  },
  "꿈":    {
    strength:  "직관과 영감의 층위가 열리며",
    challenge: "경계가 흐릿해지며 혼란이 생기고",
    neutral:   "꿈과 직관의 층위가",
  },
  "변혁":  {
    strength:  "심층의 변혁 에너지가 움직이며",
    challenge: "심층에서 강한 압력이 올라오며",
    neutral:   "심층 변혁의 흐름이",
  },
};

/** Verb phrase — aspect × transit planet class × tone */
const ASPECT_VERB_RICH: Record<AspectName, Record<"beneficial"|"malefic"|"neutral", (p: string) => string>> = {
  conjunction: {
    beneficial: (p) => `${p}의 에너지와 깊이 융합됩니다`,
    malefic:    (p) => `${p}의 강한 에너지가 직접 충돌합니다`,
    neutral:    (p) => `${p}과 같은 공간에 겹쳐지며 활성화됩니다`,
  },
  trine: {
    beneficial: (p) => `${p}의 흐름과 자연스럽게 공명합니다`,
    malefic:    (p) => `${p}${josaIG(p)} 부드럽게 흘러들며 구조화됩니다`,
    neutral:    (p) => `${p}과 유연하게 연결되며 흐릅니다`,
  },
  sextile: {
    beneficial: (p) => `${p}${josaIG(p)} 가벼운 기회의 문을 열어줍니다`,
    malefic:    (p) => `${p}${josaIG(p)} 미묘한 자극을 만들어냅니다`,
    neutral:    (p) => `${p}과 가볍게 접촉하며 기회를 만듭니다`,
  },
  square: {
    beneficial: (p) => `${p}${josaIG(p)} 긴장을 만들지만 성장을 촉진합니다`,
    malefic:    (p) => `${p}의 압력이 강한 마찰을 일으킵니다`,
    neutral:    (p) => `${p}과 마주서며 움직임을 요구합니다`,
  },
  opposition: {
    beneficial: (p) => `${p}과 마주하며 균형을 찾아갑니다`,
    malefic:    (p) => `${p}과 정면으로 충돌하며 긴장이 절정에 이릅니다`,
    neutral:    (p) => `${p}과 정반대에서 균형을 탐색합니다`,
  },
};

/** Object phrase — how the natal planet in its sign responds */
function josaIG(w: string) { const c = w.charCodeAt(w.length-1); return c >= 0xAC00 && (c-0xAC00)%28 !== 0 ? "이" : "가"; }
function josaER(w: string) { const c = w.charCodeAt(w.length-1); return c >= 0xAC00 && (c-0xAC00)%28 !== 0 ? "을" : "를"; }
const OBJECT_BY_NATAL: Record<PlanetName, Record<"strength"|"challenge"|"neutral", (sign: string, note: string) => string>> = {
  Sun: {
    strength:  (s, n) => `당신의 ${s} 태양이 지닌 ${n}${josaIG(n)} 빛을 발합니다`,
    challenge: (s, n) => `당신의 ${s} 태양이 지닌 ${n}에 압력이 걸립니다`,
    neutral:   (s, n) => `당신의 ${s} 태양의 ${n}${josaER(n)} 자극합니다`,
  },
  Moon: {
    strength:  (s, n) => `${s} 달의 ${n}${josaIG(n)} 부드럽게 공명합니다`,
    challenge: (s, n) => `${s} 달의 ${n}${josaIG(n)} 흔들립니다`,
    neutral:   (s, n) => `${s} 달의 ${n}${josaER(n)} 건드립니다`,
  },
  Mercury: {
    strength:  (s, n) => `${s} 수성의 ${n}${josaIG(n)} 선명해집니다`,
    challenge: (s, n) => `${s} 수성의 ${n}에 간섭이 일어납니다`,
    neutral:   (s, n) => `${s} 수성의 ${n}${josaER(n)} 활성화합니다`,
  },
  Venus: {
    strength:  (s, n) => `${s} 금성이 품은 ${n}${josaIG(n)} 꽃을 피웁니다`,
    challenge: (s, n) => `${s} 금성이 품은 ${n}에 긴장이 드리웁니다`,
    neutral:   (s, n) => `${s} 금성의 ${n}${josaER(n)} 자극합니다`,
  },
  Mars: {
    strength:  (s, n) => `${s} 화성의 ${n}${josaIG(n)} 강하게 점화됩니다`,
    challenge: (s, n) => `${s} 화성의 ${n}${josaIG(n)} 마찰을 일으킵니다`,
    neutral:   (s, n) => `${s} 화성의 ${n}${josaER(n)} 활성화합니다`,
  },
  Jupiter: {
    strength:  (s, n) => `${s} 목성의 ${n}${josaIG(n)} 자연스럽게 확장됩니다`,
    challenge: (s, n) => `${s} 목성의 ${n}에 과잉의 위험이 있습니다`,
    neutral:   (s, n) => `${s} 목성의 ${n}${josaER(n)} 자극합니다`,
  },
  Saturn: {
    strength:  (s, n) => `${s} 토성의 ${n}${josaIG(n)} 단단히 다져집니다`,
    challenge: (s, n) => `${s} 토성의 ${n}${josaIG(n)} 더욱 압박됩니다`,
    neutral:   (s, n) => `${s} 토성의 ${n}${josaER(n)} 활성화합니다`,
  },
  Uranus: {
    strength:  (s, n) => `${s} 천왕성의 ${n}${josaIG(n)} 해방됩니다`,
    challenge: (s, n) => `${s} 천왕성의 ${n}${josaIG(n)} 예기치 않게 폭발합니다`,
    neutral:   (s, n) => `${s} 천왕성의 ${n}${josaER(n)} 자극합니다`,
  },
  Neptune: {
    strength:  (s, n) => `${s} 해왕성의 ${n}${josaIG(n)} 깊어집니다`,
    challenge: (s, n) => `${s} 해왕성의 ${n}${josaIG(n)} 흐릿하게 번집니다`,
    neutral:   (s, n) => `${s} 해왕성의 ${n}${josaER(n)} 자극합니다`,
  },
  Pluto: {
    strength:  (s, n) => `${s} 명왕성의 ${n}${josaIG(n)} 심층에서 올라옵니다`,
    challenge: (s, n) => `${s} 명왕성의 ${n}${josaIG(n)} 강제적 변혁을 촉구합니다`,
    neutral:   (s, n) => `${s} 명왕성의 ${n}${josaER(n)} 건드립니다`,
  },
};

/**
 * Build a full TransitDeepDetail for one transit-to-natal aspect pair.
 * Generates structured sentence fragments + domain metadata.
 */
function buildOneDeepDetail(
  transitPlanet: PlanetName,
  natalPlanet: PlanetName,
  natalSign: SignName,
  aspectType: AspectName,
  orb: number,
): TransitDeepDetail {
  const cls = transitClass(transitPlanet);
  const softAspects: AspectName[] = ["trine", "sextile", "conjunction"];
  const hardAspects: AspectName[] = ["square", "opposition"];
  let tone: "strength" | "challenge" | "neutral" = "neutral";
  if (cls === "beneficial" && softAspects.includes(aspectType)) tone = "strength";
  else if (cls === "malefic" && hardAspects.includes(aspectType)) tone = "challenge";

  const domainTags = NATAL_DOMAIN_TAGS[natalPlanet] ?? ["자아"];
  const primaryTag = domainTags[0];

  const subjectPhrase =
    SUBJECT_BY_TAG_TONE[primaryTag]?.[tone]
    ?? `${PLANET_KO[natalPlanet]}의 에너지가`;

  const verbCls = cls === "neutral" ? "neutral" : cls;
  const verbPhrase =
    ASPECT_VERB_RICH[aspectType]?.[verbCls]?.(PLANET_KO[transitPlanet])
    ?? `${PLANET_KO[transitPlanet]}과 연결됩니다`;

  const noteRaw = PLANET_NOTES[natalPlanet]?.[natalSign] ?? "고유한 에너지";
  const signKo = SIGN_KO[natalSign] ?? natalSign;
  const objectPhrase =
    OBJECT_BY_NATAL[natalPlanet]?.[tone]?.(signKo, noteRaw)
    ?? `${signKo} ${PLANET_KO[natalPlanet]}의 ${noteRaw}를 자극합니다`;

  const fullPhrase = `${subjectPhrase} ${verbPhrase}. ${objectPhrase}.`;

  return {
    transitPlanet,
    natalPlanet,
    natalSign,
    aspectType,
    aspectAngle: ASPECT_ANGLE[aspectType],
    orb,
    domainTags,
    frequency: TRANSIT_FREQ[transitPlanet] ?? "주기적으로",
    subjectPhrase,
    verbPhrase,
    objectPhrase,
    fullPhrase,
    tone,
  };
}

/**
 * Compute all active transit-to-natal aspects for the given date and natal chart.
 * Returns them sorted by orb (tightest first), wrapped in TransitDeepDetail.
 * The list index matches the [id] used by /home/transits/[id].
 */
export function buildTransitDeepList(
  natal: NatalChart,
  transitDate: Date,
): TransitDeepDetail[] {
  const transitLons = computeTransitPositions(transitDate);
  const natalByName = new Map<PlanetName, { longitude: number; sign: SignName }>(
    natal.planets.map((p) => [p.planet, { longitude: p.longitude, sign: p.sign }]),
  );

  const ORB_LIMIT = 6;
  const TRANSIT_PLANETS: PlanetName[] = [
    "Moon", "Mercury", "Venus", "Sun", "Mars",
    "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
  ];
  const NATAL_PLANETS: PlanetName[] = [
    "Sun", "Moon", "Mercury", "Venus", "Mars",
    "Jupiter", "Saturn",
  ];

  const results: Array<TransitDeepDetail & { _orb: number }> = [];

  for (const tp of TRANSIT_PLANETS) {
    const tLon = transitLons.get(tp);
    if (tLon == null) continue;
    for (const np of NATAL_PLANETS) {
      if (tp === np) continue; // skip Sun conjunct natal Sun trivially (already in interpretTransits)
      const nData = natalByName.get(np);
      if (!nData) continue;
      const asp = findAspect(tLon, nData.longitude);
      if (!asp || asp.orb > ORB_LIMIT) continue;
      results.push({ ...buildOneDeepDetail(tp, np, nData.sign, asp.name, asp.orb), _orb: asp.orb });
    }
  }

  // Sort: tightest orb first; Moon transits last (too frequent)
  results.sort((a, b) => {
    const moonPenaltyA = a.transitPlanet === "Moon" ? 20 : 0;
    const moonPenaltyB = b.transitPlanet === "Moon" ? 20 : 0;
    return (a._orb + moonPenaltyA) - (b._orb + moonPenaltyB);
  });

  // Deduplicate: keep only the tightest aspect per natal planet,
  // and also suppress reverse-direction pairs (e.g. Sun→Jupiter with Jupiter→Sun same deg).
  const seenNatal = new Set<PlanetName>();
  const seenPair  = new Set<string>();
  return results.filter((r) => {
    if (seenNatal.has(r.natalPlanet)) return false;
    const rev = `${r.natalPlanet}__${r.transitPlanet}`;
    if (seenPair.has(rev)) return false;
    seenNatal.add(r.natalPlanet);
    seenPair.add(`${r.transitPlanet}__${r.natalPlanet}`);
    return true;
  });
}

// ── TodayDeepReport engine ────────────────────────────────────────────────────
// All editorial content is derived from the primary transit in buildTransitDeepList.
// No section uses a different aspect source.

const ASPECT_ANGLE_LABEL: Record<AspectName, string> = {
  conjunction: "CONJUNCTION (0°)",
  sextile:     "SEXTILE (60°)",
  square:      "SQUARE (90°)",
  trine:       "TRINE (120°)",
  opposition:  "OPPOSITION (180°)",
};

const DEEP_HEADLINE: Record<AspectName, Record<"strength"|"challenge"|"neutral", (tp: string, np: string) => string>> = {
  conjunction: {
    strength:  (tp, np) => `${tp}이 ${np}을 건드리는 날. 오늘 이 에너지가 당신 안에 있습니다.`,
    challenge: (tp, np) => `${tp}과 ${np}이 충돌합니다. 이 압력을 무시하지 마세요.`,
    neutral:   (tp, np) => `${tp}이 ${np}의 영역에 겹쳐집니다. 무언가가 조용히 시작됩니다.`,
  },
  trine: {
    strength:  (tp, np) => `${tp}과 ${np}이 오늘 같은 방향을 가리킵니다. 흐름을 신뢰하세요.`,
    challenge: (tp, np) => `${tp}의 조화로운 흐름이 ${np}을 은근히 자극합니다.`,
    neutral:   (tp, np) => `${tp}과 ${np}이 삼각으로 연결되어 있습니다. 부드럽지만 분명한 접촉입니다.`,
  },
  sextile: {
    strength:  (tp, np) => `${tp}이 ${np}에 기회의 창을 열어놓았습니다. 지금 그 창 앞에 있습니다.`,
    challenge: (tp, np) => `${tp}이 ${np}에 가벼운 마찰을 일으킵니다. 초기에 읽어야 합니다.`,
    neutral:   (tp, np) => `${tp}과 ${np}이 접촉하고 있습니다. 가능성이 표면 아래에 있습니다.`,
  },
  square: {
    strength:  (tp, np) => `${tp}과 ${np}의 긴장. 이 마찰이 오늘 당신을 움직이게 합니다.`,
    challenge: (tp, np) => `${tp}과 ${np}이 직각으로 맞섭니다. 직면이 지금 가장 필요한 것입니다.`,
    neutral:   (tp, np) => `${tp}과 ${np}이 각도를 만들고 있습니다. 움직임을 요구합니다.`,
  },
  opposition: {
    strength:  (tp, np) => `${tp}과 ${np}이 마주 보고 있습니다. 오늘은 균형이 가능합니다.`,
    challenge: (tp, np) => `${tp}과 ${np}이 정반대에서 당기고 있습니다. 이 긴장의 중심을 찾으세요.`,
    neutral:   (tp, np) => `${tp}과 ${np}이 맞은편에서 균형을 탐색합니다.`,
  },
};

const DEEP_INTRO: Record<AspectName, Record<"strength"|"challenge"|"neutral", (tp: string, sign: string, np: string) => string>> = {
  conjunction: {
    strength:  (tp, sign, np) => `현재 ${tp}${josa(tp,"이/가")} 당신의 ${sign} ${np}${josa(np,"와/과")} 정확히 겹쳐지며 에너지를 활성화합니다. 이 배치는 집중력과 추진력을 만들고, 당신의 고유한 에너지가 외부 흐름과 결합하는 드문 순간입니다. 이 창이 열려 있는 동안 분명한 의도를 가지고 움직이세요.`,
    challenge: (tp, sign, np) => `현재 ${tp}${josa(tp,"이/가")} 당신의 ${sign} ${np}${josa(np,"을/를")} 직접 압박하고 있습니다. 이 접촉은 불편함을 만들지만, 그 불편함이 변화의 재료입니다. 저항보다 탐색이, 회피보다 직면이 지금을 통과하는 방식입니다.`,
    neutral:   (tp, sign, np) => `현재 ${tp}${josa(tp,"이/가")} 당신의 ${sign} ${np}의 영역에 겹쳐지고 있습니다. 눈에 띄지 않는 변화가 일어나고 있습니다. 주의를 기울이면 이 순간이 무엇을 가리키는지 볼 수 있습니다.`,
  },
  trine: {
    strength:  (tp, sign, np) => `현재 ${tp}${josa(tp,"이/가")} 당신의 ${sign} ${np}${josa(np,"와/과")} 120도의 조화로운 각도를 이루고 있습니다. 이 배치는 자연스러운 흐름과 지지를 만듭니다. 억지로 밀어붙이지 않아도 되는 날입니다. 흐름을 신뢰하고 가볍게 움직이세요.`,
    challenge: (tp, sign, np) => `현재 ${tp}${josa(tp,"이/가")} 당신의 ${sign} ${np}${josa(np,"와/과")} 삼각을 이루고 있습니다. 표면적으로 부드러워 보이지만, 이 에너지는 서서히 압력을 만듭니다. 편안함 속에 묻힌 신호를 놓치지 마세요.`,
    neutral:   (tp, sign, np) => `현재 ${tp}${josa(tp,"와/과")} 당신의 ${sign} ${np}${josa(np,"이/가")} 삼각으로 연결되어 있습니다. 에너지가 유연하게 흐르고 있습니다. 이 연결이 무엇을 열고 있는지 천천히 살펴보세요.`,
  },
  sextile: {
    strength:  (tp, sign, np) => `현재 ${tp}${josa(tp,"이/가")} 당신의 ${sign} ${np}${josa(np,"와/과")} 60도의 기회 각도를 이루고 있습니다. 이 창은 작지만 분명합니다. 작은 시도가 의외로 큰 결과로 이어질 수 있는 시점입니다.`,
    challenge: (tp, sign, np) => `현재 ${tp}${josa(tp,"이/가")} 당신의 ${sign} ${np}${josa(np,"와/과")} 육분으로 접촉하고 있습니다. 미묘한 자극이 있습니다. 아직 드러나지 않은 마찰의 씨앗이 있으니, 흐름을 주의 깊게 살피세요.`,
    neutral:   (tp, sign, np) => `현재 ${tp}${josa(tp,"와/과")} 당신의 ${sign} ${np}${josa(np,"이/가")} 육분으로 가볍게 접촉하고 있습니다. 눈에 띄지 않는 기회가 표면 아래에 있습니다. 조금 더 주의를 기울이면 보입니다.`,
  },
  square: {
    strength:  (tp, sign, np) => `현재 ${tp}${josa(tp,"이/가")} 당신의 ${sign} ${np}${josa(np,"와/과")} 90도의 긴장 각도를 이루고 있습니다. 마찰처럼 느껴지지만, 이 압력이 성장의 재료입니다. 불편함을 회피하지 말고 그 안의 동력을 꺼내세요.`,
    challenge: (tp, sign, np) => `현재 ${tp}${josa(tp,"이/가")} 당신의 ${sign} ${np}에 직각으로 충돌하고 있습니다. 이 긴장은 무시할 수 없습니다. 상황이 당신에게 무언가를 요구하고 있습니다. 그 요구에 응하는 것이 지금을 통과하는 방법입니다.`,
    neutral:   (tp, sign, np) => `현재 ${tp}${josa(tp,"와/과")} 당신의 ${sign} ${np}${josa(np,"이/가")} 직각을 이루고 있습니다. 이 각도는 움직임을 요구합니다. 저항보다 흐름에 합류하는 방향이 더 유리합니다.`,
  },
  opposition: {
    strength:  (tp, sign, np) => `현재 ${tp}${josa(tp,"와/과")} 당신의 ${sign} ${np}${josa(np,"이/가")} 정반대에서 마주보고 있습니다. 이 대립은 균형의 기회입니다. 한쪽을 포기하지 않고 두 힘을 모두 담을 수 있는 방법을 찾아보세요.`,
    challenge: (tp, sign, np) => `현재 ${tp}${josa(tp,"와/과")} 당신의 ${sign} ${np}${josa(np,"이/가")} 180도로 당기고 있습니다. 어느 방향으로도 치우치면 불안정해집니다. 이 긴장의 중간 지점을 찾는 것이 오늘의 과제입니다.`,
    neutral:   (tp, sign, np) => `현재 ${tp}${josa(tp,"와/과")} 당신의 ${sign} ${np}${josa(np,"이/가")} 맞은편에서 균형을 탐색하고 있습니다. 외부와 내부, 요구와 욕구 사이의 지점을 의식해보세요.`,
  },
};

const DEEP_EARTH_HEADLINE: Record<AspectName, Record<"strength"|"challenge"|"neutral", (tp: string, np: string) => string>> = {
  conjunction: {
    strength:  (tp, np) => `${tp}과 ${np}이 겹치는 날, 일상에서 보이는 것들`,
    challenge: (tp, np) => `${tp}과 ${np}의 압박이 일상에 나타나는 방식`,
    neutral:   (tp, np) => `${tp}이 ${np}의 영역에 들어온 날`,
  },
  trine: {
    strength:  (tp, np) => `${tp}과 ${np}이 조화를 이루는 날의 일상`,
    challenge: (tp, np) => `${tp}의 조화가 ${np}에 남기는 것들`,
    neutral:   (tp, np) => `${tp}과 ${np}이 연결된 날의 흐름`,
  },
  sextile: {
    strength:  (tp, np) => `${tp}이 ${np}에 창을 열어준 날`,
    challenge: (tp, np) => `${tp}이 ${np}에 마찰을 일으키는 방식`,
    neutral:   (tp, np) => `${tp}과 ${np}이 접촉하는 날의 신호`,
  },
  square: {
    strength:  (tp, np) => `${tp}과 ${np}의 긴장이 일상을 움직이는 방식`,
    challenge: (tp, np) => `${tp}과 ${np}이 충돌하는 날, 주의할 것들`,
    neutral:   (tp, np) => `${tp}과 ${np}의 각도가 요구하는 것들`,
  },
  opposition: {
    strength:  (tp, np) => `${tp}과 ${np}이 균형을 찾는 날의 일상`,
    challenge: (tp, np) => `${tp}과 ${np}이 당기는 날, 조율이 필요한 것들`,
    neutral:   (tp, np) => `${tp}과 ${np}이 맞선 날의 신호`,
  },
};

/** Short bridge sentence connecting the body text to the space section. */
const NARRATIVE_BRIDGE: Record<AspectName, Record<"strength"|"challenge"|"neutral", (tp: string, np: string) => string>> = {
  conjunction: {
    strength:  (tp, np) => `지금 하늘에서 ${tp}이 실제로 ${np}을 건드리고 있습니다.`,
    challenge: (tp, np) => `이 압력은 지금 하늘에서 벌어지는 실제 사건입니다. ${tp}과 ${np}이 정면으로 겹쳐져 있습니다.`,
    neutral:   (tp, np) => `지금 하늘에서 ${tp}이 ${np}의 자리에 겹쳐지고 있습니다.`,
  },
  trine: {
    strength:  (tp, np) => `이 흐름은 이유가 있습니다. 지금 하늘에서 ${tp}과 ${np}이 120도로 이어져 있습니다.`,
    challenge: (tp, np) => `부드럽게 느껴지지만, 하늘에서 ${tp}과 ${np}은 지금도 접촉 중입니다.`,
    neutral:   (tp, np) => `지금 하늘에서 ${tp}과 ${np}이 삼각으로 연결되어 있습니다.`,
  },
  sextile: {
    strength:  (tp, np) => `이 기회는 바깥에서 오고 있습니다. 하늘에서 ${tp}이 ${np} 쪽으로 60도 창을 열었습니다.`,
    challenge: (tp, np) => `가벼운 마찰이지만, 하늘에서 ${tp}과 ${np}이 60도 간격으로 접촉 중입니다.`,
    neutral:   (tp, np) => `지금 하늘에서 ${tp}과 ${np}이 육분으로 가볍게 연결되어 있습니다.`,
  },
  square: {
    strength:  (tp, np) => `이 긴장은 하늘에서도 그대로 보입니다. ${tp}과 ${np}이 90도로 맞서 있습니다.`,
    challenge: (tp, np) => `지금 하늘에서 ${tp}과 ${np}이 직각으로 충돌하고 있습니다.`,
    neutral:   (tp, np) => `지금 하늘에서 ${tp}과 ${np}이 90도 각도를 이루고 있습니다.`,
  },
  opposition: {
    strength:  (tp, np) => `균형의 이유가 있습니다. 하늘에서 ${tp}과 ${np}이 정반대에서 마주 보고 있습니다.`,
    challenge: (tp, np) => `지금 하늘에서 ${tp}과 ${np}이 180도로 맞선 채 당기고 있습니다.`,
    neutral:   (tp, np) => `지금 하늘에서 ${tp}과 ${np}이 맞은편에서 균형을 이루고 있습니다.`,
  },
};

/** 6-item pools. buildTodayDeepReport slices 4 starting at dateSeed % 3. */
const DEEP_BULLETS: Record<AspectName, Record<"strength"|"challenge"|"neutral", string[]>> = {
  conjunction: {
    strength:  [
      "원하는 것이 선명하게 느껴집니다. 지금 그것을 말해보세요.",
      "에너지가 집중되어 있습니다. 여러 방향으로 분산하지 마세요.",
      "중요한 결정을 내리기 좋은 시점입니다. 미루지 마세요.",
      "자신의 에너지 방향이 외부 흐름과 맞아 떨어지는 날입니다.",
      "원하는 것에 집중하되, 욕심과 의도를 구분하세요.",
      "지금 이 힘을 분산하면 아무것도 완성되지 않습니다.",
    ],
    challenge: [
      "강한 압박이 느껴질 수 있습니다. 반응하기 전에 잠시 멈추세요.",
      "불편함이 내면에서 오는 것인지 외부에서 오는 것인지 구분하세요.",
      "무리한 행동보다 명확한 의도가 지금 더 중요합니다.",
      "회피보다 직면이 이 긴장을 더 빠르게 통과하게 합니다.",
      "저항이 어디에서 오는지 파악하는 것이 먼저입니다.",
      "지금 충동적으로 행동하면 나중에 정리할 것이 늘어납니다.",
    ],
    neutral:   [
      "평소와 다른 감각이 있습니다. 그 감각에 이름을 붙여보세요.",
      "이 배치 동안 자신의 내면 반응을 천천히 관찰해보세요.",
      "무언가가 조용히 활성화되고 있습니다. 서두르지 마세요.",
      "흐름에 맞서지 말고 함께 움직이는 방향을 찾아보세요.",
      "지금 일어나는 변화는 작지만 방향이 있습니다.",
      "이 접촉이 어디로 이어지는지 관찰하는 것이 오늘의 작업입니다.",
    ],
  },
  trine: {
    strength:  [
      "흐름이 자연스럽습니다. 억지로 만들려 하지 않아도 됩니다.",
      "이 시기에 시작한 것은 비교적 순조롭게 진행될 가능성이 높습니다.",
      "타인과의 협력이 평소보다 원활하게 느껴질 수 있습니다.",
      "자신의 강점이 자연스럽게 드러나는 시기입니다.",
      "힘을 아끼면서도 움직일 수 있는 날입니다.",
      "지금 흐름이 열린 방향으로 걸어가면 됩니다.",
    ],
    challenge: [
      "편안함 속에서 놓치는 신호가 있을 수 있습니다. 주의하세요.",
      "부드러운 압력이 서서히 쌓이고 있습니다. 초기에 인식하세요.",
      "지나치게 안도하지 마세요. 이 에너지는 조용히 움직입니다.",
      "변화는 급격하지 않게 일어나지만 그래서 더 놓치기 쉽습니다.",
      "표면적 안정감 아래에 다른 흐름이 있을 수 있습니다.",
      "느슨해진 주의력이 작은 마찰을 키울 수 있습니다.",
    ],
    neutral:   [
      "에너지가 유연하게 흐르고 있습니다. 이 흐름을 방해하지 마세요.",
      "강한 충동 없이 움직이는 날입니다. 작은 것에 집중하세요.",
      "이 배치는 배경처럼 작동합니다. 눈에 띄지 않지만 영향을 줍니다.",
      "흐름이 어디로 향하는지 관찰하는 것이 오늘의 작업입니다.",
      "특별한 사건 없이 지나갈 수 있지만, 무언가 조용히 정렬됩니다.",
      "지금 내면의 흐름 방향과 바깥의 흐름 방향이 잠시 일치합니다.",
    ],
  },
  sextile: {
    strength:  [
      "작은 기회가 표면 위에 있습니다. 움직이면 잡을 수 있습니다.",
      "이 창은 크지 않습니다. 하지만 놓치지 않으면 충분합니다.",
      "주변의 연결이 평소보다 더 유익하게 작동합니다.",
      "작은 시도가 의외로 큰 결과로 이어질 수 있습니다.",
      "지금 먼저 움직이는 것이 이 에너지를 활성화합니다.",
      "문을 두드리면 열릴 가능성이 있습니다. 두드려보세요.",
    ],
    challenge: [
      "가벼운 마찰이 감지됩니다. 무시하면 나중에 커질 수 있습니다.",
      "미묘한 불일치가 있는지 살펴보세요.",
      "표면 아래의 신호를 읽는 것이 오늘 중요합니다.",
      "작은 조정이 큰 충돌을 예방합니다.",
      "지금 느끼는 불편함은 경고 신호입니다. 무시하지 마세요.",
      "마찰이 쌓이기 전에 원인을 파악하는 것이 유리합니다.",
    ],
    neutral:   [
      "기회의 창이 가볍게 열려 있습니다. 가볍게 두드려보세요.",
      "평소보다 연결이 쉽게 만들어질 수 있습니다.",
      "강하지 않지만 유익한 흐름이 있습니다.",
      "이 배치는 시도를 격려합니다. 작게 시작해도 됩니다.",
      "지금 행동하면 흐름이 도와줍니다.",
      "접촉의 기회가 있습니다. 먼저 내밀어보세요.",
    ],
  },
  square: {
    strength:  [
      "이 긴장이 방향을 만들어줍니다. 마찰을 동력으로 전환하세요.",
      "불편한 질문에 직면하는 것이 오늘의 과제입니다.",
      "저항이 클수록 돌파구도 클 수 있습니다.",
      "이 에너지가 지나가면 무언가 남습니다. 지금을 잘 통과하세요.",
      "긴장을 회피하면 이 흐름의 동력을 잃게 됩니다.",
      "지금이 변화의 재료가 만들어지는 시점입니다.",
    ],
    challenge: [
      "강한 마찰이 있습니다. 충동적 반응보다 의식적 선택이 필요합니다.",
      "지금은 강행보다 조율이 더 유리합니다.",
      "이 긴장은 빠르게 해결되지 않을 수 있습니다. 긴 관점이 필요합니다.",
      "저항이 어디서 오는지 먼저 파악하세요.",
      "지금 싸우기보다 이해하는 쪽으로 에너지를 쓰세요.",
      "한 가지 잘못된 결정이 여러 개의 마찰을 만들 수 있습니다.",
    ],
    neutral:   [
      "움직임이 요구되는 날입니다. 정체보다 시도가 낫습니다.",
      "방향이 불분명하다면 작은 결정부터 시작하세요.",
      "이 각도는 행동을 촉구합니다. 그 촉구를 무시하지 마세요.",
      "마찰 속에 숨겨진 정보가 있습니다.",
      "지금 움직이지 않으면 이 흐름이 지나갑니다.",
      "작은 선택도 지금은 의미를 갖습니다.",
    ],
  },
  opposition: {
    strength:  [
      "두 개의 힘이 맞서고 있습니다. 양쪽을 모두 담는 것이 가능합니다.",
      "다른 관점이 있을 때 더 완전한 그림이 보입니다.",
      "이 균형을 찾는 과정이 오늘의 핵심 작업입니다.",
      "타인의 반응이 오늘 당신에게 유용한 거울이 됩니다.",
      "한쪽을 포기하지 않아도 됩니다. 두 방향을 동시에 안을 수 있습니다.",
      "지금 대립은 통합의 첫 단계일 수 있습니다.",
    ],
    challenge: [
      "반대 방향에서 당기는 힘이 있습니다. 억지로 해결하려 하지 마세요.",
      "이 긴장에서 벗어나려 할수록 더 강해질 수 있습니다. 잠시 머무르세요.",
      "타인과의 충돌이 사실은 내면 갈등의 반영일 수 있습니다.",
      "지금 가장 필요한 것은 선택이 아니라 이해입니다.",
      "균형을 억지로 잡으려 하면 더 흔들립니다.",
      "지금 가장 중요한 것은 어느 방향도 포기하지 않는 것입니다.",
    ],
    neutral:   [
      "내부와 외부, 자아와 타인 사이의 균형을 의식하는 날입니다.",
      "맞은편에 있는 것이 오늘 중요한 정보를 담고 있습니다.",
      "이 배치는 통합을 요구합니다. 하나를 선택하지 않아도 됩니다.",
      "외부에서 반사되는 것이 내면의 상태를 보여줍니다.",
      "균형이 목표가 아닌 날이 있습니다. 오늘은 관찰하세요.",
      "어느 한쪽을 옳다고 판단하기 전에, 두 방향을 동시에 보세요.",
    ],
  },
};

const DEEP_LESSON: Record<AspectName, Record<"strength"|"challenge"|"neutral", (tp: string, np: string) => string>> = {
  conjunction: {
    strength:  (tp, np) => `${tp}${josa(tp,"와/과")} ${np}${josa(np,"이/가")} 만날 때, 에너지는 통합됩니다. 이 순간을 낭비하지 마세요.`,
    challenge: (tp, np) => `${tp}${josa(tp,"와/과")} ${np}의 마주침은 성장의 재료입니다. 불편함이 길잡이입니다.`,
    neutral:   () => `겹쳐지는 것들은 반드시 무언가를 시작시킵니다. 그 시작을 의식하세요.`,
  },
  trine: {
    strength:  () => `에너지가 자연스럽게 흐를 때, 그 흐름을 신뢰하는 것이 지혜입니다.`,
    challenge: () => `부드러운 흐름도 방향을 갖고 있습니다. 그 방향을 읽으세요.`,
    neutral:   () => `연결이 만들어질 때, 그것이 어디로 이어지는지 따라가보세요.`,
  },
  sextile: {
    strength:  () => `기회는 크게 오지 않습니다. 작은 창이 열렸을 때 움직이는 것이 전부입니다.`,
    challenge: () => `가벼운 마찰이 신호일 때가 있습니다. 그 신호를 읽는 연습을 하세요.`,
    neutral:   () => `접촉이 일어나는 곳에 가능성이 있습니다. 주목하세요.`,
  },
  square: {
    strength:  () => `긴장은 에너지를 담고 있습니다. 그 에너지가 어디로 향하는지 선택하세요.`,
    challenge: () => `충돌은 피할 수 없지만, 그 충돌을 어떻게 통과하는지는 선택할 수 있습니다.`,
    neutral:   () => `각도가 만들어내는 긴장이 당신을 움직이게 합니다. 그 움직임의 방향을 정하세요.`,
  },
  opposition: {
    strength:  () => `대립은 완전한 그림을 위한 조건입니다. 맞은편을 포함해야 비로소 전체가 됩니다.`,
    challenge: () => `반대가 있다는 것은 통합해야 할 무언가가 있다는 뜻입니다.`,
    neutral:   () => `균형은 한쪽을 포기하는 것이 아닙니다. 두 방향을 동시에 담는 것입니다.`,
  },
};

/** TRY THIS recommendations keyed by primary domain tag of the natal planet */
const TRY_THIS_BY_TAG: Record<string, Array<{ type: string; title: string; sub: string; mood: string }>> = {
  "관계":   [{ type: "Watch", title: "비포 선라이즈", sub: "Richard Linklater, 1995", mood: "두 사람의 밤, 연결의 순간" }, { type: "Read", title: "사랑한다는 것", sub: "에리히 프롬 저", mood: "사랑의 기술에 대하여" }],
  "사랑":   [{ type: "Watch", title: "비포 선라이즈", sub: "Richard Linklater, 1995", mood: "두 사람의 밤, 연결의 순간" }, { type: "Read", title: "사랑한다는 것", sub: "에리히 프롬 저", mood: "사랑의 기술에 대하여" }],
  "자아":   [{ type: "Watch", title: "위대한 독재자", sub: "Charlie Chaplin, 1940", mood: "나는 누구인가, 나는 무엇을 원하나" }, { type: "Read", title: "자아의 발견", sub: "칼 구스타프 융 저", mood: "무의식이 말하는 진짜 나" }],
  "정체성": [{ type: "Watch", title: "위대한 독재자", sub: "Charlie Chaplin, 1940", mood: "나는 누구인가, 나는 무엇을 원하나" }, { type: "Read", title: "자아의 발견", sub: "칼 구스타프 융 저", mood: "무의식이 말하는 진짜 나" }],
  "감정":   [{ type: "Watch", title: "인사이드 아웃 2", sub: "Pete Docter, 2024", mood: "감정과 화해하는 법" }, { type: "Read", title: "감정이라는 무기", sub: "수전 데이비드 저", mood: "감정을 다루는 심리학" }],
  "직관":   [{ type: "Watch", title: "인사이드 아웃 2", sub: "Pete Docter, 2024", mood: "내면의 목소리를 따라서" }, { type: "Read", title: "감정이라는 무기", sub: "수전 데이비드 저", mood: "감정을 다루는 심리학" }],
  "사고":   [{ type: "Watch", title: "이미테이션 게임", sub: "Morten Tyldum, 2014", mood: "경계를 넘는 사고의 힘" }, { type: "Read", title: "생각에 관한 생각", sub: "대니얼 카너먼 저", mood: "우리가 틀리는 방식에 관하여" }],
  "소통":   [{ type: "Watch", title: "이미테이션 게임", sub: "Morten Tyldum, 2014", mood: "언어로 세계를 바꾼 사람" }, { type: "Read", title: "비폭력 대화", sub: "마셜 로젠버그 저", mood: "상처 없이 말하는 기술" }],
  "행동":   [{ type: "Watch", title: "소셜 네트워크", sub: "David Fincher, 2010", mood: "움직이는 자가 세계를 만든다" }, { type: "Read", title: "아토믹 해빗", sub: "제임스 클리어 저", mood: "작은 습관이 만드는 큰 변화" }],
  "욕구":   [{ type: "Watch", title: "소셜 네트워크", sub: "David Fincher, 2010", mood: "욕망이 세계를 만드는 방식" }, { type: "Read", title: "아토믹 해빗", sub: "제임스 클리어 저", mood: "작은 습관이 만드는 큰 변화" }],
  "성장":   [{ type: "Watch", title: "기생충", sub: "봉준호, 2019", mood: "계층과 욕망, 그리고 변화" }, { type: "Read", title: "마인드셋", sub: "캐럴 드웩 저", mood: "성장하는 뇌의 비밀" }],
  "구조":   [{ type: "Watch", title: "모던 타임즈", sub: "Charlie Chaplin, 1936", mood: "시스템 속 개인의 시간" }, { type: "Read", title: "딥 워크", sub: "칼 뉴포트 저", mood: "집중이 만드는 진짜 성과" }],
  "책임":   [{ type: "Watch", title: "모던 타임즈", sub: "Charlie Chaplin, 1936", mood: "시스템 속 개인의 시간" }, { type: "Read", title: "딥 워크", sub: "칼 뉴포트 저", mood: "집중이 만드는 진짜 성과" }],
  "변화":   [{ type: "Watch", title: "메트로폴리스", sub: "Fritz Lang, 1927", mood: "변혁의 전야, 새로운 질서" }, { type: "Read", title: "변화의 법칙", sub: "스펜서 존슨 저", mood: "변화를 받아들이는 방법" }],
  "꿈":     [{ type: "Watch", title: "인셉션", sub: "Christopher Nolan, 2010", mood: "현실과 꿈의 경계에서" }, { type: "Read", title: "꿈의 해석", sub: "지그문트 프로이트 저", mood: "무의식이 그리는 세계" }],
  "변혁":   [{ type: "Watch", title: "매트릭스", sub: "Wachowski Sisters, 1999", mood: "진실을 직면하는 용기" }, { type: "Read", title: "영웅의 여정", sub: "조지프 캠벨 저", mood: "모든 이야기의 근원" }],
};

const TRY_THIS_DEFAULT: Array<{ type: string; title: string; sub: string; mood: string }> = [
  { type: "Watch", title: "코스모스", sub: "Carl Sagan, 1980", mood: "우주 속 나의 자리" },
  { type: "Read",  title: "별을 보다", sub: "닐 디그래스 타이슨 저", mood: "경이로움을 되찾는 시간" },
];

/**
 * Builds a unified editorial report for the /home/detail/today page.
 * ALL sections (headline, lede, transit block, bullets, lesson) derive from
 * the same primary transit — the tightest non-Moon aspect from buildTransitDeepList.
 * Returns null if birth data is incomplete or no transits are active.
 */
export function buildTodayDeepReport(natal: NatalChart, date: Date): TodayDeepReport | null {
  const deepList = buildTransitDeepList(natal, date);
  if (deepList.length === 0) return null;

  const primary = deepList[0];
  const { transitPlanet, natalPlanet, natalSign, aspectType, tone } = primary;

  const tPlanetKo = PLANET_KO[transitPlanet];
  const nPlanetKo = PLANET_KO[natalPlanet];
  const signKo    = SIGN_KO[natalSign] ?? natalSign;

  const transitLabel = `${tPlanetKo} 현재`;
  const natalLabel   = `내 ${signKo} ${nPlanetKo}`;
  const aspectLabel  = ASPECT_ANGLE_LABEL[aspectType] ?? aspectType.toUpperCase();

  const headline = DEEP_HEADLINE[aspectType]?.[tone]?.(tPlanetKo, nPlanetKo) ?? primary.fullPhrase;
  const lede     = `${primary.subjectPhrase} ${primary.verbPhrase}. ${primary.objectPhrase}.`;
  const introParagraph = DEEP_INTRO[aspectType]?.[tone]?.(tPlanetKo, signKo, nPlanetKo) ?? lede;
  const narrativeBridge = NARRATIVE_BRIDGE[aspectType]?.[tone]?.(tPlanetKo, nPlanetKo) ?? "";
  const earthHeadline  = DEEP_EARTH_HEADLINE[aspectType]?.[tone]?.(tPlanetKo, nPlanetKo) ?? "일상에서는";

  // Date-seeded bullet rotation: rotate 6-item pool by day-of-month offset → 3 distinct views
  const bulletPool = DEEP_BULLETS[aspectType]?.[tone] ?? [];
  const bulletOffset = date.getDate() % 3; // 0, 1, or 2 — changes every ~10 days
  const bullets = bulletPool.length >= 4
    ? [0, 1, 2, 3].map((i) => bulletPool[(bulletOffset + i) % bulletPool.length])
    : bulletPool.slice(0, 4);
  const lessonText     = DEEP_LESSON[aspectType]?.[tone]?.(tPlanetKo, nPlanetKo) ?? primary.fullPhrase;
  const lessonSub      = primary.frequency;

  // TRY THIS — pick by primary domain tag of the natal planet
  const primaryTag = primary.domainTags[0] ?? "";
  const tryThis = TRY_THIS_BY_TAG[primaryTag] ?? TRY_THIS_DEFAULT;

  // BEHIND THIS FORECAST — collect all active aspects from TRANSIT_KEY_PHRASES
  const transitLons  = computeTransitPositions(date);
  const natalByName  = new Map<PlanetName, number>(natal.planets.map((p) => [p.planet, p.longitude]));
  const activeAspects: ActiveTransitAspect[] = [];
  for (const row of TRANSIT_KEY_PHRASES) {
    const tLon = transitLons.get(row.transitPlanet);
    const nLon = natalByName.get(row.natalPlanet) ?? null;
    if (tLon == null || nLon == null) continue;
    const found = findAspect(tLon, nLon);
    if (found && found.name === row.aspect && found.orb <= row.orbMax) {
      activeAspects.push({
        transitPlanet: row.transitPlanet,
        natalPlanet:   row.natalPlanet,
        aspect:        row.aspect,
        orb:           found.orb,
        phrase:        row.text,
      });
    }
  }

  const dateStr = date.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });

  return {
    primary,
    transitLabel,
    natalLabel,
    aspectLabel,
    headline: polishInterpretCopy(headline),
    lede: polishInterpretCopy(lede),
    introParagraph: polishInterpretCopy(introParagraph),
    narrativeBridge: polishInterpretCopy(narrativeBridge),
    earthHeadline: polishInterpretCopy(earthHeadline),
    bullets: bullets.map(polishInterpretCopy),
    tryThis,
    lessonText: polishInterpretCopy(lessonText),
    lessonSub,
    activeAspects: activeAspects.map((aspect) => ({
      ...aspect,
      phrase: polishInterpretCopy(aspect.phrase),
    })),
    date: dateStr,
  };
}
