"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter, usePathname } from "next/navigation";
import VoidPaywall from "@/components/paywall/VoidPaywall";
import { useVoidEligibility } from "../_context/VoidEligibilityContext";
import { createAnalysisRequestAction } from "../_actions/createAnalysisRequest";

export type CategoryKey = "self" | "love" | "work" | "social";
type ViewMode = "catalog" | "share";

interface CategoryConfig {
  label: string;
  icon: string;
  questions: string[];
}

const CATEGORY_CONFIG: Record<CategoryKey, CategoryConfig> = {
  self: {
    label: "나",
    icon: "✦",
    questions: [
      // Co-Star 번역
      "나는 지금 나 자신에게 솔직한가?",
      "어떻게 하면 더 나를 믿을 수 있을까?",
      "나는 어디에 속한 사람인가?",
      "나를 매력적으로 만드는 것은 무엇인가?",
      "지금 쉬어가야 할 시점인가?",
      "나는 지금 너무 애쓰고 있는 건 아닐까?",
      "내가 비이성적으로 반응하고 있는 건 아닐까?",
      "내 직감은 지금 무엇을 말하고 있나?",
      "지루함이 두려운 이유는 무엇인가?",
      // 루나 오리지널
      "지금 나에게 가장 필요한 힘은 무엇일까?",
      "내 감정의 근원을 알고 싶어요",
      "지금 내 안에서 가장 강한 욕구는?",
      "나를 멈추게 하는 것은 무엇인가요?",
      "이번 주 행동하기 좋은 시점은?",
      "내가 반복하는 패턴에서 벗어날 수 있을까?",
      "지금 나는 어디에 마음과 힘을 쓰고 있을까?",
      "나는 성장하고 있는가, 제자리인가?",
      "내 안의 두려움은 어디서 오는 걸까?",
      "지금 내가 원하는 것과 필요한 것이 다른가?",
      "나다운 선택을 하고 있는가?",
    ],
  },
  love: {
    label: "연애",
    icon: "♡",
    questions: [
      // Co-Star 번역
      "나는 그 사람이 아닌 그 사람의 이미지를 사랑하는 건 아닐까?",
      "나는 사랑받는 것이 두려운가?",
      "왜 나는 이렇게 강하게 끌리는 걸까?",
      "지금 내 마음을 고백해도 될까?",
      "나를 완전히 사로잡는 인연이 올까?",
      "우리는 함께 잘 맞는 사이인가?",
      "상대는 나를 매력적으로 느끼고 있을까?",
      "왜 다른 사람을 사랑하는 것이 이렇게 어려운가?",
      "돈과 사랑 중 무엇을 위해 결혼해야 할까?",
      // 루나 오리지널
      "지금 이 관계가 나에게 맞는 방향인가요?",
      "관계에서 내가 놓치고 있는 것은?",
      "이 감정이 진짜인지 알고 싶어요",
      "상대방이 원하는 것은 무엇인가요?",
      "이 관계에서 내가 더 많이 주고 있는가?",
      "이별 후 다시 시작할 수 있을까?",
      "나는 사랑받을 준비가 되어 있는가?",
      "지금 이 관계는 성장하고 있는가?",
      "내가 원하는 사랑의 형태는 무엇인가?",
      "이 감정을 놓아줘야 할 시점인가?",
      "우리 사이의 긴장감은 어디서 오는 걸까?",
    ],
  },
  work: {
    label: "일",
    icon: "▣",
    questions: [
      // Co-Star 번역
      "완전히 다른 일을 시작해도 될까?",
      "나는 어떻게 하면 인정받을 수 있을까?",
      "상사가 나를 싫어하는 건 아닐까?",
      "내 일은 나에게 의미를 주는가?",
      "성공하려면 일에 모든 것을 쏟아야 하는 걸까?",
      "동료들과 어울리는 것이 도움이 될까?",
      "지금 재정 계획이 필요한 시점인가?",
      "나는 정말 일이 싫은 걸까?",
      "더 열심히 해야 할 때인가?",
      "연봉 협상을 요청해도 될까?",
      // 루나 오리지널
      "이 결정을 지금 내려도 될까요?",
      "이 방향이 나에게 맞는 선택인가요?",
      "새로운 시작에 좋은 시점인가요?",
      "지금 내 커리어는 어느 방향으로 가고 있을까?",
      "협업 관계에서 주의해야 할 것은?",
      "지금의 직장을 계속 다녀야 할까?",
      "내 능력을 제대로 발휘하고 있는가?",
      "번아웃이 오고 있는 신호인가?",
      "이 프로젝트에 계속 투자해야 할까?",
      "나는 어떤 환경에서 가장 잘 일하는가?",
    ],
  },
  social: {
    label: "관계",
    icon: "◈",
    questions: [
      // Co-Star 번역
      "새로운 취미나 모임을 시작해야 할까?",
      "친구들과 함께 무언가를 만들어볼까?",
      "나는 약속을 너무 많이 잡는 편인가?",
      "SNS를 끊어야 할 시점인가?",
      "지금 말해야 할까, 침묵해야 할까?",
      "나는 주변에서 '쿨한 사람'으로 보일까?",
      "내가 항상 분위기를 챙기는 역할을 해야 하는 걸까?",
      "가장 친한 친구를 믿어도 될까?",
      "나는 친구로서 어떤 강점을 가지고 있나?",
      "나는 지금 내 친구들을 진심으로 좋아하는가?",
      // 루나 오리지널
      "지금 내 주변에서 중요한 사람은 누구인가요?",
      "갈등을 해결하기 좋은 시점인가요?",
      "이 모임이 나에게 도움이 될까요?",
      "소통에서 내가 더 신경 써야 할 것은?",
      "지금 내 주변 관계는 어떤 방향으로 흘러가고 있나요?",
      "이 관계에서 나는 소진되고 있는 걸까?",
      "새로운 사람을 만날 준비가 됐는가?",
      "나는 주변 사람들에게 좋은 영향을 주고 있는가?",
      "지금 거리를 둬야 할 관계가 있는가?",
      "내가 진정으로 연결되고 싶은 사람은 누구인가?",
    ],
  },
};

const CATEGORY_KEYS: CategoryKey[] = ["self", "love", "work", "social"];

/** Derives the active category from the current pathname. */
function catFromPath(path: string): CategoryKey {
  for (const k of CATEGORY_KEYS) {
    if (path === `/void/${k}`) return k;
  }
  return "self";
}

interface VoidScreenProps {
  defaultCategory?: CategoryKey;
}

function VoidSubmitButton({ canBuy, canSend }: { canBuy: boolean; canSend: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={`void-dock-buy${!canBuy || pending ? " void-dock-buy-off" : ""}`}
      aria-label={canSend ? "분석 실행" : "AI 해석 구매"}
      disabled={!canBuy || pending}
    >
      {pending ? "···" : canSend ? "보내기" : "구매"}
    </button>
  );
}

function VoidScreenContent({ category }: { category: CategoryKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const { chartAvailable, chartHash, canSend, isVip, voidCredits } = useVoidEligibility();

  const [selected, setSelected] = useState<number | null>(null);
  const [mode, setMode] = useState<ViewMode>("catalog");
  const [askValue, setAskValue] = useState("");
  const [questionType, setQuestionType] = useState<"preset" | "custom">("custom");
  const [showCreditPopup, setShowCreditPopup] = useState(false);

  const { questions, label } = CATEGORY_CONFIG[category];

  const askTrimmed = askValue.trim();
  const payload: string | null = askTrimmed || null;
  const canBuy = Boolean(payload);

  const handleCategoryChange = (cat: CategoryKey) => {
    // URL push drives the category state — no local setCategory needed
    router.push(`/void/${cat}`);
  };

  const handleClose = () => {
    if (mode === "share") {
      setMode("catalog");
    } else {
      router.push("/home");
    }
  };

  const handleBuy = () => {
    if (!canBuy || !payload) return;
    if (!canSend) {
      setShowCreditPopup(true);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (canSend) {
      window.sessionStorage.removeItem("void:auto-paywall-shown");
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const requestedPaywall = params.get("gate") === "no-credits" || params.get("paywall") === "1";
    const autoShown = window.sessionStorage.getItem("void:auto-paywall-shown") === "1";
    if (!requestedPaywall && autoShown) return;

    window.sessionStorage.setItem("void:auto-paywall-shown", "1");
    const timeoutId = window.setTimeout(() => {
      setShowCreditPopup(true);

      if (requestedPaywall) {
        router.replace(pathname);
      }
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [canSend, pathname, router]);

  const creditBadgeText = isVip && voidCredits === 0 ? "0" : String(voidCredits);
  const creditBadgeLabel = isVip
    ? `VIP 이번 달 잔여 VOID 크레딧 ${voidCredits}회`
    : `잔여 VOID 크레딧 ${voidCredits}회`;

  const handleQuestionSelect = (index: number) => {
    if (selected === index && questionType === "preset") {
      setSelected(null);
      setAskValue("");
      setQuestionType("custom");
      return;
    }

    const nextQuestion = questions[index];
    setSelected(index);
    setAskValue(nextQuestion);
    setQuestionType("preset");
  };

  const handleAskValueChange = (nextValue: string) => {
    setAskValue(nextValue);

    if (selected === null) {
      setQuestionType("custom");
      return;
    }

    const currentPreset = questions[selected];
    if (nextValue.trim() === currentPreset.trim()) {
      setQuestionType("preset");
      return;
    }

    setQuestionType("custom");
  };

  return (
    <div className="void-root">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/luna/assets/void/shooting-star.gif" alt="" className="void-bg-img" aria-hidden="true" />
      {/* TYPE B — white top strip (share/capture state) */}
      {mode === "share" && (
        <div className="void-share-strip">
          <span className="void-share-sys">LUNA — 별에게 묻다</span>
          <button
            type="button"
            className="void-share-close"
            onClick={handleClose}
            aria-label="공유 닫기"
          >
            ✕
          </button>
        </div>
      )}

      {/* Scrollable content canvas */}
      <div className="void-canvas">
        {/* TYPE A — header row: [close □] [LUNA / THE VOID] [badge ○] */}
        {mode === "catalog" && (
          <div className="void-header-row">
            <button
              type="button"
              className="void-close-btn"
              onClick={handleClose}
              aria-label="닫기"
            >
              ✕
            </button>
            <div className="void-header-center">
              <p className="void-system-line">LUNA</p>
              <h1 className="void-title">별에게 묻다</h1>
            </div>
            <button
              type="button"
              className="void-badge"
              onClick={() => router.push("/shop")}
              aria-label={creditBadgeLabel}
              title={creditBadgeLabel}
            >
              {creditBadgeText}
            </button>
          </div>
        )}

        {/* Category row — 4 items, active has thin white rectangular border */}
        <div className="void-cat-row" role="tablist" aria-label="질문 카테고리">
          {CATEGORY_KEYS.map((cat) => {
            const cfg = CATEGORY_CONFIG[cat];
            const active = category === cat;
            return (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={active}
                className={`void-cat-item${active ? " void-cat-item-active" : ""}`}
                onClick={() => handleCategoryChange(cat)}
              >
                <span className="void-cat-icon" aria-hidden="true">
                  {cfg.icon}
                </span>
                <span className="void-cat-label">{cfg.label}</span>
              </button>
            );
          })}
        </div>

        {/* Question list — centered, mono, underlined clickable text */}
        <ol className="void-question-list" aria-label={`${label} 질문 목록`}>
          {questions.map((q, i) => (
            <li key={i} className="void-question-item">
              <button
                type="button"
                className={`void-question-btn${selected === i ? " void-question-btn-active" : ""}`}
                onClick={() => handleQuestionSelect(i)}
                aria-pressed={selected === i}
              >
                {q}
              </button>
            </li>
          ))}
        </ol>
      </div>

      {/* Fixed bottom dock — ASK input | BUY */}
      {canSend ? (
        <form action={createAnalysisRequestAction} className="void-dock" aria-label="질문 입력 및 구매">
          <input type="hidden" name="category" value={category} />
          <input type="hidden" name="questionText" value={payload ?? ""} />
          <input type="hidden" name="questionType" value={questionType} />
          {chartHash ? <input type="hidden" name="chartHash" value={chartHash} /> : null}
          <div className="void-dock-ask">
            <input
              type="text"
              className="void-dock-input"
              value={askValue}
              onChange={(e) => handleAskValueChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !canBuy) e.preventDefault(); }}
              placeholder="무엇이든 물어보세요..."
              aria-label="직접 질문 입력"
            />
            {!chartAvailable && (
              <span className="void-dock-chart-notice">차트 연산 대기 중</span>
            )}
          </div>
          <VoidSubmitButton canBuy={canBuy} canSend={canSend} />
        </form>
      ) : (
        <div className="void-dock" role="group" aria-label="질문 입력 및 구매">
          <div className="void-dock-ask">
            <input
              type="text"
              className="void-dock-input"
              value={askValue}
              onChange={(e) => handleAskValueChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleBuy(); }}
              placeholder="무엇이든 물어보세요..."
              aria-label="직접 질문 입력"
            />
            {!chartAvailable && (
              <span className="void-dock-chart-notice">차트 연산 대기 중</span>
            )}
          </div>
          <button
            type="button"
            className={`void-dock-buy${!canBuy ? " void-dock-buy-off" : ""}`}
            aria-label="AI 해석 구매"
            disabled={!canBuy}
            onClick={handleBuy}
          >
            구매
          </button>
        </div>
      )}

      {showCreditPopup ? (
        <div className="void-credit-modal" role="dialog" aria-modal="true" aria-labelledby="void-credit-modal-title">
          <div className="void-credit-modal-backdrop" onClick={() => setShowCreditPopup(false)} />
          <div className="void-credit-modal-panel">
            <div className="void-credit-modal-copy">
              <p className="void-credit-modal-eyebrow">VOID</p>
              <h2 id="void-credit-modal-title" className="void-credit-modal-title">크레딧이 부족합니다</h2>
              <p className="void-credit-modal-description">원하는 상품을 선택해 주세요.</p>
            </div>
            <VoidPaywall
              remainingCredits={voidCredits}
              showVipUpsell={true}
              onDismiss={() => setShowCreditPopup(false)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function VoidScreen({ defaultCategory = "self" }: VoidScreenProps) {
  const pathname = usePathname();
  const category: CategoryKey = pathname === "/void" ? defaultCategory : catFromPath(pathname);

  return <VoidScreenContent key={category} category={category} />;
}
