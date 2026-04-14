/**
 * Decision engine for void analysis.
 *
 * Computes GO / WAIT / AVOID from:
 *   - natal chart (planet placements, house structure)
 *   - current-date transit positions (Mars/Saturn pressure, Venus/Jupiter support)
 *   - question subtype (which planets / houses to weight)
 *
 * Deterministic: same natal + same intent + same date → same output.
 * No randomness. No fallback prose. Every sentence is driven by real placements.
 */

import { SIGNS, type NatalChart, type PlanetName, type SignName } from "@/lib/astrology/types";
import { computeTransitPositions, findAspect } from "@/lib/astrology/calculate";
import type { QuestionIntent } from "./void-intent";

// ── Output types ──────────────────────────────────────────────────────────────

export type DecisionRecommendation = "GO" | "WAIT" | "AVOID";

/**
 * Classifies what kind of direct answer the question schema produces.
 * - likelihood:    가능성 판단 (그 일이 실제로 일어날까?)
 * - state:         현재 상태 판단 (지금 어떤 단계인가?)
 * - timing:        행동 타이밍 판단 (지금이 맞는 때인가?)
 * - balance:       균형·상호성 판단 (누가 더 주고 있는가?)
 * - self_awareness: 자기인식 판단 (나는 ~한가?)
 */
export type AnswerSchemaKey =
  | "likelihood"
  | "state"
  | "timing"
  | "balance"
  | "self_awareness";

/**
 * Per-schema answer label — the direct "what is the answer" classification.
 * timing:        act_now / start_small / wait / do_not_act
 * balance:       balanced / unclear / giving_more
 * likelihood:    likely / mixed / unlikely
 * state:         positive / adjusting / observing / blocked
 * self_awareness: yes / partly / not_fully / no
 *
 * Anti-collapse mechanism: same score maps to DIFFERENT labels per schema,
 * so different question types never share the same answer family.
 * Score 48 → timing: "wait"  BUT state: "observing"  BUT self_awareness: "not_fully"
 */
export type SchemaLabel =
  | "act_now" | "start_small" | "wait" | "do_not_act"
  | "balanced" | "unclear" | "giving_more"
  | "likely" | "mixed" | "unlikely"
  | "positive" | "adjusting" | "observing" | "blocked"
  | "yes" | "partly" | "not_fully" | "no";

export type DecisionFactor = {
  /** Korean label for this factor */
  name: string;
  /** 0–100 score (50 = neutral baseline) */
  score: number;
  direction: "positive" | "negative" | "neutral";
  /** One sentence explaining this factor's score */
  note: string;
};

export type VoidDecision = {
  recommendation: DecisionRecommendation;
  /**
   * 0–100 — normalized confidence within the outcome band.
   * GO/AVOID: 50 = at threshold, 100 = maximum signal.
   * WAIT: 50 = at a threshold edge, 95 = perfectly centered.
   */
  confidence: number;
  /** Sorted by explanatory impact: weight × |score − 50| descending */
  factors: DecisionFactor[];
  /**
   * DIRECT ANSWER to the user's question.
   * Produced by SCHEMA_ANSWER_TEXT[intent][schemaLabel].
   * Must answer the question first — astrology is the support, not the answer.
   */
  headline: string;
  /** Astrology-support explanation: WHY the answer is what it is */
  summary: string;
  /** Schema type — what kind of answer this question receives */
  answerSchema: AnswerSchemaKey;
  /** Schema label — the per-schema bucket the score landed in */
  schemaLabel: SchemaLabel;
  /** Short answer tag (e.g. "상호적", "성장 중", "솔직하지 않음") */
  answerTag: string;
};

// ── Moon sign stability baseline ──────────────────────────────────────────────
// Reflects decision-making clarity when the transit Moon is in each sign.
// Grounded signs (Taurus/Cancer) → high clarity; volatile signs (Scorpio/Aries) → low.

const MOON_STABILITY: Record<SignName, number> = {
  Taurus: 78, Cancer: 72, Virgo: 68, Capricorn: 66, Libra: 64,
  Pisces: 58, Aquarius: 56, Leo: 54, Sagittarius: 50, Gemini: 46,
  Aries: 40, Scorpio: 36,
};

const SIGN_KO: Record<SignName, string> = {
  Aries: "양자리", Taurus: "황소자리", Gemini: "쌍둥이자리", Cancer: "게자리",
  Leo: "사자자리", Virgo: "처녀자리", Libra: "천칭자리", Scorpio: "전갈자리",
  Sagittarius: "사수자리", Capricorn: "염소자리", Aquarius: "물병자리", Pisces: "물고기자리",
};

// ── Subtype configuration ─────────────────────────────────────────────────────
// Each intent defines which natal planets matter, how much they weigh,
// which houses are significant, and where the GO/AVOID thresholds sit.
// All weight arrays + houseWeight must sum to exactly 1.0.

type SubtypeConfig = {
  keyPlanets: PlanetName[];
  /** Parallel to keyPlanets; together with houseWeight must sum to 1.0 */
  planetWeights: number[];
  houseWeight: number;
  significantHouses: number[];
  goThreshold: number;
  avoidThreshold: number;
  /** Korean display labels, parallel to keyPlanets */
  factorLabels: string[];
};

const SUBTYPE_CONFIG: Partial<Record<QuestionIntent, SubtypeConfig>> = {
  // ── Relationship ──────────────────────────────────────────────────
  confession: {
    keyPlanets:        ["Venus", "Moon", "Mars"],
    planetWeights:     [0.40,    0.30,   0.20],
    houseWeight:       0.10,
    significantHouses: [1, 5, 7],
    goThreshold:       55,
    avoidThreshold:    46,
    factorLabels:      ["금성 흐름 상태", "달의 감정 안정", "화성 행동 타이밍"],
  },
  compatibility: {
    keyPlanets:        ["Venus", "Moon", "Saturn"],
    planetWeights:     [0.40,    0.30,   0.20],
    houseWeight:       0.10,
    significantHouses: [7, 5, 1],
    goThreshold:       55,
    avoidThreshold:    46,
    factorLabels:      ["금성 흐름 상태", "달의 감정 안정", "토성 관계 구조"],
  },
  breakup: {
    keyPlanets:        ["Moon", "Saturn", "Mars"],
    planetWeights:     [0.35,   0.35,     0.20],
    houseWeight:       0.10,
    significantHouses: [8, 12, 4],
    goThreshold:       55,
    avoidThreshold:    44,
    factorLabels:      ["달의 감정 명확도", "토성 현실 지지", "화성 분리 에너지"],
  },
  relationship: {
    keyPlanets:        ["Venus", "Moon", "Mars"],
    planetWeights:     [0.40,    0.30,   0.20],
    houseWeight:       0.10,
    significantHouses: [5, 7, 8],
    goThreshold:       55,
    avoidThreshold:    46,
    factorLabels:      ["금성 관계 에너지", "달의 감정 안정", "화성 행동 패턴"],
  },
  trust: {
    keyPlanets:        ["Moon", "Mercury", "Saturn"],
    planetWeights:     [0.35,   0.30,      0.25],
    houseWeight:       0.10,
    significantHouses: [11, 7, 3],
    goThreshold:       56,
    avoidThreshold:    46,
    factorLabels:      ["달의 직관 안정", "수성 판단 명확도", "토성 관계 구조"],
  },
  // ── Work ─────────────────────────────────────────────────────────
  quit: {
    keyPlanets:        ["Saturn", "Mars", "Sun"],
    planetWeights:     [0.35,     0.30,   0.25],
    houseWeight:       0.10,
    significantHouses: [10, 6, 1],
    goThreshold:       54,
    avoidThreshold:    45,
    factorLabels:      ["토성 구조 지지", "화성 행동 에너지", "태양 정체성 방향"],
  },
  promotion: {
    keyPlanets:        ["Saturn", "Sun", "Jupiter"],
    planetWeights:     [0.35,     0.30,  0.25],
    houseWeight:       0.10,
    significantHouses: [10, 6, 1],
    goThreshold:       56,
    avoidThreshold:    45,
    factorLabels:      ["토성 성과 구조", "태양 자아 표현", "목성 확장 기회"],
  },
  conflict: {
    keyPlanets:        ["Mars", "Saturn", "Mercury"],
    planetWeights:     [0.35,   0.30,     0.25],
    houseWeight:       0.10,
    significantHouses: [6, 7, 10],
    goThreshold:       56,
    avoidThreshold:    46,
    factorLabels:      ["화성 갈등 에너지", "토성 구조적 압박", "수성 소통 조건"],
  },
  decision: {
    keyPlanets:        ["Mercury", "Saturn", "Moon"],
    planetWeights:     [0.40,      0.30,     0.20],
    houseWeight:       0.10,
    significantHouses: [3, 9, 10],
    goThreshold:       56,
    avoidThreshold:    46,
    factorLabels:      ["수성 판단 명확도", "토성 현실 구조", "달의 감정 안정"],
  },
  direction: {
    keyPlanets:        ["Sun", "Saturn", "Jupiter"],
    planetWeights:     [0.35,   0.30,    0.25],
    houseWeight:       0.10,
    significantHouses: [1, 9, 10],
    goThreshold:       55,
    avoidThreshold:    46,
    factorLabels:      ["태양 자아 방향", "토성 현실 구조", "목성 확장 기회"],
  },
  // ── Self ──────────────────────────────────────────────────────────
  identity: {
    keyPlanets:        ["Sun", "Moon", "Saturn"],
    planetWeights:     [0.40,   0.30,   0.20],
    houseWeight:       0.10,
    significantHouses: [1, 4, 12],
    goThreshold:       55,
    avoidThreshold:    46,
    factorLabels:      ["태양 자아 에너지", "달의 감정 안정", "토성 현실 압박"],
  },
  energy: {
    keyPlanets:        ["Sun", "Moon", "Saturn"],
    planetWeights:     [0.40,   0.30,   0.20],
    houseWeight:       0.10,
    significantHouses: [1, 6, 12],
    goThreshold:       55,
    avoidThreshold:    46,
    factorLabels:      ["태양 생명력 에너지", "달의 감정 안정", "토성 소진 압박"],
  },
  pattern: {
    keyPlanets:        ["Moon", "Saturn", "Mercury"],
    planetWeights:     [0.40,   0.30,    0.20],
    houseWeight:       0.10,
    significantHouses: [4, 8, 12],
    goThreshold:       55,
    avoidThreshold:    46,
    factorLabels:      ["달의 감정 명확도", "토성 구조 인식", "수성 패턴 분석"],
  },
  purpose: {
    keyPlanets:        ["Sun", "Jupiter", "Saturn"],
    planetWeights:     [0.40,   0.30,     0.20],
    houseWeight:       0.10,
    significantHouses: [9, 1, 10],
    goThreshold:       55,
    avoidThreshold:    46,
    factorLabels:      ["태양 목적 에너지", "목성 의미 확장", "토성 현실 구조"],
  },
  // ── Social ────────────────────────────────────────────────────────
  communication: {
    keyPlanets:        ["Mercury", "Moon", "Sun"],
    planetWeights:     [0.40,      0.30,   0.20],
    houseWeight:       0.10,
    significantHouses: [3, 1, 11],
    goThreshold:       55,
    avoidThreshold:    46,
    factorLabels:      ["수성 소통 에너지", "달의 감정 안정", "태양 자아 표현"],
  },
  friendship: {
    keyPlanets:        ["Moon", "Venus", "Mercury"],
    planetWeights:     [0.35,   0.30,    0.25],
    houseWeight:       0.10,
    significantHouses: [11, 7, 3],
    goThreshold:       55,
    avoidThreshold:    46,
    factorLabels:      ["달의 공감 에너지", "금성 연결 조화", "수성 소통 명확도"],
  },
  group: {
    keyPlanets:        ["Saturn", "Mercury", "Moon"],
    planetWeights:     [0.35,     0.30,      0.25],
    houseWeight:       0.10,
    significantHouses: [11, 6, 10],
    goThreshold:       56,
    avoidThreshold:    46,
    factorLabels:      ["토성 집단 구조", "수성 소통 조건", "달의 감정 안정"],
  },
  distance: {
    keyPlanets:        ["Moon", "Saturn", "Venus"],
    planetWeights:     [0.40,   0.30,    0.20],
    houseWeight:       0.10,
    significantHouses: [11, 12, 4],
    goThreshold:       55,
    avoidThreshold:    46,
    factorLabels:      ["달의 거리감 인식", "토성 경계 구조", "금성 연결 욕구"],
  },
  // ── New LOVE intents ──────────────────────────────────────────────
  reciprocity: {
    keyPlanets:        ["Venus", "Moon", "Mars"],
    planetWeights:     [0.45,    0.35,   0.10],
    houseWeight:       0.10,
    significantHouses: [5, 7, 11],
    goThreshold:       56,
    avoidThreshold:    47,
    factorLabels:      ["금성 상호 끌림", "달의 감정 공명", "화성 상대 반응"],
  },
  commitment: {
    keyPlanets:        ["Saturn", "Venus", "Moon"],
    planetWeights:     [0.35,     0.35,   0.20],
    houseWeight:       0.10,
    significantHouses: [7, 8, 4],
    goThreshold:       57,
    avoidThreshold:    47,
    factorLabels:      ["토성 관계 구조화", "금성 헌신 에너지", "달의 유대 안정"],
  },
  timing: {
    keyPlanets:        ["Moon", "Venus", "Mercury"],
    planetWeights:     [0.50,   0.30,   0.10],
    houseWeight:       0.10,
    significantHouses: [1, 5, 7],
    goThreshold:       58,
    avoidThreshold:    47,
    factorLabels:      ["달의 접촉 타이밍", "금성 연결 흐름", "수성 메시지 에너지"],
  },
  // ── New WORK intent ───────────────────────────────────────────────
  opportunity: {
    keyPlanets:        ["Jupiter", "Mercury", "Saturn"],
    planetWeights:     [0.40,     0.30,      0.20],
    houseWeight:       0.10,
    significantHouses: [2, 9, 10],
    goThreshold:       56,
    avoidThreshold:    46,
    factorLabels:      ["목성 기회 확장", "수성 조건 판단", "토성 현실 장벽"],
  },
  // ── New SELF intents ──────────────────────────────────────────────
  self_trust: {
    keyPlanets:        ["Sun", "Moon", "Mercury"],
    planetWeights:     [0.45,   0.35,   0.10],
    houseWeight:       0.10,
    significantHouses: [1, 12, 4],
    goThreshold:       56,
    avoidThreshold:    46,
    factorLabels:      ["태양 자기 확신", "달의 내면 안정", "수성 자기 판단"],
  },
  boundary: {
    keyPlanets:        ["Saturn", "Moon", "Sun"],
    planetWeights:     [0.40,     0.35,   0.15],
    houseWeight:       0.10,
    significantHouses: [1, 7, 12],
    goThreshold:       56,
    avoidThreshold:    47,
    factorLabels:      ["토성 경계 구조", "달의 보호 본능", "태양 자기 중심"],
  },
  self_worth: {
    keyPlanets:        ["Sun", "Venus", "Moon"],
    planetWeights:     [0.45,   0.30,   0.15],
    houseWeight:       0.10,
    significantHouses: [1, 2, 12],
    goThreshold:       56,
    avoidThreshold:    46,
    factorLabels:      ["태양 자기 가치", "금성 자기 수용", "달의 내면 안정"],
  },
  self_honesty: {
    keyPlanets:        ["Moon", "Mercury", "Saturn"],
    planetWeights:     [0.45,   0.35,     0.10],
    houseWeight:       0.10,
    significantHouses: [4, 12, 8],
    goThreshold:       55,
    avoidThreshold:    45,
    factorLabels:      ["달의 내면 솔직도", "수성 자기 인식", "토성 자기 직면"],
  },
  fear: {
    keyPlanets:        ["Moon", "Saturn", "Mars"],
    planetWeights:     [0.40,   0.35,    0.15],
    houseWeight:       0.10,
    significantHouses: [12, 8, 4],
    goThreshold:       55,
    avoidThreshold:    44,
    factorLabels:      ["달의 두려움 뿌리", "토성 정지 압박", "화성 행동 저항"],
  },
  growth: {
    keyPlanets:        ["Jupiter", "Sun", "Saturn"],
    planetWeights:     [0.40,     0.35,   0.15],
    houseWeight:       0.10,
    significantHouses: [9, 1, 3],
    goThreshold:       55,
    avoidThreshold:    45,
    factorLabels:      ["목성 성장 에너지", "태양 자아 확장", "토성 성장 구조"],
  },
  stagnation: {
    keyPlanets:        ["Saturn", "Moon", "Mars"],
    planetWeights:     [0.40,     0.35,   0.15],
    houseWeight:       0.10,
    significantHouses: [4, 12, 1],
    goThreshold:       54,
    avoidThreshold:    44,
    factorLabels:      ["토성 정체 장벽", "달의 내면 에너지", "화성 돌파 에너지"],
  },
  // ── New SOCIAL intent ─────────────────────────────────────────────
  belonging: {
    keyPlanets:        ["Moon", "Mercury", "Saturn"],
    planetWeights:     [0.40,   0.30,      0.20],
    houseWeight:       0.10,
    significantHouses: [11, 4, 1],
    goThreshold:       55,
    avoidThreshold:    46,
    factorLabels:      ["달의 소속감", "수성 집단 적합도", "토성 소속 구조"],
  },
};

const DEFAULT_CONFIG: SubtypeConfig = {
  keyPlanets:        ["Moon", "Saturn", "Venus"],
  planetWeights:     [0.35,   0.30,    0.25],
  houseWeight:       0.10,
  significantHouses: [1, 4, 7],
  goThreshold:       55,
  avoidThreshold:    46,
  factorLabels:      ["달의 감정 안정", "토성 구조적 지지", "금성 관계 조화"],
};

// ── Category helper ───────────────────────────────────────────────────────────
// Maps every intent to one of four rendering categories so transit notes
// and buildHeadline flavors can use category-appropriate language.

type VoidCategory = "love" | "work" | "self" | "social";

function getCategoryFromIntent(intent: QuestionIntent): VoidCategory {
  if (["confession","compatibility","trust","breakup","relationship",
       "reciprocity","commitment","timing"].includes(intent))   return "love";
  if (["quit","promotion","conflict","decision","direction",
       "opportunity"].includes(intent))                         return "work";
  if (["identity","energy","pattern","purpose",
       "self_trust","boundary","self_worth","self_honesty",
       "fear","growth","stagnation"].includes(intent))          return "self";
  return "social"; // friendship, group, distance, communication, belonging
}

// ── Transit scoring rules ─────────────────────────────────────────────────────
// Each rule carries four category-specific note variants.
// transitPlanetScore picks the variant matching the current question category.

const TRANSIT_RULES: Array<{
  planet: PlanetName;
  aspects: string[];
  weight: number;
  maxOrb: number;
  note: string;
  love?: string; work?: string; self?: string; social?: string;
}> = [
  { planet: "Saturn",  aspects: ["square", "opposition"], weight: -18, maxOrb: 7,
    note:   "토성이 제동을 걸고 있습니다. 억지로 밀면 더 오래 막힙니다",
    love:   "관계에서 구조적 저항이 있습니다. 감정보다 구조가 먼저 정비되어야 합니다",
    work:   "지금 시도는 현실 구조에서 막힙니다. 조건을 먼저 다시 점검하세요",
    self:   "내면에서 오는 저항입니다. 외압이 아닌 자기 패턴이 브레이크입니다",
    social: "집단 역학이 흐름을 막습니다. 역할과 타이밍을 먼저 읽으세요",
  },
  { planet: "Saturn",  aspects: ["conjunction"],          weight: -12, maxOrb: 5,
    note:   "토성이 정면에 있습니다. 구조를 먼저 정비하세요",
    love:   "관계 구조에 직접 압박이 있습니다. 지금은 구조 정비가 먼저입니다",
    work:   "현실 조건이 정면에서 압박합니다. 기반을 다시 다지세요",
    self:   "내면에서 구조 재편 요청이 옵니다. 이 압박은 성장 신호입니다",
    social: "소통 채널에 직접 압박이 있습니다. 방식을 먼저 바꾸세요",
  },
  { planet: "Mars",    aspects: ["square", "opposition"], weight: -14, maxOrb: 6,
    note:   "화성이 충돌 에너지를 만들고 있습니다. 충동으로 움직이면 역효과입니다",
    love:   "감정적 충돌 에너지가 있습니다. 지금 반응은 과잉이 될 수 있습니다",
    work:   "행동 에너지가 방향 없이 폭발합니다. 충동보다 전략이 먼저입니다",
    self:   "내면 긴장 에너지가 폭발 중입니다. 방향을 정하고 움직이세요",
    social: "관계 충돌 에너지가 활성화됩니다. 공격적 반응을 자제하세요",
  },
  { planet: "Mars",    aspects: ["conjunction"],          weight:  -8, maxOrb: 4,
    note:   "화성이 폭발적으로 집중됩니다. 방향을 먼저 잡고 움직이세요",
    love:   "감정 반응이 즉각적입니다. 상대에게 쏟아내기 전 정리가 필요합니다",
    work:   "강한 행동 에너지가 모였습니다. 방향 확인 후 에너지를 쏟으세요",
    self:   "내면 에너지가 응집됩니다. 충동이 아닌 의도적 방향으로 전환하세요",
    social: "대인 에너지가 폭발적입니다. 호흡을 고르고 반응하세요",
  },
  { planet: "Jupiter", aspects: ["trine", "sextile"],     weight: +16, maxOrb: 7,
    note:   "목성이 흐름을 열어줍니다. 지금이 내딛기 좋은 타이밍입니다",
    love:   "관계 확장 에너지가 흐릅니다. 감정을 솔직하게 표현해도 받아줍니다",
    work:   "기회가 열리는 구조입니다. 지금이 움직이기 가장 좋은 때입니다",
    self:   "내적 확장 에너지가 뒷받침합니다. 자아 탐색이 자연스럽게 열립니다",
    social: "연결 확장 에너지가 있습니다. 새 네트워크를 열기 좋은 때입니다",
  },
  { planet: "Jupiter", aspects: ["conjunction"],          weight: +14, maxOrb: 5,
    note:   "목성 에너지가 정점입니다. 지금 가장 강하게 지지받고 있습니다",
    love:   "관계에서 정점 에너지가 있습니다. 지금이 가장 강한 지지 타이밍입니다",
    work:   "성과 확장 에너지가 정점입니다. 지금 가장 강하게 뒷받침됩니다",
    self:   "자아 에너지가 최강 상태입니다. 지금 내린 방향이 장기적으로 맞습니다",
    social: "소속 에너지가 최고점입니다. 집단 참여 타이밍이 딱 맞습니다",
  },
  { planet: "Venus",   aspects: ["trine", "sextile"],     weight: +14, maxOrb: 7,
    note:   "금성이 부드럽게 흐릅니다. 관계와 연결이 자연스럽게 이어집니다",
    love:   "감정 흐름이 열려있습니다. 솔직한 표현이 자연스럽게 받아들여집니다",
    work:   "협력 에너지가 흐릅니다. 협상이나 팀워크에 유리한 타이밍입니다",
    self:   "자기 가치 에너지가 자연스럽게 흐릅니다. 자신을 긍정할 시기입니다",
    social: "관계 에너지가 조화롭습니다. 사람 사이 흐름이 자연스럽습니다",
  },
  { planet: "Venus",   aspects: ["conjunction"],          weight: +12, maxOrb: 5,
    note:   "금성 에너지가 강하게 모입니다. 끌림과 연결에 솔직하게 반응하세요",
    love:   "끌림 에너지가 강하게 응집됩니다. 감정을 솔직하게 표현할 타이밍입니다",
    work:   "협력 에너지가 강하게 모입니다. 파트너십 제안에 열려있으세요",
    self:   "자기 수용 에너지가 강합니다. 자신의 욕구에 솔직해질 시기입니다",
    social: "연결 에너지가 정점입니다. 사람들에게 다가가기 최적의 타이밍입니다",
  },
  { planet: "Sun",     aspects: ["trine", "sextile"],     weight:  +8, maxOrb: 7,
    note:   "태양이 지지합니다. 전면에 나서도 에너지가 뒷받침됩니다",
    love:   "자아 에너지가 관계를 지지합니다. 당신답게 있는 것이 매력입니다",
    work:   "자기 표현 에너지가 지지합니다. 앞에 나서도 에너지가 뒷받침됩니다",
    self:   "자아 에너지가 탐색을 지지합니다. 내면의 방향이 보이고 있습니다",
    social: "자기 표현이 자연스럽게 받아들여집니다. 지금 목소리를 내도 됩니다",
  },
  { planet: "Sun",     aspects: ["opposition"],           weight:  -6, maxOrb: 7,
    note:   "태양 에너지가 분산됩니다. 집중해야 할 때입니다",
    love:   "자아와 관계 에너지가 충돌합니다. 나의 욕구와 상대의 욕구가 엇갈립니다",
    work:   "자기 표현 에너지가 분산됩니다. 지금은 선택과 집중이 필요합니다",
    self:   "자아 에너지가 분열됩니다. 여러 방향이 당기는 지금 하나를 고르세요",
    social: "자기 표현이 오해받기 쉽습니다. 의도를 명확하게 전달하세요",
  },
];

// Planet-specific neutral notes (no active transit aspect firing)
const NEUTRAL_PLANET_NOTE: Partial<Record<PlanetName, string>> = {
  Saturn:  "토성의 직접적 압박은 없습니다. 구조적으로 중립 국면입니다",
  Mars:    "화성의 충돌 에너지는 없습니다. 행동 에너지가 평탄합니다",
  Venus:   "금성의 직접 지원은 없습니다. 관계 에너지가 잠잠합니다",
  Jupiter: "목성의 확장 신호는 없습니다. 별도의 기회 에너지가 없습니다",
  Sun:     "태양의 직접 지원은 없습니다. 자아 에너지가 평탄합니다",
  Mercury: "수성의 직접 작용은 없습니다. 판단 에너지가 고요합니다",
};

// ── Category-specific neutral notes (no transit active — domain-aware fallback) ─
// Replaces the generic "평탄합니다" / "고요합니다" with domain-specific framing.
const NEUTRAL_NOTE_BY_CATEGORY: Record<VoidCategory, Partial<Record<PlanetName, string>>> = {
  love: {
    Saturn:  "관계에서 토성의 직접 개입은 없습니다 — 구조적으로 중립 국면",
    Mars:    "감정 충돌 신호가 없습니다 — 상대 에너지 흐름이 잠잠합니다",
    Venus:   "끌림 에너지가 잠잠합니다 — 현재 흐름에 힘을 더하거나 빼는 신호가 없습니다",
    Jupiter: "관계 확장 신호가 없습니다 — 현재 감정 에너지를 유지하는 것이 자연스럽습니다",
    Sun:     "자아-관계 갈등 신호가 없습니다 — 지금은 자연스럽게 있는 상태입니다",
    Mercury: "소통에서 직접 작용이 없습니다 — 표현 에너지가 고요하게 대기 중입니다",
  },
  work: {
    Saturn:  "업무 구조에서 직접 압박이 없습니다 — 현 구조가 안정적으로 유지됩니다",
    Mars:    "행동 에너지의 충돌 신호가 없습니다 — 에너지가 일정하게 흐릅니다",
    Venus:   "협력 에너지가 잠잠합니다 — 팀워크나 협상이 대기 상태입니다",
    Jupiter: "기회 확장 신호가 없습니다 — 지금은 준비를 더 쌓는 타이밍입니다",
    Sun:     "자기 표현 에너지가 고요합니다 — 지금은 어필보다 준비할 때입니다",
    Mercury: "판단 에너지가 중립입니다 — 정보를 더 모은 후 결정하는 것이 좋습니다",
  },
  self: {
    Saturn:  "내면에서 토성 압박이 없습니다 — 자아 구조가 안정적입니다",
    Mars:    "내면 긴장 에너지가 잠잠합니다 — 충동 없이 관찰하기 좋은 상태입니다",
    Venus:   "자기 수용 에너지가 고요합니다 — 지금은 자신을 조용히 관찰하세요",
    Jupiter: "내적 확장 신호가 잠잠합니다 — 지금은 외부보다 내면을 다지는 시기입니다",
    Sun:     "자아 에너지가 고요합니다 — 탐색보다 정착의 에너지입니다",
    Mercury: "자기 판단 에너지가 중립입니다 — 지금 내면 목소리에 조용히 집중하세요",
  },
  social: {
    Saturn:  "집단 구조에서 직접 개입이 없습니다 — 소속 구조가 안정적입니다",
    Mars:    "대인 충돌 신호가 없습니다 — 관계 에너지가 평화로운 상태입니다",
    Venus:   "사회적 연결 에너지가 잠잠합니다 — 조용히 현재 관계를 유지하세요",
    Jupiter: "소속 확장 신호가 없습니다 — 지금은 현재 관계망에 집중하는 게 자연스럽습니다",
    Sun:     "자기 표현 에너지가 고요합니다 — 지금은 드러내기보다 관찰하는 시기입니다",
    Mercury: "소통 에너지가 평탄합니다 — 지금은 말보다 듣는 것이 더 유효합니다",
  },
};

// ── Intent-level transit note overrides ───────────────────────────────────────
// Keyed as `${intent}:${planet}:${'pos'|'neg'}`.
// When a transit rule fires, this is checked FIRST (before category fallback).
// Same planet+aspect → completely different framing per question intent.
// This is the primary mechanism preventing repeated signal bundles across question types.
const TRANSIT_INTENT_NOTE: Record<string, string> = {
  // ── SELF: self_worth ────────────────────────────────────────────────────────
  "self_worth:Saturn:neg": "토성이 자기 평가를 압박합니다. 지금 내린 자기 판단은 과도한 비판일 수 있습니다",
  "self_worth:Saturn:pos": "토성이 자기 기준을 지지합니다. 이 평가는 현실에 기반한 것입니다",
  "self_worth:Venus:pos":  "금성이 자기 수용 에너지를 엽니다. 지금 자신을 긍정할 수 있는 타이밍입니다",
  "self_worth:Venus:neg":  "금성 에너지가 막혀있습니다. 자기 수용이 어려운 국면입니다",
  "self_worth:Sun:pos":    "태양이 자기 가치를 지지합니다. 외부 비교와 무관하게 에너지가 충분합니다",
  "self_worth:Sun:neg":    "태양 에너지가 분열됩니다. 지금 자기 평가가 흔들리고 있습니다",
  "self_worth:Jupiter:pos":"목성이 자기 긍정 에너지를 열어줍니다. 지금 자신에게 너그러울 수 있습니다",
  "self_worth:Mars:neg":   "화성이 자기비판 에너지를 자극합니다. 내면 공격 충동을 알아차리세요",
  // ── SELF: self_honesty ──────────────────────────────────────────────────────
  "self_honesty:Moon:neg":    "달이 내면 직면을 방해합니다. 지금 자기 서사를 그대로 믿지 마세요",
  "self_honesty:Moon:pos":    "달이 내면 직면 에너지를 지지합니다. 솔직하게 볼 수 있는 타이밍입니다",
  "self_honesty:Mercury:neg": "수성이 자기 인식을 흐립니다. 자기 합리화 에너지가 강해지고 있습니다",
  "self_honesty:Mercury:pos": "수성이 자기 인식을 선명하게 합니다. 지금 보이는 것이 진짜입니다",
  "self_honesty:Saturn:neg":  "토성이 직면 에너지를 막습니다. 방어 구조가 활성화되어 있습니다",
  "self_honesty:Saturn:pos":  "토성이 내면 직면을 구조적으로 지지합니다. 직면할 준비가 됐습니다",
  // ── SELF: fear ───────────────────────────────────────────────────────────────
  "fear:Saturn:neg": "토성이 두려움 에너지를 고착시킵니다. 멈춤의 뿌리가 구조화되어 있습니다",
  "fear:Saturn:pos": "토성이 두려움에 구조를 줍니다. 이름 붙이면 통제할 수 있습니다",
  "fear:Moon:neg":   "달이 두려움 에너지를 증폭합니다. 공포 기반 결정은 지금 피하세요",
  "fear:Moon:pos":   "달이 두려움 직면을 지지합니다. 지금이 이름 붙이기 좋은 타이밍입니다",
  "fear:Mars:neg":   "화성이 공포 반응을 자극합니다. 충동적 회피가 강해지고 있습니다",
  "fear:Mars:pos":   "화성이 두려움을 직접 다룰 에너지를 줍니다. 작은 행동 하나가 불안을 줄입니다",
  // ── SELF: growth ─────────────────────────────────────────────────────────────
  "growth:Jupiter:pos": "목성이 성장 에너지를 강하게 지지합니다. 이미 나아가고 있습니다",
  "growth:Jupiter:neg": "목성 에너지가 막혀있습니다. 성장이 지연되고 있지만 방향은 있습니다",
  "growth:Saturn:neg":  "토성이 성장에 저항합니다. 급진보다 견고한 기반이 먼저입니다",
  "growth:Saturn:pos":  "토성이 성장 구조를 지지합니다. 지금 쌓이는 것이 장기적 자산입니다",
  "growth:Sun:pos":     "태양이 성장 방향을 지지합니다. 내면의 확장이 표면으로 드러납니다",
  "growth:Sun:neg":     "태양 에너지가 분산됩니다. 성장 방향이 여러 갈래로 당기고 있습니다",
  // ── SELF: stagnation ─────────────────────────────────────────────────────────
  "stagnation:Saturn:neg": "토성이 정체를 고착시킵니다. 억지로 뚫으면 더 단단해집니다",
  "stagnation:Saturn:pos": "토성이 정체 구조를 완화합니다. 천천히 움직일 수 있는 타이밍입니다",
  "stagnation:Mars:pos":   "화성이 돌파 에너지를 지지합니다. 작은 행동 하나가 정체를 깝니다",
  "stagnation:Mars:neg":   "화성 에너지가 막혀있습니다. 충동적 돌파는 지금 역효과입니다",
  "stagnation:Moon:neg":   "달이 내면 에너지를 막습니다. 지금은 외부 자극보다 내면 관찰이 먼저입니다",
  // ── SELF: identity ─────────────────────────────────────────────────────────
  "identity:Sun:neg":     "태양 에너지가 분열됩니다. 여러 자아상이 충돌하고 있습니다",
  "identity:Sun:pos":     "태양이 자아 탐색을 지지합니다. 지금 발견한 방향이 진짜입니다",
  "identity:Saturn:neg":  "토성이 자아 구조를 압박합니다. 지금은 정체성이 재편 중입니다",
  "identity:Moon:neg":    "달이 불안정합니다. 지금 자아 감각이 흔들리고 있습니다",
  // ── SELF: pattern ──────────────────────────────────────────────────────────
  "pattern:Moon:neg":     "달이 패턴을 재활성화합니다. 무의식적 반응이 강하게 올라오고 있습니다",
  "pattern:Saturn:neg":   "토성이 패턴을 고착시킵니다. 반복 구조가 더 단단해지고 있습니다",
  "pattern:Saturn:pos":   "토성이 패턴 인식을 지지합니다. 구조를 보면 탈출구가 보입니다",
  // ── SELF: energy ──────────────────────────────────────────────────────────
  "energy:Saturn:neg":    "토성이 생명력을 압박합니다. 소진이 구조화되어 있습니다",
  "energy:Sun:pos":       "태양이 생명력을 지지합니다. 회복 에너지가 모이고 있습니다",
  "energy:Sun:neg":       "태양 에너지가 분산됩니다. 에너지 누수가 여러 방향에서 옵니다",
  "energy:Mars:neg":      "화성 압박이 소진을 가속합니다. 지금 행동 에너지를 소모하지 마세요",
  // ── SELF: purpose ──────────────────────────────────────────────────────────
  "purpose:Jupiter:neg":  "목성 에너지가 막혀있습니다. 지금 의미를 구하면 왜곡됩니다",
  "purpose:Jupiter:pos":  "목성이 의미 에너지를 열어줍니다. 지금이 탐색을 시작할 때입니다",
  "purpose:Sun:neg":      "태양 에너지가 흐려집니다. 목적 감각이 일시적으로 잡히지 않는 것입니다",
  // ── LOVE: confession ────────────────────────────────────────────────────────
  "confession:Venus:neg":   "금성 에너지가 닫혀있습니다. 고백보다 자기 감정 정리가 먼저입니다",
  "confession:Venus:pos":   "금성이 감정 표현을 지지합니다. 솔직하게 전달할 타이밍입니다",
  "confession:Moon:neg":    "달이 불안정합니다. 지금 말하면 의도가 정확하게 전달되지 않습니다",
  "confession:Mercury:neg": "수성이 표현 에너지를 막습니다. 말이 의도와 다르게 나올 수 있습니다",
  // ── LOVE: reciprocity ───────────────────────────────────────────────────────
  "reciprocity:Venus:neg":  "금성 상호 에너지가 약합니다. 지금 상대 에너지가 다른 방향입니다",
  "reciprocity:Venus:pos":  "금성 상호 에너지가 열려있습니다. 지금이 확인하기 좋은 타이밍입니다",
  "reciprocity:Moon:neg":   "달의 공명이 어긋납니다. 상대도 지금 비슷하게 흔들릴 수 있습니다",
  "reciprocity:Mars:neg":   "화성이 일방적 에너지를 만듭니다. 지금 끌림이 상호적이지 않을 수 있습니다",
  // ── LOVE: commitment ────────────────────────────────────────────────────────
  "commitment:Saturn:neg":  "토성이 관계 구조화를 막습니다. 헌신 조건이 아직 갖춰지지 않았습니다",
  "commitment:Saturn:pos":  "토성이 관계 구조를 지지합니다. 더 깊이 들어갈 조건이 됩니다",
  "commitment:Venus:neg":   "금성 헌신 에너지가 막혀있습니다. 지금 더 깊어지면 불균형이 됩니다",
  "commitment:Venus:pos":   "금성이 헌신 에너지를 지지합니다. 감정이 구조를 원하고 있습니다",
  // ── LOVE: breakup ───────────────────────────────────────────────────────────
  "breakup:Moon:pos":    "달이 명확한 분리를 지지합니다. 지금 결정이 감정을 정리해줍니다",
  "breakup:Saturn:pos":  "토성이 분리 구조를 지지합니다. 구조적으로 끊기 좋은 타이밍입니다",
  "breakup:Saturn:neg":  "토성이 분리를 막습니다. 아직 구조적으로 연결되어 있습니다",
  "breakup:Venus:pos":   "금성이 분리 에너지를 완화합니다. 정리가 가능하지만 아직 끌림도 있습니다",
  // ── LOVE: timing ────────────────────────────────────────────────────────────
  "timing:Moon:neg":     "달의 타이밍이 어긋납니다. 지금 연락하면 오해가 생깁니다",
  "timing:Moon:pos":     "달의 타이밍이 맞습니다. 지금이 연락하기 좋은 달 에너지입니다",
  "timing:Mercury:neg":  "수성이 메시지 타이밍을 막습니다. 지금 보낸 메시지가 다르게 읽힐 수 있습니다",
  // ── LOVE: compatibility ─────────────────────────────────────────────────────
  "compatibility:Venus:neg":  "금성 에너지가 충돌합니다. 끌림과 지속 가능성은 다른 에너지입니다",
  "compatibility:Saturn:neg": "토성이 관계 구조를 압박합니다. 속도가 다르면 마찰이 생깁니다",
  "compatibility:Moon:pos":   "달이 감정 공명을 지지합니다. 에너지 방향이 일치하고 있습니다",
  // ── LOVE: trust ─────────────────────────────────────────────────────────────
  "trust:Moon:neg":     "달의 직관 신호가 흔들립니다. 지금 판단은 감정 상태의 영향을 받고 있습니다",
  "trust:Saturn:neg":   "토성이 신뢰 구조를 압박합니다. 신뢰의 기반이 아직 형성 중입니다",
  "trust:Mercury:neg":  "수성이 판단을 흐립니다. 지금 내린 신뢰 판단은 재고가 필요합니다",
  // ── LOVE: relationship ──────────────────────────────────────────────────────
  "relationship:Venus:neg":  "금성 관계 에너지가 막혀있습니다. 지금 움직이면 어긋납니다",
  "relationship:Venus:pos":  "금성이 관계 에너지를 지지합니다. 솔직하게 다가가도 됩니다",
  "relationship:Mars:neg":   "화성이 감정 충돌 에너지를 만듭니다. 지금 반응은 과잉이 될 수 있습니다",
  // ── WORK: quit ──────────────────────────────────────────────────────────────
  "quit:Saturn:neg":   "토성이 이탈을 막습니다. 지금 떠나면 구조 없이 나가는 것입니다",
  "quit:Saturn:pos":   "토성이 구조적 이탈을 지지합니다. 준비된 이탈 타이밍입니다",
  "quit:Mars:pos":     "화성이 이탈 에너지를 지지합니다. 충동이 아닌 방향에서 오는 이탈입니다",
  "quit:Mars:neg":     "화성이 충동적 이탈 에너지를 만듭니다. 탈출이 아닌 방향이 먼저입니다",
  "quit:Sun:neg":      "태양 에너지가 분열됩니다. 이탈 욕구가 피로에서 오는지 방향에서 오는지 구별하세요",
  // ── WORK: promotion ─────────────────────────────────────────────────────────
  "promotion:Saturn:neg":  "토성이 성과 인정을 막습니다. 성과보다 기반 구조가 먼저입니다",
  "promotion:Saturn:pos":  "토성이 성과 구조를 지지합니다. 인정받을 조건이 갖춰지고 있습니다",
  "promotion:Jupiter:pos": "목성이 성과 확장을 지지합니다. 더 작은 시도로 먼저 테스트하세요",
  "promotion:Jupiter:neg": "목성 기회 에너지가 막혀있습니다. 지금 어필하면 역효과입니다",
  "promotion:Sun:pos":     "태양이 자기 표현을 지지합니다. 성과를 드러낼 에너지가 있습니다",
  // ── WORK: opportunity ───────────────────────────────────────────────────────
  "opportunity:Jupiter:pos": "목성이 기회 에너지를 강하게 열어줍니다. 지금이 잡기 좋은 타이밍입니다",
  "opportunity:Jupiter:neg": "목성 기회 에너지가 막혀있습니다. 지금 제안은 함정이 될 수 있습니다",
  "opportunity:Mercury:pos": "수성이 조건 판단을 지지합니다. 세부 조건을 꼼꼼히 확인하면 됩니다",
  "opportunity:Saturn:neg":  "토성이 기회 구조에 장벽을 만듭니다. 현실 조건이 아직 안 됩니다",
  // ── WORK: conflict ──────────────────────────────────────────────────────────
  "conflict:Mars:neg":    "화성이 갈등을 증폭합니다. 직접 대면보다 거리가 먼저입니다",
  "conflict:Mars:pos":    "화성이 갈등 해소 에너지를 지지합니다. 직접 말해도 받아들여집니다",
  "conflict:Saturn:pos":  "토성이 갈등 해소 구조를 지지합니다. 직접 말해도 구조가 버팁니다",
  "conflict:Mercury:neg": "수성이 소통을 막습니다. 지금 말은 의도와 다르게 전달될 수 있습니다",
  // ── WORK: decision ──────────────────────────────────────────────────────────
  "decision:Mercury:neg": "수성이 판단 에너지를 막습니다. 지금 내린 결정은 재고가 필요합니다",
  "decision:Mercury:pos": "수성이 판단 에너지를 지지합니다. 지금 판단에 신호가 있습니다",
  "decision:Saturn:neg":  "토성이 결정에 무게를 더합니다. 충분히 검토하지 않은 결정은 위험합니다",
  // ── WORK: direction ─────────────────────────────────────────────────────────
  "direction:Sun:pos":     "태양이 방향 에너지를 지지합니다. 내면의 방향이 외부로 드러납니다",
  "direction:Sun:neg":     "태양 에너지가 분산됩니다. 여러 방향이 당기는 지금 하나를 선택하세요",
  "direction:Jupiter:pos": "목성이 방향 확장을 지지합니다. 지금 향하는 방향이 성장 방향입니다",
  "direction:Saturn:neg":  "토성이 방향 결정을 압박합니다. 조건이 정비되기 전에 결정하지 마세요",
  // ── SOCIAL: belonging ───────────────────────────────────────────────────────
  "belonging:Moon:neg":    "달이 소속감 에너지를 막습니다. 지금 이 환경이 당신에게 맞지 않습니다",
  "belonging:Moon:pos":    "달이 소속감 에너지를 지지합니다. 이 환경에서 공명이 느껴집니다",
  "belonging:Saturn:neg":  "토성이 소속 구조를 압박합니다. 이 집단에서 역할이 아직 불명확합니다",
  "belonging:Mercury:pos": "수성이 집단 적합도를 지지합니다. 지금 이 사람들과 소통이 가능합니다",
  // ── SOCIAL: distance ────────────────────────────────────────────────────────
  "distance:Moon:pos":    "달이 거리 조율을 지지합니다. 솔직하게 거리를 이야기해도 됩니다",
  "distance:Saturn:neg":  "토성이 거리감을 고착시킵니다. 지금 이 거리는 패턴에서 오고 있습니다",
  "distance:Saturn:pos":  "토성이 거리 구조를 지지합니다. 지금이 경계를 설정하기 좋은 타이밍입니다",
  "distance:Venus:pos":   "금성이 거리 조율 에너지를 지지합니다. 연결 유지와 거리 조율이 모두 가능합니다",
  // ── SOCIAL: friendship ──────────────────────────────────────────────────────
  "friendship:Venus:pos": "금성이 연결 에너지를 지지합니다. 먼저 다가가도 받아줍니다",
  "friendship:Venus:neg": "금성 연결 에너지가 막혀있습니다. 지금 다가가면 소진됩니다",
  "friendship:Moon:neg":  "달이 공감 에너지를 막습니다. 지금 이 우정 에너지가 일방적입니다",
  "friendship:Moon:pos":  "달이 공감 에너지를 지지합니다. 지금이 연결하기 좋은 달 에너지입니다",
  // ── SOCIAL: group ───────────────────────────────────────────────────────────
  "group:Saturn:neg":     "토성이 집단 역학을 압박합니다. 지금 깊이 들어가면 구속됩니다",
  "group:Saturn:pos":     "토성이 집단 구조를 지지합니다. 지금이 역할을 정하기 좋은 타이밍입니다",
  "group:Mercury:pos":    "수성이 집단 소통을 지지합니다. 지금 목소리를 내도 받아들여집니다",
  "group:Mercury:neg":    "수성이 집단 소통을 막습니다. 지금 말은 의도와 다르게 전달될 수 있습니다",
  // ── SOCIAL: communication ───────────────────────────────────────────────────
  "communication:Mercury:pos": "수성이 표현 에너지를 강하게 지지합니다. 지금 말해도 제대로 전달됩니다",
  "communication:Mercury:neg": "수성 에너지가 막혀있습니다. 지금 발언이 오해를 낳을 수 있습니다",
  "communication:Venus:neg":   "금성이 관계적 표현을 막습니다. 지금 말투가 의도와 다르게 읽힙니다",
};
/** Sign-aware neutral note — category+intent-aware so no two question types share
 * the same "평탄합니다" phrasing when no transit is actively firing. */
function neutralNote(
  planet: PlanetName,
  natalSign: SignName,
  category: VoidCategory = "self",
): string {
  const p = PLANET_LABEL_KO[planet] ?? String(planet);
  const s = SIGN_KO[natalSign];
  // 1. Category-specific fallback
  const catNote = NEUTRAL_NOTE_BY_CATEGORY[category]?.[planet];
  if (catNote) return `${p} · 출생 ${s}: ${catNote}`;
  // 2. Generic fallback with natal sign reference
  const baseNote = NEUTRAL_PLANET_NOTE[planet];
  if (baseNote) return `${p} · 출생 ${s}: ${baseNote}`;
  return `${p} · 출생 ${s}: 지금은 직접 자극이 크지 않아, 원래 성향이 더 또렷하게 드러납니다`;
}

const PLANET_LABEL_KO: Partial<Record<PlanetName, string>> = {
  Saturn: "토성", Mars: "화성", Venus: "금성", Jupiter: "목성",
  Sun: "태양", Moon: "달", Mercury: "수성", Uranus: "천왕성",
  Neptune: "해왕성", Pluto: "명왕성",
};

/** Natal sign affinity: small baseline bonus/penalty when no transit fires.
 * Creates divergence between users with different natal charts on the same question. */
function natalSignAffinity(planet: PlanetName, natalSign: SignName, intent: QuestionIntent): number {
  // LOVE intents: Venus dignity / debility
  const isLoveIntent = ["confession", "relationship", "compatibility", "reciprocity", "commitment", "timing"].includes(intent);
  if (isLoveIntent) {
    if (planet === "Venus") {
      if (["Taurus", "Libra", "Pisces"].includes(natalSign)) return  9;  // domicile / exaltation
      if (["Aries",  "Scorpio"].includes(natalSign))         return -5;  // detriment / fall
      if (["Cancer", "Leo"].includes(natalSign))             return  4;
    }
    if (planet === "Moon") {
      if (["Cancer", "Taurus"].includes(natalSign))          return  7;
      if (["Scorpio", "Capricorn"].includes(natalSign))      return -4;
    }
    if (planet === "Mars") {
      if (["Aries", "Scorpio", "Capricorn"].includes(natalSign)) return 5;
      if (["Libra", "Cancer"].includes(natalSign))               return -4;
    }
  }
  // WORK intents: Saturn/Sun/Mercury dignity
  const isWorkIntent = ["quit", "promotion", "decision", "direction", "conflict", "opportunity"].includes(intent);
  if (isWorkIntent) {
    if (planet === "Saturn") {
      if (["Capricorn", "Aquarius", "Libra"].includes(natalSign)) return  8;
      if (["Aries", "Leo"].includes(natalSign))                   return -5;
    }
    if (planet === "Sun") {
      if (["Aries", "Leo"].includes(natalSign))                   return  6;
      if (["Libra"].includes(natalSign))                          return -4;
    }
    if (planet === "Jupiter") {
      if (["Sagittarius", "Pisces", "Cancer"].includes(natalSign)) return 7;
      if (["Gemini", "Virgo"].includes(natalSign))                 return -4;
    }
  }
  // SELF intents: Sun/Moon dignity
  const isSelfIntent = ["identity","energy","direction","pattern","purpose",
    "self_trust","boundary","self_worth","self_honesty","fear","growth","stagnation"
  ].includes(intent);
  if (isSelfIntent) {
    if (planet === "Sun") {
      if (["Leo", "Aries"].includes(natalSign))     return  8;
      if (["Libra"].includes(natalSign))            return -4;
      if (["Capricorn", "Scorpio"].includes(natalSign)) return 5;
    }
    if (planet === "Moon") {
      if (["Cancer", "Taurus"].includes(natalSign))    return  7;
      if (["Scorpio", "Aquarius"].includes(natalSign)) return -3;
    }
  }
  // SOCIAL intents: Mercury/Moon dignity
  const isSocialIntent = ["conflict", "distance", "group", "friendship", "communication", "belonging"].includes(intent);
  if (isSocialIntent) {
    if (planet === "Mercury") {
      if (["Gemini", "Virgo", "Aquarius"].includes(natalSign)) return  7;
      if (["Sagittarius", "Pisces"].includes(natalSign))       return -4;
    }
    if (planet === "Moon") {
      if (["Cancer", "Taurus", "Pisces"].includes(natalSign)) return 6;
      if (["Scorpio", "Capricorn"].includes(natalSign))       return -3;
    }
  }
  return 0;
}
// ── Core scoring functions ────────────────────────────────────────────────────

/**
 * Score how well current transits support the given natal planet longitude.
 * Returns 0–100 (50 = neutral; >50 = supported; <50 = under pressure).
 * topNote lookup priority: intent-specific → category → rule fallback.
 */
function transitPlanetScore(
  natalLon: number,
  transitLons: Map<PlanetName, number>,
  category: VoidCategory = "self",
  intent: QuestionIntent = "identity",
): { score: number; topNote: string | null } {
  let delta = 0;
  let topNote: string | null = null;
  let topAbs = 0;

  for (const rule of TRANSIT_RULES) {
    const tLon = transitLons.get(rule.planet);
    if (tLon == null) continue;
    const asp = findAspect(tLon, natalLon);
    if (!asp || !rule.aspects.includes(asp.name) || asp.orb > rule.maxOrb) continue;
    const orbFactor = (rule.maxOrb - asp.orb) / rule.maxOrb;
    const d = rule.weight * orbFactor;
    delta += d;
    if (Math.abs(d) > topAbs) {
      topAbs = Math.abs(d);
      // 1. Intent-specific override (most specific — prevents cross-intent repetition)
      const sign = rule.weight > 0 ? "pos" : "neg";
      const intentKey = `${intent}:${rule.planet}:${sign}`;
      topNote = (TRANSIT_INTENT_NOTE as Record<string, string>)[intentKey]
        // 2. Category-level note (domain-aware)
        ?? rule[category]
        // 3. Generic rule fallback
        ?? rule.note;
    }
  }

  return { score: Math.max(0, Math.min(100, 50 + delta)), topNote };
}

/**
 * Moon stability score — blends transit Moon sign baseline (60%)
 * with how active transit pressure is on the natal Moon (40%).
 * Intent-aware so SELF sub-questions get distinct framings.
 */
function moonStabilityScore(
  natal: NatalChart,
  transitLons: Map<PlanetName, number>,
  category: VoidCategory = "self",
  intent: QuestionIntent = "identity",
): { score: number; note: string } {
  const moonLon = transitLons.get("Moon")!;
  const transitMoonSign = SIGNS[Math.floor(((moonLon % 360) + 360) % 360 / 30)];
  const base = MOON_STABILITY[transitMoonSign];

  const natalMoonLon = natal.planets.find((p) => p.planet === "Moon")!.longitude;
  const { score: aspectScore } = transitPlanetScore(natalMoonLon, transitLons, category, intent);

  const score = Math.max(0, Math.min(100, Math.round(base * 0.6 + aspectScore * 0.4)));
  const s = SIGN_KO[transitMoonSign];

  // ── SELF sub-intent specific Moon notes (intent-level divergence) ─────────
  // Each of the 7 SELF intents + 5 new ones gets its own framing so the
  // "moon note" line never reads the same across different SELF questions.
  const SELF_MOON_NOTE: Partial<Record<QuestionIntent, [string,string,string,string]>> = {
    self_worth: [
      `달이 ${s}에 있습니다. 자기 가치 에너지가 안정적입니다 — 지금 자신에게 너그러울 수 있습니다`,
      `달이 ${s}에 있습니다. 자기 평가 에너지가 잠잠합니다`,
      `달이 ${s}에 있습니다. 자기비판이 강해지고 있습니다. 비교 에너지에서 거리 두세요`,
      `달이 ${s}에 있습니다. 자기혐오 에너지가 올라옵니다. 지금 내린 자기 평가를 믿지 마세요`,
    ],
    self_honesty: [
      `달이 ${s}에 있습니다. 내면 직면 에너지가 열려있습니다 — 솔직하게 볼 수 있습니다`,
      `달이 ${s}에 있습니다. 내면 인식 에너지가 평탄합니다`,
      `달이 ${s}에 있습니다. 회피 경향이 강해지고 있습니다. 눈 감고 싶은 부분을 직면하세요`,
      `달이 ${s}에 있습니다. 자기기만 에너지가 높습니다. 지금 자기 서사를 그대로 믿지 마세요`,
    ],
    fear: [
      `달이 ${s}에 있습니다. 두려움 에너지가 낮습니다 — 지금이 직면하기 좋은 타이밍입니다`,
      `달이 ${s}에 있습니다. 두려움 에너지가 잠잠합니다`,
      `달이 ${s}에 있습니다. 두려움 에너지가 올라옵니다. 무엇이 막고 있는지 더 들여다보세요`,
      `달이 ${s}에 있습니다. 두려움이 지배적입니다. 지금 행동 결정은 공포 기반이 될 수 있습니다`,
    ],
    growth: [
      `달이 ${s}에 있습니다. 성장 수용 에너지가 열려있습니다 — 새로운 방향을 받아들일 준비가 됐습니다`,
      `달이 ${s}에 있습니다. 성장 에너지가 평탄합니다`,
      `달이 ${s}에 있습니다. 성장 저항이 있습니다. 변화를 받아들이기 어려운 국면입니다`,
      `달이 ${s}에 있습니다. 성장 에너지가 막혀있습니다. 지금 무리한 전진보다 수용이 먼저입니다`,
    ],
    stagnation: [
      `달이 ${s}에 있습니다. 내면 움직임 에너지가 있습니다 — 정체를 뚫을 수 있는 시점입니다`,
      `달이 ${s}에 있습니다. 내면 에너지가 잠잠합니다`,
      `달이 ${s}에 있습니다. 정체 에너지가 강합니다. 억지로 뚫으려 하지 마세요`,
      `달이 ${s}에 있습니다. 내면이 막혀있습니다. 지금은 움직임보다 수용이 유효합니다`,
    ],
    self_trust: [
      `달이 ${s}에 있습니다. 내면 신호가 안정적입니다 — 지금 직감을 신뢰할 수 있습니다`,
      `달이 ${s}에 있습니다. 내면 신호가 잠잠합니다`,
      `달이 ${s}에 있습니다. 내면 신호에 잡음이 있습니다. 직감과 걱정을 먼저 분리하세요`,
      `달이 ${s}에 있습니다. 내면 신호가 흔들립니다. 지금 내 직감을 최종 판단으로 쓰지 마세요`,
    ],
    boundary: [
      `달이 ${s}에 있습니다. 자기 보호 에너지가 안정적입니다 — 선을 그을 내적 자원이 있습니다`,
      `달이 ${s}에 있습니다. 경계 에너지가 잠잠합니다`,
      `달이 ${s}에 있습니다. 보호 본능이 흔들립니다. 지금 경계 설정은 감정적으로 힘들 수 있습니다`,
      `달이 ${s}에 있습니다. 자기 보호 에너지가 고갈됩니다. 경계보다 회복이 먼저입니다`,
    ],
    identity: [
      `달이 ${s}에 있습니다. 내면이 안정적입니다 — 자아 탐색에 좋은 에너지입니다`,
      `달이 ${s}에 있습니다. 내면 에너지가 고요합니다`,
      `달이 ${s}에 있습니다. 내면에 잡음이 있습니다. 자아 판단을 서두르지 마세요`,
      `달이 ${s}에 있습니다. 내면이 흔들립니다. 지금은 결론보다 관찰이 유효합니다`,
    ],
    energy: [
      `달이 ${s}에 있습니다. 생명력 에너지가 안정적입니다 — 회복 국면에 접어들었습니다`,
      `달이 ${s}에 있습니다. 생명력 에너지가 평탄합니다`,
      `달이 ${s}에 있습니다. 에너지 소진 경향이 있습니다. 무리한 행동을 멈추세요`,
      `달이 ${s}에 있습니다. 에너지가 고갈됩니다. 지금은 행동보다 회복이 절대적으로 먼저입니다`,
    ],
    pattern: [
      `달이 ${s}에 있습니다. 패턴 인식 에너지가 열려있습니다 — 지금 보이는 게 진짜 패턴입니다`,
      `달이 ${s}에 있습니다. 패턴 에너지가 잠잠합니다`,
      `달이 ${s}에 있습니다. 패턴이 재활성화 중입니다. 무의식적 반응을 관찰하세요`,
      `달이 ${s}에 있습니다. 패턴이 강하게 작동합니다. 지금 행동은 패턴의 반복일 수 있습니다`,
    ],
    purpose: [
      `달이 ${s}에 있습니다. 의미 수용 에너지가 열려있습니다 — 내면의 목소리가 들릴 때입니다`,
      `달이 ${s}에 있습니다. 의미 에너지가 잠잠합니다`,
      `달이 ${s}에 있습니다. 의미를 찾기 어려운 국면입니다. 지금 의미 감각이 흐려진 것입니다`,
      `달이 ${s}에 있습니다. 내면이 고갈됩니다. 지금 고갈 상태에서 의미를 구하면 왜곡됩니다`,
    ],
  };

  // For SELF intents use the intent-specific note table
  const selfNote = category === "self"
    ? (SELF_MOON_NOTE as Record<string, [string,string,string,string]>)[intent]
    : undefined;

  // For all other categories, use the 4-variant category table
  const MOON_NOTE: Record<VoidCategory, [string, string, string, string]> = {
    love:   [
      `달이 ${s}에 있습니다. 감정 표현 타이밍이 열려있습니다 — 솔직하게 전달하세요`,
      `달이 ${s}에 있습니다. 감정 흐름이 평탄합니다`,
      `달이 ${s}에 있습니다. 감정에 잡음이 있습니다. 표현 전 먼저 정리하세요`,
      `달이 ${s}에 있습니다. 감정이 불안정합니다. 지금 말하면 의도가 흐려집니다`,
    ],
    work:   [
      `달이 ${s}에 있습니다. 판단 에너지가 안정적입니다 — 결정 내리기 좋은 상태`,
      `달이 ${s}에 있습니다. 판단 에너지 평탄합니다`,
      `달이 ${s}에 있습니다. 판단에 잡음이 있습니다. 감정 배제 후 결정하세요`,
      `달이 ${s}에 있습니다. 판단이 흔들립니다. 지금 결정은 충동이 될 수 있습니다`,
    ],
    self:   selfNote ?? [
      `달이 ${s}에 있습니다. 내면이 안정적입니다 — 자아 탐색에 좋은 에너지입니다`,
      `달이 ${s}에 있습니다. 내면 에너지가 고요합니다`,
      `달이 ${s}에 있습니다. 내면에 잡음이 있습니다. 자아 판단을 서두르지 마세요`,
      `달이 ${s}에 있습니다. 내면이 흔들립니다. 지금은 결론보다 관찰이 유효합니다`,
    ],
    social: [
      `달이 ${s}에 있습니다. 공감 에너지가 안정적입니다 — 연결하기 좋은 상태`,
      `달이 ${s}에 있습니다. 공감 에너지가 평탄합니다`,
      `달이 ${s}에 있습니다. 공감에 잡음이 있습니다. 관계 역학을 먼저 읽으세요`,
      `달이 ${s}에 있습니다. 감정이 요동칩니다. 지금은 관계보다 거리 유지가 유효합니다`,
    ],
  };
  const [h, m, l, vl] = MOON_NOTE[category];
  const note = score >= 68 ? h : score >= 52 ? m : score >= 40 ? l : vl;
  return { score, note };
}

/**
 * House activation score — checks whether transit benefics/malefics
 * are currently occupying the significant houses for this question type.
 * Returns 0–100 (50 = no activation; >50 = benefic presence; <50 = malefic pressure).
 */
function houseActivationScore(
  natal: NatalChart,
  significantHouses: number[],
  transitLons: Map<PlanetName, number>,
  category: VoidCategory = "self",
): { score: number; note: string } {
  const ascSignIdx = Math.floor(((natal.ascendant.longitude % 360) + 360) % 360 / 30);
  let delta = 0;

  for (const houseNum of significantHouses) {
    const houseSignIdx = (ascSignIdx + houseNum - 1) % 12;
    const houseLonMin = houseSignIdx * 30;
    const houseLonMax = houseLonMin + 30;

    for (const [planet, lon] of transitLons) {
      const norm = ((lon % 360) + 360) % 360;
      if (norm < houseLonMin || norm >= houseLonMax) continue;
      if      (planet === "Jupiter") delta += 14;
      else if (planet === "Venus")   delta += 10;
      else if (planet === "Sun")     delta +=  6;
      else if (planet === "Moon")    delta +=  4;
      else if (planet === "Saturn")  delta -=  8;
      else if (planet === "Mars")    delta -=  6;
      else                           delta +=  2;
    }
  }

  const score = Math.max(0, Math.min(100, 50 + delta));
  // Category-specific house notes — same activation score, different context
  const HOUSE_NOTE: Record<VoidCategory, [string, string, string]> = {
    love:   [
      "관계 쪽으로 마음이 움직이기 쉬운 때입니다. 표현도 비교적 자연스럽게 이어집니다",
      "관계 쪽 부담이 큽니다. 지금 감정 표현은 역효과가 날 수 있습니다",
      "관계 쪽 큰 움직임은 없습니다. 지금은 상황을 먼저 보는 편이 낫습니다",
    ],
    work:   [
      "일과 성과 쪽으로 힘을 쓰기 좋은 때입니다",
      "일 쪽 압박이 큽니다. 조건부터 다시 점검하세요",
      "일 쪽 판은 아직 조용합니다. 준비를 더 쌓는 편이 낫습니다",
    ],
    self:   [
      "내면을 돌아보고 정리하기 좋은 때입니다",
      "안쪽에서 버거움이 올라옵니다. 밀어붙이기보다 쉬어가세요",
      "마음 쪽 큰 파도는 없습니다. 기반을 다지는 데 집중하세요",
    ],
    social: [
      "사람들과 연결되기 좋은 때입니다",
      "관계나 집단 안에서 긴장이 큽니다. 지금은 오해를 줄이는 게 먼저입니다",
      "대인관계 쪽 큰 움직임은 없습니다. 현재 관계를 무리 없이 유지하세요",
    ],
  };
  const [pos, neg, neu] = HOUSE_NOTE[category];
  const note = score >= 62 ? pos : score <= 38 ? neg : neu;
  return { score, note };
}

// ── Recommendation threshold ──────────────────────────────────────────────────

/**
 * Normalize score into a confidence value within each outcome band:
 * - GO:    50 (at threshold) → 100 (max signal), range [goThreshold, 100]
 * - AVOID: 50 (at threshold) → 100 (max signal), range [0, avoidThreshold]
 * - WAIT:  95 (perfectly centered) → 50 (at a boundary edge)
 */
function toRecommendation(
  score: number,
  goThreshold: number,
  avoidThreshold: number,
): { recommendation: DecisionRecommendation; confidence: number } {
  if (score >= goThreshold) {
    const range = Math.max(1, 100 - goThreshold);
    const pct   = (score - goThreshold) / range;
    return { recommendation: "GO", confidence: Math.min(100, Math.round(50 + 50 * pct)) };
  }
  if (score <= avoidThreshold) {
    const range = Math.max(1, avoidThreshold);
    const pct   = (avoidThreshold - score) / range;
    return { recommendation: "AVOID", confidence: Math.min(100, Math.round(50 + 50 * pct)) };
  }
  // WAIT — highest confidence when centered; falls toward 50 near either boundary
  const midpoint     = (goThreshold + avoidThreshold) / 2;
  const halfRange    = Math.max(1, (goThreshold - avoidThreshold) / 2);
  const distFromCenter = Math.abs(score - midpoint);
  const pct          = 1 - distFromCenter / halfRange;
  return { recommendation: "WAIT", confidence: Math.max(50, Math.round(50 + 45 * pct)) };
}

// ── Summary templates ─────────────────────────────────────────────────────────

const SUMMARY_TEMPLATES: Record<DecisionRecommendation, Record<string, string>> = {
  GO: {
    confession:    "마음을 전할 만한 때입니다. 돌려 말하기보다 담백하게 전해보세요.",
    compatibility: "서로 맞는 부분이 잘 보이는 때입니다. 다만 속도는 맞춰가야 합니다.",
    breakup:       "마음을 정리할 힘이 어느 정도 모였습니다. 결정을 마냥 미루지만은 마세요.",
    relationship:  "관계를 한 걸음 움직여볼 만합니다. 솔직하되 서두르지는 마세요.",
    trust:         "지금은 믿어도 될 근거가 비교적 분명합니다. 말보다 행동을 보세요.",
    quit:          "옮기거나 떠날 준비를 하기 좋은 때입니다. 충동보다 계획이 중요합니다.",
    promotion:     "보여준 것을 드러내기 좋은 때입니다. 너무 크게 벌이기보다 정확하게 어필하세요.",
    conflict:      "지금은 대화를 시도해볼 만합니다. 요점만 분명하게 꺼내세요.",
    decision:      "판단이 비교적 선명한 때입니다. 필요한 결정은 미루지 않아도 됩니다.",
    direction:     "방향을 다시 잡기 좋습니다. 지금 끌리는 쪽을 가볍게라도 움직여보세요.",
    identity:      "내가 원하는 모습이 조금 더 분명해집니다. 남 기준보다 내 감각을 믿으세요.",
    energy:        "회복할 힘이 돌아오고 있습니다. 쉬는 시간을 제대로 챙기세요.",
    pattern:       "반복되는 습관을 끊을 틈이 보입니다. 평소와 다른 선택을 작게라도 해보세요.",
    purpose:       "의미를 다시 붙잡을 실마리가 생깁니다. 크게 정하려 하지 말고 당장 할 수 있는 일부터 하세요.",
    communication: "대화를 시작하기 좋은 때입니다. 길게 설명하기보다 핵심부터 말하세요.",
    friendship:    "먼저 다가가도 괜찮습니다. 부담 없는 방식이 가장 잘 먹힙니다.",
    group:         "집단 안에서 자리를 잡아가기 좋습니다. 관찰만 하지 말고 조금 참여해보세요.",
    distance:      "거리와 친밀감 사이를 조절해볼 만합니다. 솔직하되 급하게 메우려 하진 마세요.",
    reciprocity:   "상대도 어느 정도는 반응하고 있을 가능성이 큽니다. 확인은 차분하게 하세요.",
    commitment:    "관계를 더 진지하게 볼 바탕이 있습니다. 서로 원하는 그림을 먼저 맞춰보세요.",
    timing:        "지금은 가볍게 연락을 건네기 좋은 때입니다. 첫 문장은 짧을수록 좋습니다.",
    opportunity:   "잡아볼 만한 기회입니다. 다만 조건은 끝까지 확인하세요.",
    self_trust:    "내 판단을 너무 깎아내릴 필요는 없습니다. 핵심만 다시 확인하고 믿어보세요.",
    boundary:      "지금은 선을 그을 힘이 있습니다. 작은 것부터 분명히 하세요.",
    belonging:     "이 환경이 꽤 잘 맞는 편입니다. 억지로 애쓰지 말고 자연스럽게 섞여보세요.",
    self_worth:    "지금의 자기비판은 지나칠 수 있습니다. 스스로를 너무 몰아붙이지 마세요.",
    self_honesty:  "지금은 나를 조금 더 정직하게 볼 수 있습니다. 불편한 감정도 피하지 마세요.",
    fear:          "두려움을 다뤄볼 만한 때입니다. 없애려 하기보다 이름부터 붙여보세요.",
    growth:        "조금씩 앞으로 나아가고 있습니다. 크게 달라 보이지 않아도 쌓이고 있습니다.",
    stagnation:    "막힌 감각을 풀 실마리가 생깁니다. 작은 행동 하나가 판을 바꿉니다.",
    _default:      "지금은 한 걸음 움직여볼 만한 때입니다. 다만 무리하게 몰아붙이진 마세요.",
  },
  WAIT: {
    confession:    "감정이 아직 고르지 않습니다. 조금 더 정리한 뒤 말하세요.",
    compatibility: "좋은 부분도 있지만 아직 단정하긴 이릅니다. 더 지켜보세요.",
    breakup:       "마음이 아직 한쪽으로 정리되지 않았습니다. 시간을 두는 편이 낫습니다.",
    relationship:  "관계는 아직 자리 잡는 중입니다. 서두르면 어색해집니다.",
    trust:         "판단이 흐릴 수 있습니다. 정보가 더 쌓인 뒤 보세요.",
    quit:          "당장 떠나는 결정보다 준비를 먼저 챙기세요.",
    promotion:     "보여줄 타이밍이 조금 더 필요합니다. 기반을 더 쌓으세요.",
    conflict:      "지금은 풀려는 마음보다 타이밍이 문제입니다. 바로 부딪히지 마세요.",
    decision:      "지금은 결론을 내리기보다 정보를 더 모으는 편이 낫습니다.",
    direction:     "아직 마음이 완전히 모이지 않았습니다. 조금 더 지켜보세요.",
    identity:      "나는 지금 정리되는 중입니다. 섣부른 규정은 피하세요.",
    energy:        "회복이 진행 중입니다. 속도를 낮추는 쪽이 좋습니다.",
    pattern:       "반복의 이유를 더 봐야 합니다. 성급히 고치려 하지 마세요.",
    purpose:       "의미를 억지로 찾기보다 힘을 회복하는 쪽이 먼저입니다.",
    communication: "지금은 말할 내용보다 말하는 방식이 더 중요합니다. 시점을 고르세요.",
    friendship:    "관계가 정리되는 중입니다. 시간을 조금 두세요.",
    group:         "집단 안 역할이 아직 분명하지 않습니다. 먼저 분위기를 보세요.",
    distance:      "지금은 거리를 섣불리 줄이거나 늘리지 않는 편이 낫습니다.",
    reciprocity:   "상대 마음을 단정하긴 아직 이릅니다. 더 관찰하세요.",
    commitment:    "더 깊어지기 전 확인할 게 남아 있습니다. 시간을 두세요.",
    timing:        "지금은 타이밍이 덜 무르익었습니다. 잠시 기다리세요.",
    opportunity:   "조건이 더 필요합니다. 좋아 보여도 서두르지 마세요.",
    self_trust:    "내 목소리가 조금 더 분명해질 때까지 기다리세요.",
    boundary:      "지금은 선을 그을 준비가 완전하지 않습니다. 상황을 더 보세요.",
    belonging:     "맞는지 아닌지 아직 단정하기 어렵습니다. 더 지켜보세요.",
    self_worth:    "지금의 자기평가는 흔들릴 수 있습니다. 최종 판단으로 삼지 마세요.",
    self_honesty:  "아직은 스스로를 바로 보기 어려울 수 있습니다. 조금 더 시간을 두세요.",
    fear:          "두려움의 뿌리를 더 봐야 합니다. 지금은 관찰이 먼저입니다.",
    growth:        "성장 방향이 아직 또렷하지 않습니다. 조급해하지 마세요.",
    stagnation:    "왜 막혔는지 더 봐야 합니다. 억지로 밀어붙이지 마세요.",
    _default:      "지금은 조금 더 지켜보는 편이 낫습니다.",
  },
  AVOID: {
    confession:    "지금 고백은 오해를 키울 수 있습니다. 타이밍을 다시 잡으세요.",
    compatibility: "지금은 잘 맞는다고 단정하기 어렵습니다. 기대부터 낮추는 편이 안전합니다.",
    breakup:       "지금 헤어짐을 결정하면 후회가 남기 쉽습니다. 감정이 가라앉을 때까지 기다리세요.",
    relationship:  "지금 밀어붙이면 오해가 쌓입니다. 거리를 두는 편이 낫습니다.",
    trust:         "지금은 믿고 맡기기보다 확인이 먼저입니다.",
    quit:          "지금 나가면 같은 문제가 반복될 수 있습니다. 먼저 상황을 안정시키세요.",
    promotion:     "지금은 어필이 약이 되지 않습니다. 기반부터 다시 챙기세요.",
    conflict:      "지금 맞부딪히면 갈등만 커집니다. 한걸음 물러서세요.",
    decision:      "지금 결정은 후회로 이어질 수 있습니다. 당장 확정하지 마세요.",
    direction:     "지금은 방향을 정할 힘이 부족합니다. 먼저 숨을 고르세요.",
    identity:      "지금의 흔들림만으로 나를 단정하지 마세요.",
    energy:        "지금은 행동보다 회복이 훨씬 더 중요합니다.",
    pattern:       "지금 무리하게 바꾸려 하면 되레 반복이 세집니다.",
    purpose:       "지친 상태에서 의미를 찾으려 하면 더 공허해질 수 있습니다. 먼저 쉬세요.",
    communication: "지금 말은 오해로 남기 쉽습니다. 침묵이 더 나은 때입니다.",
    friendship:    "지금은 다가갈수록 더 지칠 수 있습니다. 거리를 두세요.",
    group:         "지금 집단 안으로 깊이 들어가면 쉽게 소모됩니다.",
    distance:      "지금 경계를 건드리면 역효과가 큽니다. 당분간 유지하세요.",
    reciprocity:   "상대는 지금 다른 쪽을 보고 있을 가능성이 큽니다. 더 밀지 마세요.",
    commitment:    "지금 더 깊어지면 불균형이 커집니다. 속도를 늦추세요.",
    timing:        "지금 연락은 오해를 부를 수 있습니다. 보내지 않는 편이 낫습니다.",
    opportunity:   "지금 이 기회는 부담이 더 클 수 있습니다. 일단 보류하세요.",
    self_trust:    "지금 내 판단만 믿고 밀어붙이기엔 흔들림이 큽니다.",
    boundary:      "지금 선을 그으면 상처만 커질 수 있습니다. 준비를 더 하세요.",
    belonging:     "지금 이 환경에 억지로 맞추려 하면 더 소모됩니다.",
    self_worth:    "지금의 자기비난은 왜곡이 큽니다. 그 목소리를 사실로 받아들이지 마세요.",
    self_honesty:  "지금은 자기합리화가 강해질 수 있습니다. 스스로 한 말부터 의심해보세요.",
    fear:          "두려움이 판단 전체를 덮고 있습니다. 지금 결정은 피하세요.",
    growth:        "지금 무리한 전진은 역효과가 나기 쉽습니다. 바탕부터 다지세요.",
    stagnation:    "지금 억지로 뚫으려 하면 더 막힙니다. 멈춰서 원인부터 봐야 합니다.",
    _default:      "지금은 밀어붙일 때가 아닙니다.",
  },
};

// ── Answer schema per intent ──────────────────────────────────────────────────
const ANSWER_SCHEMA: Record<QuestionIntent, AnswerSchemaKey> = {
  confession: "timing", compatibility: "likelihood", trust: "likelihood",
  breakup: "timing", relationship: "state", reciprocity: "balance",
  commitment: "timing", timing: "timing",
  quit: "timing", promotion: "timing", decision: "timing",
  conflict: "timing", direction: "state", opportunity: "likelihood",
  identity: "self_awareness", energy: "state", pattern: "self_awareness",
  purpose: "state", self_trust: "self_awareness", boundary: "timing",
  self_worth: "self_awareness", self_honesty: "self_awareness",
  fear: "self_awareness", growth: "state", stagnation: "state",
  communication: "timing", friendship: "state", group: "state",
  distance: "state", belonging: "likelihood",
};

// ── Schema bucket system ──────────────────────────────────────────────────────
// CORE ANTI-COLLAPSE FIX:
// Each schema maps score ranges to 3-4 labeled buckets.
// Critical insight: the SAME score maps to DIFFERENT bucket labels per schema.
//   Score 48 → timing:"wait"  state:"observing"  self_awareness:"not_fully"  balance:"unclear"
// This prevents different questions from sharing the same answer family even when
// the underlying transit score is identical.
//
// Wider neutral bands prevent most questions from falling into the lowest bucket.
const SCHEMA_BUCKETS: Record<AnswerSchemaKey, Array<{ label: SchemaLabel; minScore: number }>> = {
  // timing: 4 buckets — act now / start small / wait / do not act
  // "start_small" is the key addition: prevents binary GO/AVOID.
  timing: [
    { label: "act_now",     minScore: 62 },
    { label: "start_small", minScore: 54 },
    { label: "wait",        minScore: 41 },
    { label: "do_not_act",  minScore: 0  },
  ],
  // balance: 3 buckets with WIDE unclear band (43–57)
  // Prevents "one-sided" answer unless signal is genuinely strong.
  balance: [
    { label: "balanced",    minScore: 57 },
    { label: "unclear",     minScore: 43 },
    { label: "giving_more", minScore: 0  },
  ],
  // likelihood: 3 buckets — likely / mixed / unlikely
  likelihood: [
    { label: "likely",      minScore: 59 },
    { label: "mixed",       minScore: 41 },
    { label: "unlikely",    minScore: 0  },
  ],
  // state: 4 buckets — positive / adjusting / observing / blocked
  // "adjusting" and "observing" cover most of the 40-60 range.
  // "blocked" only fires below 40 (needs active strong negative transit).
  state: [
    { label: "positive",    minScore: 60 },
    { label: "adjusting",   minScore: 50 },
    { label: "observing",   minScore: 40 },
    { label: "blocked",     minScore: 0  },
  ],
  // self_awareness: 4 buckets — yes / partly / not_fully / no
  // "partly" and "not_fully" cover score 40-62; most questions land here.
  // "no" only fires below 39 (needs very strong negative transit stack).
  self_awareness: [
    { label: "yes",         minScore: 63 },
    { label: "partly",      minScore: 52 },
    { label: "not_fully",   minScore: 39 },
    { label: "no",          minScore: 0  },
  ],
};

function resolveSchemaLabel(score: number, schema: AnswerSchemaKey): SchemaLabel {
  for (const b of SCHEMA_BUCKETS[schema]) {
    if (score >= b.minScore) return b.label;
  }
  return SCHEMA_BUCKETS[schema][SCHEMA_BUCKETS[schema].length - 1].label;
}

// Schema label → GO/WAIT/AVOID (for UI badge color/icon — kept for display only)
const LABEL_RECOMMENDATION: Record<SchemaLabel, DecisionRecommendation> = {
  act_now:     "GO",   start_small: "GO",   wait:        "WAIT", do_not_act: "AVOID",
  balanced:    "GO",   unclear:     "WAIT", giving_more: "AVOID",
  likely:      "GO",   mixed:       "WAIT", unlikely:    "AVOID",
  positive:    "GO",   adjusting:   "WAIT", observing:   "WAIT", blocked: "AVOID",
  yes:         "GO",   partly:      "WAIT", not_fully:   "WAIT", no:      "AVOID",
};

// ── Per-intent direct answer texts (schema-label keyed) ───────────────────────
// Each intent has its own answer vocabulary per schema bucket.
// This is what the user SEES as the verdict — it answers the question directly.
//
// Rules:
//  - Must answer the QUESTION, not describe the astrology state
//  - Different schemas → totally different vocabulary, even at same score
//  - "blocked"/"not_fully"/"unclear" must NOT all sound like "blocked"
const SCHEMA_ANSWER_TEXT: Record<QuestionIntent, Record<string, string>> = {
  // ── TIMING schema ─────────────────────────────────────────────────────────
  confession: {
    act_now:    "지금 말해도 됩니다 — 에너지가 당신 편입니다",
    start_small:"조심스럽게 운을 띄워볼 수 있습니다 — 반응을 먼저 살피세요",
    wait:       "아직 말하기 이릅니다 — 감정이 더 정리될 때까지 기다리세요",
    do_not_act: "지금 말하면 의도가 왜곡됩니다 — 타이밍이 맞지 않습니다",
  },
  timing: {
    act_now:    "지금이 연락할 타이밍입니다 — 달 에너지가 열려있습니다",
    start_small:"이어질 수 있지만 짧은 연락부터 시작하세요",
    wait:       "타이밍이 아직 맞지 않습니다 — 조금 더 기다리세요",
    do_not_act: "지금 연락하면 역효과입니다 — 타이밍이 어긋나 있습니다",
  },
  breakup: {
    act_now:    "지금이 결정 타이밍입니다 — 에너지가 분리를 지지합니다",
    start_small:"결정하기 전 거리를 두고 먼저 확인하세요",
    wait:       "아직 결정하기 이릅니다 — 내면 욕구를 먼저 명확히 하세요",
    do_not_act: "지금 결정하면 후회할 수 있습니다 — 감정이 요동치고 있습니다",
  },
  commitment: {
    act_now:    "지금 더 깊이 들어가도 됩니다 — 헌신 조건이 갖춰졌습니다",
    start_small:"더 깊이 가기 전 조건을 먼저 한 단계 확인하세요",
    wait:       "감정은 있지만 구조가 아직 준비되지 않았습니다",
    do_not_act: "지금 더 깊이 들어가면 구조가 삐걱거립니다",
  },
  quit: {
    act_now:    "지금 나가도 됩니다 — 이탈 에너지가 구조적으로 지지됩니다",
    start_small:"바로 떠나기보다 나갈 준비 조건을 먼저 정비하세요",
    wait:       "아직 나가기 전에 충동인지 방향인지를 먼저 분리하세요",
    do_not_act: "지금 나가면 패턴이 반복됩니다 — 방향 확인이 먼저입니다",
  },
  promotion: {
    act_now:    "지금 어필해도 됩니다 — 성과 에너지가 뒷받침합니다",
    start_small:"어필하되 규모를 줄여 먼저 테스트하세요",
    wait:       "충분하지 않아서가 아닙니다 — 드러낼 구조가 아직 형성 중입니다",
    do_not_act: "지금 어필하면 역효과입니다 — 조건이 아직 없습니다",
  },
  decision: {
    act_now:    "지금 결정을 내려도 됩니다 — 판단 에너지가 안정적입니다",
    start_small:"결정하되 작은 범위에서 먼저 확인하세요",
    wait:       "지금 결정은 흐릿합니다 — 더 명확해질 때를 기다리세요",
    do_not_act: "지금 내린 결정은 후회할 수 있습니다 — 욕구를 먼저 명확히 하세요",
  },
  conflict: {
    act_now:    "지금 직접 해결할 수 있습니다 — 에너지가 지지됩니다",
    start_small:"먼저 작은 대화로 분위기를 확인하세요",
    wait:       "해결 의지가 부족한 게 아닙니다 — 해소 타이밍이 아직 오지 않았습니다",
    do_not_act: "지금 개입하면 갈등이 악화됩니다 — 거리를 먼저 유지하세요",
  },
  communication: {
    act_now:    "지금 말해도 됩니다 — 전달 에너지가 열려있습니다",
    start_small:"말하되 짧게 시작하고 반응을 먼저 보세요",
    wait:       "할 말이 없는 게 아닙니다 — 어떻게 말할지가 아직 정리 중입니다",
    do_not_act: "지금 발언은 오해를 낳습니다 — 에너지가 어긋나 있습니다",
  },
  boundary: {
    act_now:    "지금 선을 그을 수 있습니다 — 경계 에너지가 지지됩니다",
    start_small:"선을 긋되 작게 시작하세요 — 상대 반응을 먼저 살피세요",
    wait:       "경계 설정 전 상황을 더 파악해야 합니다",
    do_not_act: "지금 경계를 세우면 관계가 단절될 수 있습니다",
  },
  // ── BALANCE schema ────────────────────────────────────────────────────────
  reciprocity: {
    balanced:    "상대방도 당신에게 반응하고 있습니다 — 이건 일방적이지 않습니다",
    unclear:     "아직 단정하기 어렵습니다 — 상대 에너지가 혼재됩니다",
    giving_more: "당신이 더 많이 주고 있을 가능성이 큽니다",
  },
  // ── LIKELIHOOD schema ─────────────────────────────────────────────────────
  compatibility: {
    likely:  "에너지 방향이 조화롭습니다 — 함께하기 좋은 구조입니다",
    mixed:   "호환 가능하지만 속도가 다릅니다 — 조율이 필요합니다",
    unlikely:"에너지 방향이 충돌합니다 — 지금 판단은 오판이 될 수 있습니다",
  },
  trust: {
    likely:  "신뢰 기반이 갖춰지고 있습니다 — 판단을 믿어도 됩니다",
    mixed:   "신뢰 기반이 아직 형성 중입니다 — 더 파악한 후 판단하세요",
    unlikely:"지금 무조건 신뢰하면 흔들립니다 — 기반이 아직 불안합니다",
  },
  opportunity: {
    likely:  "지금이 잡을 수 있는 기회입니다 — 에너지가 열려있습니다",
    mixed:   "조건이 아직 무르익지 않았습니다 — 좀 더 살피세요",
    unlikely:"지금 이 기회는 함정이 될 수 있습니다 — 에너지가 역방향입니다",
  },
  belonging: {
    likely:  "지금 이 환경이 당신에게 맞습니다 — 공명이 확인됩니다",
    mixed:   "맞지 않는다고 확신하기 이릅니다 — 공명이 아직 형성 중입니다",
    unlikely:"지금 이 환경은 당신에게 맞지 않습니다",
  },
  // ── STATE schema ──────────────────────────────────────────────────────────
  relationship: {
    positive: "지금 관계 에너지가 흐릅니다 — 솔직하게 다가가도 됩니다",
    adjusting:"관계 에너지가 아직 형성 중입니다 — 서두르지 마세요",
    observing:"지금은 관계보다 거리 유지를 먼저 생각하세요",
    blocked:  "지금 관계 에너지가 충돌합니다 — 거리를 먼저 두세요",
  },
  direction: {
    positive: "지금 방향 결정을 내려도 됩니다 — 에너지가 모였습니다",
    adjusting:"이 망설임은 방향 재정의의 신호입니다 — 왜 원하는지를 먼저 물으세요",
    observing:"방향이 더 명확해질 때를 기다리세요 — 에너지가 수렴 중입니다",
    blocked:  "지금 방향 결정은 무리입니다 — 에너지가 아직 모이지 않았습니다",
  },
  energy: {
    positive: "회복 에너지가 모였습니다 — 지금이 재충전 시점입니다",
    adjusting:"에너지가 회복 중입니다 — 속도를 낮추세요",
    observing:"아직 회복이 완전하지 않습니다 — 무리하지 마세요",
    blocked:  "소진이 심합니다 — 행동보다 회복이 절대적으로 먼저입니다",
  },
  purpose: {
    positive: "의미 에너지가 열리고 있습니다 — 탐색을 시작하세요",
    adjusting:"지금은 의미를 찾기보다 에너지를 쌓는 단계입니다",
    observing:"의미가 없어서가 아닙니다 — 지금 상태에서는 의미가 왜곡됩니다",
    blocked:  "고갈 상태에서 의미를 구하지 마세요 — 회복 후에 질문하세요",
  },
  friendship: {
    positive: "연결 에너지가 열려있습니다 — 먼저 다가가도 됩니다",
    adjusting:"관계가 변화 중입니다 — 자연스럽게 흘러가게 하세요",
    observing:"관계를 포기하는 게 아닙니다 — 에너지 회복을 위한 거리가 필요합니다",
    blocked:  "지금 다가가면 소진됩니다 — 거리를 먼저 유지하세요",
  },
  group: {
    positive: "지금 집단 에너지가 맞습니다 — 참여하기 좋은 타이밍입니다",
    adjusting:"집단 내 역할이 정리 중입니다 — 지켜보면서 자연스럽게 들어가세요",
    observing:"소속 의지가 없는 게 아닙니다 — 집단 내 역할이 아직 불명확합니다",
    blocked:  "지금 집단에 깊이 들어가지 마세요 — 에너지가 충돌합니다",
  },
  distance: {
    positive: "거리 조율이 가능한 타이밍입니다 — 솔직하게 표현하세요",
    adjusting:"거리감의 원인이 정리 중입니다 — 한 발짝 물러서서 보세요",
    observing:"경계가 아직 정리 중입니다 — 욕망보다 경계를 먼저 보세요",
    blocked:  "지금 경계를 건드리면 역효과입니다 — 거리가 보호막이 됩니다",
  },
  growth: {
    positive: "성장하고 있습니다 — 기준을 바꾸면 이미 보입니다",
    adjusting:"지금은 성장보다 재정렬 단계에 가깝습니다",
    observing:"아직 준비 중입니다 — 내부적으로 쌓이고 있는 것이 있습니다",
    blocked:  "지금은 정체 구간입니다 — 그것 자체가 읽어야 할 신호입니다",
  },
  stagnation: {
    positive: "정체를 뚫을 수 있는 타이밍입니다 — 작은 행동으로 에너지를 열어보세요",
    adjusting:"이유 있는 정지입니다 — 무엇이 막고 있는지 먼저 파악하세요",
    observing:"변화 에너지가 아직 충분히 쌓이지 않았습니다 — 기다리는 것도 전략입니다",
    blocked:  "정체 에너지가 강합니다 — 억지로 뚫으면 더 막힙니다",
  },
  // ── SELF_AWARENESS schema ─────────────────────────────────────────────────
  identity: {
    yes:       "자아 에너지가 명확합니다 — 지금 방향이 진짜입니다",
    partly:    "자아 방향이 보이지만 아직 완전히 정립되지 않았습니다",
    not_fully: "자아가 재편 중입니다 — 지금 결론을 내리지 마세요",
    no:        "자아 판단이 흐려진 상태입니다 — 섣부른 정체성 결론은 피하세요",
  },
  pattern: {
    yes:       "반복의 고리가 보여서 지금이 흐름을 바꿔볼 때입니다",
    partly:    "반복의 흐름이 조금씩 보입니다 — 조금 더 지켜보세요",
    not_fully: "반복의 이유가 드러나는 중입니다 — 조금 더 지켜보세요",
    no:        "지금 급히 바꾸려 하면 같은 흐름만 더 강해집니다",
  },
  self_trust: {
    yes:       "지금 내 판단을 믿어도 됩니다 — 내면 신호가 안정적입니다",
    partly:    "판단을 믿어도 되지만 한 번 더 확인하세요",
    not_fully: "지금 내면 신호가 흔들립니다 — 조금 더 기다리세요",
    no:        "지금 내 판단은 흐려진 상태입니다 — 외부 시각이 도움됩니다",
  },
  self_worth: {
    yes:       "지금 당신은 충분합니다 — 에너지가 뒷받침합니다",
    partly:    "충분하지 않다는 목소리가 있지만, 지금 그 목소리는 공정하지 않습니다",
    not_fully: "지금 자기 평가가 왜곡 중입니다 — 비교 에너지에 영향받고 있습니다",
    no:        "자기비판 에너지가 지배적입니다 — 지금 내린 자기 평가는 왜곡되어 있습니다",
  },
  self_honesty: {
    yes:       "지금 자신에게 꽤 솔직한 상태입니다",
    partly:    "부분적으로 솔직합니다 — 보고 싶지 않은 영역이 있습니다",
    not_fully: "완전히 솔직하다고 보긴 어렵습니다 — 자기기만 에너지가 부분적으로 있습니다",
    no:        "지금 자기 서사를 그대로 믿지 마세요 — 회피 에너지가 강합니다",
  },
  fear: {
    yes:       "두려움을 직면할 에너지가 있습니다 — 지금이 이름 붙이기 좋은 때입니다",
    partly:    "두려움이 있지만 지금은 직면 가능한 에너지가 있습니다",
    not_fully: "두려움의 뿌리가 아직 명확하지 않습니다 — 더 들여다봐야 합니다",
    no:        "두려움이 모든 판단을 덮고 있습니다 — 지금 내린 결정을 최종으로 삼지 마세요",
  },
};

// ── Short answer tags per intent × schema label ───────────────────────────────
const SCHEMA_TAG: Partial<Record<QuestionIntent, Partial<Record<string, string>>>> = {
  reciprocity:   { balanced: "상호적",      unclear: "불명확",       giving_more: "일방적"         },
  self_honesty:  { yes: "솔직함",           partly: "부분적",         not_fully: "회피 있음",  no: "회피 중"       },
  self_worth:    { yes: "충분함",           partly: "자기평가 흔들림", not_fully: "평가 왜곡",  no: "비판 지배"     },
  self_trust:    { yes: "신뢰 가능",        partly: "재확인 필요",    not_fully: "신호 흔들림",no: "흐려진 상태"   },
  identity:      { yes: "방향 명확",        partly: "정립 중",        not_fully: "재편 중",    no: "흐려진 상태"   },
  pattern:       { yes: "바꿔볼 수 있음", partly: "조금 보임",      not_fully: "더 지켜봐야 함", no: "반복 강해짐"    },
  fear:          { yes: "직면 가능",        partly: "직면 중",        not_fully: "불명확",     no: "두려움 지배"   },
  growth:        { positive: "성장 중",     adjusting: "재정렬 중",   observing: "준비 중",    blocked: "정체 중"  },
  stagnation:    { positive: "돌파 가능",   adjusting: "이유 있는 정체",observing: "변화 준비 중",blocked: "정체 지속"},
  energy:        { positive: "회복 중",     adjusting: "속도 조절",   observing: "충전 중",    blocked: "소진 심함"},
  purpose:       { positive: "의미 열림",   adjusting: "힘을 모으는 중",observing:"왜곡 주의", blocked: "고갈 상태"},
  relationship:  { positive: "좋은 기류",   adjusting: "형성 중",     observing: "거리 유지",  blocked: "충돌"     },
  friendship:    { positive: "연결 가능",   adjusting: "변화 중",     observing: "거리 필요",  blocked: "소진 위험"},
  group:         { positive: "적합 타이밍", adjusting: "역할 정리 중",observing: "역할 불명확",blocked: "부딪힘 큼"},
  distance:      { positive: "조율 가능",   adjusting: "정리 중",     observing: "경계 형성 중",blocked:"역효과"   },
  direction:     { positive: "방향 명확",   adjusting: "재정의 중",   observing: "수렴 중",    blocked: "힘 부족"},
  confession:    { act_now: "지금 말해도 됨",start_small:"조심스럽게", wait: "아직 아님",       do_not_act: "역효과"},
  timing:        { act_now: "타이밍 맞음",  start_small: "짧게 시작", wait: "대기",            do_not_act: "역효과"},
  breakup:       { act_now: "결정 타이밍",  start_small: "거리 두기", wait: "유보",            do_not_act: "역효과"},
  commitment:    { act_now: "조건 갖춤",    start_small: "단계 확인", wait: "준비 부족",        do_not_act: "역효과"},
  quit:          { act_now: "이탈 가능",    start_small: "준비 먼저", wait: "재검토",           do_not_act: "시기상조"},
  promotion:     { act_now: "어필 가능",    start_small: "소규모 테스트",wait:"구조 형성 중",   do_not_act: "역효과"},
  decision:      { act_now: "결정 가능",    start_small: "소규모 확인",wait:"유보",             do_not_act: "오판 위험"},
  conflict:      { act_now: "해소 가능",    start_small: "소규모 대화",wait:"타이밍 아님",      do_not_act: "악화 위험"},
  communication: { act_now: "표현 가능",    start_small: "짧게 시작", wait: "정리 중",          do_not_act: "역효과"},
  boundary:      { act_now: "설정 가능",    start_small: "작게 시작", wait: "더 파악",          do_not_act: "역효과"},
  compatibility: { likely: "조화로움",      mixed: "조율 필요",       unlikely: "충돌"          },
  trust:         { likely: "신뢰 가능",     mixed: "더 봐야 함",      unlikely: "위험"          },
  opportunity:   { likely: "잡을 수 있음",  mixed: "미성숙",          unlikely: "함정 가능성"   },
  belonging:     { likely: "맞는 환경",     mixed: "아직 더 봐야 함", unlikely: "맞지 않음"     },
};

const DECISION_TEXT_REPLACEMENTS: Array<[string, string]> = [
  ["금성이 자기 수용 에너지를 엽니다. 지금 자신을 긍정할 수 있는 타이밍입니다", "금성이 스스로를 받아들이는 힘을 보탭니다. 지금은 자신을 덜 깎아내려도 됩니다"],
  ["자기 수용 에너지가 고요합니다 — 지금은 자신을 조용히 관찰하세요", "스스로를 받아들이는 힘이 크게 출렁이지는 않습니다. 지금은 조용히 나를 살피세요"],
  ["자기 수용 에너지가 강합니다. 자신의 욕구에 솔직해질 시기입니다", "스스로를 받아들이는 힘이 강합니다. 내 욕구를 덜 숨겨도 됩니다"],
  ["에너지가 당신 편입니다", "상황이 당신 편입니다"],
  ["에너지가 지지합니다", "힘을 보탭니다"],
  ["에너지를 지지합니다", "힘을 보탭니다"],
  ["에너지가 지지됩니다", "상황이 받쳐줍니다"],
  ["에너지가 뒷받침합니다", "상황이 받쳐줍니다"],
  ["에너지가 뒷받침됩니다", "상황이 받쳐줍니다"],
  ["에너지가 모였습니다", "여건이 모였습니다"],
  ["에너지가 혼재되어 있습니다", "마음과 상황이 엇갈리고 있습니다"],
  ["에너지가 혼재됩니다", "마음과 상황이 엇갈립니다"],
  ["에너지가 열려있습니다", "판이 열려 있습니다"],
  ["에너지가 열려 있습니다", "판이 열려 있습니다"],
  ["에너지가 막혀있습니다", "판이 막혀 있습니다"],
  ["에너지가 막혀 있습니다", "판이 막혀 있습니다"],
  ["에너지가 흐려집니다", "판단이 흐려집니다"],
  ["에너지가 흐립니다", "판단이 흐립니다"],
  ["에너지가 분산됩니다", "마음이 한곳에 모이지 않습니다"],
  ["에너지가 응집됩니다", "힘이 한곳에 모입니다"],
  ["에너지가 잠잠합니다", "큰 움직임이 없습니다"],
  ["에너지가 고요합니다", "큰 기복이 없습니다"],
  ["흐름을 열어줍니다", "길을 열어줍니다"],
  ["흐름이 열려있습니다", "판이 열려 있습니다"],
  ["흐름이 열려 있습니다", "판이 열려 있습니다"],
  ["흐름이 잠잠합니다", "큰 움직임이 없습니다"],
  ["흐름이 평탄합니다", "기복이 크지 않습니다"],
  ["흐름이 자연스럽습니다", "자연스럽습니다"],
  ["현재 흐름", "지금 상황"],
  ["관계 에너지", "관계의 온도"],
  ["감정 에너지", "감정 상태"],
  ["자아 에너지", "마음의 중심"],
  ["소속 에너지", "소속감"],
  ["연결 에너지", "연결감"],
  ["행동 에너지", "움직일 힘"],
  ["판단 에너지", "판단력"],
  ["의미 에너지", "의미 감각"],
  ["자기 표현 에너지", "표현력"],
  ["생명력 에너지", "기력"],
  ["내면 에너지", "마음의 힘"],
  ["공감 에너지", "공감력"],
  ["회복 에너지", "회복력"],
  ["성장 에너지", "성장세"],
  ["확장 에너지", "넓어지는 힘"],
  ["구조적 압박", "현실적인 압박"],
  ["구조적 저항", "현실적인 걸림돌"],
  ["구조적으로", "현실적으로"],
  ["구조를 먼저 정비하세요", "기반부터 손보세요"],
  ["구조 정비", "기반 정비"],
  ["구조를 지지합니다", "버틸 바탕을 보탭니다"],
  ["구조를 압박합니다", "버틸 바탕을 흔듭니다"],
  ["구조를 막습니다", "버틸 바탕을 가로막습니다"],
  ["구조가 안정적입니다", "기반이 안정적입니다"],
  ["공명", "잘 맞는 느낌"],
  ["활성화됩니다", "도드라집니다"],
  ["활성화 신호", "뚜렷한 움직임"],
  ["응집됩니다", "한데 모입니다"],
  ["분산됩니다", "흩어집니다"],
  ["고착시킵니다", "굳어지게 만듭니다"],
];

function polishDecisionText(text: string): string {
  if (!text) return text;

  let result = text;
  for (const [from, to] of DECISION_TEXT_REPLACEMENTS) {
    result = result.split(from).join(to);
  }

  return result.replace(/\s{2,}/g, " ").trim();
}

/**
 * Build headline from schema label — the DIRECT ANSWER to the question.
 *
 * Flow:
 *   score → resolveSchemaLabel → SCHEMA_ANSWER_TEXT[intent][label]
 *
 * Why this breaks the collapse:
 *   Score 48 is "WAIT" in the old system for ALL questions.
 *   With schema labels: score 48 → timing:"wait" / state:"observing" / self_awareness:"not_fully"
 *   Different labels → different vocabulary → different answer family.
 */
function buildHeadline(
  _recommendation: DecisionRecommendation,
  _factors: DecisionFactor[],
  intent: QuestionIntent,
  schemaLabel: SchemaLabel,
): string {
  const text = (SCHEMA_ANSWER_TEXT as Record<string, Record<string, string>>)[intent]?.[schemaLabel];
  if (text) return polishDecisionText(text);
  // Fallback: use schema label in plain language
  const LABEL_FALLBACK: Partial<Record<string, string>> = {
    act_now: "지금이 행동할 타이밍입니다", start_small: "작게 시작해볼 수 있습니다",
    wait: "조금 더 기다리세요", do_not_act: "지금은 피하는 쪽이 낫습니다",
    balanced: "균형이 있습니다", unclear: "아직 불명확합니다", giving_more: "당신이 더 많이 주고 있습니다",
    likely: "가능성이 있습니다", mixed: "혼재됩니다", unlikely: "가능성이 낮습니다",
    positive: "상황이 비교적 좋습니다", adjusting: "조정 중입니다", observing: "관찰이 필요합니다", blocked: "지금은 막혀 있습니다",
    yes: "그렇습니다", partly: "부분적으로 그렇습니다", not_fully: "완전하지 않습니다", no: "그렇지 않습니다",
  };
  return polishDecisionText(LABEL_FALLBACK[schemaLabel] ?? "마음과 상황이 엇갈리고 있습니다");
}
function buildSummary(
  intent: QuestionIntent,
  recommendation: DecisionRecommendation,
): string {
  return polishDecisionText(
    SUMMARY_TEMPLATES[recommendation][intent] ?? SUMMARY_TEMPLATES[recommendation]["_default"],
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute a deterministic GO/WAIT/AVOID decision.
 *
 * @param natal   The user's natal chart (from computeNatalChart / getOrComputeNatalChart)
 * @param intent  Classified question intent (classifyQuestionIntent result)
 * @param date    Date for transit calculation (default: now)
 * @returns       VoidDecision with recommendation, confidence, factors, summary
 */
export function computeDecision(
  natal: NatalChart,
  intent: QuestionIntent,
  date: Date = new Date(),
): VoidDecision {
  const transitLons = computeTransitPositions(date);
  const config = SUBTYPE_CONFIG[intent] ?? DEFAULT_CONFIG;
  const category = getCategoryFromIntent(intent);

  // Build factors alongside their effective weights so we can sort by actual impact.
  const rawFactors: Array<{ factor: DecisionFactor; weight: number }> = [];
  let weightedSum = 0;

  // ── Planet factors ────────────────────────────────────────────────────────
  for (let i = 0; i < config.keyPlanets.length; i++) {
    const planet = config.keyPlanets[i];
    const weight = config.planetWeights[i];
    let score: number;
    let note: string;

    if (planet === "Moon") {
      const ms = moonStabilityScore(natal, transitLons, category, intent);
      score = ms.score;
      note  = ms.note;
    } else {
      const natalPlanet = natal.planets.find((p) => p.planet === planet)!;
      const natalSignIdx = Math.floor(((natalPlanet.longitude % 360) + 360) % 360 / 30);
      const natalSign    = SIGNS[natalSignIdx];
      const ts = transitPlanetScore(natalPlanet.longitude, transitLons, category, intent);
      const affinity = natalSignAffinity(planet, natalSign, intent);
      score = Math.max(0, Math.min(100, ts.score + affinity));
      note  = ts.topNote ?? neutralNote(planet, natalSign, category);
    }

    rawFactors.push({
      factor: {
        name:      config.factorLabels[i],
        score:     Math.round(score),
        direction: score >= 60 ? "positive" : score <= 40 ? "negative" : "neutral",
        note:      polishDecisionText(note),
      },
      weight,
    });
    weightedSum += score * weight;
  }

  // ── House activation factor ───────────────────────────────────────────────
  const { score: houseScore, note: houseNote } = houseActivationScore(
    natal,
    config.significantHouses,
    transitLons,
    category,
  );
  rawFactors.push({
    factor: {
      name:      "영역 활성화",
      score:     Math.round(houseScore),
      direction: houseScore >= 60 ? "positive" : houseScore <= 40 ? "negative" : "neutral",
      note:      polishDecisionText(houseNote),
    },
    weight: config.houseWeight,
  });
  weightedSum += houseScore * config.houseWeight;

  // ── Sort by explanatory impact: weight × |score − 50| descending ─────────
  // The factor that contributed most to the final recommendation appears first.
  rawFactors.sort((a, b) => {
    const impA = a.weight * Math.abs(a.factor.score - 50);
    const impB = b.weight * Math.abs(b.factor.score - 50);
    return impB - impA;
  });
  const factors = rawFactors.map((rf) => rf.factor);

  // ── Final decision ────────────────────────────────────────────────────────
  const finalScore = Math.round(weightedSum);
  const { confidence } = toRecommendation(
    finalScore,
    config.goThreshold,
    config.avoidThreshold,
  );
  const answerSchema   = ANSWER_SCHEMA[intent] ?? "state";
  const schemaLabel    = resolveSchemaLabel(finalScore, answerSchema);
  const recommendation = LABEL_RECOMMENDATION[schemaLabel];
  const headline       = buildHeadline(recommendation, factors, intent, schemaLabel);
  const summary        = buildSummary(intent, recommendation);
  const answerTag      = polishDecisionText(
    (SCHEMA_TAG as Record<string, Record<string, string>>)[intent]?.[schemaLabel]
      ?? schemaLabel,
  );

  return { recommendation, confidence, factors, headline, summary, answerSchema, schemaLabel, answerTag };
}
