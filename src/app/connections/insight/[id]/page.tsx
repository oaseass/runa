import { notFound } from "next/navigation";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import BackButton from "@/components/BackButton";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/server/auth-session";
import { getConnection, getCachedSynastry, saveSynastry } from "@/lib/server/connection-store";
import { getNatalChartForUser } from "@/lib/server/chart-runtime";
import { computeSynastry } from "@/lib/astrology/synastry";
import { SIGN_KO, PLANET_KO } from "@/lib/astrology/interpret";
import type { NatalChart } from "@/lib/astrology/types";
import type { SynastryAnalysis, CrossAspect, SynastryCategory } from "@/lib/astrology/synastry";

// ── Aspect display ────────────────────────────────────────────────────────────

const ASPECT_KO: Record<string, string> = {
  conjunction: "합",
  sextile:     "육분",
  square:      "긴장",
  trine:       "조화",
  opposition:  "대립",
};

const TONE_SYMBOL: Record<string, string> = {
  harmony: "↑",
  tension: "↓",
  neutral: "—",
};

const TONE_COLOR: Record<string, string> = {
  harmony: "rgba(255,255,255,0.52)",
  tension: "rgba(255,160,80,0.62)",
  neutral: "rgba(255,255,255,0.24)",
};

// ── Score bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ score, tone }: { score: number; tone: string }) {
  const barColor =
    tone === "strength" || tone === "harmony"
      ? "rgba(255,255,255,0.52)"
      : tone === "challenge" || tone === "tension"
      ? "rgba(255,160,80,0.5)"
      : "rgba(255,255,255,0.28)";

  return (
    <div className="luna-synastry-bar-wrap">
      <div
        className="luna-synastry-bar-fill"
        style={{ width: `${score}%`, background: barColor }}
      />
    </div>
  );
}

// ── Category block ────────────────────────────────────────────────────────────

function CategoryBlock({ cat }: { cat: SynastryCategory }) {
  const toneCss =
    cat.tone === "strength" ? "luna-synastry-cat-strength" :
    cat.tone === "challenge" ? "luna-synastry-cat-challenge" :
    "luna-synastry-cat-neutral";

  return (
    <div className="luna-synastry-cat">
      <div className="luna-synastry-cat-header">
        <span className={`luna-synastry-cat-label ${toneCss}`}>{cat.label}</span>
        <span className="luna-synastry-cat-score">{cat.score}</span>
      </div>
      <ScoreBar score={cat.score} tone={cat.tone} />
      <p className="luna-synastry-cat-headline">{cat.headline}</p>
      <p className="luna-synastry-cat-body">{cat.body}</p>
      {cat.topAspect && (
        <div className="luna-synastry-cat-aspect">
          <span
            style={{
              fontSize: "0.62rem",
              color: TONE_COLOR[cat.topAspect.tone],
              marginRight: "0.45rem",
            }}
          >
            {TONE_SYMBOL[cat.topAspect.tone]}
          </span>
          <span style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.38)" }}>
            {PLANET_KO[cat.topAspect.planetA] ?? cat.topAspect.planetA}
            {" — "}
            {PLANET_KO[cat.topAspect.planetB] ?? cat.topAspect.planetB}
            {" "}
            {ASPECT_KO[cat.topAspect.aspect] ?? cat.topAspect.aspect}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Aspect list ───────────────────────────────────────────────────────────────

function AspectRow({ aspect }: { aspect: CrossAspect }) {
  return (
    <div className="luna-synastry-aspect-row">
      <span
        className="luna-synastry-aspect-tone"
        style={{ color: TONE_COLOR[aspect.tone] }}
      >
        {TONE_SYMBOL[aspect.tone]}
      </span>
      <div className="luna-synastry-aspect-content">
        <div className="luna-synastry-aspect-header">
          <span className="luna-synastry-aspect-planets">
            {PLANET_KO[aspect.planetA] ?? aspect.planetA}
            {" × "}
            {PLANET_KO[aspect.planetB] ?? aspect.planetB}
          </span>
          <span className="luna-synastry-aspect-type">
            {ASPECT_KO[aspect.aspect] ?? aspect.aspect}
            {" "}
            <span style={{ color: "rgba(255,255,255,0.22)" }}>
              {aspect.orb.toFixed(1)}°
            </span>
          </span>
        </div>
        <p className="luna-synastry-aspect-note">{aspect.note}</p>
      </div>
    </div>
  );
}

// ── Overall score display ─────────────────────────────────────────────────────

function OverallScore({ score, tone }: { score: number; tone: string }) {
  const label =
    score >= 70 ? "높은 공명" :
    score >= 55 ? "균형 잡힌 구조" :
    score >= 40 ? "이해가 필요한 관계" :
    "도전적인 구조";

  const color =
    tone === "strength" ? "rgba(255,255,255,0.8)" :
    tone === "challenge" ? "rgba(255,160,80,0.8)" :
    "rgba(255,255,255,0.55)";

  return (
    <div className="luna-synastry-overall">
      <span className="luna-synastry-overall-score" style={{ color }}>
        {score}
      </span>
      <span className="luna-synastry-overall-label">{label}</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ConnectionInsightPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Auth
  const cookieStore = await cookies();
  const token = cookieStore.get("luna_auth")?.value;
  if (!token) notFound();
  const claims = verifySessionToken(token);
  if (!claims) notFound();

  const { userId, username } = claims;

  // Load connection (ownership check)
  const connection = getConnection(id, userId);
  if (!connection) notFound();

  // Load owner chart
  const ownerChart = await getNatalChartForUser(userId);
  if (!ownerChart) {
    return (
      <main className="screen luna-article-screen" aria-label="Connection insight">
        <article className="luna-article-wrap">
          <BackButton />
          <div style={{ marginTop: "3rem" }}>
            <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.38)", letterSpacing: "0.1em" }}>
              내 별 지도가 준비되지 않았습니다.
            </p>
            <Link
              href="/birth-time?edit=1"
              style={{
                display: "inline-block",
                marginTop: "1rem",
                fontSize: "0.75rem",
                color: "rgba(255,255,255,0.55)",
                textDecoration: "underline",
              }}
            >
              출생 정보 입력하기
            </Link>
          </div>
        </article>
      </main>
    );
  }

  // Parse connection chart
  if (!connection.chartJson) {
    return (
      <main className="screen luna-article-screen" aria-label="Connection insight">
        <article className="luna-article-wrap">
          <BackButton />
          <p className="luna-article-kicker">관계 해석</p>
          <h1 className="luna-article-headline">{connection.name}의 차트를 불러올 수 없습니다.</h1>
          <p className="luna-article-lede">
            출생 정보를 다시 입력해 주세요.
          </p>
          <Link href="/connections/add" className="luna-secondary-link" style={{ marginTop: "2rem", display: "inline-block" }}>
            다시 연결하기
          </Link>
        </article>
      </main>
    );
  }

  let connectionChart: NatalChart;
  try {
    connectionChart = JSON.parse(connection.chartJson) as NatalChart;
  } catch {
    notFound();
  }

  // Get or compute synastry
  const ownerChartHash = ownerChart.chartHash ?? "";
  let analysis: SynastryAnalysis | null = getCachedSynastry(userId, id, ownerChartHash);

  if (!analysis) {
    analysis = computeSynastry(ownerChart, connectionChart, connection.timeKnown);
    if (ownerChartHash) {
      saveSynastry(userId, id, ownerChartHash, analysis);
    }
  }

  // Display data
  const ownerSunKo  = SIGN_KO[analysis.personASign.sun]  ?? analysis.personASign.sun;
  const connSunKo   = SIGN_KO[analysis.personBSign.sun]  ?? analysis.personBSign.sun;
  const ownerMoonKo = SIGN_KO[analysis.personASign.moon] ?? analysis.personASign.moon;
  const connMoonKo  = SIGN_KO[analysis.personBSign.moon] ?? analysis.personBSign.moon;

  const signPair = `${ownerSunKo} × ${connSunKo}`;

  // Top 6 cross-aspects for display
  const topAspects = analysis.crossAspects.slice(0, 6);

  const generatedDate = new Date(analysis.generatedAt).toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
  });

  return (
    <main className="screen luna-article-screen" aria-label="Connection insight reading">
      <article className="luna-article-wrap">
        <BackButton />

        {/* Co-Star style friend banner */}
        <div className="cs-friend-banner">
          <div className="cs-friend-banner-inner">
            <span className="cs-friend-banner-label">관계 해석</span>
            <div className="cs-friend-banner-names">
              <span className="cs-friend-banner-you">{username}</span>
              <span className="cs-friend-banner-x">×</span>
              <span className="cs-friend-banner-them">{connection.name}</span>
            </div>
            <p className="cs-friend-banner-signs">{signPair}</p>
          </div>
        </div>

        {/* Header */}
        <header>
          <p className="luna-article-kicker">관계 해석</p>
          <h1 className="luna-article-headline">{analysis.keyPhrase}</h1>
          <p className="luna-article-lede">{analysis.synthesis}</p>
        </header>

        {/* Sign overview */}
        <div className="luna-synastry-signs">
          <div className="luna-synastry-sign-col">
            <span className="luna-synastry-sign-name">{username}</span>
            <span className="luna-synastry-sign-val">
              ☀ {ownerSunKo}
            </span>
            <span className="luna-synastry-sign-val">
              ☽ {ownerMoonKo}
            </span>
            {analysis.personASign.asc && (
              <span className="luna-synastry-sign-val">
                ASC {SIGN_KO[analysis.personASign.asc] ?? analysis.personASign.asc}
              </span>
            )}
          </div>
          <span className="luna-synastry-sign-cross">×</span>
          <div className="luna-synastry-sign-col luna-synastry-sign-col-right">
            <span className="luna-synastry-sign-name">{connection.name}</span>
            <span className="luna-synastry-sign-val">
              ☀ {connSunKo}
            </span>
            <span className="luna-synastry-sign-val">
              ☽ {connMoonKo}
            </span>
            {analysis.personBSign.asc ? (
              <span className="luna-synastry-sign-val">
                ASC {SIGN_KO[analysis.personBSign.asc] ?? analysis.personBSign.asc}
              </span>
            ) : (
              <span className="luna-synastry-sign-val" style={{ opacity: 0.3 }}>
                시간 미상
              </span>
            )}
          </div>
        </div>

        {/* Overall score */}
        <section className="luna-article-section" aria-label="Overall compatibility">
          <h2 className="luna-article-section-title">관계의 전체 구조</h2>
          <OverallScore score={analysis.overallScore} tone={analysis.overallTone} />
        </section>

        {/* Categories */}
        <section className="luna-article-section" aria-label="Category scores">
          <h2 className="luna-article-section-title">영역별 분석</h2>
          <div className="luna-synastry-cats">
            <CategoryBlock cat={analysis.resonance} />
            <CategoryBlock cat={analysis.communication} />
            <CategoryBlock cat={analysis.tension} />
            <CategoryBlock cat={analysis.growth} />
          </div>
        </section>

        {/* Top cross-aspects */}
        {topAspects.length > 0 && (
          <section className="luna-article-section" aria-label="Cross aspects">
            <h2 className="luna-article-section-title">주요 크로스 각</h2>
            <div className="luna-synastry-aspects">
              {topAspects.map((asp, i) => (
                <AspectRow key={i} aspect={asp} />
              ))}
            </div>
          </section>
        )}

        {/* Time unknown notice */}
        {!connection.timeKnown && (
          <p
            style={{
              fontSize: "0.65rem",
              color: "rgba(255,255,255,0.24)",
              letterSpacing: "0.06em",
              marginTop: "0.5rem",
              marginBottom: "1.5rem",
            }}
          >
            * {connection.name}의 출생 시간이 입력되지 않아 탄생점과 영역 배치는
            계산에서 제외됩니다. 달의 위치는 정오 기준 추정값입니다.
          </p>
        )}

        {/* Footer */}
        <div
          style={{
            marginTop: "2.4rem",
            paddingTop: "1.2rem",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: "0.62rem", color: "rgba(255,255,255,0.22)", letterSpacing: "0.08em" }}>
            {generatedDate} 생성
          </span>
          <Link href="/connections/add" className="luna-secondary-link" style={{ fontSize: "0.7rem" }}>
            새 연결 추가
          </Link>
        </div>

        <BottomNav />
      </article>
    </main>
  );
}
