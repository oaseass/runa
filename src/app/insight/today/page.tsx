import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import BottomNav from "@/components/BottomNav";
import BackButton from "@/components/BackButton";
import { devPurchaseAction } from "@/app/store/_actions/devPurchaseAction";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/server/auth-session";
import { getDateInterpretation, getDomainReadingsByDate, getTransitChartData } from "@/lib/server/chart-store";
import type { TransitInterpretation, DomainReading } from "@/lib/astrology/types";
import FeedbackRow from "./_components/FeedbackRow";
import NoteField from "./_components/NoteField";
import TransitChartViz from "./_components/TransitChartViz";

// ── Navigation config ─────────────────────────────────────────────────────────

const TOP_TABS = [
  { label: "오늘", href: "/insight/today", active: true },
  { label: "차트", href: "/profile/chart" },
  { label: "나", href: "/settings" },
];

// ── Date strip helpers (server-side) ────────────────────────────────────────

const KO_DAYS_SUN = ["일", "월", "화", "수", "목", "금", "토"] as const;

function toIsoDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDisplayDate(d: Date): string {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function parseSelectedDate(dateParam: string | undefined): Date {
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    const [y, m, day] = dateParam.split("-").map(Number);
    return new Date(y, m - 1, day);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function buildDateStrip(selected: Date) {
  const today = new Date();
  const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayStr = toIsoDateString(todayNorm);
  const selectedStr = toIsoDateString(selected);

  return ([-2, -1, 0, 1, 2] as const).map((offset) => {
    const d = new Date(todayNorm);
    d.setDate(d.getDate() + offset);
    const dayStr = toIsoDateString(d);
    const isThisSlotToday = dayStr === todayStr;
    return {
      label: KO_DAYS_SUN[d.getDay()],
      date: d.getDate(),
      isSelected: dayStr === selectedStr,
      isToday: isThisSlotToday,
      href: isThisSlotToday ? `/insight/today` : `/insight/today/${dayStr}`,
    };
  });
}

// ── No-data fallback ──────────────────────────────────────────────────────────

function NoDataState() {
  return (
    <main className="screen luna-editorial-screen" aria-label="Daily reading">
      <div className="luna-dr-wrap">
        <p className="luna-dr-system-line">LUNA · 출생 데이터 필요</p>
        <nav className="luna-dr-tabs" aria-label="Section navigation">
          {TOP_TABS.map((tab) => (
            <Link
              key={tab.label}
              href={tab.href}
              className={tab.active ? "luna-dr-tab luna-dr-tab-active" : "luna-dr-tab"}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        <header className="luna-dr-header">
          <p className="luna-block-kicker">데이터 없음</p>
          <h1 className="luna-editorial-headline">
            오늘의 흐름을 보려면 출생 데이터가 필요합니다.
          </h1>
          <p className="luna-editorial-support">
            생년월일, 출생 시간, 출생지를 입력해야 차트를 계산할 수 있습니다.
          </p>
        </header>
        <Link href="/birth-time" className="luna-black-cta">
          출생 데이터 입력하기
        </Link>
        <BottomNav />
      </div>
    </main>
  );
}

export async function renderInsightTodayPage(dateParam?: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);

  if (!session) return <NoDataState />;

  const selectedDate = parseSelectedDate(dateParam);
  // Use noon to avoid DST edge cases in transit calculations
  const reportDate = new Date(
    selectedDate.getFullYear(),
    selectedDate.getMonth(),
    selectedDate.getDate(),
    12,
    0,
    0,
  );

  const interp: TransitInterpretation | null = getDateInterpretation(session.userId, reportDate);
  if (!interp) return <NoDataState />;

  const chartData = getTransitChartData(session.userId, reportDate);
  const domains: DomainReading[] = getDomainReadingsByDate(session.userId, reportDate) ?? [];
  const strengthDomains = domains.filter((d) => d.tone !== "challenge");
  const challengeDomains = domains.filter((d) => d.tone === "challenge");

  const today = new Date();
  const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const isToday = toIsoDateString(selectedDate) === toIsoDateString(todayNorm);
  const isPast = selectedDate < todayNorm;
  const dateStrip = buildDateStrip(selectedDate);
  const displayDate = formatDisplayDate(selectedDate);
  const shortDateLabel = isToday
    ? "오늘"
    : `${selectedDate.getMonth() + 1}.${selectedDate.getDate()}`;
  const dateSuffix = isToday ? "" : isPast ? " · 과거" : " · 예측";

  return (
    <main className="screen luna-editorial-screen" aria-label="Daily reading">
      <div className="luna-dr-wrap">

        <BackButton />

        {/* ── 1. Micro system line ── */}
        <p className="luna-dr-system-line" aria-hidden="true">
          LUNA · {displayDate}{dateSuffix}
        </p>

        {/* ── 2. Top section tabs ── */}
        <nav className="luna-dr-tabs" aria-label="Section navigation">
          {TOP_TABS.map((tab) => (
            <Link
              key={tab.label}
              href={tab.href}
              className={tab.active ? "luna-dr-tab luna-dr-tab-active" : "luna-dr-tab"}
              aria-current={tab.active ? "page" : undefined}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        {/* ── 3. Date strip — 5 slots, selected date centered ── */}
        <div className="luna-dr-datestrip" role="group" aria-label="날짜 선택">
          {dateStrip.map((day) => (
            <Link
              key={day.href}
              href={day.href}
              className={day.isSelected ? "luna-dr-day luna-dr-day-active" : "luna-dr-day"}
              style={{ textDecoration: "none", color: "inherit" }}
              aria-current={day.isSelected ? "date" : undefined}
            >
              <span className="luna-dr-day-label">{day.label}</span>
              {day.isSelected ? (
                <span className="luna-dr-day-circle">{day.date}</span>
              ) : (
                <span
                  className="luna-dr-day-num"
                  style={day.isToday ? { color: "rgba(20,21,22,0.65)", fontWeight: 540 } : undefined}
                >
                  {day.date}
                </span>
              )}
              {day.isToday && !day.isSelected && (
                <span className="luna-dr-day-today-dot" aria-hidden="true" />
              )}
            </Link>
          ))}
        </div>

        {/* ── 4. Main thesis headline ── */}
        <header className="luna-dr-header">
          <h1 className="luna-editorial-headline">{interp.headline}</h1>
          <p className="luna-editorial-support">{interp.lede}</p>
        </header>

        {/* ── 5. Today summary block ── */}
        <div className="luna-dr-summary-card" aria-label="오늘 요약">
          <p className="luna-block-kicker" style={{ marginBottom: "0.6rem" }}>
            {shortDateLabel} 요약
          </p>
          <div className="luna-dr-summary-row">
            <span className="luna-dr-summary-icon" aria-hidden="true">▲</span>
            <span className="luna-dr-summary-domain">{interp.section1.title}</span>
            <span className="luna-dr-summary-note">
              {interp.section1.body.length > 36
                ? interp.section1.body.slice(0, 36) + "…"
                : interp.section1.body}
            </span>
          </div>
          <div className="luna-dr-summary-row">
            <span className="luna-dr-summary-icon luna-dr-summary-icon-dim" aria-hidden="true">
              ▽
            </span>
            <span className="luna-dr-summary-domain">{interp.section2.title}</span>
            <span className="luna-dr-summary-note">
              {interp.section2.body.length > 36
                ? interp.section2.body.slice(0, 36) + "…"
                : interp.section2.body}
            </span>
          </div>
        </div>

        {/* ── 5b. Transit chart visualisation ── */}
        {chartData && (
          <div style={{ margin: "0.6rem 0 0.4rem" }}>
            <p
              style={{
                fontSize: "0.58rem",
                letterSpacing: "0.13em",
                opacity: 0.35,
                marginBottom: "0.5rem",
              }}
            >
              흐름 차트
            </p>
            <TransitChartViz data={chartData} />
          </div>
        )}

        {/* ── 6a. Section 1 — artwork right ── */}
        <div className="luna-dr-art-float-right" aria-hidden="true">
          <Image
            src="/luna/assets/costar/transit/animated_transit_edu_orbit_animation.webp"
            alt=""
            width={96}
            height={96}
            unoptimized
            style={{
              width: "4rem",
              height: "4rem",
              objectFit: "contain",
              opacity: 0.5,
              animation: "lunaFloatSlow 9.6s ease-in-out infinite",
            }}
          />
        </div>

        <section className="luna-dr-section" aria-label={interp.section1.title}>
          <h2 className="luna-dr-section-title">{interp.section1.title}</h2>
          <p className="luna-article-body">{interp.section1.body}</p>
        </section>

        {/* ── 6b. Section 2 — artwork left ── */}
        <div className="luna-dr-art-float-left" aria-hidden="true">
          <Image
            src="/luna/assets/costar/cutouts/animated_cutout_04.webp"
            alt=""
            width={72}
            height={72}
            unoptimized
            style={{
              width: "3rem",
              height: "3rem",
              objectFit: "contain",
              opacity: 0.4,
              animation: "lunaFloatSlow 11s ease-in-out infinite",
            }}
          />
        </div>

        <section className="luna-dr-section" aria-label={interp.section2.title}>
          <h2 className="luna-dr-section-title">{interp.section2.title}</h2>
          <p className="luna-article-body">{interp.section2.body}</p>
        </section>

        <div className="luna-article-pullquote" aria-label="오늘의 문장">
          <p className="luna-article-pullquote-kicker">{interp.keyPhraseKicker}</p>
          <p className="luna-article-pullquote-text">{interp.keyPhrase}</p>
        </div>

        <FeedbackRow />

        <div className="luna-dr-premium-card" role="complementary" aria-label="관계 리포트 프로모션">
          <div>
            <p className="luna-block-kicker" style={{ marginBottom: "0.28rem" }}>
              관계 리포트
            </p>
            <p
              style={{
                margin: 0,
                fontSize: "0.9rem",
                lineHeight: 1.42,
                fontWeight: 420,
                color: "rgba(20,21,22,0.8)",
                wordBreak: "keep-all",
              }}
            >
              지금 함께하는 사람과의 에너지 흐름을 차트로 읽어드립니다.
            </p>
          </div>
          <Link href="/connections" className="luna-dr-premium-cta" aria-label="관계 리포트 보기">
            →
          </Link>
        </div>

        <NoteField />

        <div className="luna-dr-art-editorial" aria-hidden="true">
          <Image
            src="/luna/assets/costar/bg/bg_galaxy.png"
            alt=""
            width={280}
            height={280}
            style={{
              width: "min(100%, 12.5rem)",
              height: "auto",
              borderRadius: "999px",
              objectFit: "cover",
              opacity: 0.38,
              filter: "grayscale(1)",
              animation: "lunaFloatSlow 14s ease-in-out infinite",
            }}
          />
        </div>

        {strengthDomains.length > 0 && (
          <section className="luna-dr-domain-group" aria-label="강점 영역 오늘 흐름">
            <div className="luna-dr-domain-group-header">
              <p className="luna-block-kicker" style={{ margin: 0 }}>
                강점 흐름
              </p>
              <span className="luna-dr-domain-group-badge luna-dr-badge-strength">{shortDateLabel}</span>
            </div>
            {strengthDomains.map((d) => (
              <div key={d.domain} className="luna-dr-domain-item">
                <div className="luna-dr-domain-item-row">
                  <span className="luna-dr-domain-label">{d.domain}</span>
                  <p className="luna-dr-domain-headline">{d.headline}</p>
                </div>
                <p className="luna-dr-domain-note">{d.note}</p>
                <Link href="/profile/chart" className="luna-dr-domain-detail-link" aria-label={`${d.domain} 차트에서 상세 보기`}>
                  차트에서 보기 →
                </Link>
              </div>
            ))}
          </section>
        )}

        <div className="luna-dr-premium-card luna-dr-premium-card-invert" role="complementary" aria-label="연간 리포트 프로모션">
          <div>
            <p className="luna-block-kicker" style={{ marginBottom: "0.28rem", color: "rgba(244,244,241,0.44)" }}>
              연간 리포트
            </p>
            <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.42, fontWeight: 420, color: "rgba(244,244,241,0.82)", wordBreak: "keep-all" }}>
              앞으로 12개월의 주요 에너지 구간과 전환점을 확인하세요.
            </p>
          </div>
          <form action={devPurchaseAction} style={{ display: "contents" }}>
            <input type="hidden" name="productId" value="yearly" />
            <button type="submit" className="luna-dr-premium-cta" aria-label="연간 리포트 보기"
              style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "inherit", padding: 0 }}>
              →
            </button>
          </form>
        </div>

        {challengeDomains.length > 0 && (
          <section className="luna-dr-domain-group" aria-label="주의 영역 오늘 흐름">
            <div className="luna-dr-domain-group-header">
              <p className="luna-block-kicker" style={{ margin: 0 }}>
                주의 흐름
              </p>
              <span className="luna-dr-domain-group-badge luna-dr-badge-challenge">{shortDateLabel}</span>
            </div>
            {challengeDomains.map((d) => (
              <div key={d.domain} className="luna-dr-domain-item">
                <div className="luna-dr-domain-item-row">
                  <span className="luna-dr-domain-label">{d.domain}</span>
                  <p className="luna-dr-domain-headline">{d.headline}</p>
                </div>
                <p className="luna-dr-domain-note">{d.note}</p>
                <Link href="/profile/chart" className="luna-dr-domain-detail-link" aria-label={`${d.domain} 차트에서 상세 보기`}>
                  차트에서 보기 →
                </Link>
              </div>
            ))}
          </section>
        )}

        <BottomNav />
      </div>
    </main>
  );
}

export default async function InsightTodayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  return renderInsightTodayPage(date);
}