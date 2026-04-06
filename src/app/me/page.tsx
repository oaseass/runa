import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import VipBadge from "@/components/VipBadge";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/server/auth-session";
import { getOrComputeNatalChart, getOnboardingProfile, getTodayInterpretation, getDomainReadings, getTransitDeepList } from "@/lib/server/chart-store";
import { getPaidProductIds } from "@/lib/server/order-store";
import {
  getPlanetReadings,
  SIGN_KO,
  PLANET_KO,
} from "@/lib/astrology/interpret";
import {
  getUserPreferences,
  getUserPhoneNumber,
} from "@/lib/server/settings-store";
import { UsernameForm } from "../settings/_components/UsernameForm";
import { NotificationToggles } from "../settings/_components/NotificationToggles";
import { logoutAction } from "../settings/_actions/settingsActions";
import type { PlanetName, TransitInterpretation, DomainReading } from "@/lib/astrology/types";
import type { PlanetReading } from "@/lib/astrology/interpret";

// ── Constants ─────────────────────────────────────────────────────────────────

const PLANET_GLYPH: Record<PlanetName, string> = {
  Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀", Mars: "♂",
  Jupiter: "♃", Saturn: "♄", Uranus: "♅", Neptune: "♆", Pluto: "♇",
};

/** General meaning per planet — static editorial copy */
const PLANET_MEANING_KO: Record<PlanetName, string> = {
  Sun:     "자아의 중심과 삶의 추진력.",
  Moon:    "감정의 본능과 내면의 필요.",
  Mercury: "생각의 결, 말하는 방식, 정보를 다루는 법.",
  Venus:   "관계, 취향, 사랑을 표현하는 방식.",
  Mars:    "욕구와 추진력, 몸이 먼저 반응하는 방식.",
  Jupiter: "성장과 확장, 삶이 넓어지는 방향.",
  Saturn:  "책임과 구조, 오래 버티게 하는 힘.",
  Uranus:  "변화와 자유, 틀을 깨는 움직임.",
  Neptune: "직관과 상상, 경계가 흐려지는 지점.",
  Pluto:   "집착과 변환, 완전히 바뀌게 만드는 힘.",
};

const HOUSE_LABEL: Record<number, string> = {
  1:  "자아와 첫인상", 2:  "가치와 자원",    3:  "소통과 일상 학습",
  4:  "가정과 내면",  5:  "창의성과 표현",  6:  "루틴과 건강",
  7:  "관계와 파트너십", 8: "변혁과 심층",   9:  "철학과 여행",
  10: "커리어와 명성", 11: "공동체와 미래",  12: "무의식과 영성",
};

/** Planets after which to insert a decorative break image */
const DECO_AFTER: Partial<Record<PlanetName, string>> = {
  Sun:     "/luna/assets/costar/cutouts/animated_cutout_03.webp",
  Venus:   "/luna/assets/costar/cutouts/animated_cutout_07.webp",
  Jupiter: "/luna/assets/costar/cutouts/animated_cutout_12.webp",
  Saturn:  "/luna/assets/costar/cutouts/animated_cutout_16.webp",
};

function maskPhone(phone: string): string {
  const digits = phone.replace(/^\+82/, "").replace(/\D/g, "");
  if (digits.length === 10) return `010-****-${digits.slice(6)}`;
  if (digits.length === 11) return `${digits.slice(0, 3)}-****-${digits.slice(7)}`;
  return phone.slice(0, 3) + "****" + phone.slice(-4);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function YouHeader({
  username,
  sunSign,
  moonSign,
  ascSign,
  isVip,
}: {
  username: string;
  sunSign: string;
  moonSign: string;
  ascSign: string;
  isVip: boolean;
}) {
  return (
    <div className="you-header">
      <div className="you-header-left">
        <p className="you-handle" style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          {isVip && <VipBadge size={14} />}
          @{username}
        </p>
        <div className="you-triad">
          <span className="you-triad-item">
            <span className="you-triad-glyph">☉</span>
            {sunSign}
          </span>
          <span className="you-triad-sep">·</span>
          <span className="you-triad-item">
            <span className="you-triad-glyph">☽</span>
            {moonSign}
          </span>
          <span className="you-triad-sep">·</span>
          <span className="you-triad-item">
            <span className="you-triad-glyph">⊕</span>
            {ascSign}
          </span>
        </div>
      </div>
      <Image
        src="/luna/assets/home/home-orb-primary.webp"
        alt=""
        className="you-header-obj"
        width={54}
        height={54}
        unoptimized
      />
    </div>
  );
}

function YouTabs({ active }: { active: "updates" | "chart" | "settings" }) {
  return (
    <nav className="you-tabs" aria-label="YOU 탭">
      <Link href="/me?tab=updates" className={active === "updates" ? "you-tab you-tab--active" : "you-tab"}>
        업데이트
      </Link>
      <Link href="/me?tab=chart" className={active === "chart" ? "you-tab you-tab--active" : "you-tab"}>
        차트
      </Link>
      <Link href="/me?tab=settings" className={active === "settings" ? "you-tab you-tab--active" : "you-tab"}>
        설정
      </Link>
    </nav>
  );
}

// ── UPDATES tab ───────────────────────────────────────────────────────────────

const ASPECT_KO_SHORT: Record<string, string> = {
  conjunction: "합", sextile: "육분", square: "긴장", trine: "조화", opposition: "대립",
};

const DOMAIN_LABEL_EN: Record<string, string> = {
  "관계":     "연애",
  "사고·표현": "소통",
  "루틴·일":  "일",
  "감정·내면": "내면",
};
const DOMAIN_HIGHLIGHT_ORDER = ["관계", "사고·표현", "루틴·일", "감정·내면"];

function UpdatesTab({
  interp,
  domains,
  deepAspects,
  isPaid,
}: {
  interp: TransitInterpretation | null;
  domains: DomainReading[] | null;
  deepAspects: import("@/lib/astrology/types").TransitDeepDetail[] | null;
  isPaid: boolean;
}) {
  const today = new Date().toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric", weekday: "short",
  });

  const domainMap = new Map((domains ?? []).map((d) => [d.domain, d]));

  return (
    <div className="you-updates">
      <p className="you-section-eyebrow">{today}</p>

      {interp ? (
        <>
          {/* Daily headline */}
          <h2 className="you-updates-headline">{interp.headline}</h2>

          {/* Domain highlights strip */}
          {domains && domains.length > 0 && (
            <div className="you-updates-domains">
              {DOMAIN_HIGHLIGHT_ORDER.map((key) => {
                const d = domainMap.get(key);
                if (!d) return null;
                return (
                  <div key={key} className={`you-updates-domain you-updates-domain--${d.tone}`}>
                    <p className="you-updates-domain-label">{DOMAIN_LABEL_EN[key] ?? key}</p>
                    <p className="you-updates-domain-status">{d.statusLabel ?? "—"}</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Lede */}
          <p className="you-updates-lede">{interp.lede}</p>

          {/* Sections */}
          <section className="you-updates-section">
            <p className="you-updates-section-title">{interp.section1.title}</p>
            <p className="you-updates-section-body">{interp.section1.body}</p>
          </section>

          <section className="you-updates-section">
            <p className="you-updates-section-title">{interp.section2.title}</p>
            <p className="you-updates-section-body">{interp.section2.body}</p>
          </section>

          {/* Key phrase */}
          <div className="you-updates-keyphrase">
            <p className="you-updates-keyphrase-kicker">오늘의 메시지</p>
            <p className="you-updates-keyphrase-text">{interp.keyPhrase}</p>
            {interp.keyPhraseKicker && (
              <p className="you-updates-keyphrase-sub">{interp.keyPhraseKicker}</p>
            )}
          </div>

          {/* Active aspects teaser — compact, links to transit detail */}
          {interp.activeAspects.length > 0 && (
            <div className="you-updates-aspects">
              <p className="you-updates-aspects-eyebrow">이 해석의 근거</p>
              {(deepAspects ?? interp.activeAspects).slice(0, 4).map((a, i) => {
                const tp = a.transitPlanet;
                const np = a.natalPlanet;
                const aspect = (a as import("@/lib/astrology/types").TransitDeepDetail).aspectType
                  ?? (a as import("@/lib/astrology/types").ActiveTransitAspect).aspect;
                return (
                  <Link
                    key={i}
                    href={`/home/transits/${i}?tp=${tp}&np=${np}`}
                    className="you-updates-aspects-item"
                  >
                    <span>
                      {PLANET_KO[tp as import("@/lib/astrology/types").PlanetName]}&nbsp;
                      <em>{ASPECT_KO_SHORT[aspect] ?? aspect}</em>&nbsp;
                      {PLANET_KO[np as import("@/lib/astrology/types").PlanetName]}
                    </span>
                    <span className="you-updates-aspects-arrow">→</span>
                  </Link>
                );
              })}
              <Link href="/home/transits" className="you-updates-aspects-more">
                전체 해석 보기 →
              </Link>
            </div>
          )}

          {/* Premium teaser for unpaid users */}
          {!isPaid && (
            <div className="you-updates-premium">
              <p className="you-updates-premium-title">더 보기</p>
              <p className="you-updates-premium-body">
                영역별 상세 해석과 더 깊은 질문 리딩은 VOID에서 이어집니다.
              </p>
              <Link href="/void" className="you-updates-premium-cta">
                VOID →
              </Link>
            </div>
          )}
        </>
      ) : (
        <p className="you-updates-empty">오늘의 별자리 리딩을 불러올 수 없습니다.</p>
      )}
    </div>
  );
}

// ── CHART tab — one card per placement ────────────────────────────────────────

function ChartCard({ r }: { r: PlanetReading }) {
  const glyph = PLANET_GLYPH[r.planetEn];
  const lines = r.body.split("\n").filter(Boolean);
  const signLine = lines[0] ?? "";
  const houseLine = lines[1] ?? "";
  const rxLine = lines[2] ?? "";
  const houseLabel = HOUSE_LABEL[r.house] ?? `${r.house}영역`;
  const meaning = PLANET_MEANING_KO[r.planetEn];

  return (
    <article className="you-chart-card">
      <div className="you-chart-card-rule" />
      <header className="you-chart-card-header">
        <span className="you-chart-card-glyph" aria-hidden="true">{glyph}</span>
        <div>
          <h2 className="you-chart-card-title">
            {PLANET_KO[r.planetEn]} in {r.sign}
          </h2>
          <p className="you-chart-card-subtitle">{r.house}영역 · {houseLabel}</p>
        </div>
        {r.retrograde && <span className="you-chart-card-rx">℞</span>}
      </header>

      <section className="you-chart-card-section">
        <p className="you-chart-card-eyebrow">이 배치가 뜻하는 것</p>
        <p className="you-chart-card-body">{meaning}</p>
      </section>

      <section className="you-chart-card-section">
        <p className="you-chart-card-eyebrow">이 별자리에서 드러나는 기질</p>
        <p className="you-chart-card-body">{signLine}</p>
      </section>

      <section className="you-chart-card-section">
        <p className="you-chart-card-eyebrow">내 차트에서</p>
        <p className="you-chart-card-body you-chart-card-body--muted">{houseLine}</p>
      </section>

      {rxLine && (
        <section className="you-chart-card-section">
          <p className="you-chart-card-eyebrow">역행</p>
          <p className="you-chart-card-body you-chart-card-body--rx">{rxLine}</p>
        </section>
      )}
    </article>
  );
}

function RelationshipCta({ planet }: { planet: "Venus" | "Mars" }) {
  const isVenus = planet === "Venus";
  return (
    <div className="you-chart-cta">
      <p className="you-chart-cta-label">관계 분석</p>
      <p className="you-chart-cta-text">
        {isVenus
          ? "내가 사랑하는 방식과 끄릴림의 패턴을 읽어드립니다."
          : "나의 욕망과 행동이 관계에서 어떻게 드러나는지 읽어드립니다."}
      </p>
      <Link href="/void?category=love" className="you-chart-cta-link">
        VOID에서 분석하기 →
      </Link>
    </div>
  );
}

function ChartLockGate({ lockedCount }: { lockedCount: number }) {
  return (
    <div className="you-chart-lock">
      <div className="you-chart-lock-inner">
        <span className="you-chart-lock-icon" aria-hidden="true">◎</span>
        <p className="you-chart-lock-title">나머지 {lockedCount}개 행성</p>
        <p className="you-chart-lock-body">
          수성 · 금성 · 화성부터 명왕성까지.<br />
          탄생점(ASC) 해석도 여기 포함됩니다.
        </p>
        <Link href="/shop" className="you-chart-lock-cta">
          멤버십으로 열기
        </Link>
      </div>
    </div>
  );
}

function ChartTab({ readings, isPaid }: { readings: PlanetReading[]; isPaid: boolean }) {
  return (
    <div className="you-chart">
      <p className="you-section-eyebrow">별 지도 · 탄생차트</p>

      {/* Overview table — always visible */}
      <div className="me-table you-chart-table" role="table" aria-label="행성 배치 요약">
        <div className="me-table-head" role="row">
          <span role="columnheader">행성</span>
          <span role="columnheader">별자리</span>
          <span role="columnheader">영역</span>
        </div>
        {readings.map((r) => (
          <div key={r.planetEn} className="me-table-row" role="row">
            <div className="me-table-planet">
              <span className="me-table-glyph" aria-hidden="true">{PLANET_GLYPH[r.planetEn]}</span>
              <span>{r.planet}</span>
              {r.retrograde && <span className="me-table-rx">℞</span>}
            </div>
            <span className="me-table-sign">{r.sign}</span>
            <span className="me-table-house">{r.house}영역</span>
          </div>
        ))}
      </div>

      {/* Paid: full card library */}
      {isPaid ? (
        <div className="you-chart-cards">
          {readings.map((r) => (
            <div key={r.planetEn}>
              <ChartCard r={r} />

              {/* Relationship CTA after Venus and Mars */}
              {(r.planetEn === "Venus" || r.planetEn === "Mars") && (
                <RelationshipCta planet={r.planetEn} />
              )}

              {/* Decorative break objects */}
              {DECO_AFTER[r.planetEn] && (
                <div className="you-chart-deco">
                  <Image
                    src={DECO_AFTER[r.planetEn]!}
                    alt=""
                    className="you-chart-deco-img"
                    width={80}
                    height={80}
                    unoptimized
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* Unpaid: show first 2 cards then lock gate */
        <div className="you-chart-cards">
          {readings.slice(0, 2).map((r) => (
            <ChartCard key={r.planetEn} r={r} />
          ))}
          <ChartLockGate lockedCount={Math.max(0, readings.length - 2)} />
        </div>
      )}
    </div>
  );
}

// ── SETTINGS tab — flat Co-Star-style ─────────────────────────────────────────

function SRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="settings-row">
      <span className="settings-row-label">{label}</span>
      <span className="settings-row-value">{value}</span>
    </div>
  );
}

function SLinkRow({
  label,
  value,
  href,
}: {
  label: string;
  value?: string;
  href: string;
}) {
  return (
    <Link href={href} className="settings-row settings-row--link">
      <span className="settings-row-label">{label}</span>
      <span className="settings-row-right">
        {value && <span className="settings-row-value">{value}</span>}
        <span className="settings-row-chevron">›</span>
      </span>
    </Link>
  );
}

function SettingsTab({
  username,
  phone,
  profile,
  prefs,
  hasMembership,
  hasYearly,
  hasAreaReport,
  hasQuestionReport,
}: {
  username: string;
  phone: string | null;
  profile: { birthDate: string | null; birthHour: number | null; birthMinute: number | null; birthPlaceFullText: string | null } | null;
  prefs: { notifyDailyReading: boolean; notifyAnalysisDone: boolean } | null;
  hasMembership: boolean;
  hasYearly: boolean;
  hasAreaReport: boolean;
  hasQuestionReport: boolean;
}) {
  const birthDateStr = profile?.birthDate
    ? profile.birthDate.replace(/-/g, ". ")
    : "미입력";
  const birthTimeStr =
    profile?.birthHour != null && profile?.birthMinute != null
      ? `${String(profile.birthHour).padStart(2, "0")}:${String(profile.birthMinute).padStart(2, "0")}`
      : "미입력";

  return (
    <div className="settings-page">

      {/* ── A. 계정 ── */}
      <section className="settings-section">
        <p className="settings-section-header">계정</p>
        <div className="settings-list">
          <div style={{ padding: "0.2rem 0" }}>
            <UsernameForm currentUsername={username} />
          </div>
          {phone
            ? <SRow label="전화번호" value={maskPhone(phone)} />
            : <SRow label="전화번호" value="미입력" />
          }
        </div>
      </section>

      {/* ── B. 알림 ── */}
      <section className="settings-section">
        <p className="settings-section-header">알림</p>
        <div className="settings-list">
          {prefs ? (
            <NotificationToggles initialPrefs={prefs} />
          ) : (
            <SRow label="알림" value="로그인 필요" />
          )}
        </div>
        <p className="luna-settings-note" style={{ paddingTop: "0.4rem" }}>
          추가 알림 기능은 이후 지원 예정입니다.
        </p>
      </section>

      {/* ── C. 차트 설정 ── */}
      <section className="settings-section">
        <p className="settings-section-header">차트 설정</p>
        <div className="settings-list">
          <SLinkRow label="생년월일" value={birthDateStr} href="/birth-time?edit=1" />
          <SLinkRow label="출생 시각" value={birthTimeStr} href="/birth-time?edit=1" />
          <SLinkRow
            label="출생지"
            value={profile?.birthPlaceFullText ?? "미입력"}
            href="/birth-place?edit=1"
          />
          <SRow label="하우스 시스템" value="Whole Sign" />
        </div>
        <div className="settings-note-box">
          <p className="settings-note-box-title">수정하면 이것들이 함께 바뀝니다</p>
          <ul className="settings-note-box-list">
            <li>탄생차트 — 행성 배치 · 탄생점</li>
            <li>매일의 별자리 리딩</li>
            <li>영역별 해석 (연애 · 소통 · 일 · 내면)</li>
            <li>VOID 분석 결과</li>
          </ul>
        </div>
      </section>

      {/* ── D. 멤버십 & 구매 ── */}
      <section className="settings-section">
        <p className="settings-section-header">멤버십 &amp; 구매</p>
        <div className="settings-list">
          {hasMembership ? (
            <div className="settings-row">
              <span className="settings-row-label">LUNA 멤버십</span>
              <span className="settings-row-right">
                <span className="settings-row-badge settings-row-badge--active">이용 중</span>
              </span>
            </div>
          ) : (
            <SLinkRow label="LUNA 멤버십" value="가입하기" href="/shop" />
          )}
          {hasYearly ? (
            <div className="settings-row">
              <span className="settings-row-label">2026 연간 리포트</span>
              <span className="settings-row-right">
                <span className="settings-row-badge settings-row-badge--active">구매 완료</span>
              </span>
            </div>
          ) : (
            <SLinkRow label="2026 연간 리포트" value="₩29,000" href="/shop" />
          )}
          <SLinkRow label="Eros" value="무료" href="/eros/select" />
          {hasAreaReport ? (
            <div className="settings-row">
              <span className="settings-row-label">영역 보고서</span>
              <span className="settings-row-right">
                <span className="settings-row-badge settings-row-badge--active">구매 완료</span>
              </span>
            </div>
          ) : (
            <SLinkRow label="영역 보고서" value="₩9,900" href="/store" />
          )}
          {hasQuestionReport ? (
            <div className="settings-row">
              <span className="settings-row-label">VOID 질문 리포트</span>
              <span className="settings-row-right">
                <span className="settings-row-badge settings-row-badge--active">구매 완료</span>
              </span>
            </div>
          ) : (
            <SLinkRow label="VOID 질문 리포트" value="₩4,900" href="/store" />
          )}
        </div>
      </section>

      {/* ── E. 지원 ── */}
      <section className="settings-section">
        <p className="settings-section-header">지원</p>
        <div className="settings-list">
          <a href="tel:1393" className="settings-row settings-row--link">
            <span className="settings-row-label">위기 상담 전화</span>
            <span className="settings-row-right">
              <span className="settings-row-value">1393 · 24시간</span>
              <span className="settings-row-chevron">›</span>
            </span>
          </a>
        </div>
      </section>

      {/* ── F. 로그아웃 / LOGOUT ── */}
      <div className="settings-logout-row">
        <form action={logoutAction}>
          <button type="submit" className="settings-logout-btn">로그아웃</button>
        </form>
      </div>

      {/* ── G. 법적 / FOOTER ── */}
      <div className="settings-footer">
        <div className="settings-footer-links">
          <a href="/privacy" className="settings-footer-link">개인정보 처리방침</a>
          <a href="/terms" className="settings-footer-link">이용약관</a>
        </div>
        <p className="settings-footer-version">LUNA v0.1.0</p>
      </div>

    </div>
  );
}

// ── No-chart fallback ─────────────────────────────────────────────────────────

function NoChartState({ username }: { username: string }) {
  return (
    <main className="screen luna-article-screen">
      <div className="luna-article-wrap">
        <p className="you-handle" style={{ marginBottom: "1.2rem" }}>@{username}</p>
        <p className="me-system">LUNA · 별 지도</p>
        <p style={{ fontSize: "0.82rem", opacity: 0.5, lineHeight: 1.7 }}>
          출생 데이터가 없습니다.
        </p>
        <Link href="/birth-time" className="luna-black-cta" style={{ marginTop: "1.4rem", display: "flex" }}>
          출생 정보 입력하기
        </Link>
        <BottomNav />
      </div>
    </main>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function MePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);
  if (!session) redirect("/account-access");

  const { tab: rawTab } = await searchParams;
  const tab = (rawTab === "chart" || rawTab === "settings") ? rawTab : "updates";

  const chart   = getOrComputeNatalChart(session.userId);
  if (!chart) return <NoChartState username={session.username} />;

  // Payment check
  const skipPayment       = process.env.SKIP_PAYMENT === "true" || process.env.NEXT_PUBLIC_SKIP_PAYMENT === "true";
  const paidIds           = skipPayment ? null : getPaidProductIds(session.userId);
  const hasMembership     = skipPayment || (paidIds?.has("membership") ?? false);
  const hasYearly         = skipPayment || (paidIds?.has("yearly") ?? false);
  const hasAreaReport     = skipPayment || (paidIds?.has("area") ?? false);
  const hasQuestionReport = skipPayment || (paidIds?.has("question") ?? false);
  const isPaid            = hasMembership || hasYearly;

  const readings    = getPlanetReadings(chart);
  const sunReading  = readings.find((r) => r.planetEn === "Sun");
  const moonReading = readings.find((r) => r.planetEn === "Moon");
  const ascSignKo   = SIGN_KO[chart.ascendant.sign] ?? chart.ascendant.sign;

  // Daily interpretation — only fetched when UPDATES tab is active
  const todayInterp   = tab === "updates" ? getTodayInterpretation(session.userId) : null;
  const domainReads   = tab === "updates" ? getDomainReadings(session.userId) : null;
  const deepAspects   = tab === "updates" ? getTransitDeepList(session.userId, new Date()) : null;

  // Settings data (fetched only when needed but cheap enough to always load)
  const profile    = getOnboardingProfile(session.userId);
  const prefs      = getUserPreferences(session.userId);
  const phone      = getUserPhoneNumber(session.userId);

  return (
    <main className="screen luna-article-screen you-screen" aria-label="YOU">
      <div className="luna-article-wrap">

        <YouHeader
          username={session.username}
          sunSign={sunReading?.sign ?? ""}
          moonSign={moonReading?.sign ?? ""}
          ascSign={ascSignKo}
          isVip={isPaid}
        />

        <YouTabs active={tab} />

        {tab === "updates"  && <UpdatesTab interp={todayInterp} domains={domainReads} deepAspects={deepAspects} isPaid={isPaid} />}
        {tab === "chart"    && <ChartTab readings={readings} isPaid={isPaid} />}
        {tab === "settings" && (
          <SettingsTab
            username={session.username}
            phone={phone}
            profile={profile}
            prefs={prefs}
            hasMembership={hasMembership}
            hasYearly={hasYearly}
            hasAreaReport={hasAreaReport}
            hasQuestionReport={hasQuestionReport}
          />
        )}

        <BottomNav />
      </div>
    </main>
  );
}
