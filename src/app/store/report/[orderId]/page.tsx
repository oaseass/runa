import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type React from "react";
import BackButton from "@/components/BackButton";
import BottomNav from "@/components/BottomNav";
import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/server/auth-session";
import { getOrder, setOrderReportJson } from "@/lib/server/order-store";
import { generateAreaReport } from "@/lib/server/area-report";
import { generateYearlyReport } from "@/lib/server/yearly-report";
import type { AreaReport, AreaSection } from "@/lib/server/area-report";
import type { YearlyReport, SeasonEntry } from "@/lib/server/yearly-report";

// ── Shared UI helpers ─────────────────────────────────────────────────────────

const TONE_LABEL: Record<string, string> = {
  strength: "조화", challenge: "긴장", neutral: "중립",
};

// ── Yearly report specific ────────────────────────────────────────────────────

const YR_TONE: Record<string, { label: string; cls: string }> = {
  strength: { label: "강함",  cls: "yr-tone-tag--strength" },
  neutral:  { label: "중립",  cls: "yr-tone-tag--neutral"  },
  challenge:{ label: "주의",  cls: "yr-tone-tag--challenge" },
};

const SEASON_INDEX: Record<string, string> = {
  spring: "01", summer: "02", autumn: "03", winter: "04",
};

const SEASON_SYMBOL: Record<string, string> = {
  spring: "◌", summer: "◉", autumn: "◕", winter: "○",
};

// ── Area report rendering ─────────────────────────────────────────────────────

function AreaSectionBlock({ s }: { s: AreaSection }) {
  return (
    <div className="sr-section">
      <div className="sr-section-header">
        <span className="sr-section-icon">{s.icon}</span>
        <span className="sr-section-label">{s.label}</span>
        <span className="sr-tone" data-tone={s.tone}>{TONE_LABEL[s.tone] ?? s.tone}</span>
      </div>
      <p className="sr-section-headline">{s.headline}</p>
      <p className="sr-section-body">{s.body}</p>
      <span className="sr-section-key">{s.keyInsight}</span>
    </div>
  );
}

function AreaReportView({ report }: { report: AreaReport }) {
  const date = new Date(report.generatedAt).toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
  });
  return (
    <article className="luna-article-wrap sr-wrap">
      <BackButton />

      <header className="sr-header">
        <p className="sr-kicker">영역 보고서</p>
        <h1 className="sr-title">관계 · 일 · 에너지 심층</h1>
        <p className="sr-date">{date}</p>
      </header>

      <div className="sr-intro-block">
        <p className="sr-intro">{report.intro}</p>
      </div>

      <div className="sr-rule" />

      {report.sections.map((s) => (
        <AreaSectionBlock key={s.key} s={s} />
      ))}

      <div className="sr-synthesis-block">
        <p className="sr-synthesis-label">종합</p>
        <p className="sr-synthesis">{report.synthesis}</p>
      </div>
    </article>
  );
}

// ── Yearly report rendering ───────────────────────────────────────────────────

function YearlySeasonBlock({ s, index }: { s: SeasonEntry; index: number }) {
  const tone = YR_TONE[s.tone] ?? YR_TONE.neutral;
  const num = SEASON_INDEX[s.season] ?? "0" + (index + 1);
  const sym = SEASON_SYMBOL[s.season] ?? "○";

  return (
    <section className="yr-season" style={{ animationDelay: `${index * 0.08}s` }}>
      <div className="yr-season-rule" aria-hidden="true" />

      <div className="yr-season-top">
        <div className="yr-season-id">
          <span className="yr-season-num" aria-hidden="true">{num}</span>
          <span className="yr-season-sym" aria-hidden="true">{sym}</span>
        </div>
        <div className="yr-season-labels">
          <span className="yr-season-name">{s.label}</span>
          <span className="yr-season-period">{s.period}</span>
        </div>
        <span className={`yr-tone-tag ${tone.cls}`}>{tone.label}</span>
      </div>

      <h2 className="yr-season-headline">{s.headline}</h2>
      <p className="yr-season-body">{s.lede}</p>
      <p className="yr-season-key">&ldquo;{s.keyPhrase}&rdquo;</p>
    </section>
  );
}

function YearlyReportView({ report }: { report: YearlyReport }) {
  const date = new Date(report.generatedAt).toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
  });
  const introLines = report.intro.split("\n").filter(Boolean);

  return (
    <div className="yr-root">
      <BackButton />

      {/* ── Hero ── */}
      <header className="yr-hero">
        <p className="yr-sys">LUNA · {report.year}</p>
        <h1 className="yr-title">{report.year} 전체 흐름</h1>
        <p className="yr-theme">{report.overallTheme}</p>
      </header>

      {/* ── Intro ── */}
      <div className="yr-intro-wrap">
        {introLines.map((line, i) => (
          <p key={i} className={i === 0 ? "yr-intro-meta" : "yr-intro-body"}>
            {line}
          </p>
        ))}
      </div>

      {/* ── Seasons ── */}
      <div className="yr-seasons">
        {report.seasons.map((s, i) => (
          <YearlySeasonBlock key={s.season} s={s} index={i} />
        ))}
      </div>

      {/* ── Finale ── */}
      <div className="yr-finale">
        <p className="yr-finale-label">올해의 문장</p>
        <p className="yr-finale-phrase">&ldquo;{report.yearKeyPhrase}&rdquo;</p>
        <p className="yr-finale-date">{date}</p>
      </div>
    </div>
  );
}

// ── Pending / error screens ───────────────────────────────────────────────────

function ErrorScreen() {
  return (
    <article className="luna-article-wrap sr-wrap">
      <BackButton />
      <div className="sr-state">
        <p className="sr-state-label">ERROR</p>
        <p className="sr-state-msg">
          보고서 생성 중 오류가 발생했습니다.
          출생 차트가 완성되어 있는지 확인하고 다시 시도해 주세요.
        </p>
        <Link href="/profile/chart" style={{ fontSize: "0.72rem", opacity: 0.55, display: "block", marginTop: "1rem" }}>
          → 차트 확인
        </Link>
      </div>
    </article>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function StoreReportPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;

  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const claims = verifySessionToken(token);
  if (!claims) redirect("/account-access");

  let order = getOrder(orderId);
  if (!order || order.userId !== claims.userId) notFound();
  if (order.status !== "paid") redirect("/store");

  const productId = order.productId;

  // Area report: always regenerate with today's transits (never static-cache).
  // Yearly report: generate once and persist (static for the purchased year).
  if (productId === "area" || !order.reportJson) {
    try {
      let reportJson: string | null = null;
      if (productId === "area") {
        const r = await generateAreaReport(claims.userId);
        if (r) reportJson = JSON.stringify(r);
      } else if (productId === "yearly") {
        const r = await generateYearlyReport(claims.userId);
        if (r) reportJson = JSON.stringify(r);
      }
      if (reportJson) {
        if (productId !== "area") {
          // Only persist yearly reports; area reports are always fresh
          setOrderReportJson(orderId, reportJson);
          order = getOrder(orderId)!;
        } else {
          // Inject the fresh area report without persisting
          order = { ...order, reportJson };
        }
      }
    } catch { /* fall through to error screen below */ }
  }

  if (!order.reportJson) {
    return (
      <main className="screen luna-article-screen">
        <ErrorScreen />
        <BottomNav />
      </main>
    );
  }

  let areaReport: AreaReport | null = null;
  let yearlyReport: YearlyReport | null = null;

  try {
    if (productId === "area") {
      areaReport = JSON.parse(order.reportJson) as AreaReport;
    }

    if (productId === "yearly") {
      yearlyReport = JSON.parse(order.reportJson) as YearlyReport;
    }
  } catch {
    return (
      <main className="screen luna-article-screen">
        <ErrorScreen />
        <BottomNav />
      </main>
    );
  }

  if (areaReport) {
    return (
      <main className="screen luna-article-screen">
        <AreaReportView report={areaReport} />
        <BottomNav />
      </main>
    );
  }

  if (yearlyReport) {
    return (
      <main className="screen">
        <YearlyReportView report={yearlyReport} />
        <BottomNav />
      </main>
    );
  }

  // Unknown product type
  notFound();
}
