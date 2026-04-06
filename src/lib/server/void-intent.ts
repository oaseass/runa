/**
 * Lightweight deterministic question-intent classifier for the void analysis engine.
 *
 * Classification is keyword-based — no ML, no random output.
 * Same question text always produces the same intent.
 *
 * Architecture:
 *   1. Normalise input (lower-case, strip punctuation)
 *   2. Walk prioritised keyword rules in order — first match wins
 *   3. Fall back to the category default intent if no keyword matches
 *
 * Each CategoryKey has a set of sub-intents; the classifier picks the most
 * specific one so the analysis engine can reweight natal factors accordingly.
 */

import type { CategoryKey } from "@/app/void/_components/VoidScreen";

// ── Intent type ───────────────────────────────────────────────────────────────

export type LoveIntent =
  | "confession"    // 고백 / 마음 전달
  | "compatibility" // 궁합 / 잘 맞는지
  | "trust"         // 믿을 수 있는지 / 신뢰
  | "breakup"       // 이별 / 헤어짐 / 결별
  | "relationship"  // 기본 관계 / 연애 / 감정
  | "reciprocity"   // 상대방도 나를 좋아할까 / 관심이 있을까
  | "commitment"    // 더 진지하게 / 관계 공식화 / 결혼
  | "timing";       // 지금 연락할 타이밍인가 / 다가가기 좋은 때인가

export type WorkIntent =
  | "quit"          // 퇴직 / 그만두기 / 이직 결심
  | "promotion"     // 승진 / 인정 / 성과
  | "decision"      // 선택 / 계약 / 제안 수락
  | "conflict"      // 상사 / 동료 갈등 / 팀 문제
  | "direction"     // 방향 / 진로 / 커리어 전환
  | "opportunity";  // 새로운 기회 / 제안 / 프로젝트 평가

export type SelfIntent =
  | "identity"      // 나는 누구 / 내 본질 / 자아
  | "energy"        // 피곤 / 무기력 / 에너지 부족
  | "direction"     // 방향 / 목표 / 앞으로 어떻게
  | "pattern"       // 반복 / 같은 실수 / 패턴
  | "purpose"       // 이유 / 의미 / 왜 사는지
  | "self_trust"    // 내 판단을 믿어도 될까 / 확신이 없어
  | "boundary"      // 선을 그어야 할 때인가 / 경계 / 거절
  | "self_worth"    // 나는 충분한가 / 자기비판 / 자존감
  | "self_honesty"  // 나 자신에게 솔직한가 / 자기기만 / 회피
  | "fear"          // 두려움 / 무엇이 나를 막는가 / 공포
  | "growth"        // 성장하고 있는가 / 배우고 있는가 / 더 나아가야
  | "stagnation";   // 제자리인가 / 막혀있는가 / 정체

export type SocialIntent =
  | "conflict"      // 갈등 / 다툼 / 싸움 / 불화
  | "distance"      // 거리감 / 연락 없음 / 멀어짐
  | "group"         // 무리 / 집단 / 소속 / 팀
  | "friendship"    // 친구 / 우정 / 오랜 친구
  | "communication" // 말 / 대화 / 표현 / 전달
  | "belonging";    // 이 곳이 나에게 맞는가 / 소속감 없음

export type QuestionIntent =
  | LoveIntent
  | WorkIntent
  | SelfIntent
  | SocialIntent;

export type ClassifiedIntent = {
  category: CategoryKey;
  intent: QuestionIntent;
  /** Raw matched keyword, or null if fell back to category default */
  matchedKeyword: string | null;
};

// ── Keyword rule tables (priority order — earlier = higher priority) ──────────

type KeywordRule = { keywords: string[]; intent: QuestionIntent };

const LOVE_RULES: KeywordRule[] = [
  // ── reciprocity: does the other person feel the same? ───────────────────
  {
    keywords: [
      "상대방도", "상대도", "나를 좋아할까", "관심이 있을까", "마음이 있을지",
      "나한테 관심", "좋아하는 것 같은데", "좋아하는지", "내 마음을 아는지",
      "상대 마음", "그 사람 마음", "저쪽 감정", "상대방 마음", "나에게 관심",
    ],
    intent: "reciprocity",
  },
  // ── commitment: deepening or formalizing the relationship ───────────────
  {
    keywords: [
      "사귀자고", "공식적으로", "진지하게 만나자", "관계를 더 깊게",
      "함께 하자고", "프러포즈", "결혼", "동거", "더 진지한",
      "이 사람과 미래", "미래를 같이", "오래 만날 수 있을지",
    ],
    intent: "commitment",
  },
  // ── timing: pure contact / approach timing ──────────────────────────────
  {
    keywords: [
      "지금 연락해도", "연락할 타이밍", "먼저 연락할까", "지금 다가가도",
      "타이밍이 맞는지", "언제 연락", "지금이 맞는지", "지금 연락하면",
      "다시 연락해도 될까",
    ],
    intent: "timing",
  },
  {
    keywords: [
      "고백", "마음 전달", "마음을 전", "처음 만나", "좋아한다고", "먼저 말",
      "먼저 연락", "말해도 될지", "표현해도", "직접 표현",
      "끌리는 이유", "왜 이렇게 끌리", "강하게 끌리", "이렇게 끌리",
    ],
    intent: "confession",
  },
  {
    keywords: [
      "궁합", "잘 맞는지", "잘 맞을", "상성", "맞는 사람",
      "잘 맞는 사이", "함께 잘 맞", "에너지가 맞",
    ],
    intent: "compatibility",
  },
  {
    keywords: [
      "믿을 수", "신뢰", "진심인지", "믿어도", "진짜 좋아", "거짓말",
      "진심일", "이용하", "속이",
      "이미지를 사랑", "이미지인지", "이미지가 아닌",
    ],
    intent: "trust",
  },
  {
    keywords: [
      "이별", "헤어지", "헤어져", "헤어짐", "결별", "끝내야", "관계를 끊",
      "연락을 끊", "보내야", "끝내고 싶", "정리하고 싶", "관계 정리",
      "놓아줘야", "이 감정을 놓", "정리해야 할 시점",
    ],
    intent: "breakup",
  },
  {
    keywords: [
      "연애", "사귀", "좋아하", "감정", "설레", "관심", "다가가", "관계",
      "사랑받", "준비가 됐", "사랑받을", "사랑받는",
    ],
    intent: "relationship",
  },
];

const WORK_RULES: KeywordRule[] = [
  // ── opportunity: evaluate a new offer / project / chance ───────────────
  {
    keywords: [
      "기회를 잡아야", "제안을 받았는데", "새로운 프로젝트", "오퍼", "제안이 왔",
      "기회가 생겼", "새로운 기회", "지금 이 기회", "잡아야 할지",
      "투자 제안", "파트너십", "새로운 계약", "제의를 받았",
    ],
    intent: "opportunity",
  },
  {
    keywords: [
      "퇴직", "그만두", "그만둬", "그만 다니", "이직", "회사를 떠",
      "사직", "도망", "계속 다녀야", "계속 다니는",
      "번아웃이 오고", "번아웃", "번 아웃",
    ],
    intent: "quit",
  },
  {
    keywords: [
      "승진", "인정", "성과", "평가", "인정받", "잘 보이", "올라갈",
      "연봉", "팀장이 될", "리더",
      "제대로 발휘하고", "능력을 제대로",
    ],
    intent: "promotion",
  },
  {
    keywords: [
      "선택", "계약", "제안", "수락", "거절", "결정", "해야 할지",
      "이 방향이 나에게", "계속 투자해야", "투자해야 할까",
      "새로운 시작에 좋은", "지금 결정",
    ],
    intent: "decision",
  },
  {
    keywords: [
      "상사", "동료", "팀장", "갈등", "마찰", "싸움", "눈치", "분위기",
      "협업 관계", "협업에서",
    ],
    intent: "conflict",
  },
  {
    keywords: [
      "방향", "진로", "커리어", "직업", "어떤 일", "어떤 직",
      "어떤 환경에서", "커리어 흐름", "나의 흐름은",
    ],
    intent: "direction",
  },
];

const SELF_RULES: KeywordRule[] = [
  // ── self_worth: am I enough? self-esteem, self-criticism ────────────────
  {
    keywords: [
      "나는 충분한가", "나는 충분할까", "충분히 잘하고 있는", "내가 부족한건지",
      "너무 못난", "왜 이렇게 못", "나를 사랑해야 하는데", "자존감이 낮",
      "나 자신이 싫어", "자기비판", "스스로를 너무 비판", "자기혐오",
      "비교하지 말아야 하는데", "남들이 다 잘하는데 나만", "뒤처지는 것 같아",
    ],
    intent: "self_worth",
  },
  // ── self_honesty: am I being honest with myself? avoidance/denial ──────
  {
    keywords: [
      "나 자신에게 솔직한지", "솔직하게 직면해야", "스스로를 속이", "자기기만",
      "회피하고 있는 것 같아", "외면하고 있는 것 같아", "직면하기가 무서워",
      "눈 감고 있는 것 같아", "알지만 직면을 못하", "알면서도 모른 척",
      "나를 꾸미고 있는지", "연기하고 있는 것 같아",
    ],
    intent: "self_honesty",
  },
  // ── fear: what is stopping me / fear-based paralysis ───────────────────
  {
    keywords: [
      "두려움이 뭔지", "나를 막는 것이 뭔지", "왜 무서운지", "공포가", "두렵다",
      "시도조차 못하", "움직이지 못하", "멈춰있는 이유", "나를 가로막는",
      "두려워서 못하", "겁이 나서", "실패가 두려워", "거절당할까봐",
      "상처받을까봐", "회피의 근원", "뭐가 이렇게 무서운지",
    ],
    intent: "fear",
  },
  // ── growth: am I growing? learning / expanding ──────────────────────────
  {
    keywords: [
      "성장하고 있는지", "배우고 있는지", "더 나아가야", "성장하는 방향",
      "진화하고 있나", "앞으로 가고 있나", "점점 더 나아지", "성장통",
      "이게 맞는 방향인지", "발전하고 있는지", "나아지고 있나",
      "좋은 방향으로 가",
    ],
    intent: "growth",
  },
  // ── stagnation: am I stuck / blocked / plateaued ────────────────────────
  {
    keywords: [
      "제자리인 것 같아", "막혀있는 것 같아", "정체된 것 같아", "앞으로 안 나아가",
      "아무것도 안 변하는 것 같아", "같은 자리에 있는 것 같아", "발전이 없는",
      "왜 이렇게 제자리냐", "뭔가 막혀있어", "이 상태가 계속되는 것 같아",
      "동그라미를 맴도는", "벗어나지 못하",
    ],
    intent: "stagnation",
  },
  // ── self_trust: can I trust my own judgment? ────────────────────────────
  {
    keywords: [
      "내 판단을 믿어도", "내가 맞는지", "내 직감을 믿어야", "나를 믿어도",
      "내 결정이 맞는지", "내 판단이 흔들리", "내 선택이 맞는지",
      "너무 예민한 건지", "내가 과민한 건지", "확신이 없어",
      "내 감각을 믿어야", "감이 맞는 건지",
    ],
    intent: "self_trust",
  },
  // ── boundary: should I draw a line / say no? ────────────────────────────
  {
    keywords: [
      "선을 그어야", "경계를 정해야", "선을 긋는 것이", "거절해야",
      "선을 넘는 것 같아", "나를 지키려면", "내 영역을 지켜야",
      "한계를 정해야", "적당히 해야", "과도한 요구를 받고",
    ],
    intent: "boundary",
  },
  {
    keywords: [
      "나는 누구", "내 본질", "정체성", "진짜 나", "나다운", "자아",
      "솔직한가", "나를 믿", "어디에 속", "매력적으로 만드는",
      "감정의 근원", "욕구는", "원하는 것과 필요한", "나를 정의",
      "나는 지금 나 자신", "나 자신에게",
    ],
    intent: "identity",
  },
  {
    keywords: [
      "피곤", "무기력", "지쳐", "힘이 없", "에너지가 없", "무너지", "소진",
      "쉬어가야", "쉬어야", "너무 애쓰고", "에너지는 어디로",
      "필요한 에너지", "에너지가 어디", "지금 내 에너지",
    ],
    intent: "energy",
  },
  {
    keywords: [
      "반복", "같은 실수", "또 했", "패턴", "왜 항상", "왜 매번",
      "비이성적", "반응하고 있", "멈추게 하는", "두려움은 어디서",
      "지루함", "반복하는 패턴", "내 안의 두려움",
    ],
    intent: "pattern",
  },
  {
    keywords: [
      "의미", "왜 사는지", "이유", "삶의 목적", "목적이 뭔지",
      "직감은", "직감을", "내 직감",
    ],
    intent: "purpose",
  },
  {
    keywords: [
      "방향", "목표", "앞으로", "무엇을", "어디로", "어떻게 살",
      "성장하고 있는가", "성장하고 있는지", "행동하기 좋은", "이번 주",
      "제자리인가",
    ],
    intent: "direction",
  },
];

const SOCIAL_RULES: KeywordRule[] = [
  // ── belonging: is this the right place / community for me? ─────────────
  {
    keywords: [
      "이 곳이 나에게 맞는지", "소속감이 없는 느낌", "여기 있어야 하나",
      "내가 여기 어울리는지", "이 집단이 나와 맞는지", "이 환경이 나에게",
      "나에게 맞는 곳", "어디에 속해야", "이 사람들과 맞는지",
      "나의 공동체", "나에게 맞는 사람들",
    ],
    intent: "belonging",
  },
  {
    keywords: [
      "갈등", "다툼", "싸움", "불화", "소외", "미움", "눈치 보",
      "중요한 사람은 누구", "갈등을 해결",
    ],
    intent: "conflict",
  },
  {
    keywords: [
      "거리감", "멀어지", "연락이 없", "연락 안", "차가워지", "냉랭",
      "달라진", "예전 같지", "소진되고 있", "거리를 둬야",
    ],
    intent: "distance",
  },
  {
    keywords: [
      "무리", "집단", "소속", "팀", "그룹", "동아리", "사람들 속",
      "새로운 취미나 모임", "새로운 취미", "이 모임이",
    ],
    intent: "group",
  },
  {
    keywords: [
      "친구", "우정", "오랜 친구", "절친",
      "좋은 영향을 주고", "진정으로 연결되고 싶",
      "내 친구들을 진심",
    ],
    intent: "friendship",
  },
  {
    keywords: [
      "말", "대화", "표현", "전달", "설명", "오해", "소통", "말하기",
      "말해야 할까", "침묵해야", "SNS", "약속을 너무", "분위기를 챙기",
      "새로운 사람을 만날",
    ],
    intent: "communication",
  },
];

const RULES_BY_CATEGORY: Record<CategoryKey, KeywordRule[]> = {
  love: LOVE_RULES,
  work: WORK_RULES,
  self: SELF_RULES,
  social: SOCIAL_RULES,
};

const DEFAULT_INTENT_BY_CATEGORY: Record<CategoryKey, QuestionIntent> = {
  love: "relationship",
  work: "direction",
  self: "direction",
  social: "communication",
};

// ── Normaliser ────────────────────────────────────────────────────────────────

function normalise(text: string): string {
  return text
    .toLowerCase()
    // Collapse whitespace
    .replace(/\s+/g, " ")
    // Strip punctuation (keep Korean, Latin, digits, spaces)
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .trim();
}

// ── Classifier ────────────────────────────────────────────────────────────────

/**
 * Classify a user question into a sub-intent within its category.
 * Deterministic: same text always returns the same result.
 */
export function classifyQuestionIntent(
  questionText: string,
  category: CategoryKey,
): ClassifiedIntent {
  const norm = normalise(questionText);
  const rules = RULES_BY_CATEGORY[category];

  for (const rule of rules) {
    for (const kw of rule.keywords) {
      if (norm.includes(normalise(kw))) {
        return {
          category,
          intent: rule.intent,
          matchedKeyword: kw,
        };
      }
    }
  }

  return {
    category,
    intent: DEFAULT_INTENT_BY_CATEGORY[category],
    matchedKeyword: null,
  };
}
