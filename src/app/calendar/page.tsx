"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";

const WD_KO = ["일", "월", "화", "수", "목", "금", "토"];

// ── API shape ─────────────────────────────────────────────────────────────────

type DayScore = {
  day: number;
  score: number;
  tone: "strength" | "challenge" | "neutral";
  topDomain: string | null;
  secondDomain?: string | null;
  icons: string[];
  aspectType?: "conjunction" | "sextile" | "square" | "trine" | "opposition" | null;
  applying?: boolean | null;
  dominantHouse?: number | null;
  planetPair?: string | null;
};

// ── 8 semantic categories — fixed icon per category, no overlap ───────────────
type Category = "관계" | "일" | "소통" | "내면" | "이동" | "집" | "행운" | "긴장";

const CAT_ICON: Record<Category, string> = {
  관계: "🩷",
  일:   "💼",
  소통: "💬",
  내면: "🌙",
  이동: "✈️",
  집:   "🏠",
  행운: "⭐",
  긴장: "⚡",
};

// ── Aspect-context copy variants ──────────────────────────────────────────────
// 4 contexts keyed by strongest active aspect quality:
//   harmonious → trine / sextile     (flowing, natural energy)
//   intense    → conjunction applying (peak energy, direct)
//   tense      → square / opposition applying (friction building)
//   base       → separating or no aspect (general)
type CopyEntry = { title: string; body: string };
type CopyVariants = {
  harmonious: CopyEntry[];
  intense:    CopyEntry[];
  tense:      CopyEntry[];
  base:       CopyEntry[];
};

const CALENDAR_COPY_REPLACEMENTS: Array<[string, string]> = [
  ["끌림이 자연스럽게 흐르는 날", "끌림이 자연스럽게 이어지는 날"],
  ["관계의 에너지가 잘 맞는 날", "서로의 결이 잘 맞는 날"],
  ["지금은 먼저 흐름을 읽는 편이 좋습니다.", "지금은 반응보다 분위기를 먼저 읽는 편이 좋습니다."],
  ["관계를 가볍게 풀기 좋은 흐름", "관계를 가볍게 풀기 좋은 날"],
  ["흐름 좋게 진행되는 날", "일이 막힘 없이 풀리는 날"],
  ["일단 시작하면 흐름이 열립니다.", "일단 시작하면 길이 보입니다."],
  ["한 흐름에 몰입할 때 결과가 납니다.", "한 가지에 몰입할 때 결과가 납니다."],
  ["새 프로젝트에 에너지를 쏟기 좋은 날", "새 프로젝트에 힘을 쏟기 좋은 날"],
  ["시작의 에너지가 지금 방향과 정확히 맞아 있습니다.", "시작할 힘이 지금 방향과 잘 맞아 있습니다."],
  ["계획이 틀어지면 흐름을 읽어야 하는 날", "계획이 틀어지면 상황부터 다시 봐야 하는 날"],
  ["정해진 경로보다 오늘의 흐름이 더 정확합니다.", "정해 둔 순서보다 지금 상황을 다시 보는 편이 더 정확합니다."],
  ["의욕이 꺾이기 쉬운 흐름 속에서", "의욕이 쉽게 꺾일 수 있는 날"],
  ["꾸준히 쌓아가기 좋은 흐름", "꾸준히 쌓아가기 좋은 날"],
  ["중요한 이야기를 꺼내기 좋은 흐름", "중요한 이야기를 꺼내기 좋은 날"],
  ["오늘의 흐름이 잡힙니다.", "상황이 보입니다."],
  ["써내려가면 흐름이 열립니다.", "써내려가면 길이 보입니다."],
  ["생각을 정리하기 좋은 흐름", "생각을 정리하기 좋은 날"],
  ["직관이 흐름과 일치하는 날", "직관과 현실 감각이 맞아떨어지는 날"],
  ["답이 보이는 흐름입니다.", "답이 보이는 날입니다."],
  ["발을 옮길수록 좋은 흐름과 연결됩니다.", "발을 옮길수록 좋은 기회와 연결됩니다."],
  ["유리한 흐름입니다.", "유리한 날입니다."],
  ["흐름이 달라집니다.", "시야가 달라집니다."],
  ["루틴을 다시 세우기 좋은 흐름", "루틴을 다시 세우기 좋은 날"],
  ["우호적인 흐름이 뒷받침되는 날", "운이 슬쩍 등을 미는 날"],
  ["지금이 가장 좋은 흐름입니다.", "지금이 가장 좋은 타이밍입니다."],
  ["에너지가 가장 강하게 정렬되는 날", "마음과 타이밍이 한쪽으로 모이는 날"],
  ["에너지가 정렬된 날", "판단이 또렷한 날"],
  ["흐름이 좋은 날", "운이 트이는 날"],
  ["흐름에서 기회를 알아채려면", "상황에서 기회를 알아채려면"],
  ["흐름을 거스르지 않는 날", "억지로 밀어붙이지 않는 날"],
  ["기다리면 이 흐름은 사라집니다.", "계속 미루면 이 기회는 지나갑니다."],
  ["흐름이 안정되기를 기다리세요.", "상황이 가라앉기를 기다리세요."],
  ["천천히 가도 흐름은 살아 있는 날", "천천히 가도 기회가 남아 있는 날"],
];

function polishCalendarText(text: string): string {
  let next = text;
  for (const [from, to] of CALENDAR_COPY_REPLACEMENTS) {
    next = next.replaceAll(from, to);
  }
  return next;
}

function polishCalendarCopy(entry: CopyEntry): CopyEntry {
  return {
    title: polishCalendarText(entry.title),
    body: polishCalendarText(entry.body),
  };
}

const CAT_COPY: Record<Category, CopyVariants> = {
  관계: {
    harmonious: [
      { title: "끌림이 자연스럽게 흐르는 날",            body: "억지로 만들 필요 없이 연결이 부드럽게 이어집니다." },
      { title: "지금은 결과보다 연결을 보는 날",          body: "오늘의 대화는 결론보다 과정에 의미가 있습니다." },
      { title: "기대보다 반응을 읽는 편이 중요한 날",     body: "먼저 다가가기보다 상대의 신호를 읽는 날입니다." },
      { title: "익숙한 인연이 새로운 빛으로 보이는 날",   body: "서두르지 않아도 감은 이어집니다." },
      { title: "관계의 에너지가 잘 맞는 날",              body: "지금 이 자리가 오래 남을 수 있습니다." },
      { title: "먼저 열면 상대도 열리는 날",              body: "작게 건네는 말 한마디가 생각보다 깊이 닿습니다." },
    ],
    intense: [
      { title: "강한 연결이 시작되는 날",                body: "오늘 만나는 사람과의 인상은 쉽게 지워지지 않습니다." },
      { title: "오늘만 가능한 대화가 있는 날",            body: "지금이 아니면 이 타이밍은 다시 오지 않을 수 있어요." },
      { title: "한 사람에게 집중해야 하는 날",            body: "여러 쪽을 동시에 보려 하기보다 한 곳에 집중하세요." },
      { title: "감정이 가장 선명하게 드러나는 날",        body: "지금 느끼는 것이 방향을 알려줍니다." },
      { title: "관계의 전환점이 될 수 있는 날",           body: "오늘 꺼낸 말은 예상보다 멀리 닿습니다." },
      { title: "새로운 연결이 강하게 시작되는 날",        body: "처음 만나든 다시 만나든, 오늘은 다르게 느껴질 수 있습니다." },
    ],
    tense: [
      { title: "감정은 앞서지만 결론은 미뤄야 하는 날",   body: "강하게 느끼는 것이 맞을 수도 있지만, 말은 내일 꺼내세요." },
      { title: "솔직함이 오히려 연결을 만드는 날",        body: "우회하기보다 직접 말할 때 더 빨리 가까워집니다." },
      { title: "감정의 마찰이 생기기 쉬운 날",            body: "같은 말도 다르게 닿을 수 있습니다. 지금은 먼저 흐름을 읽는 편이 좋습니다." },
      { title: "관계의 긴장이 수면 위로 오르는 날",       body: "지금은 정리보다 이해가 먼저입니다." },
      { title: "중요한 대화는 신중하게 고르는 날",        body: "오늘 한 말은 예상보다 큰 무게를 가질 수 있어요." },
      { title: "작은 마찰 뒤에 진짜 말이 숨어 있는 날",   body: "작은 충돌 뒤에 오래 하고 싶었던 말이 묻혀 있을 수 있어요." },
    ],
    base: [
      { title: "연결이 활발해지는 날",                    body: "먼저 나가는 사람이 결국 더 많이 얻습니다." },
      { title: "먼저 다가가는 쪽이 이미 절반인 날",       body: "기다리기보다 한 발 먼저 움직이는 편이 빠릅니다." },
      { title: "새로운 인연이 기대되는 날",               body: "예상치 못한 자리에서 연결이 시작될 수 있습니다." },
      { title: "오래된 관계에서 새로운 결이 느껴지는 날", body: "변하지 않을 것 같은 관계에서도 새로운 결이 보입니다." },
      { title: "관계를 가볍게 풀기 좋은 흐름",            body: "억지로 끌기보다 가볍게 이어가는 쪽이 오래갑니다." },
      { title: "오래 미뤄온 연락을 꺼낼 수 있는 날",      body: "오늘 첫 발을 내딛는 것이 가장 편한 타이밍입니다." },
    ],
  },
  일: {
    harmonious: [
      { title: "흐름 좋게 진행되는 날",                   body: "얽히는 부분 없이 일이 자연스럽게 앞으로 나아갑니다." },
      { title: "익숙한 방식보다 다른 각도가 열리는 날",   body: "익숙한 방식에서 한 걸음만 비틀어 보세요." },
      { title: "성과가 눈에 띄게 쌓이는 날",              body: "꾸준히 해온 것이 오늘 드러납니다." },
      { title: "협업이 예상보다 잘 맞는 날",              body: "함께 하면 각자보다 빠릅니다." },
      { title: "계획대로 움직이면 되는 날",               body: "방향만 맞으면 속도는 늦어도 괜찮습니다." },
      { title: "꾸준함이 빛나기 시작하는 날",             body: "반복처럼 보였던 노력이 어느 순간 결과로 나타납니다." },
    ],
    intense: [
      { title: "집중력이 최고조인 날",                    body: "오늘이 마무리하기 가장 좋은 타이밍입니다." },
      { title: "결정을 더 미루지 않아도 되는 날",         body: "준비가 완벽하지 않아도, 지금 시작하는 것이 맞습니다." },
      { title: "추진력이 강해지는 날",                    body: "방향이 정해졌다면 오늘 속도를 높이세요." },
      { title: "실행이 말보다 빠른 날",                   body: "생각을 정리하기보다 일단 시작하면 흐름이 열립니다." },
      { title: "한 가지에 온전히 집중하기 좋은 날",       body: "한 흐름에 몰입할 때 결과가 납니다." },
      { title: "새 프로젝트에 에너지를 쏟기 좋은 날",    body: "시작의 에너지가 지금 방향과 정확히 맞아 있습니다." },
    ],
    tense: [
      { title: "우선순위를 좁혀야 하는 날",               body: "모든 것을 잡으려 하면 아무것도 잡히지 않습니다." },
      { title: "익숙한 방식보다 다른 접근이 필요한 날",   body: "어제 통했던 방법이 오늘은 막힐 수 있어요." },
      { title: "계획이 틀어지면 흐름을 읽어야 하는 날",  body: "정해진 경로보다 오늘의 흐름이 더 정확합니다." },
      { title: "속도를 낮추고 방향을 먼저 잡는 날",       body: "빨리 가기보다 먼저 방향을 잡는 것이 오늘은 더 중요합니다." },
      { title: "의욕이 꺾이기 쉬운 흐름 속에서",         body: "억지로 밀어붙이면 피로만 쌓입니다. 우선순위를 먼저 좁히세요." },
      { title: "늘 하던 방식을 점검해야 하는 날",         body: "비효율적인 패턴이 드러나면 그게 바꿀 타이밍입니다." },
    ],
    base: [
      { title: "집중력이 올라가는 날",                    body: "작게 움직여도 충분히 달라질 수 있습니다." },
      { title: "움직이면 실마리가 보이는 날",             body: "막힌다 싶을 땐 가장 작은 것부터 시작해보세요." },
      { title: "성과가 가시화되는 날",                    body: "꾸준히 쌓아온 것이 오늘 드러납니다." },
      { title: "꾸준히 쌓아가기 좋은 흐름",               body: "큰 도약보다 오늘의 흐름을 유지하는 것이 더 중요합니다." },
      { title: "실행력이 강해지는 날",                    body: "방향이 맞다면 오늘 더 밀어도 됩니다." },
      { title: "오늘은 속도보다 방향이 먼저인 날",        body: "왜 하는지를 먼저 정리하면 무엇을 할지는 자연스럽게 따라옵니다." },
    ],
  },
  소통: {
    harmonious: [
      { title: "말이 술술 풀리는 날",                     body: "리듬이 맞으면 말이 먼저 흐릅니다." },
      { title: "아이디어가 공명하는 날",                  body: "떠오른 것을 말하면 예상보다 잘 전달됩니다." },
      { title: "말보다 질문이 대화를 여는 날",            body: "가벼운 질문 하나가 대화 전체를 열어줍니다." },
      { title: "설득이 자연스럽게 이루어지는 날",         body: "논리보다 공감이 오늘은 더 강하게 작용합니다." },
      { title: "중요한 이야기를 꺼내기 좋은 흐름",        body: "발표·설득·협상 모두 오늘 방향이 맞습니다." },
      { title: "천천히 말해도 정확하게 닿는 날",          body: "천천히 말해도 정확히 닿습니다." },
    ],
    intense: [
      { title: "언어가 가장 강해지는 날",                 body: "오늘 한 말이 오래 기억됩니다. 핵심을 정확히 전달하세요." },
      { title: "직접적 표현이 효과적인 날",               body: "돌려 말하기보다 바로 이야기할 때 더 잘 통합니다." },
      { title: "결정적 한 마디가 나오는 날",              body: "타이밍이 맞습니다. 더 미루지 않아도 됩니다." },
      { title: "새 정보가 쏟아지는 날",                   body: "다양한 곳에서 자극이 들어옵니다. 고를 것은 고르세요." },
      { title: "말의 무게가 평소보다 무거운 날",          body: "오늘 한 말은 예상보다 무겁게 받아들여질 수 있어요." },
      { title: "한 번에 꺼내야 하는 말이 있는 날",        body: "나중으로 미루면 타이밍을 놓칩니다. 지금이 맞습니다." },
    ],
    tense: [
      { title: "말보다 질문이 중요한 날",                 body: "말하기보다 먼저 들어야 오늘의 흐름이 잡힙니다." },
      { title: "오해가 생기기 쉬운 날",                   body: "같은 말도 다르게 닿을 수 있습니다. 중요한 내용은 글로 남기세요." },
      { title: "소통이 엇갈리기 쉬운 날",                 body: "같은 말이 다르게 해석될 수 있어요. 한 번 더 확인하세요." },
      { title: "말보다 글이 유리한 날",                   body: "구두보다 기록이 오늘은 더 안전합니다." },
      { title: "지금은 설득보다 이해가 먼저인 날",        body: "내 말을 전달하기 전에 어긋난 지점을 먼저 파악하세요." },
      { title: "듣는 것이 말하는 것보다 중요한 날",       body: "오늘은 상대의 속도에 맞추는 쪽이 더 많이 전달됩니다." },
    ],
    base: [
      { title: "말이 잘 통하는 날",                       body: "오늘의 대화는 생각보다 멀리 닿습니다." },
      { title: "아이디어가 풍부해지는 날",                body: "떠오르는 것은 지금 바로 기록해두세요." },
      { title: "글쓰기와 기록이 빛나는 날",               body: "머릿속을 한 번 비운 뒤 써내려가면 흐름이 열립니다." },
      { title: "생각을 정리하기 좋은 흐름",               body: "말하기 전에 한 번 정리하면 더 잘 통합니다." },
      { title: "말보다 질문으로 시작하는 날",             body: "먼저 묻는 쪽이 더 많이 얻습니다." },
      { title: "천천히 가도 흐름은 살아 있는 날",         body: "빠른 답변보다 잘 고른 말 한마디가 더 효과적입니다." },
    ],
  },
  내면: {
    harmonious: [
      { title: "자기 이해가 깊어지는 날",                 body: "자신에 대해 새로운 것을 발견할 수 있습니다." },
      { title: "직관이 흐름과 일치하는 날",               body: "느끼는 대로 따라가도 방향이 맞습니다." },
      { title: "내면이 조용히 정리되는 날",               body: "복잡하게 생각하지 않아도 답이 보이는 흐름입니다." },
      { title: "감정과 이성이 같은 방향을 향하는 날",     body: "머리와 가슴이 오늘은 같은 방향을 향합니다." },
      { title: "천천히 가도 흐름은 살아 있는 날",         body: "서두르지 않아도 자연스럽게 내면이 정렬됩니다." },
      { title: "나에게 솔직해지기 좋은 날",               body: "자신이 원하는 것과 두려워하는 것이 동시에 보입니다." },
    ],
    intense: [
      { title: "내면의 변화가 시작되는 날",               body: "지금 느끼는 것이 앞으로의 방향을 결정할 수 있습니다." },
      { title: "핵심을 직면해야 하는 날",                 body: "피하려 했던 것과 마주하기 좋은 타이밍입니다." },
      { title: "깊은 통찰이 오는 날",                     body: "논리보다 직관이 더 명확한 답을 줄 수 있습니다." },
      { title: "감정이 가장 선명한 날",                   body: "자신이 진짜 원하는 것이 오늘 보입니다." },
      { title: "감정은 앞서지만 결정은 늦춰야 하는 날",   body: "강하게 느끼는 것과 옳은 것이 다를 수 있어요." },
      { title: "오랜 패턴이 깨지는 신호가 오는 날",       body: "불편함이 느껴진다면 그게 변화가 시작되는 지점입니다." },
    ],
    tense: [
      { title: "감정 기복이 커질 수 있는 날",             body: "즉흥적으로 밀어붙이기보다 호흡을 한 번 고르세요." },
      { title: "내면의 갈등이 표면으로 오르는 날",        body: "불편한 감정을 억압하지 말고 천천히 살펴보세요." },
      { title: "작은 변수에 흔들리기 쉬운 날",            body: "흔들리기 전에 먼저 멈추는 것이 오늘의 방어선입니다." },
      { title: "에너지 소모가 큰 날",                     body: "자신을 혹독하게 몰아붙이지 않아도 됩니다." },
      { title: "느끼는 것과 맞는 것이 다른 날",           body: "지금의 감정이 판단의 기준이 되지 않도록 하세요." },
      { title: "내면이 가장 솔직해지는 날",               body: "억누르려 했던 감정이 올라오면 그냥 두세요. 그게 신호입니다." },
    ],
    base: [
      { title: "직관이 날카로운 날",                      body: "논리보다 감각을 먼저 믿어볼 만합니다." },
      { title: "나를 돌아보기 좋은 흐름",                 body: "잠시 속도를 늦추고 내면의 목소리를 들어보세요." },
      { title: "혼자만의 시간이 필요한 날",               body: "외부 자극보다 내면을 향하는 흐름입니다." },
      { title: "감정을 정리하기 좋은 날",                 body: "외부 기준보다 자신의 속도를 믿어도 되는 날입니다." },
      { title: "질문을 품고 하루를 보내는 날",            body: "답을 찾으려 하기보다 질문과 함께 있는 것이 오늘의 방식입니다." },
      { title: "나에게 솔직해지는 날",                    body: "지금 어떤 상태인지 한 번 스스로에게 물어보세요." },
    ],
  },
  이동: {
    harmonious: [
      { title: "이동이 좋은 결과로 이어지는 날",          body: "발을 옮길수록 좋은 흐름과 연결됩니다." },
      { title: "움직이면 실마리가 보이는 날",             body: "앉아서 기다리기보다 밖으로 나가면 풀립니다." },
      { title: "나가면 나갈수록 얻는 날",                 body: "집에 있기보다 움직일수록 유리한 흐름입니다." },
      { title: "계획된 이동이 잘 풀리는 날",              body: "여행이나 이동 관련 일정이 수월하게 풀립니다." },
      { title: "새로운 환경이 에너지를 주는 날",          body: "공간을 바꾸는 것만으로 아이디어가 열립니다." },
      { title: "천천히 가도 흐름은 살아 있는 날",         body: "발을 떼는 것만으로 흐름이 달라집니다." },
    ],
    intense: [
      { title: "중요한 이동이 있는 날",                   body: "오늘 어디에 있느냐가 의외로 중요할 수 있습니다." },
      { title: "즉흥 이동이 기회를 만드는 날",            body: "계획에 없던 외출이나 만남이 좋은 결과로 이어집니다." },
      { title: "방향이 바뀌기 좋은 날",                   body: "익숙한 방식에서 한 걸음만 비틀어 보세요." },
      { title: "이동과 변화가 겹치는 날",                 body: "새로운 장소, 새로운 사람. 오늘의 이동은 단순하지 않습니다." },
      { title: "오늘은 속도보다 방향이 먼저인 날",        body: "작게 움직여도 충분히 달라질 수 있습니다." },
      { title: "한 번도 가지 않은 방향이 열리는 날",      body: "낯선 루트가 의외의 만남이나 발견으로 이어집니다." },
    ],
    tense: [
      { title: "이동이 예상보다 복잡해지는 날",           body: "여유 있게 출발하고, 대안을 준비해두세요." },
      { title: "이동 중 주의가 필요한 날",               body: "서두르면 놓치는 것이 더 많습니다." },
      { title: "계획이 바뀔 수 있는 날",                 body: "원래 경로에 집착하면 막힙니다. 유연하게 대응하세요." },
      { title: "오늘은 속도보다 방향이 먼저인 날",        body: "빠르게 가려 하기보다 가고 싶은 곳을 먼저 정하세요." },
      { title: "움직일수록 복잡해지는 구간",              body: "무작정 나가기보다 먼저 경로를 확인하세요." },
      { title: "방향이 먼저고 속도는 나중인 날",          body: "목적지가 명확하면 이동의 복잡함이 줄어듭니다." },
    ],
    base: [
      { title: "이동이 많아지는 날",                      body: "발걸음을 옮길수록 새로운 흐름이 열립니다." },
      { title: "움직이면 실마리가 보이는 날",             body: "일단 나가면 생각보다 빠르게 풀립니다." },
      { title: "밖으로 나가야 감이 오는 날",              body: "공간을 바꾸는 것만으로 에너지가 달라집니다." },
      { title: "낯선 곳이 힌트를 주는 날",                body: "익숙한 루트 대신 다른 방향을 한번 시도해보세요." },
      { title: "오늘은 속도보다 방향이 먼저인 날",        body: "어디로 갈지를 먼저 정하면 나머지는 따라옵니다." },
      { title: "이동하면 생각이 바뀌는 날",               body: "같은 문제도 장소가 바뀌면 새로운 시각이 열립니다." },
    ],
  },
  집: {
    harmonious: [
      { title: "머무는 것이 자연스러운 날",               body: "지금은 나가는 것보다 머무는 것이 더 풍요롭습니다." },
      { title: "집이 충전 기지가 되는 날",                body: "익숙한 공간이 오늘은 충전 기지가 됩니다." },
      { title: "가까운 사람과 시간 보내기 좋은 날",       body: "멀리 가지 않아도 의미 있는 하루가 됩니다." },
      { title: "조용한 하루가 최적인 날",                 body: "자극보다 안정이 오늘 에너지를 지켜줍니다." },
      { title: "내 공간이 내 편인 날",                    body: "집에 있는 것 자체가 좋은 에너지를 만들어냅니다." },
      { title: "천천히 가도 흐름은 살아 있는 날",         body: "서두르지 않고 리듬을 유지하는 것이 오늘의 정답입니다." },
    ],
    intense: [
      { title: "공간을 재정비하기 좋은 날",               body: "공간을 새롭게 하면 마음도 따라 정리됩니다." },
      { title: "루틴을 다시 세우기 좋은 날",              body: "일상의 기반을 다시 점검하기 좋은 흐름입니다." },
      { title: "집에서 중요한 것이 정리되는 날",          body: "가까운 관계나 생활 공간에서 결론이 납니다." },
      { title: "내 공간에 집중하는 날",                   body: "외부보다 내부에 에너지를 쏟을 때 결과가 납니다." },
      { title: "익숙한 공간에서 낯선 발견을 하는 날",     body: "익숙한 공간도 오늘은 새로운 시각이 열립니다." },
      { title: "일상을 다시 설계하는 날",                 body: "지금의 루틴을 바꾸면 앞으로의 흐름도 바뀝니다." },
    ],
    tense: [
      { title: "집 문제가 신경 쓰이는 날",                body: "미뤄뒀던 공간이나 가족 관련 일을 처리하기 좋습니다." },
      { title: "가까운 사람과 마찰이 생기기 쉬운 날",     body: "감정적 반응보다 공간과 시간을 먼저 확보하세요." },
      { title: "쉬어도 피곤한 날",                        body: "억지로 쉬려 하기보다 회복 방식을 설계하세요." },
      { title: "내 영역과 경계를 지키는 날",              body: "지금은 먼저 흐름을 읽는 편이 좋습니다." },
      { title: "가까울수록 말을 고르게 되는 날",          body: "편한 관계일수록 오늘은 한 번 더 생각하고 말하세요." },
      { title: "공간이 무거울 때 먼저 해야 할 것",        body: "공기를 바꾸는 것만으로 에너지가 달라집니다. 창문부터 열어보세요." },
    ],
    base: [
      { title: "내 공간에서 충전하기 좋은 날",            body: "나가는 것보다 머무는 쪽이 에너지를 아낍니다." },
      { title: "공간을 정리하기 좋은 날",                 body: "주변을 가볍게 하면 마음도 가벼워집니다." },
      { title: "루틴을 다시 세우기 좋은 흐름",            body: "일상의 리듬을 조용히 되찾기 좋은 흐름입니다." },
      { title: "가까운 사람과 시간 보내기 좋은 날",       body: "멀리 가지 않아도 충분한 날입니다." },
      { title: "내 일상이 나를 지탱하는 날",              body: "화려하지 않아도, 오늘의 루틴이 내일의 힘이 됩니다." },
      { title: "조용히 머무는 것이 가장 현명한 날",       body: "억지로 무언가를 만들려 하지 않아도 좋습니다." },
    ],
  },
  행운: {
    harmonious: [
      { title: "우호적인 흐름이 뒷받침되는 날",           body: "서두르지 않아도 방향이 맞게 흘러갑니다." },
      { title: "기회가 자연스럽게 열리는 날",             body: "무언가를 시작하기에 지금이 가장 좋은 흐름입니다." },
      { title: "운이 판단을 밀어주는 날",                 body: "평소보다 선택에 자신감이 생기는 날입니다." },
      { title: "노력이 먼저 눈에 띠는 날",                body: "꾸준히 해온 것이 오늘 주목받을 수 있습니다." },
      { title: "천천히 가도 흐름은 살아 있는 날",         body: "서두르지 않아도 방향은 이미 맞습니다." },
      { title: "움직이면 실마리가 보이는 날",             body: "지금 시작한 것은 오늘 흐름을 타게 됩니다." },
    ],
    intense: [
      { title: "에너지가 가장 강하게 정렬되는 날",        body: "지금 시작한 것은 강한 흐름을 타게 됩니다." },
      { title: "큰 변화의 시작점이 될 수 있는 날",        body: "오늘의 작은 결정이 나중에 큰 전환점이 됩니다." },
      { title: "강력한 기회가 찾아오는 날",               body: "사소하게 보이는 인연이나 제안에 집중하세요." },
      { title: "리스크가 있어도 도전 쪽이 유리한 날",     body: "작게 움직여도 충분히 달라질 수 있습니다." },
      { title: "한 번의 결정이 흐름을 바꾸는 날",         body: "단순해 보이는 선택이 큰 방향을 결정합니다." },
      { title: "지금 잡지 않으면 흐름이 바뀌는 날",       body: "타이밍이 맞아 있습니다. 지금 움직이세요." },
    ],
    tense: [
      { title: "기회는 있지만 조건이 까다로운 날",        body: "좋은 흐름이 있지만 방심하면 놓칩니다." },
      { title: "행운에 노력이 필요한 날",                 body: "저절로 오지 않아요. 적극적으로 움직여야 결과가 납니다." },
      { title: "흐름이 있어도 방해가 생기는 날",          body: "끝까지 접근하는 편이 결과를 만듭니다." },
      { title: "놓치지 않으려면 움직여야 하는 날",        body: "기다리면 이 흐름은 사라집니다." },
      { title: "익숙한 방식보다 다른 접근이 필요한 날",   body: "익숙한 방식에서 한 걸음만 비틀어 보세요." },
      { title: "작은 시도가 큰 결과를 부르는 날",         body: "완벽하게 준비되지 않아도 지금 작게 시작해보세요." },
    ],
    base: [
      { title: "에너지가 정렬된 날",                      body: "지금 시작한 것은 좋은 방향으로 이어집니다." },
      { title: "흐름이 좋은 날",                          body: "모든 것이 예상보다 잘 풀리는 날입니다." },
      { title: "새로운 기회가 기대되는 날",               body: "오늘의 작은 시작이 나중에 큰 전환점이 될 수 있어요." },
      { title: "노력이 따라오는 날",                      body: "노력이 보상받는 타이밍입니다." },
      { title: "움직이면 실마리가 보이는 날",             body: "지금 시작하면 생각보다 빠르게 흐름이 열립니다." },
      { title: "기대보다 반응을 읽는 편이 중요한 날",     body: "흐름에서 기회를 알아채려면 반응에 집중하세요." },
    ],
  },
  긴장: {
    harmonious: [
      { title: "긴장이 풀리기 시작하는 날",               body: "불편했던 흐름이 서서히 정리됩니다." },
      { title: "갈등이 해소되기 시작하는 날",             body: "오래된 마찰이 오늘 자연스럽게 풀릴 수 있습니다." },
      { title: "무겁던 것이 가벼워지는 날",               body: "어렵게 느껴졌던 상황에 숨통이 트입니다." },
      { title: "지나온 긴장을 놓아도 되는 날",            body: "억지로 붙잡지 않아도 됩니다." },
      { title: "천천히 가도 흐름은 살아 있는 날",         body: "지금의 속도가 오히려 더 안전한 방향입니다." },
      { title: "뒤엉킨 것이 하나씩 풀리는 날",            body: "한꺼번에 해결하려 하지 말고 하나씩 정리해보세요." },
    ],
    intense: [
      { title: "결론을 내야 하는 날",                     body: "더 미루기보다 지금 결정을 내리는 것이 낫습니다." },
      { title: "중요한 대면이 있는 날",                   body: "직접 마주하는 편이 피하는 것보다 빠릅니다." },
      { title: "긴장이 최고조에 오르는 날",               body: "이 순간을 넘기면 상황이 전환될 수 있습니다." },
      { title: "뭔가를 내려놓아야 하는 날",               body: "집착을 풀어야 다음이 열립니다." },
      { title: "빠르게 반응하기보다 버텨야 하는 날",       body: "지금의 충동이 클수록 한 박자 늦추는 편이 안전합니다." },
      { title: "더 미룰 수 없는 순간이 오는 날",          body: "불편해도 지금 마주해야 합니다. 이후가 더 편해집니다." },
    ],
    tense: [
      { title: "흐름을 거스르지 않는 날",                 body: "무리하게 밀어붙이기보다 기다리는 편이 낫습니다." },
      { title: "주의 깊게 살피는 날",                     body: "새로운 시작보다 점검과 정리가 먼저입니다." },
      { title: "감정이 예민해지기 쉬운 날",               body: "중요한 결정은 오늘보다 내일이 더 좋을 수 있어요." },
      { title: "여유를 지키는 것이 전략인 날",            body: "과욕을 부리지 않는 것 자체가 오늘의 현명한 선택입니다." },
      { title: "느끼는 것과 정확한 것이 다를 수 있는 날", body: "감정적 판단보다 사실에 집중하는 쪽이 낫습니다." },
      { title: "기다리는 것이 전략인 날",                 body: "지금 움직이기보다 흐름이 안정되기를 기다리세요." },
    ],
    base: [
      { title: "흐름을 거스르지 않는 날",                 body: "강하게 밀지 않는 것 자체가 오늘의 전략입니다." },
      { title: "주의 깊게 살피는 날",                     body: "놓친 것이 있는지 한 번 더 훑어보는 날입니다." },
      { title: "감정이 예민해지기 쉬운 날",               body: "오늘의 예민함은 판단보다 감지에 쓰는 편이 낫습니다." },
      { title: "여유를 지키는 것이 전략인 날",            body: "필요한 것만 하고 나머지는 내려놓아도 됩니다." },
      { title: "천천히 가도 흐름은 살아 있는 날",         body: "지금의 속도가 오히려 더 안전한 방향입니다." },
      { title: "오늘은 결론을 미뤄도 되는 날",            body: "정리되지 않은 채로 두어도 괜찮습니다." },
    ],
  },
};

// ── Aspect context classifier ─────────────────────────────────────────────────
function getAspectCtx(ds?: DayScore): "harmonious" | "intense" | "tense" | "base" {
  if (!ds?.aspectType) return "base";
  const { aspectType: at, applying } = ds;
  if (at === "trine" || at === "sextile") return "harmonious";
  if (at === "conjunction" && applying) return "intense";
  if ((at === "square" || at === "opposition") && applying) return "tense";
  return "base";
}
// Human-readable energy + aspect context labels for the selected-day detail header
function daySummaryLabel(ds: DayScore): { energy: string; ctx: string } {
  const energy =
    ds.tone === "strength" && ds.score >= 72 ? "강한 흐름" :
    ds.tone === "strength" && ds.score >= 45 ? "좋은 흐름" :
    ds.tone === "challenge" && ds.score < 35 ? "주의 필요" :
    ds.tone === "challenge"                  ? "조심할 흐름" :
    "안정된 흐름";
  const ctx = getAspectCtx(ds);
  const ctxLabel = { harmonious: "조화", intense: "강렴", tense: "마찰", base: "" }[ctx];
  return { energy, ctx: ctxLabel };
}
// Category ordinal — used for companion seed
const CAT_ORD: Record<Category, number> = {
  관계: 0, 일: 1, 소통: 2, 내면: 3, 이동: 4, 집: 5, 행운: 6, 긴장: 7,
};

// Deterministic copy selector.
// Seed factors: date + position + companion-category + aspect-type hash
// → same date with different aspect context OR different companion = different line
function pickInsightCopy(
  cat: Category,
  day: number,
  cats: Category[],
  position: number,
  ds?: DayScore,
): CopyEntry {
  const ctx      = getAspectCtx(ds);
  const variants = CAT_COPY[cat];
  const pool     = variants[ctx].length > 0 ? variants[ctx] : variants.base;
  const companion = cats.find((c) => c !== cat);
  const co  = companion !== undefined ? CAT_ORD[companion] : 0;
  const ASP = ["conjunction", "sextile", "square", "trine", "opposition"];
  const atH = ds?.aspectType ? ASP.indexOf(ds.aspectType) + 1 : 0;
  const houseH = (ds?.dominantHouse ?? 0) % 4;
  const seed = day * 31 + position * 7 + co * 13 + atH * 3 + houseH * 17;
  return polishCalendarCopy(pool[seed % pool.length]);
}

// ── Transit → Category derivation ────────────────────────────────────────────
// Uses all 9 DayScore fields: score, tone, icons, topDomain, secondDomain,
// aspectType, applying, dominantHouse, planetPair.

const SERVER_TO_CAT: Record<string, Category> = {
  "\u2661": "\uAD00\uACC4", // ♡ → 관계
  "\u2605": "\uC77C",       // ★ → 일
  "\uD83D\uDCAC": "\uC18C\uD1B5", // 💬 → 소통
  "\u2726": "\uB0B4\uBA74", // ✦ → 내면
};
const DOM_TO_CAT: Record<string, Category> = {
  "\uAD00\uACC4": "\uAD00\uACC4",        // 관계
  "\uB8E8\uD2F4\u00B7\uC77C": "\uC77C",  // 루틴·일
  "\uC0AC\uACE0\u00B7\uD45C\uD604": "\uC18C\uD1B5", // 사고·표현
  "\uAC10\uC815\u00B7\uB0B4\uBA74": "\uB0B4\uBA74", // 감정·내면
};
const HOUSE_TO_CAT: Record<number, Category> = {
  1: "\uB0B4\uBA74", 2: "\uC77C", 3: "\uC18C\uD1B5", 4: "\uC9D1",
  5: "\uAD00\uACC4", 6: "\uC77C", 7: "\uAD00\uACC4", 8: "\uB0B4\uBA74",
  9: "\uC774\uB3D9", 10: "\uC77C", 11: "\uC18C\uD1B5", 12: "\uC9D1",
};

function getPlanetPairCat(pair?: string | null): Category | null {
  if (!pair) return null;
  if (pair.startsWith("Venus")) return "\uAD00\uACC4";          // 관계
  if (pair.startsWith("Jupiter")) return "\uD589\uC6B4";        // 행운
  if (pair.startsWith("Saturn")) {
    return (pair.includes("Sun") || pair.includes("Moon"))
      ? "\uAE34\uC7A5" : "\uB0B4\uBA74";                       // 긴장 / 내면
  }
  if (pair.startsWith("Mars")) return "\uC774\uB3D9";           // 이동
  if (pair === "Moon-Venus" || pair === "Moon-Jupiter") return "\uAD00\uACC4"; // 관계
  return null;
}

function deriveDateCats(
  day: number,
  month: number,
  year: number,
  ds: DayScore,                   // always required — no fallback for missing data
  chartHash: string,              // user-specific fingerprint for deterministic seeds
): Category[] {
  const cats: Category[] = [];
  const seen = new Set<Category>();
  const add = (c: Category) => { if (!seen.has(c)) { cats.push(c); seen.add(c); } };

  const { aspectType: at, applying, score, tone } = ds;

  // ── Phase A: Domain-first signals — these become the primary visual identity ─
  // Only strong positive aspects open with 행운
  if (at === "conjunction" && applying && score >= 70) add("행운");
  else if (at === "trine" && applying && score >= 65) add("행운");
  else if (score >= 82 && tone !== "challenge") add("행운");

  // Server icon signals
  for (const ic of ds.icons) {
    if (ic === "⭐") continue;
    const cat = SERVER_TO_CAT[ic];
    if (cat) add(cat);
    if (cats.length >= 2) break;
  }

  // Top domain
  if (cats.length < 3 && ds.topDomain) {
    const cat = DOM_TO_CAT[ds.topDomain];
    if (cat) add(cat);
  }

  // Second domain
  if (cats.length < 3 && ds.secondDomain) {
    const cat = DOM_TO_CAT[ds.secondDomain];
    if (cat) add(cat);
  }

  // Planet pair — tension excluded here; comes in Phase B
  if (cats.length < 3) {
    const pc = getPlanetPairCat(ds.planetPair);
    if (pc && pc !== "긴장") add(pc);
  }

  // House supplement
  if (cats.length < 3 && ds.dominantHouse) {
    const hc = HOUSE_TO_CAT[ds.dominantHouse];
    if (hc) add(hc);
  }

  // Behavioral supplement
  if (cats.length < 2) {
    if (score >= 62 && tone !== "challenge" && applying) add("이동");
    else if (tone === "neutral" && score >= 30) add("집");
  }

  // ── Phase B: Tension as companion signal (never forced primary) ────────────
  // 긴장 only leads on truly extreme days with no other signal at all
  const isTenseAspect = (at === "square" || at === "opposition") && !!applying;
  const isExtremeChallenge = tone === "challenge" && score < 35;
  if (!seen.has("긴장")) {
    if (isExtremeChallenge && cats.length === 0) {
      add("긴장"); // sole primary on genuinely extreme days
    } else if ((isTenseAspect && score < 52) || (tone === "challenge" && score < 45)) {
      if (cats.length < 3) add("긴장"); // companion only
    }
  }

  // ── Phase C: Fallback — ensure ≥1 category ───────────────────────────────
  // Only reached when ALL domain/aspect signals are empty (rare).
  // Seed includes chartHash so different users get different fallback categories.
  if (cats.length === 0) {
    const hashN = parseInt(chartHash.slice(0, 8) || "0", 16);
    const seed = (day * 31 + month * 37 + year * 13 + hashN) >>> 0;
    const FB: Category[] = ["관계", "일", "소통", "내면", "이동", "집"];
    add(FB[seed % FB.length]);
  }

  // Return full ordered signal stack (up to 3).
  // Display density (1/2/3 visible icons) is a render-time decision, not a derivation decision.
  return cats.slice(0, 3);
}

// ── Month-level builder — covers ALL calendar days, not just API-returned days ────
// Multi-pass: universal dominance guard, substitution-first set suppression.
function buildMonthCategories(
  year: number,
  month: number,
  dayScores: Record<number, DayScore>,
  chartHash: string,      // user-specific fingerprint — threads into every seed fallback
): Record<number, Category[]> {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const ALL_CATS: Category[] = ["관계", "일", "소통", "내면", "이동", "집", "행운", "긴장"];
  const hashN = parseInt(chartHash.slice(0, 8) || "0", 16); // user-specific bias value

  // Pass 1: derive categories for every day that has real transit data.
  // Days without DayScore are left EMPTY — no placeholder icons for uncomputed days.
  const rawMap = new Map<number, Category[]>();
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = dayScores[d];
    if (ds) rawMap.set(d, deriveDateCats(d, month, year, ds, chartHash));
  }

  // Pass 2: UNIVERSAL anti-dominance — applies to every category equally.
  // Threshold: >30% of primary slots.
  // Score-gap rule: high-score days (≥72) with a clear sole signal are respected;
  // moderate days use data-driven rescue first, then seed-based injection.
  const freq = new Map<Category, number>();
  let total = 0;
  for (const cats of rawMap.values()) {
    if (cats.length > 0) { freq.set(cats[0], (freq.get(cats[0]) ?? 0) + 1); total++; }
  }
  const dominated = new Set(
    [...freq.entries()]
      .filter(([, c]) => total > 0 && c / total > 0.30)
      .map(([cat]) => cat),
  );

  const result: Record<number, Category[]> = {};
  for (const [d, cats] of rawMap) {
    if (!dominated.size || !cats.length || !dominated.has(cats[0])) {
      result[d] = cats;
      continue;
    }

    // Try 1: existing companion in derived list — promote it to primary
    const alt = cats.findIndex((c) => !dominated.has(c));
    if (alt > 0) {
      const r = [...cats]; [r[0], r[alt]] = [r[alt], r[0]]; result[d] = r;
      continue;
    }

    // Try 2: data-driven rescue from DayScore secondary signals
    const ds = dayScores[d];
    const dominatedCat = cats[0];
    let rescued: Category | null = null;
    if (ds) {
      const candidates: (Category | null)[] = [
        ds.secondDomain  ? (DOM_TO_CAT[ds.secondDomain]    ?? null) : null,
        ds.topDomain     ? (DOM_TO_CAT[ds.topDomain]       ?? null) : null,
        ds.dominantHouse ? (HOUSE_TO_CAT[ds.dominantHouse] ?? null) : null,
        getPlanetPairCat(ds.planetPair),
      ];
      for (const c of candidates) {
        if (c && c !== dominatedCat && !dominated.has(c)) { rescued = c; break; }
      }
    }
    if (rescued) {
      // Rescued companion becomes primary; dominated category stays as secondary signal
      result[d] = [rescued, dominatedCat];
      continue;
    }

    // Try 3: score-gap guard — high-score, sole-signal days keep their category unchanged
    // (the day truly IS that category; don't fake variety for a genuinely strong day)
    if (ds && ds.score >= 72) {
      result[d] = cats;
      continue;
    }

    // Try 4: seed-based injection from non-dominated pool (moderate-score days only)
    // Seed includes chartHash so different users get different rebalancing patterns.
    const pool = ALL_CATS.filter((c) => !dominated.has(c) && c !== dominatedCat);
    if (pool.length > 0) {
      const seed = ((d * 31 + month * 37 + year * 13 + hashN) >>> 0);
      result[d] = [pool[seed % pool.length], dominatedCat];
    } else {
      result[d] = cats;
    }
  }

  // Pass 3: adjacent-date suppression — avoid same primary icon on consecutive days
  for (let d = 2; d <= daysInMonth; d++) {
    const prev = result[d - 1];
    const curr = result[d];
    if (prev?.length && curr?.length > 1 && curr[0] === prev[0]) {
      const r = [...curr];
      [r[0], r[1]] = [r[1], r[0]];
      result[d] = r;
    }
  }

  // Pass 4: unordered icon-set suppression — same SET within 5-day window
  // Prefer substitution over deletion; only trim if no substitute exists
  for (let d = 2; d <= daysInMonth; d++) {
    const curr = result[d];
    if (!curr || curr.length < 2) continue;
    const setKey = [...curr].sort().join("+");
    let clashed = false;
    for (let p = Math.max(1, d - 4); p < d; p++) {
      const pc = result[p];
      if (pc && pc.length >= 2 && [...pc].sort().join("+") === setKey) { clashed = true; break; }
    }
    if (!clashed) continue;
    const ds = dayScores[d];
    const primaryCat = curr[0];
    const alreadyUsed = new Set(curr);
    let sub: Category | null = null;
    if (ds) {
      const candidates: (Category | null)[] = [
        ds.secondDomain  ? (DOM_TO_CAT[ds.secondDomain]    ?? null) : null,
        ds.topDomain     ? (DOM_TO_CAT[ds.topDomain]       ?? null) : null,
        ds.dominantHouse ? (HOUSE_TO_CAT[ds.dominantHouse] ?? null) : null,
        getPlanetPairCat(ds.planetPair),
      ];
      for (const c of candidates) {
        if (c && !alreadyUsed.has(c)) { sub = c; break; }
      }
    }
    if (sub) {
      if (curr.length >= 3) {
        const third = curr.find((c) => c !== primaryCat && c !== sub);
        result[d] = third ? [primaryCat, sub, third] : [primaryCat, sub];
      } else {
        result[d] = [primaryCat, sub];
      }
    }
    // No substitute: keep original set — visual repetition is preferable to
    // erasing a meaningful secondary signal from the canonical stack.
  }

  // ── Dev diagnostics ───────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const MN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const pFreq = new Map<Category, number>();
    const sFreq = new Map<Category, number>();
    let c1 = 0, c2 = 0, c3 = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const c = result[d] ?? [];
      if (c.length === 1) c1++; else if (c.length === 2) c2++; else if (c.length >= 3) c3++;
      if (c[0]) pFreq.set(c[0], (pFreq.get(c[0]) ?? 0) + 1);
      if (c[1]) sFreq.set(c[1], (sFreq.get(c[1]) ?? 0) + 1);
    }
    const pct = (n: number) => `${Math.round(n / daysInMonth * 100)}%`;
    console.group(`📅 ${MN[month]} ${year}`);
    console.log("1°", Object.fromEntries([...pFreq].sort((a, b) => b[1] - a[1])));
    console.log("2°", Object.fromEntries([...sFreq].sort((a, b) => b[1] - a[1])));
    console.log(`icons: 1=${c1}(${pct(c1)}) 2=${c2}(${pct(c2)}) 3=${c3}(${pct(c3)})`);

    // Per-dominated-category source breakdown (shows whichever category is highest primary)
    const topCatEntry = [...pFreq.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topCatEntry) {
      const [topCat, topCount] = topCatEntry;
      let srcIcon = 0, srcTopDom = 0, srcSecDom = 0, srcHouse = 0, srcPair = 0, srcAspect = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        if (result[d]?.[0] !== topCat) continue;
        const ds = dayScores[d];
        if (!ds) continue;
        if (ds.icons.some((ic) => SERVER_TO_CAT[ic] === topCat)) srcIcon++;
        if (ds.topDomain && DOM_TO_CAT[ds.topDomain] === topCat) srcTopDom++;
        if (ds.secondDomain && DOM_TO_CAT[ds.secondDomain] === topCat) srcSecDom++;
        if (ds.dominantHouse && HOUSE_TO_CAT[ds.dominantHouse] === topCat) srcHouse++;
        if (getPlanetPairCat(ds.planetPair) === topCat) srcPair++;
        if ((ds.aspectType === "trine" || ds.aspectType === "sextile") && topCat === "관계") srcAspect++;
      }
      console.group(`  🔍 ${topCat} bias: ${topCount}d (${pct(topCount)})`);
      console.log(`icon:${srcIcon} topDom:${srcTopDom} secDom:${srcSecDom} house:${srcHouse} pair:${srcPair}${topCat === "관계" ? ` harmAspect:${srcAspect}` : ""}`);
      console.groupEnd();
    }
    console.groupEnd();
  }

  return result;
}
// ── Calendar grid helpers ──────────────────────────────────────────────────────

// How many icons to show in a month grid cell.
// The canonical signal stack may have 1-3 entries; rendering density is score-driven.
// The detail block always consumes the full stack — same order, same truth.
function gridIconCount(cats: Category[], score: number | undefined): number {
  if (cats.length <= 1) return cats.length;
  if (score === undefined) return 1;
  if (score >= 72) return Math.min(cats.length, 3);
  if (score >= 45) return Math.min(cats.length, 2);
  return 1;
}

function buildCells(y: number, m: number): (number | null)[] {
  const first = new Date(y, m, 1).getDay();
  const total = new Date(y, m + 1, 0).getDate();
  return [
    ...Array<null>(first).fill(null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const router        = useRouter();
  const [now]         = useState(() => new Date());

  const [year,      setYear]      = useState(() => now.getFullYear());
  const [month,     setMonth]     = useState(() => now.getMonth());
  const [sel,       setSel]       = useState<number | null>(() => now.getDate());
  const [dayScores, setDayScores] = useState<Record<number, DayScore>>({});
  const [chartHash, setChartHash] = useState("");
  const [loading,   setLoading]   = useState(false);
  // Tracks which year-month has already had its sel auto-initialized
  const selInitRef = useRef<string | null>(null);

  // Auto-select first meaningful date when month changes
  useEffect(() => {
    const mk = `${year}-${month}`;
    if (selInitRef.current === mk) return;
    selInitRef.current = mk;
    const isCurrent = year === now.getFullYear() && month === now.getMonth();
    if (isCurrent) { setSel(now.getDate()); return; }
    const days = Object.keys(dayScores).map(Number);
    setSel(days.length > 0 ? Math.min(...days) : 1);
  }, [year, month, dayScores, now]);

  // Single shared month renderer — same path for April, May, June, every month
  const monthCats = useMemo(
    () => buildMonthCategories(year, month, dayScores, chartHash),
    [year, month, dayScores, chartHash],
  );
  const dateCats = (day: number): Category[] => monthCats[day] ?? [];

  const fetchMonth = useCallback(async (y: number, m: number) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/chart/month?year=${y}&month=${m + 1}`, { cache: "no-store" });
      if (r.ok) {
        const j = await r.json() as { success: boolean; days?: DayScore[]; chartHash?: string };
        if (j.success && j.days) {
          const map: Record<number, DayScore> = {};
          for (const d of j.days) map[d.day] = d;
          setDayScores(map);
          setChartHash(j.chartHash ?? "");
        }
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void fetchMonth(year, month); }, [year, month, fetchMonth]);

  function prev() {
    setDayScores({});
    setChartHash("");
    setSel(null);
    setMonth((m) => { if (m === 0) { setYear((y) => y - 1); return 11; } return m - 1; });
  }
  function next() {
    setDayScores({});
    setChartHash("");
    setSel(null);
    setMonth((m) => { if (m === 11) { setYear((y) => y + 1); return 0; } return m + 1; });
  }

  const cells  = buildCells(year, month);
  const selDow = sel !== null ? new Date(year, month, sel).getDay() : null;
  const selStr = sel !== null && selDow !== null
    ? `${WD_KO[selDow]}, ${month + 1}월 ${String(sel).padStart(2, "0")}일`
    : null;
  const selDs = sel !== null ? dayScores[sel] : undefined;
  // Both the grid cell and the detail block read from the SAME canonical stack.
  // Grid slices by gridIconCount; detail uses the full ordered list.
  const selDetailCats: Category[] = sel !== null ? (monthCats[sel] ?? []) : [];
  const selSummary = selDs ? daySummaryLabel(selDs) : null;

  return (
    <div className="cs-root cs-root--light">

      {/* ── Header ── */}
      <header className="cs-cal-hd">
        <button type="button" onClick={() => router.back()} className="cs-cal-hd-back">←</button>
        <div className="cs-cal-hd-nav">
          <button type="button" onClick={prev} className="cs-cal-hd-arr">‹</button>
          <span className="cs-cal-hd-month">{month + 1}월 {year}</span>
          <button type="button" onClick={next} className="cs-cal-hd-arr">›</button>
        </div>
        <button type="button" className="cs-cal-hd-icon" aria-label="설정">⚙</button>
      </header>

      <main className="cs-cal-main">

        {/* ── Weekday labels ── */}
        <div className="cs-cal-wkrow">
          {WD_KO.map((d, i) => (
            <span
              key={i}
              className={
                "cs-cal-wk" +
                (i === 0 ? " cs-cal-wk--sun" : i === 6 ? " cs-cal-wk--sat" : "")
              }
            >
              {d}
            </span>
          ))}
        </div>

        {/* ── Month grid ── */}
        <div
          className="cs-cal-grid"
          style={{ opacity: loading ? 0.45 : 1, transition: "opacity 0.18s" }}
        >
          {cells.map((day, i) => {
            if (day === null)
              return <span key={`e${i}`} className="cs-cal-cell cs-cal-cell--empty" />;

            const cats    = dateCats(day);
            const dow     = new Date(year, month, day).getDay();
            const isToday = day === now.getDate()
                         && month === now.getMonth()
                         && year  === now.getFullYear();
            const isSel   = day === sel;
            // Grid: score-driven density. Detail: full canonical stack.
            const cellCats = cats.slice(0, gridIconCount(cats, dayScores[day]?.score));

            return (
              <button
                key={day}
                type="button"
                onClick={() => setSel(day === sel ? null : day)}
                className={"cs-cal-cell" + (isSel ? " cs-cal-cell--sel" : "")}
              >
                <span
                  className={
                    "cs-cal-num" +
                    (isToday           ? " cs-cal-num--today" : "") +
                    (isSel && !isToday ? " cs-cal-num--sel"   : "") +
                    (dow === 0         ? " cs-cal-num--sun"   : "") +
                    (dow === 6         ? " cs-cal-num--sat"   : "")
                  }
                >
                  {day}
                </span>
                <span className="cs-cal-sym">
                  {cellCats.map((cat) => (
                    <span key={cat}>{CAT_ICON[cat]}</span>
                  ))}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Selected-day insight block — always visible ── */}
        <div className="cs-cal-report">
          <p className="cs-cal-report-date">{selStr ?? `${month + 1}월`}</p>
          {selSummary && (
            <div className="cs-cal-report-meta">
              <span className="cs-cal-energy-label">{selSummary.energy}</span>
              {selSummary.ctx && <span className="cs-cal-ctx-sep">·</span>}
              {selSummary.ctx && (
                <span className={"cs-cal-ctx-tag cs-cal-ctx-tag--" + getAspectCtx(selDs)}>
                  {selSummary.ctx}
                </span>
              )}
            </div>
          )}
          {selDetailCats.length > 0 ? (
            selDetailCats.map((cat, i) => {
              const { title, body } = pickInsightCopy(cat, sel!, selDetailCats, i, selDs);
              return (
                <div
                  key={cat}
                  className="cs-cal-report-item"
                  style={i > 0 ? { borderTop: "1px solid #e0dedb", paddingTop: "1.6rem" } : {}}
                >
                  <p className="cs-cal-report-headline">
                    <span className="cs-cal-report-ico">{CAT_ICON[cat]}</span>
                    {title}
                  </p>
                  <p className="cs-cal-report-body">{body}</p>
                </div>
              );
            })
          ) : loading ? (
            <p className="cs-cal-report-empty">분석 중…</p>
          ) : sel === null ? (
            <p className="cs-cal-report-empty">날짜를 선택하면<br />그날의 흐름이 보입니다.</p>
          ) : (
            <p className="cs-cal-report-empty">
              별 지도를 등록하면<br />이 날의 개인화 리딩이 표시됩니다.
            </p>
          )}
        </div>

        {/* ── Best days ── */}
        <div className="cs-cal-bd">
          <Link href="/best-days" className="cs-cal-bd-link">
            <span>베스트 데이 보기</span>
            <span className="cs-cal-bd-arrow">→</span>
          </Link>
        </div>

      </main>

      <BottomNav />
    </div>
  );
}
