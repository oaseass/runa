import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import BackButton from "@/components/BackButton";
import { getVoidEligibility } from "@/lib/server/void-eligibility";
import {
  generateVoidAnalysis,
  normalizeLegacyVoidAnalysisOutput,
  type VoidAnalysisOutput,
} from "@/lib/server/void-analysis";
import type { CategoryKey } from "@/app/void/types";

const CATEGORY_LABELS: Record<string, string> = {
  self: "SELF",
  love: "LOVE",
  work: "WORK",
  social: "SOCIAL",
};

const TONE_KO: Record<string, string> = {
  strength: "조화",
  challenge: "긴장",
  neutral: "중립",
};

const DECISION_SYMBOL: Record<string, string> = {
  GO: "↑",
  WAIT: "—",
  AVOID: "↓",
};

function TemporaryResultView({
  output,
  category,
  questionText,
  questionType,
}: {
  output: VoidAnalysisOutput;
  category: CategoryKey;
  questionText: string;
  questionType: "preset" | "custom";
}) {
  const catLabel = CATEGORY_LABELS[category] ?? category.toUpperCase();
  const backHref = `/void/${category}`;
  const symbol = DECISION_SYMBOL[output.decision.recommendation] ?? "—";

  return (
    <div className="void-root">
      <div className="void-canvas vr-canvas">
        <div className="vr-nav">
          <BackButton className="vr-back" />
          <span className="vr-date">결과</span>
        </div>

        <p className="vr-system">LUNA · 별에게 묻다</p>
        <p className="vr-question-type">{questionType === "custom" ? "직접 입력" : catLabel}</p>

        <div className="vr-question-wrap">
          <p className="vr-question">{questionText}</p>
        </div>

        <div className="vr-rule" />

        <div className="vr-decision">
          <div className="vr-decision-tag">
            <span className="vr-decision-symbol">{symbol}</span>
            <span className="vr-decision-rec">{output.decision.recommendation}</span>
            {output.decision.answerTag ? (
              <span className="vr-decision-answer-tag">{output.decision.answerTag}</span>
            ) : null}
          </div>
          <p className="vr-decision-headline">{output.decision.headline || output.decision.recommendation}</p>
          <p className="vr-decision-summary">{output.decision.summary}</p>
        </div>

        <div className="vr-tone-badge" data-tone={output.tone}>
          {TONE_KO[output.tone] ?? output.tone}
        </div>

        {output.sections.map((section) => (
          <div key={section.title} className="vr-section">
            <p className="vr-section-label">{section.title}</p>
            <p className="vr-section-body">{section.body}</p>
            <span className="vr-section-key">{section.keyLine}</span>
          </div>
        ))}

        <div className="vr-cta-wrap">
          <Link href={backHref} className="vr-cta">← 다른 질문 선택하기</Link>
        </div>
      </div>
    </div>
  );
}

/**
 * /void/result (no ID) is a legacy route from before the durable
 * /void/result/[id] flow was added. All analysis requests now go through
 * /void/checkout → createAnalysisRequestAction → /void/result/[id].
 * Redirect to the void entry so the user can start a fresh question.
 */
export default async function VoidResultLegacyPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; q?: string; type?: string }>;
}) {
  const params = await searchParams;
  const rawCategory = params.cat;
  const rawQuestion = params.q?.trim();
  const rawType = params.type;

  if (!rawCategory || !rawQuestion) {
    redirect("/void");
  }

  if (!["self", "love", "work", "social"].includes(rawCategory)) {
    notFound();
  }

  const eligibility = await getVoidEligibility();
  if (
    eligibility.status === "unauthenticated" ||
    eligibility.status === "incomplete-birth-data" ||
    eligibility.status === "chart-pending"
  ) {
    redirect("/void");
  }

  const output = await generateVoidAnalysis(
    eligibility.userId,
    rawCategory as CategoryKey,
    rawQuestion,
  );

  if (!output) {
    notFound();
  }

  const normalizedOutput = normalizeLegacyVoidAnalysisOutput(output);

  return (
    <TemporaryResultView
      output={normalizedOutput}
      category={rawCategory as CategoryKey}
      questionText={rawQuestion}
      questionType={rawType === "custom" ? "custom" : "preset"}
    />
  );
}
