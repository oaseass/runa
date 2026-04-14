import { notFound } from "next/navigation";
import Link from "next/link";
import BackButton from "@/components/BackButton";
import { getVoidEligibility } from "@/lib/server/void-eligibility";
import { getVoidAnalysisRequest } from "@/lib/server/void-store";
import { getOrderByAnalysisId } from "@/lib/server/order-store";
import {
  normalizeLegacyVoidAnalysisOutput,
  type VoidAnalysisOutput,
  type VoidDecision,
} from "@/lib/server/void-analysis";
import type { DecisionFactor } from "@/lib/server/void-decision";
import { refreshAnalysisAction } from "../../_actions/refreshAnalysisRequest";

const CATEGORY_LABELS: Record<string, string> = {
  self: "SELF",
  love: "LOVE",
  work: "WORK",
  social: "SOCIAL",
};

// ── Status state components ───────────────────────────────────────────────────

function PendingState({ backHref }: { backHref: string }) {
  return (
    <div className="vr-state">
      <p className="vr-state-label">GENERATING</p>
      <p className="vr-state-msg">
        별 지도와 현재 행성 배치를 기반으로 해석을 준비하고 있습니다.
        잠시 후 페이지를 새로 고침하면 결과가 표시됩니다.
      </p>
      <Link href={backHref} className="vr-back">← 카탈로그로 돌아가기</Link>
    </div>
  );
}

function FailedState({ backHref }: { backHref: string }) {
  return (
    <div className="vr-state">
      <p className="vr-state-label">FAILED</p>
      <p className="vr-state-msg">
        해석 생성 중 오류가 발생했습니다. 새 질문으로 다시 시도하거나,
        같은 질문을 다시 선택해 주세요.
      </p>
      <Link href={backHref} className="vr-back">← 다시 시도</Link>
    </div>
  );
}

function ChartMissingState() {
  return (
    <div className="vr-state">
      <p className="vr-state-label">CHART MISSING</p>
      <p className="vr-state-msg">
        별 지도 데이터를 확인할 수 없습니다.
        출생 정보를 완성한 후 다시 시도해 주세요.
      </p>
      <Link href="/profile/chart" className="vr-back">→ 차트 확인</Link>
    </div>
  );
}

// ── Decision maps ─────────────────────────────────────────────────────────────

const DECISION_SYMBOL: Record<string, string> = {
  GO: "↑", WAIT: "—", AVOID: "↓",
};

const DIRECTION_SYMBOL: Record<string, string> = {
  positive: "↑", negative: "↓", neutral: "—",
};

const TONE_KO: Record<string, string> = {
  strength: "조화", challenge: "긴장", neutral: "중립",
};

// ── Decision hero ─────────────────────────────────────────────────────────────

function DecisionHero({ decision }: { decision: VoidDecision }) {
  const symbol = DECISION_SYMBOL[decision.recommendation] ?? "—";
  // headline is always the direct answer from DIRECT_ANSWER_MAP
  const displayHeadline = decision.headline || decision.recommendation;

  return (
    <div className="vr-decision">
      <div className="vr-decision-tag">
        <span className="vr-decision-symbol">{symbol}</span>
        <span className="vr-decision-rec">{decision.recommendation}</span>
        {decision.answerTag && (
          <span className="vr-decision-answer-tag">{decision.answerTag}</span>
        )}
      </div>
      <p className="vr-decision-headline">{displayHeadline}</p>
      <p className="vr-decision-summary">{decision.summary}</p>
      <div className="vr-decision-meta">
        <span className="vr-decision-conf">신뢰도 {decision.confidence}%</span>
        {decision.factors[0] && (
          <span className="vr-decision-factor-hint">· {decision.factors[0].name}</span>
        )}
      </div>
    </div>
  );
}

// ── Factor list ───────────────────────────────────────────────────────────────

function FactorList({ factors }: { factors: DecisionFactor[] }) {
  if (!factors.length) return null;
  return (
    <div className="vr-factors">
      <p className="vr-section-label">주요 작용 인자</p>
      {factors.map((f, i) => (
        <div key={i} className="vr-factor-row">
          <span
            className="vr-factor-dir"
            data-dir={f.direction}
          >
            {DIRECTION_SYMBOL[f.direction]}
          </span>
          <div className="vr-factor-body">
            <div className="vr-factor-top">
              <span className="vr-factor-name">{f.name}</span>
              <span className="vr-factor-score">{f.score}</span>
            </div>
            <p className="vr-factor-note">{f.note}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Stale banner ──────────────────────────────────────────────────────────────

function StaleBanner({ requestId }: { requestId: string }) {
  const refresh = refreshAnalysisAction.bind(null, requestId);
  return (
    <div className="vr-stale">
      <form action={refresh}>
        <button type="submit" className="vr-stale-btn">다시 분석하기</button>
      </form>
    </div>
  );
}

// ── Analysis sections ─────────────────────────────────────────────────────────

function AnalysisSections({
  output,
  requestId,
  isStale,
  tone,
}: {
  output: VoidAnalysisOutput;
  requestId: string;
  isStale: boolean;
  tone: string;
}) {
  return (
    <>
      {isStale && <StaleBanner requestId={requestId} />}
      <DecisionHero decision={output.decision} />
      {output.decision?.factors?.length > 0 && (
        <FactorList factors={output.decision.factors} />
      )}
      <div className="vr-tone-badge" data-tone={tone}>
        {TONE_KO[tone] ?? tone}
      </div>
      {output.sections.map((section) => (
        <div key={section.title} className="vr-section">
          <p className="vr-section-label">{section.title}</p>
          <p className="vr-section-body">{section.body}</p>
          <span className="vr-section-key">{section.keyLine}</span>
        </div>
      ))}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function VoidResultByIdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const eligibility = await getVoidEligibility();
  if (
    eligibility.status === "unauthenticated" ||
    eligibility.status === "incomplete-birth-data"
  ) {
    notFound();
  }

  const request = getVoidAnalysisRequest(id, eligibility.userId);
  if (!request) notFound();

  const linkedOrder = getOrderByAnalysisId(id, eligibility.userId);
  if (linkedOrder && linkedOrder.status !== "paid") {
    notFound();
  }

  const catLabel = CATEGORY_LABELS[request.category] ?? request.category.toUpperCase();
  const backHref = `/void/${request.category}`;

  let analysisOutput: VoidAnalysisOutput | null = null;
  if (request.status === "complete" && request.analysisJson) {
    try {
      analysisOutput = normalizeLegacyVoidAnalysisOutput(
        JSON.parse(request.analysisJson) as VoidAnalysisOutput,
      );
    } catch {
      // corrupt JSON — treat as failed
    }
  }

  const isGenerating = request.status === "generating" || request.status === "pending";
  const isFailed = request.status === "failed" || (request.status === "complete" && !analysisOutput);
  const isChartMissing = request.status === "chart_missing";
  const isComplete = request.status === "complete" && analysisOutput !== null;
  const isStale = !((analysisOutput?.decision as (VoidDecision & { headline?: string }) | undefined)?.headline);

  const createdDate = new Date(request.createdAt).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="void-root">
      <div className="void-canvas vr-canvas">

        {/* ── Header ── */}
        <div className="vr-nav">
          <BackButton className="vr-back" />
          <span className="vr-date">{createdDate}</span>
        </div>

        {/* ── Brand + intent stack ── */}
        <p className="vr-system">LUNA · 별에게 묻다</p>
        <p className="vr-question-type">
          {request.questionType === "custom" ? "직접 입력" : catLabel}
        </p>

        {/* ── Question ── */}
        <div className="vr-question-wrap">
          <p className="vr-question">{request.questionText}</p>
        </div>

        <div className="vr-rule" />

        {/* ── Status-gated content ── */}
        {isComplete && analysisOutput && (
          <AnalysisSections
            output={analysisOutput}
            requestId={id}
            isStale={isStale}
            tone={analysisOutput.tone}
          />
        )}
        {isGenerating && <PendingState backHref={backHref} />}
        {isFailed && <FailedState backHref={backHref} />}
        {isChartMissing && <ChartMissingState />}

        {/* ── CTA ── */}
        {isComplete && (
          <div className="vr-cta-wrap">
            <Link href={backHref} className="vr-cta">← 다른 질문 선택하기</Link>
          </div>
        )}
      </div>

      {/* ── Dock ── */}
      <div className="void-dock">
        <div className="void-dock-ask">
          <span className="void-co-dock-label">LUNA · {catLabel}</span>
        </div>
        <Link
          href={backHref}
          className="void-dock-buy void-dock-buy-off"
          aria-label="카탈로그로 돌아가기"
        >
          ← 목록
        </Link>
      </div>
    </div>
  );
}
