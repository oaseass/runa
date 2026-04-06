// Void analysis generation.
//
// Derives structured text from:
//   1. User's natal chart (deterministic, precomputed)
//   2. Today's transit positions (date-keyed)
//   3. Question text (intent-classified, keyword-deterministic)
//
// Same chart + same question + same date -> same output (no randomness).
// Same chart + different question -> different planet emphasis and synthesis.
// Same question + different chart -> different readings.

import { getOrComputeNatalChart } from "./chart-store";
import {
  interpretNatalChart,
  interpretTransits,
  interpretDomains,
  SIGN_KO,
  PLANET_KO,
  PLANET_NOTES,
} from "@/lib/astrology/interpret";
import { classifyQuestionIntent } from "./void-intent";
import { computeDecision, type VoidDecision } from "./void-decision";
import type { NatalChart, PlanetPosition, SignName } from "@/lib/astrology/types";
import type { CategoryKey } from "@/app/void/_components/VoidScreen";
import type { QuestionIntent } from "./void-intent";

// ── Output schema ─────────────────────────────────────────────────────────────

export type VoidAnalysisSection = {
  title: string;
  body: string;
  keyLine: string;
};

export type VoidAnalysisOutput = {
  category: CategoryKey;
  intent: QuestionIntent;
  generatedAt: string;
  chartHash: string;
  sections: [VoidAnalysisSection, VoidAnalysisSection, VoidAnalysisSection];
  keyPhrase: string;
  tone: "strength" | "challenge" | "neutral";
  decision: VoidDecision;
};

export type { VoidDecision };

// ── Category -> domain label ──────────────────────────────────────────────────

const CATEGORY_DOMAIN: Record<CategoryKey, string> = {
  self: "\uB098",
  love: "\uAD00\uACC4",
  work: "\uB8E8\uD2F4\u00B7\uC77C",
  social: "\uC0AC\uACE0\u00B7\uD45C\uD604",
};

// ── Intent × tone closing sentence for Section 3 ─────────────────────────────

const INTENT_TONE_LINE: Record<QuestionIntent, Record<"strength" | "challenge" | "neutral", string>> = {
  confession: {
    strength: "지금은 마음을 전해도 어색하지 않은 때입니다.",
    challenge: "지금은 말보다 마음을 먼저 정리하는 편이 낫습니다.",
    neutral: "무슨 말을 할지보다 어떤 마음으로 말할지가 더 중요합니다.",
  },
  compatibility: {
    strength: "두 사람은 지금 꽤 잘 맞는 결을 보입니다.",
    challenge: "잘 맞더라도 지금은 속도 차이 때문에 삐걱일 수 있습니다.",
    neutral: "맞는 부분은 분명하지만, 오래 가려면 조율이 필요합니다.",
  },
  trust: {
    strength: "지금은 믿어볼 근거가 비교적 분명합니다.",
    challenge: "지금의 의심은 실제보다 크게 느껴질 수 있습니다.",
    neutral: "감정보다 반복되는 행동을 기준으로 보는 편이 정확합니다.",
  },
  breakup: {
    strength: "지금은 결론을 내릴 힘이 어느 정도 모여 있습니다.",
    challenge: "지금은 결정보다 왜 떠나고 싶은지 정리하는 게 먼저입니다.",
    neutral: "헤어질지보다, 내가 정말 원하는 게 무엇인지부터 확인하세요.",
  },
  relationship: {
    strength: "관계에 한 걸음 더 나아가 보기 좋은 때입니다.",
    challenge: "지금은 서두를수록 서로 엇갈리기 쉽습니다.",
    neutral: "관계보다 내 상태를 먼저 살피는 편이 맞습니다.",
  },
  reciprocity: {
    strength: "상대도 어느 정도 반응하고 있을 가능성이 큽니다.",
    challenge: "지금은 상대 마음보다 내 기대가 더 크게 작용하고 있습니다.",
    neutral: "상대 마음을 읽기 전에, 내가 무엇을 바라는지부터 보세요.",
  },
  commitment: {
    strength: "더 진지한 이야기를 꺼내 볼 만한 때입니다.",
    challenge: "아직은 버틸 바탕이 약합니다. 서두르면 더 흔들립니다.",
    neutral: "관계의 깊이는 타이밍보다 두 사람의 뜻이 같은지에 달려 있습니다.",
  },
  timing: {
    strength: "지금 연락해도 무리는 없습니다.",
    challenge: "지금은 타이밍이 조금 어긋나 있습니다. 잠시 기다리세요.",
    neutral: "언제 연락할지보다 무엇을 전할지가 더 중요합니다.",
  },
  quit: {
    strength: "떠나는 쪽으로 마음이 꽤 정리되고 있습니다.",
    challenge: "지금 떠나고 싶은 마음이 환경 때문인지 지침 때문인지부터 가려야 합니다.",
    neutral: "오래 머문 곳을 떠나는 일은 마음과 조건이 더 분명해진 뒤에 정하세요.",
  },
  promotion: {
    strength: "지금은 존재감을 드러내기 좋은 때입니다.",
    challenge: "성과를 보여주기보다 내 기준을 다시 세우는 일이 먼저입니다.",
    neutral: "인정은 급히 끌어오는 게 아니라 방향이 맞을 때 따라옵니다.",
  },
  decision: {
    strength: "지금은 결정을 내려도 괜찮은 때입니다.",
    challenge: "지금은 판단이 흔들립니다. 조금 미루는 편이 낫습니다.",
    neutral: "정답을 고르려 하기보다, 솔직한 선택을 하는 쪽이 중요합니다.",
  },
  conflict: {
    strength: "갈등을 풀기 위한 첫 움직임을 내기 좋은 때입니다.",
    challenge: "지금 부딪히면 일이 더 꼬일 수 있습니다. 거리를 먼저 두세요.",
    neutral: "무엇 때문에 틀어졌는지부터 짚어야 해결도 가능합니다.",
  },
  direction: {
    strength: "방향을 바꾸거나 정하기에 나쁘지 않은 때입니다.",
    challenge: "지금의 막막함은 실패가 아니라 재정비의 과정입니다.",
    neutral: "방향이 없는 게 아니라 아직 또렷해지지 않은 것입니다.",
  },
  opportunity: {
    strength: "이 기회를 잡아볼 만한 여건이 있습니다.",
    challenge: "좋아 보여도 지금의 나에게는 부담이 될 수 있습니다.",
    neutral: "기회인지 짐인지, 조금 더 차분히 따져볼 필요가 있습니다.",
  },
  identity: {
    strength: "지금은 내가 원하는 모습이 비교적 선명합니다.",
    challenge: "정체감이 흔들리는 건 무너져서가 아니라 다시 맞추는 중이기 때문입니다.",
    neutral: "지금은 스스로를 단정하기보다 열어두는 편이 맞습니다.",
  },
  energy: {
    strength: "조금씩 기운이 돌아오는 때입니다.",
    challenge: "지금은 회복보다 멈춤이 먼저입니다. 더 밀어붙이면 지칩니다.",
    neutral: "컨디션 기복이 크지 않으니 무리만 피하면 됩니다.",
  },
  pattern: {
    strength: "지금은 반복되는 패턴을 끊어볼 여지가 있습니다.",
    challenge: "지금 당장 바꾸려 하면 반발이 큽니다. 우선 알아차리는 데 집중하세요.",
    neutral: "이해와 변화는 다른 단계입니다. 지금은 이해가 먼저입니다.",
  },
  purpose: {
    strength: "지금은 삶의 의미를 다시 붙잡기 좋은 때입니다.",
    challenge: "허무하게 느껴지는 건 삶이 틀려서가 아니라 지쳐 있기 때문일 수 있습니다.",
    neutral: "거창한 답보다 오늘 할 수 있는 일을 이어가는 편이 맞습니다.",
  },
  self_trust: {
    strength: "지금은 내 판단을 믿어도 괜찮습니다.",
    challenge: "지금은 내면 신호가 흔들립니다. 큰 결정은 잠시 미루세요.",
    neutral: "직감과 논리가 어긋날 때는 둘 다 들은 채 조금 더 기다리세요.",
  },
  boundary: {
    strength: "지금은 선을 그을 힘이 있습니다.",
    challenge: "지금 선을 그어도 지켜내기 어렵습니다. 준비부터 하세요.",
    neutral: "경계는 한 번의 선언보다 반복된 태도로 세워집니다.",
  },
  self_worth: {
    strength: "지금 스스로를 깎아내릴 이유는 없습니다.",
    challenge: "지금의 자기평가는 실제보다 박할 수 있습니다. 비교를 멈추세요.",
    neutral: "충분함은 조건이 아니라 태도에서 시작됩니다.",
  },
  self_honesty: {
    strength: "지금은 나를 조금 더 정직하게 볼 수 있습니다.",
    challenge: "마주 보기 어려운 건 의지가 약해서가 아니라 스스로를 지키려는 마음이 강해서입니다.",
    neutral: "한 번에 다 보려 하지 않아도 됩니다. 지금 보이는 만큼이면 충분합니다.",
  },
  fear: {
    strength: "지금은 두려움에 이름을 붙여볼 수 있는 때입니다.",
    challenge: "지금은 두려움과 정면승부하기보다, 어디서 오는지부터 살피세요.",
    neutral: "두려움은 없애는 대상이 아니라 이해해야 할 감정입니다.",
  },
  growth: {
    strength: "지금은 성장의 방향이 분명하게 보입니다.",
    challenge: "성장이 멈춘 것처럼 보여도 실제로는 안에서 쌓이고 있을 수 있습니다.",
    neutral: "결과보다 방향을 기준으로 보면 지금의 변화가 더 잘 보입니다.",
  },
  stagnation: {
    strength: "지금은 막힌 감각을 조금씩 풀어볼 수 있습니다.",
    challenge: "억지로 밀어붙이면 더 답답해집니다. 왜 막혔는지부터 보세요.",
    neutral: "멈춘 것처럼 보여도 안에서는 준비가 진행 중일 수 있습니다.",
  },
  communication: {
    strength: "지금은 말을 꺼내기 괜찮은 때입니다.",
    challenge: "지금 말하면 의도와 다르게 들릴 수 있습니다. 정리한 뒤 말하세요.",
    neutral: "지금은 말의 양보다 정확함이 더 중요합니다.",
  },
  friendship: {
    strength: "먼저 손을 내밀어도 괜찮은 때입니다.",
    challenge: "지금은 관계에 힘을 쏟을수록 나만 지칠 수 있습니다.",
    neutral: "우정은 자주 보는 것보다 편안함이 유지되는지가 중요합니다.",
  },
  group: {
    strength: "지금은 집단 안에서 자리를 잡아가기 좋은 때입니다.",
    challenge: "지금 너무 깊이 들어가면 쉽게 지칠 수 있습니다.",
    neutral: "이곳이 맞는지는 소속감보다 소모감을 기준으로 봐야 합니다.",
  },
  distance: {
    strength: "지금은 거리감을 조절해볼 수 있는 때입니다.",
    challenge: "거리가 생긴 이유가 있으니, 지금은 쫓아가기보다 멈춰 보는 편이 낫습니다.",
    neutral: "거리를 없애는 것보다 어떤 거리가 편한지 아는 게 먼저입니다.",
  },
  belonging: {
    strength: "지금 이 환경은 당신과 제법 잘 맞습니다.",
    challenge: "소속감이 없다고 해서 꼭 환경 탓만은 아닙니다. 내 상태부터 살피세요.",
    neutral: "소속감은 금방 생기지 않습니다. 지금의 어색함도 과정일 수 있습니다.",
  },
};

// ── Section title lookups ─────────────────────────────────────────────────────

const SECTION1_TITLE: Record<QuestionIntent, string> = {
  confession: "고백의 별 지도",      compatibility: "궁합의 별 지도",
  trust: "신뢰의 별 지도",           breakup: "이별의 별 지도",
  relationship: "감정의 별 지도",    reciprocity: "상대 마음의 별 지도",
  commitment: "헌신의 별 지도",      timing: "타이밍의 별 지도",
  quit: "이탈의 별 지도",            promotion: "성과의 별 지도",
  decision: "선택의 별 지도",        conflict: "갈등의 별 지도",
  direction: "방향의 별 지도",       opportunity: "기회의 별 지도",
  identity: "자아의 별 지도",        energy: "회복의 별 지도",
  pattern: "패턴의 별 지도",         purpose: "의미의 별 지도",
  self_trust: "자기 신뢰의 별 지도", boundary: "경계의 별 지도",
  self_worth: "자기 가치의 별 지도", self_honesty: "자기 직면의 별 지도",
  fear: "두려움의 별 지도",          growth: "성장의 별 지도",
  stagnation: "정체의 별 지도",      communication: "소통의 별 지도",
  friendship: "우정의 별 지도",      group: "집단의 별 지도",
  distance: "거리감의 별 지도",      belonging: "소속의 별 지도",
};

const SECTION2_TITLE: Record<CategoryKey, string> = {
  love: "오늘 관계의 분위기",
  work: "오늘 움직임의 방향",
  self: "오늘 마음의 상태",
  social: "오늘 대화의 분위기",
};

const SECTION3_TITLE: Record<QuestionIntent, string> = {
  confession: "지금 이 감정에 대해",      compatibility: "두 사람의 궁합에 대해",
  trust: "신뢰의 근거에 대해",            breakup: "이별을 앞두고",
  relationship: "지금 이 관계에 대해",    reciprocity: "상대 감정에 대해",
  commitment: "더 진지한 관계에 대해",    timing: "연락 타이밍에 대해",
  quit: "그만두는 것에 대해",             promotion: "인정받는 것에 대해",
  decision: "이 선택에 대해",             conflict: "갈등 해소에 대해",
  direction: "방향에 대해",               opportunity: "이 기회에 대해",
  identity: "지금의 나에 대해",           energy: "기력을 회복하는 일에 대해",
  pattern: "반복 패턴에 대해",            purpose: "의미에 대해",
  self_trust: "나를 믿는 것에 대해",      boundary: "선 긋는 것에 대해",
  self_worth: "나는 충분한가",            self_honesty: "자신에게 솔직한가",
  fear: "두려움에 대해",                  growth: "성장에 대해",
  stagnation: "정체에 대해",              communication: "소통에 대해",
  friendship: "이 우정에 대해",           group: "이 집단에 대해",
  distance: "이 거리감에 대해",           belonging: "소속에 대해",
};

// ── Intent → 핵심 조언 도입부 (intent별 고유 텍스트 → 같은 사람도 다른 질문은 다른 분석) ──

const SECTION3_INTENT_INTRO: Record<QuestionIntent, string> = {
  confession:
    "말하고 싶은 감정과 실제로 말할 수 있는 타이밍은 다릅니다. 지금 금성과 수성이 그 간격을 얼마나 좁혀주는지가 중요합니다.",
  compatibility:
    "잘 맞는 것과 오래 맞는 것은 다른 이야기입니다. 지금 두 사람의 흐름이 같은 방향인지, 속도가 일치하는지를 먼저 봐야 합니다.",
  trust:
    "믿어야 할지 고민되는 건 직감이 흔들리기 때문입니다. 달의 상태가 지금 직감을 과장하거나 억제하고 있을 수 있습니다.",
  breakup:
    "이별을 고민할 때 두 가지를 구분해야 합니다 — 지금 고통이 상황에서 오는 건지, 관계 자체에서 오는 건지. 이 구분이 명확하지 않다면 결정을 서두르지 마세요.",
  relationship:
    "관계를 원하는 마음과 지금 관계를 감당할 수 있는 상태가 일치할 때만 제대로 맺어집니다. 지금 두 가지가 같은 방향인지를 봐야 합니다.",
  quit:
    "그만두고 싶은 충동이 클 때일수록 천천히 봐야 합니다. 지금 이 느낌이 번아웃에서 오는 건지, 이미 오래전부터 쌓인 신호인지가 다릅니다.",
  promotion:
    "인정받으려는 마음이 강할수록 자기 기준이 흐릿해지는 경우가 있습니다. 지금 태양이 얼마나 안정적으로 자리 잡고 있는지가 이 질문의 실마리입니다.",
  decision:
    "결정이 어려울 때는 선택지 자체의 문제가 아닌 경우가 많습니다. 지금 수성이 어떤 상태인지가 판단력이 제대로 작동하는지를 알려줍니다.",
  conflict:
    "갈등을 빨리 해결하려는 것이 오히려 더 꼬이게 만드는 경우가 있습니다. 충돌의 방향을 파악하는 것이 먼저입니다.",
  direction:
    "방향이 없다는 느낌이 드는 건 대개 방향이 없어서가 아닙니다. 아직 드러나지 않은 것이거나, 이미 알지만 받아들이기를 미루는 것입니다.",
  identity:
    "자아 질문은 답을 찾는 것이 아닙니다. 태양과 달이 지금 어떤 상태인지를 보는 것 — 그것이 지금 '나는 누구인가'의 실마리입니다.",
  energy:
    "몸이 소진됐을 때와 마음이 멈추라는 신호를 보낼 때는 대응이 다릅니다. 지금 달이 어떤 위치인지가 회복 방식을 알려줍니다.",
  pattern:
    "패턴을 깨려면 먼저 그것이 언제, 어떤 조건에서 활성화되는지를 알아야 합니다. 달과 토성의 각도가 그 구조를 보여줍니다.",
  purpose:
    "의미는 목표를 이루어야 생기는 것이 아닙니다. 지금 목성과 태양이 어떻게 연결되어 있는지 — 그것이 의미가 흐르는지를 결정합니다.",
  friendship:
    "우정에 쓰는 것과 그 관계에서 소진되는 것은 다릅니다. 달이 지금 어떤 방향으로 연결 흐름을 만들어내고 있는지가 이 차이를 만듭니다.",
  group:
    "집단 속에서 자리를 찾는 것은 시간이 걸립니다. 지금 소속감이 없는 것이 집단 문제인지 역할 문제인지 — 둘의 대응이 다릅니다.",
  distance:
    "거리감이 생겼을 때 빨리 메우려 하면 상대를 밀어낼 수 있습니다. 달과 토성이 말하는 것은 지금 이 거리가 보호인지 단절인지입니다.",
  communication:
    "말이 잘 안 통한다는 느낌이 들 때, 표현 방식보다 내가 무엇을 전달하고 싶은지가 먼저 정리됐는지를 봐야 합니다.",
  reciprocity:
    "상대방의 감정이 어떤지는 달과 금성의 각도로 읽힙니다. 끌림이 강할수록 상대 신호를 과대해석하는 경우가 많습니다.",
  commitment:
    "더 진지하게 가기 전에 먼저 볼 것은 지금 내가 헌신할 수 있는 상태인가입니다. 감정이 있어도 구조가 뒷받침되지 않으면 무너지기 쉽습니다.",
  timing:
    "연락 타이밍은 달의 위치가 가장 직접적으로 알려줍니다. 지금 달이 어떤 상태인지가 '지금 연락해도 되는가'의 실질적 답입니다.",
  opportunity:
    "기회처럼 느껴지는 것이 진짜 확장인지 과부하인지는 지금 내 상태에 달려 있습니다. 여유 없이 잡는 기회는 짐이 됩니다.",
  self_trust:
    "나를 믿어도 되는지를 물을 때 필요한 건 증거가 아닙니다. 지금 달이 흔들리는 상태인지 안정된 상태인지가 그 답의 맥락을 만듭니다.",
  boundary:
    "선을 그어야 한다는 걸 알면서도 못 그을 때, 이유는 용기가 아닌 흐름에 있습니다. 토성과 달의 각도가 지금 경계 설정에 필요한 힘을 갖고 있는지를 봅니다.",
  belonging:
    "이 곳이 나에게 맞는지의 답은 소속 여부가 아니라 소모 여부입니다. 달이 지금 이 환경에서 공명하고 있는지 아닌지가 실질적인 답입니다.",
  self_worth:
    "나는 충분한가라는 질문에 별 지도는 이렇게 답합니다. 충분함은 외부 기준에서 오지 않고, 지금 태양이 얼마나 명확한지에서 옵니다.",
  self_honesty:
    "자신에게 솔직하다는 것은 아는 것을 모두 직면하는 것입니다. 지금 달과 수성이 얼마나 명확하게 협력하고 있는지가 이 솔직함의 깊이를 결정합니다.",
  fear:
    "두려움은 없애는 것이 아닙니다. 어디서 오는지 이름을 붙이면 크기가 작아집니다. 달과 토성이 그 뿌리를 보여줍니다.",
  growth:
    "성장이 안 느껴질 때 먼저 확인해야 할 것은 기준이 맞는가입니다. 목성이 지금 열려있다면 성장하고 있는 것입니다. 다만 속도가 예상과 다를 뿐입니다.",
  stagnation:
    "정체처럼 느껴지는 것이 실제 정체가 아닐 수 있습니다. 달이 안으로 모으는 시기가 있고, 그 시기가 겉으로는 제자리처럼 보입니다.",
};

const VOID_ANALYSIS_TEXT_REPLACEMENTS: Array<[string, string]> = [
  ["구조가 뒷받침되지 않으면", "버틸 바탕이 없으면"],
  ["구조가 아직 준비되지 않았습니다", "아직 버틸 바탕이 약합니다"],
  ["구조를 보여줍니다", "밑바탕을 보여줍니다"],
  ["구조를 봐야 할 시점인지", "밑바탕을 먼저 봐야 할 시점인지"],
  ["구조적 원인", "밑바탕"],
  ["구조적 저항", "현실적인 걸림돌"],
  ["구조적으로", "현실적으로"],
  ["흐름이 아직 모이지 않은", "여건이 아직 모이지 않은"],
  ["흐름이 뒷받침됩니다", "상황이 받쳐줍니다"],
  ["흐름이 받쳐줍니다", "상황이 받쳐줍니다"],
  ["흐름을 만들어내고 있는지가", "관계를 어느 쪽으로 끌고 가는지가"],
  ["흐름이 같은 방향인지", "마음이 같은 방향인지"],
  ["연결 흐름", "관계의 방향"],
  ["분리 흐름", "멀어지는 방향"],
  ["확장 흐름", "확장 가능성"],
  ["감정 흐름", "감정의 방향"],
  ["행동 흐름", "움직임의 방향"],
  ["내면 흐름", "마음의 상태"],
  ["소통 흐름", "대화의 분위기"],
  ["관계 흐름", "관계의 분위기"],
  ["흐름이 열려 있습니다", "움직이기 좋은 때입니다"],
  ["흐름이 열려있습니다", "움직이기 좋은 때입니다"],
  ["흐름이 모였습니다", "여건이 모였습니다"],
  ["흐름이 모입니다", "여건이 모입니다"],
  ["흐름을 읽는 것이 먼저입니다", "왜 막히는지 먼저 보는 편이 맞습니다"],
  ["이유는 용기가 아닌 흐름에 있습니다", "이유는 의지 부족보다 지금 상황에 있습니다"],
  ["흐름의 문제입니다", "지금 상황의 문제입니다"],
  ["흐름이 평균 근처입니다", "기복이 크지 않습니다"],
  ["공명", "잘 맞는 감각"],
  ["활성화되는지를", "도드라지는지를"],
  ["작동하는지를 알려줍니다", "제대로 서는지를 보여줍니다"],
  ["작동하는지가", "제대로 서는지가"],
  ["작동 중입니다", "강하게 걸려 있습니다"],
  ["작동합니다", "영향이 드러납니다"],
  ["정렬", "한쪽으로 모임"],
];

function polishVoidAnalysisText(text: string): string {
  if (!text) return text;

  let result = text;
  for (const [from, to] of VOID_ANALYSIS_TEXT_REPLACEMENTS) {
    result = result.split(from).join(to);
  }

  return result.replace(/\n{3,}/g, "\n\n").trim();
}

function polishVoidAnalysisSection(section: VoidAnalysisSection): VoidAnalysisSection {
  return {
    title: polishVoidAnalysisText(section.title),
    body: polishVoidAnalysisText(section.body),
    keyLine: polishVoidAnalysisText(section.keyLine),
  };
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function hStr(house: number): string {
  return `${house}\uC601\uC5ED`;
}

function placement(planet: { planet: string; sign: string; house: number }): string {
  const pName = PLANET_KO[planet.planet as keyof typeof PLANET_KO] ?? planet.planet;
  const sName = SIGN_KO[planet.sign as keyof typeof SIGN_KO] ?? planet.sign;
  return `${pName} \u00B7 ${sName} ${hStr(planet.house)}`;
}

function planetNote(planet: PlanetPosition): string {
  const notes = PLANET_NOTES[planet.planet as keyof typeof PLANET_NOTES];
  return notes?.[planet.sign as SignName] ?? "";
}

// ── Intent weighting definition ───────────────────────────────────────────────

type PlanetKey = keyof typeof PLANET_KO;

type IntentWeighting = {
  primary: PlanetKey;
  secondary: PlanetKey;
  tertiary?: PlanetKey;
  significantHouses: number[];
  synthesisFocus: string;
};

const INTENT_WEIGHTING: Record<QuestionIntent, IntentWeighting> = {
  relationship: {
    primary: "Venus", secondary: "Moon", tertiary: "Mars",
    significantHouses: [5, 7, 8],
    synthesisFocus: "\uAD00\uACC4 \uC5D0\uB108\uC9C0\uC758 \uC790\uC5F0\uC2A4\uB7EC\uC6B4 \uD750\uB984\uACFC \uBC29\uC5B4 \uD328\uD134",
  },
  confession: {
    primary: "Venus", secondary: "Mercury", tertiary: "Sun",
    significantHouses: [1, 5, 7],
    synthesisFocus: "\uAC10\uC815 \uD45C\uD604\uACFC \uC790\uAE30 \uB178\uCD9C\uC758 \uC5D0\uB108\uC9C0 \uAD6C\uC870",
  },
  compatibility: {
    primary: "Venus", secondary: "Moon", tertiary: "Mars",
    significantHouses: [7, 5, 1],
    synthesisFocus: "\uC5D0\uB108\uC9C0 \uC6D0\uC18C\uC640 \uD589\uC131 \uBC30\uCE58\uC758 \uC0C1\uC131 \uAD6C\uC870",
  },
  trust: {
    primary: "Moon", secondary: "Saturn", tertiary: "Mercury",
    significantHouses: [7, 8, 12],
    synthesisFocus: "\uC2E0\uB8B0 \uAD6C\uC870\uC640 \uACBD\uACC4 \uC5D0\uB108\uC9C0",
  },
  breakup: {
    primary: "Moon", secondary: "Saturn", tertiary: "Mars",
    significantHouses: [8, 12, 4],
    synthesisFocus: "\uBD84\uB9AC\uC640 \uB0B4\uBA74 \uC815\uB9AC\uC758 \uC5D0\uB108\uC9C0 \uD750\uB984",
  },
  direction: {
    primary: "Saturn", secondary: "Mercury", tertiary: "Sun",
    significantHouses: [10, 6, 1],
    synthesisFocus: "\uBC29\uD5A5 \uC124\uC815\uACFC \uAD6C\uC870\uC801 \uC5D0\uB108\uC9C0 \uD328\uD134",
  },
  quit: {
    primary: "Saturn", secondary: "Mars", tertiary: "Uranus",
    significantHouses: [6, 10, 12],
    synthesisFocus: "\uC774\uD0C8 \uCDA9\uB3D9\uACFC \uCD9C\uC0DD \uCC28\uD2B8\uC758 \uC790\uC720 \uC5D0\uB108\uC9C0",
  },
  promotion: {
    primary: "Saturn", secondary: "Sun", tertiary: "Mercury",
    significantHouses: [10, 6, 1],
    synthesisFocus: "\uC131\uACFC\uC640 \uC778\uC815 \uC5D0\uB108\uC9C0\uC758 \uAD6C\uC870\uC801 \uC870\uAC74",
  },
  decision: {
    primary: "Mercury", secondary: "Saturn", tertiary: "Moon",
    significantHouses: [3, 9, 10],
    synthesisFocus: "\uC120\uD0DD \uC55E\uC758 \uD310\uB2E8 \uC5D0\uB108\uC9C0\uC640 \uBD88\uD655\uC2E4 \uCC98\uB9AC \uBC29\uC2DD",
  },
  conflict: {
    primary: "Mars", secondary: "Saturn", tertiary: "Mercury",
    significantHouses: [6, 7, 10],
    synthesisFocus: "\uAC08\uB4F1 \uC5D0\uB108\uC9C0\uC640 \uCC28\uD2B8\uC0C1\uC758 \uAE34\uC7A5 \uD574\uC18C \uD328\uD134",
  },
  identity: {
    primary: "Sun", secondary: "Moon", tertiary: "Mercury",
    significantHouses: [1, 4, 12],
    synthesisFocus: "자아 구조의 핵심 에너지 축",
  },
  energy: {
    primary: "Moon", secondary: "Saturn", tertiary: "Sun",
    significantHouses: [1, 6, 12],
    synthesisFocus: "에너지 고갈의 차트적 패턴과 회복 구조",
  },
  pattern: {
    primary: "Moon", secondary: "Saturn", tertiary: "Pluto",
    significantHouses: [4, 8, 12],
    synthesisFocus: "반복 패턴의 심층 구조 — 달과 토성의 각도",
  },
  purpose: {
    primary: "Jupiter", secondary: "Sun", tertiary: "Saturn",
    significantHouses: [9, 1, 10],
    synthesisFocus: "의미와 목적감의 행성 구조",
  },
  communication: {
    primary: "Mercury", secondary: "Sun",
    significantHouses: [3, 1, 11],
    synthesisFocus: "\uD45C\uD604\uACFC \uC18C\uD1B5 \uC5D0\uB108\uC9C0\uC758 \uCC28\uD2B8 \uAD6C\uC870",
  },
  friendship: {
    primary: "Moon", secondary: "Venus", tertiary: "Mercury",
    significantHouses: [11, 7, 3],
    synthesisFocus: "\uC6B0\uC815 \uC5D0\uB108\uC9C0\uC640 \uC5F0\uACB0 \uD328\uD134",
  },
  group: {
    primary: "Saturn", secondary: "Mercury", tertiary: "Moon",
    significantHouses: [11, 6, 10],
    synthesisFocus: "\uC9D1\uB2E8 \uC18D \uC5ED\uD560\uACFC \uC5D0\uB108\uC9C0 \uD328\uD134",
  },
  distance: {
    primary: "Moon", secondary: "Saturn",
    significantHouses: [11, 12, 4],
    synthesisFocus: "\uAC70\uB9AC\uAC10\uC758 \uCC28\uD2B8 \uAD6C\uC870 - \uC5F0\uACB0\uACFC \uBD84\uB9AC \uACBD\uACC4",
  },
  reciprocity: {
    primary: "Venus", secondary: "Moon", tertiary: "Mars",
    significantHouses: [5, 7, 11],
    synthesisFocus: "상호 에너지의 차트적 공명 구조",
  },
  commitment: {
    primary: "Saturn", secondary: "Venus", tertiary: "Moon",
    significantHouses: [7, 8, 4],
    synthesisFocus: "관계 구조화와 헌신 에너지의 조건",
  },
  timing: {
    primary: "Moon", secondary: "Venus", tertiary: "Mercury",
    significantHouses: [1, 5, 7],
    synthesisFocus: "감정 타이밍과 연결 에너지 구조",
  },
  opportunity: {
    primary: "Jupiter", secondary: "Mercury", tertiary: "Saturn",
    significantHouses: [2, 9, 10],
    synthesisFocus: "기회 에너지와 현실 조건의 차트 구조",
  },
  self_trust: {
    primary: "Sun", secondary: "Moon", tertiary: "Mercury",
    significantHouses: [1, 12, 4],
    synthesisFocus: "자기 확신과 내면 안정의 차트 구조",
  },
  boundary: {
    primary: "Saturn", secondary: "Moon", tertiary: "Sun",
    significantHouses: [1, 7, 12],
    synthesisFocus: "경계 에너지와 자기 보호 구조",
  },
  belonging: {
    primary: "Moon", secondary: "Mercury", tertiary: "Saturn",
    significantHouses: [11, 4, 1],
    synthesisFocus: "소속감과 환경 적합도의 차트 패턴",
  },
  self_worth: {
    primary: "Sun", secondary: "Venus", tertiary: "Moon",
    significantHouses: [1, 2, 12],
    synthesisFocus: "자기 가치감과 자기 수용의 차트 구조",
  },
  self_honesty: {
    primary: "Moon", secondary: "Mercury", tertiary: "Saturn",
    significantHouses: [4, 12, 8],
    synthesisFocus: "내면 직면과 자기 인식의 에너지 구조",
  },
  fear: {
    primary: "Moon", secondary: "Saturn", tertiary: "Mars",
    significantHouses: [12, 8, 4],
    synthesisFocus: "두려움의 뿌리와 내면 방어 구조",
  },
  growth: {
    primary: "Jupiter", secondary: "Sun", tertiary: "Saturn",
    significantHouses: [9, 1, 3],
    synthesisFocus: "성장 에너지와 확장 가능성의 차트 구조",
  },
  stagnation: {
    primary: "Saturn", secondary: "Moon", tertiary: "Mars",
    significantHouses: [4, 12, 1],
    synthesisFocus: "정체 에너지와 돌파 가능성의 차트 구조",
  },
};

// ── Section 1 intent framing: leads Section 1 with question-specific context ──

const SECTION1_INTENT_FRAME: Record<QuestionIntent, string> = {
  confession:    "고백을 앞두고 볼 것은 금성과 수성의 각도입니다. 말하고 싶은 감정(금성)과 그것을 실제로 표현할 수 있는 언어(수성)가 지금 일치하는지가 핵심입니다.",
  compatibility: "둘이 잘 맞는지는 금성과 달을 봅니다. 끌림(금성)과 감정 결이 맞는지(달) — 이 둘이 같은 방향이면 호환, 같아도 속도가 다르면 마찰이 옵니다.",
  trust:         "믿어야 하는가를 물을 때 달(직감)과 토성(현실 판단)을 봅니다. 두 행성이 지금 어떤 상태인지가 이 질문의 배경입니다.",
  breakup:       "이별을 생각할 때 달(감정의 무게)과 토성(현실 구조)을 먼저 봅니다. 끝내고 싶은 감정과, 실제로 끝낼 수 있는 지금의 조건이 모두 준비됐는지를 확인합니다.",
  relationship:  "지금 이 감정이 연애로 이어질 수 있는지는 금성(끌림)과 달(감정 지속성)이 말해줍니다. 설레는 것과 지속 가능한 것은 다른 자리에서 옵니다.",
  quit:          "지금 그만두고 싶은지를 볼 때는 토성(버티는 구조)과 화성(이탈 충동)을 봅니다. 환경이 문제인지, 소진이 문제인지 — 이 차이가 결정의 방향을 바꿉니다.",
  promotion:     "인정받고 싶을 때 먼저 볼 것은 토성(성과 구조)과 태양(자기 기준)입니다. 인정은 외부에서 오지만, 인정받을 준비는 내부에서 시작됩니다.",
  decision:      "선택 앞에서 수성(판단 방식)과 토성(선택의 현실 조건)이 지금 어떤 상태인지를 봅니다. 결정이 어려운 건 실력 문제가 아니라 흐름의 문제일 수 있습니다.",
  conflict:      "갈등을 다룰 때 화성(충돌 방향)과 토성(갈등의 구조적 원인)을 봅니다. 지금 싸울 준비가 된 건지, 아니면 근본 구조를 봐야 할 시점인지가 다릅니다.",
  direction:     "방향이 안 잡힐 때는 토성(구조화 흐름)과 수성(사고 방식)을 봅니다. 방향이 없는 게 아니라 인식이 아직 안 됐거나 흐름이 아직 모이지 않은 것입니다.",
  identity:      "지금 '나는 누구인가'를 물을 때 태양(자아 핵심)과 달(내면 안정)을 봅니다. 이 질문은 답을 구하는 것이 아니라 지금 자아가 어떤 상태인지를 보는 것입니다.",
  energy:        "몸이 소진됐을 때 달(감정 흐름)과 토성(소진 패턴)을 봅니다. 피곤함이 일시적인 건지, 구조적으로 쌓인 것인지가 대응 방법을 다르게 합니다.",
  pattern:       "같은 실수가 반복될 때 달(반응 패턴)과 토성(반복 구조)을 봅니다. 의지의 문제가 아니라 별 지도에 새겨진 구조입니다. 패턴을 알면 선택지가 생깁니다.",
  purpose:       "의미를 잃은 느낌이 들 때 목성(의미 확장)과 태양(삶의 방향)을 봅니다. 의미 부재는 방향이 없어서가 아니라 흐름이 아직 모이지 않은 단계일 수 있습니다.",
  friendship:    "우정에 대해 고민할 때 달(감정 연결)과 금성(우정 흐름)을 봅니다. 진짜 우정과 소진을 주는 관계의 차이는 흐름의 방향에 있습니다.",
  group:         "집단 속에서 자신의 위치를 고민할 때 토성(역할 구조)과 달(소속감)을 봅니다. 이 집단이 나에게 맞는지, 아직 역할을 찾는 중인지가 다릅니다.",
  distance:      "거리감이 느껴질 때 달(감정 연결)과 토성(분리 흐름)을 봅니다. 상대가 멀어지는 건지, 내가 흐름을 끊고 있는 건지 — 이 방향이 대응을 다르게 합니다.",
  communication: "말이 안 통한다는 느낌이 들 때 수성(표현 방식)과 태양(자기 노출)을 봅니다. 전달 방법 문제인지, 아직 내가 정리가 안 된 것인지가 다릅니다.",
  reciprocity:   "상대방도 나를 좋아할까 — 이 질문은 금성(상호 끌림)과 달(감정 공명)의 각도로 읽습니다. 일방적 끌림과 상호적 흐름은 별 지도에서 다르게 보입니다.",
  commitment:    "관계를 더 진지하게 만들 수 있는지는 토성(관계 구조)과 금성(헌신 흐름)을 봅니다. 감정보다 구조가 먼저 — 구조가 없으면 헌신이 무게를 감당하지 못합니다.",
  timing:        "연락 타이밍은 달(지금 감정 흐름)과 금성(연결 흐름)의 관계로 읽습니다. 충동에서 연락하는 것과 흐름이 실제로 열린 시점에 연락하는 것은 결과가 다릅니다.",
  opportunity:   "기회가 왔을 때 목성(확장 흐름)과 수성(판단 조건)을 봅니다. 좋아 보이는 기회가 실제 확장인지, 지금 상태에서 함정인지를 구별해야 합니다.",
  self_trust:    "내 판단을 믿어야 할지 흔들릴 때 태양(자기 확신)과 달(내면 신호)을 봅니다. 두 행성이 지금 어떤 상태인지가 '내 감이 맞는가'의 답입니다.",
  boundary:      "선을 그어야 할지 고민할 때 토성(경계 구조)과 달(보호 본능)을 봅니다. 지금 그을 수 있는 흐름이 있는지, 아니면 더 쌓인 후에 그려야 하는지가 다릅니다.",
  belonging:     "여기가 나에게 맞는 곳인지를 볼 때 달(내면 공명)과 수성(환경 적합)을 봅니다. 소속감은 외부 조건보다 내면에서 먼저 옵니다.",
  self_worth:    "'나는 충분한가'를 물을 때 태양(자기 가치)과 금성(자기 수용)을 봅니다. 비교에서 오는 부족감과 실제 흐름 상태는 다릅니다.",
  self_honesty:  "나 자신에게 솔직한가를 물을 때 달(내면 직면)과 수성(자기 인식)을 봅니다. 알면서도 외면하는 것이 있는지, 별 지도가 그 지점을 보여줍니다.",
  fear:          "무엇이 나를 막는지 볼 때 달(두려움의 감정 뿌리)과 토성(정지 압박)을 봅니다. 두려움의 실제 크기와 별 지도가 보여주는 크기가 다른 경우가 많습니다.",
  growth:        "성장하고 있는지를 볼 때 목성(성장 흐름)과 태양(자아 확장)을 봅니다. 성장이 안 느껴질 때는 기준이 잘못된 경우가 많습니다.",
  stagnation:    "제자리인 것 같을 때 토성(정체 장벽)과 달(내면 흐름)을 봅니다. 멈춰있는 것처럼 보여도 내부적으로는 무언가 쌓이는 단계가 있습니다.",
};

// ── Section 1: Natal chart basis, intent-weighted ─────────────────────────────

function buildSection1(
  chart: NatalChart,
  weighting: IntentWeighting,
  natal: ReturnType<typeof interpretNatalChart>,
  intent: QuestionIntent,
): VoidAnalysisSection {
  const byName = new Map(chart.planets.map((p) => [p.planet, p]));

  const primaryPlanet = byName.get(weighting.primary)!;
  const secondaryPlanet = byName.get(weighting.secondary)!;
  const tertiaryPlanet = weighting.tertiary ? byName.get(weighting.tertiary) : undefined;

  // Intent-specific frame line — ensures same chart + different question ≠ same Section 1
  const lines: string[] = [polishVoidAnalysisText(SECTION1_INTENT_FRAME[intent])];

  const primaryNote = polishVoidAnalysisText(planetNote(primaryPlanet));
  const secondaryNote = polishVoidAnalysisText(planetNote(secondaryPlanet));

  lines.push(primaryNote ? `${placement(primaryPlanet)}\n${primaryNote}` : placement(primaryPlanet));
  lines.push(secondaryNote ? `${placement(secondaryPlanet)}\n${secondaryNote}` : placement(secondaryPlanet));

  if (
    tertiaryPlanet &&
    tertiaryPlanet.planet !== primaryPlanet.planet &&
    tertiaryPlanet.planet !== secondaryPlanet.planet
  ) {
    const tertiaryNote = polishVoidAnalysisText(planetNote(tertiaryPlanet));
    lines.push(tertiaryNote ? `${placement(tertiaryPlanet)}\n${tertiaryNote}` : placement(tertiaryPlanet));
  }

  // Call out when primary or secondary occupies a significant house for this intent
  for (const h of weighting.significantHouses) {
    if (primaryPlanet.house === h) {
      lines.push(
        `${PLANET_KO[weighting.primary]}이 ${hStr(h)}에 있습니다. 이 자리는 이번 질문에서 특히 눈여겨볼 자리입니다.`,
      );
      break;
    }
    if (secondaryPlanet.house === h) {
      lines.push(
        `${PLANET_KO[weighting.secondary]}이 ${hStr(h)}에 있습니다. 이 배치가 오늘 판단에 직접 영향을 줍니다.`,
      );
      break;
    }
  }

  lines.push(
    `탄생점 · ${SIGN_KO[chart.ascendant.sign]}\n${polishVoidAnalysisText(natal.ascSummary)}`,
  );

  const keyLine =
    `${PLANET_KO[weighting.primary]}(${SIGN_KO[primaryPlanet.sign]})\uACFC ` +
    `${PLANET_KO[weighting.secondary]}(${SIGN_KO[secondaryPlanet.sign]})\uAC00 ` +
    `이 질문의 핵심을 드러냅니다.`;

  return polishVoidAnalysisSection({ title: SECTION1_TITLE[intent], body: lines.join("\n\n"), keyLine });
}

// ── Section 2: Transit context, intent-focused ────────────────────────────────

function buildSection2(
  chart: NatalChart,
  weighting: IntentWeighting,
  transit: ReturnType<typeof interpretTransits>,
  domainHeadline: string,
  domainNote: string,
  qSeed: number,
  category: CategoryKey,
): VoidAnalysisSection {
  const byName = new Map(chart.planets.map((p) => [p.planet, p]));
  const primaryPlanet = byName.get(weighting.primary)!;

  const ASPECT_KO: Record<string, string> = {
    conjunction: "합", sextile: "육분", square: "격각",
    trine: "삼각", opposition: "대립",
  };
  const ASPECT_DESC_KO: Record<string, string> = {
    conjunction: "합 — 두 행성이 같은 자리를 강하게 비춥니다",
    sextile:     "육분 — 서로 힘을 보태는 각입니다",
    square:      "격각 — 부딪히며 과제를 드러내는 각입니다",
    trine:       "삼각 — 자연스럽게 이어지는 각입니다",
    opposition:  "대립 — 균형을 다시 묻게 하는 각입니다",
  };

  const relevantAspects = chart.aspects.filter(
    (a) => (a.planet1 === weighting.primary || a.planet2 === weighting.primary) && a.orb <= 5,
  );

  let aspectLine: string | null = null;
  if (relevantAspects.length > 0) {
    const a = relevantAspects[0];
    const other = a.planet1 === weighting.primary ? a.planet2 : a.planet1;
    const otherKo = PLANET_KO[other as PlanetKey] ?? other;
    aspectLine = `${PLANET_KO[weighting.primary]}과 ${otherKo}: ${ASPECT_DESC_KO[a.aspect] ?? ASPECT_KO[a.aspect]}`;
  }

  // Lead with aspect line (intent-specific) so different questions start with different text
  const lines: string[] = [];
  if (aspectLine) lines.push(polishVoidAnalysisText(aspectLine));
  else lines.push(`${PLANET_KO[weighting.primary]}이 지금 이 질문에 가장 직접적으로 걸려 있습니다.`);

  if (weighting.significantHouses.includes(primaryPlanet.house)) {
    lines.push(
      `${PLANET_KO[weighting.primary]}이 현재 ${hStr(primaryPlanet.house)}에 있습니다. 이 위치가 오늘 판단에 직접 영향을 줍니다.`,
    );
  }

  // Live transit phrases filtered by intent's primary planet — unique per intent, user, and date
  const activePhrases = transit.activeAspects
    .filter((a) => a.natalPlanet === weighting.primary || a.natalPlanet === weighting.secondary)
    .map((a) => a.phrase);
  if (activePhrases.length > 0) {
    // qSeed selects which active phrase to lead with — same user+date but different question picks differently
    lines.push(polishVoidAnalysisText(activePhrases[qSeed % activePhrases.length]));
  }

  // Question-seeded action item from dos list — different questions pick different dos entries
  if (transit.dos.length > 0) {
    lines.push(`지금 해볼 것: ${polishVoidAnalysisText(transit.dos[qSeed % transit.dos.length])}`);
  }

  lines.push(polishVoidAnalysisText(`${domainHeadline}\n${domainNote}`));

  return polishVoidAnalysisSection({
    title: SECTION2_TITLE[category],
    body: lines.join("\n\n"),
    keyLine: polishVoidAnalysisText(transit.keyPhrase),
  });
}

// ── Section 3: Intent-shaped synthesis ───────────────────────────────────────

function buildSection3(
  chart: NatalChart,
  intent: QuestionIntent,
  weighting: IntentWeighting,
  natal: ReturnType<typeof interpretNatalChart>,
  tone: "strength" | "challenge" | "neutral",
  donts: string[],
  qSeed: number,
): VoidAnalysisSection {
  const byName = new Map(chart.planets.map((p) => [p.planet, p]));
  const primaryPlanet = byName.get(weighting.primary)!;
  const secondaryPlanet = byName.get(weighting.secondary)!;

  // Intent-specific intro: unique per question type regardless of user
  const intentIntro = polishVoidAnalysisText(SECTION3_INTENT_INTRO[intent]);

  // Chart-specific planet context: unique per user's actual planet positions
  const primaryKo  = PLANET_KO[weighting.primary];
  const secondaryKo = PLANET_KO[weighting.secondary];
  const primaryNote = polishVoidAnalysisText(planetNote(primaryPlanet));
  const secondaryNote = polishVoidAnalysisText(planetNote(secondaryPlanet));
  const planetContext =
    `${primaryKo} · ${SIGN_KO[primaryPlanet.sign as SignName]} ${hStr(primaryPlanet.house)}${primaryNote ? `: ${primaryNote}` : ""}\n` +
    `${secondaryKo} · ${SIGN_KO[secondaryPlanet.sign as SignName]} ${hStr(secondaryPlanet.house)}${secondaryNote ? `: ${secondaryNote}` : ""}`;

  // Natal aspect line (user-specific; falls back to dominant element)
  const aspectLine = polishVoidAnalysisText(
    natal.keyAspects.length > 0 ? natal.keyAspects[0] : natal.dominantPattern,
  );

  // Question-seeded caution — different questions see different warning items
  const dontLine = donts.length > 0 ? `지금은 피할 것: ${polishVoidAnalysisText(donts[qSeed % donts.length])}` : null;

  const bodyParts = [intentIntro, planetContext, aspectLine];
  if (dontLine) bodyParts.push(dontLine);
  bodyParts.push(polishVoidAnalysisText(INTENT_TONE_LINE[intent][tone]));
  const body = bodyParts.join("\n\n");
  const keyLine = `${primaryKo}와 ${secondaryKo}이 이번 질문의 핵심입니다.`;

  return polishVoidAnalysisSection({ title: SECTION3_TITLE[intent], body, keyLine });
}

// ── Main export ───────────────────────────────────────────────────────────────

export function generateVoidAnalysis(
  userId: string,
  category: CategoryKey,
  questionText: string,
): VoidAnalysisOutput | null {
  const chart = getOrComputeNatalChart(userId);
  if (!chart) return null;

  const natal = interpretNatalChart(chart);
  const transit = interpretTransits(chart, new Date());
  const domains = interpretDomains(chart, new Date());

  const domainLabel = CATEGORY_DOMAIN[category];
  const domainReading = domains.find((d) => d.domain === domainLabel) ?? domains[0];

  const classified = classifyQuestionIntent(questionText, category);
  const weighting = INTENT_WEIGHTING[classified.intent];

  // Question hash seed — same question always picks same items; different questions pick differently
  const qSeed = questionText.split('').reduce((sum, c) => sum + c.charCodeAt(0), 0);

  const section1 = buildSection1(chart, weighting, natal, classified.intent);
  const section2 = buildSection2(chart, weighting, transit, domainReading.headline, domainReading.note, qSeed, category);
  const section3 = buildSection3(chart, classified.intent, weighting, natal, domainReading.tone, transit.donts, qSeed);

  const decision = computeDecision(chart, classified.intent);

  return {
    category,
    intent: classified.intent,
    generatedAt: new Date().toISOString(),
    chartHash: chart.chartHash ?? "",
    sections: [section1, section2, section3],
    keyPhrase: polishVoidAnalysisText(domainReading.headline),
    tone: domainReading.tone,
    decision,
  };
}
