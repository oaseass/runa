"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import BottomNav from "@/components/BottomNav";
import TodaySpaceScene, { PLANET_CUTOUT, PlanetSphere } from "./_components/TodaySpaceScene";
import TodayCategoryCard from "./_components/TodayCategoryCard";
import type {
  DomainReading, DomainDetail, TransitInterpretation,
  TodayDeepReport,
} from "@/lib/astrology/types";

/* ── maps ──────────────────────────────────────────────────────────────── */

const DOMAIN_MAP: Record<string, { label: string; apiDomain: string; fullLabel: string }> = {
  love:    { label: "연애",  apiDomain: "관계",     fullLabel: "관계와 연애" },
  friends: { label: "친구",  apiDomain: "사고·표현", fullLabel: "친구" },
  work:    { label: "일",    apiDomain: "루틴·일",  fullLabel: "루틴과 일" },
  family:  { label: "가족",  apiDomain: "감정·내면", fullLabel: "가족과 내면" },
  today:   { label: "오늘",  apiDomain: "",         fullLabel: "오늘" },
};

const PLANET_MEANING: Record<string, string> = {
  Sun:     "정체성과 생명의 원리",
  Moon:    "감정과 내면의 필요",
  Mercury: "소통과 사고의 방식",
  Venus:   "연애와 연결의 언어",
  Mars:    "행동과 욕망의 에너지",
  Jupiter: "확장과 성장의 흐름",
  Saturn:  "구조와 책임의 원리",
  Uranus:  "혁신과 자유의 충동",
  Neptune: "영감과 직관의 영역",
  Pluto:   "심층 변혁의 에너지",
};

const ASPECT_VERB: Record<string, string> = {
  conjunction: "완전히 겹쳐드는",
  sextile:     "흐름을 만들어내는",
  square:      "긴장을 만들어내는",
  trine:       "완벽한 조화를 이루는",
  opposition:  "완전히 맞서는",
};

const PLANET_FREQ: Record<string, { text: string; months: number }> = {
  Moon:    { text: "매달",     months: 0   },
  Mercury: { text: "3~4개월",  months: 1   },
  Venus:   { text: "약 6개월", months: 6   },
  Sun:     { text: "1년",      months: 12  },
  Mars:    { text: "약 2년",   months: 24  },
  Jupiter: { text: "약 12년",  months: 144 },
  Saturn:  { text: "약 30년",  months: 360 },
  Uranus:  { text: "일생",     months: 840  },
  Neptune: { text: "일생",     months: 1980 },
  Pluto:   { text: "일생",     months: 3000 },
};

/* ?�?� timeline generator ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?� */

function makeTimeline(planet: string, today: Date) {
  const months = PLANET_FREQ[planet]?.months ?? 6;
  if (months <= 1) return [];
  const past2 = new Date(today); past2.setMonth(past2.getMonth() - months * 2);
  const past1 = new Date(today); past1.setMonth(past1.getMonth() - months);
  const next1 = new Date(today); next1.setMonth(next1.getMonth() + months);
  function fmt(d: Date) {
    const m = d.getMonth();
    const y = d.getFullYear();
    if (m < 3) return `${y}년 1분기`;
    if (m < 6) return `${y}년 2분기`;
    if (m < 9) return `${y}년 3분기`;
    return `${y}년 4분기`;
  }
  return [
    { label: fmt(past2), isCurrent: false },
    { label: fmt(past1), isCurrent: false },
    { label: fmt(today), isCurrent: true  },
    { label: fmt(next1), isCurrent: false },
  ];
}

function Skel({ w = "100%", h = "0.85rem" }: { w?: string; h?: string }) {
  return (
    <span style={{
      display:"block", width:w, height:h,
      background:"rgba(20,21,22,0.07)", borderRadius:3, marginBottom:"0.35rem",
      animation:"csSkelPulse 1.8s ease-in-out infinite",
    }} />
  );
}

/* ?�?� page ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?� */

function DomainDetailPageInner() {
  const router      = useRouter();
  const params      = useParams<{ domain: string }>();
  const searchParams = useSearchParams();
  const domainKey   = (params.domain ?? "today").toLowerCase();
  const isToday     = domainKey === "today";
  const meta        = DOMAIN_MAP[domainKey] ?? DOMAIN_MAP["today"];

  /* shared state */
  const [lessonDecoSrc, setLessonDecoSrc] = useState("/luna/assets/home/detail-lesson.gif");

  /* today-only state */
  const [todayReport, setTodayReport] = useState<TodayDeepReport | null>(null);

  /* domain-only state */
  const [interp, setInterp]           = useState<TransitInterpretation | null>(null);
  const [domains, setDomains]         = useState<DomainReading[] | null>(null);
  const [domainDetail, setDomainDetail] = useState<DomainDetail | null>(null);

  const today = new Date();
  const dateParam = searchParams.get("date") ?? null;
  const displayDate = dateParam ? new Date(dateParam) : today;
  const dateQuery = dateParam ? `?date=${dateParam}` : "";

  useEffect(() => {
    void (async () => {
      try {
        if (isToday) {
          /* ?�?� today: single unified fetch ?�?� */
          const [r1] = await Promise.all([
            fetch(`/api/chart/today-deep${dateQuery}`, { cache: "no-store" }),
          ]);
          if (r1.status === 402) {
            router.replace("/store/checkout?product=membership");
            return;
          }
          if (r1.ok) {
            const report = (await r1.json() as { report: TodayDeepReport }).report;
            setTodayReport(report);
          }
        } else {
          /* ?�?� domain pages: existing four-call logic ?�?� */
          const detailQuery = dateQuery
            ? `?domain=${domainKey}&${dateQuery.slice(1)}`
            : `?domain=${domainKey}`;
          const [r1, r2, r4] = await Promise.all([
            fetch(`/api/chart/today${dateQuery}`,           { cache: "no-store" }),
            fetch(`/api/chart/domains${dateQuery}`,          { cache: "no-store" }),
            fetch(`/api/chart/domain-detail${detailQuery}`,  { cache: "no-store" }),
          ]);
          if (r4.status === 402) {
            router.replace("/store/checkout?product=membership");
            return;
          }
          if (r1.ok) setInterp((await r1.json() as { interpretation: TransitInterpretation }).interpretation);
          if (r2.ok) setDomains((await r2.json() as { domains: DomainReading[] }).domains);
          if (r4.ok) setDomainDetail((await r4.json() as { detail: DomainDetail }).detail);
        }
      } catch { /* silent */ }
    })();
  }, [dateQuery, domainKey, isToday, router]);

  /* ?�?� derived values (non-today only) ?�?� */
  const dr = domains?.find((d) => d.domain === meta.apiDomain);
  const dateStr = displayDate.toLocaleDateString("ko-KR", { year:"numeric", month:"long", day:"numeric" });

  /* ?�?� today-derived values ?�?� */
  const todayTimeline = todayReport
    ? makeTimeline(todayReport.primary.transitPlanet, today)
    : [];

  /* ?�?� Non-today domains ??Co?�Star-style category Today card ?�?�?�?�?�?�?�?�?�?�?�?�
     love / friends / work / family get a simple single-screen card:
     headline + object image + paragraph + feedback + Behind This Forecast.
     Deep-dive modules (SPACE scene, wheel chart, DRIVING TRANSIT, EARTH,
     TRY THIS, THE LESSON) do NOT appear on these four routes.
     ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?� */
  if (!isToday) {
    return (
      <div className="cc-page">
        <header className="cs-detail-header">
          <button type="button" onClick={() => router.back()} className="cs-detail-back">←</button>
          <span className="cs-detail-header-title">오늘</span>
          <span />
        </header>
        <main>
          <TodayCategoryCard
            domainKey={domainKey}
            interp={interp}
            dr={dr}
            domainDetail={domainDetail}
            dateStr={dateStr}
          />
        </main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="cs-root cs-root--light">

      {/* ── Header ── */}
      <header className="cs-detail-header">
        <button type="button" onClick={() => router.back()} className="cs-detail-back">←</button>
        <span className="cs-detail-header-title">오늘</span>
        <span />
      </header>

      <main className="cs-detail-main">

        {/* ?�?� TODAY: Full-width hero ??planet·date·headline stacked ?�?� */}
        <div className="cs-dv-hero cs-dv-hero--today">
          {/* Planet sphere ??editorial, centered, atmospheric */}
          <div className="cs-dv-hero-sphere">
            {todayReport ? (
              <PlanetSphere planet={todayReport.primary.transitPlanet} size={96} />
            ) : (
              <div style={{ width: 96, height: 96, borderRadius: "50%", background: "rgba(0,0,0,0.07)" }} />
            )}
          </div>
          <p className="cs-dv-date">{todayReport?.date ?? dateStr}</p>
          {todayReport
            ? <h1 className="cs-dv-headline cs-dv-headline--today">{todayReport.headline}</h1>
            : <><Skel w="92%" h="1.7rem" /><Skel w="76%" h="1.7rem" /></>
          }
        </div>

        {/* 소개 본문 + 행동 조언 — 2단락 */}
        <div className="cs-dv-body cs-dv-body--today">
          {todayReport ? (
            <>
              <p style={{ marginBottom: "1em" }}>{todayReport.introParagraph}</p>
              {todayReport.narrativeBridge && (
                <p style={{ color: "rgba(0,0,0,0.58)", fontSize: "0.93rem" }}>{todayReport.narrativeBridge}</p>
              )}
            </>
          ) : <><Skel /><Skel /><Skel w="80%" /></>}
        </div>

        {/* ?�?� SPACE: transit planet geometry ?�?� */}
        <section className="cs-dv-space-section">
            <p className="cs-dv-section-eyebrow">지금 하늘에서는</p>

          {todayReport ? (
            <TodaySpaceScene
              transitPlanet={todayReport.primary.transitPlanet}
              natalPlanet={todayReport.primary.natalPlanet}
              natalSign={todayReport.primary.natalSign}
              aspectType={todayReport.primary.aspectType}
              transitLabel={todayReport.transitLabel}
              natalLabel={todayReport.natalLabel}
            />
          ) : (
            <div className="tsz-skel"><Skel w="100%" h="220px" /></div>
          )}

          {/* Transit rows */}
          {todayReport && (() => {
            const p = todayReport.primary;
            const transitCutout = PLANET_CUTOUT[p.transitPlanet] ?? PLANET_CUTOUT.Moon;
            const natalCutout   = PLANET_CUTOUT[p.natalPlanet]   ?? PLANET_CUTOUT.Moon;
            const aspectAngle   = ({ conjunction:"0°", sextile:"60°", square:"90°", trine:"120°", opposition:"180°" } as Record<string,string>)[p.aspectType] ?? "–";
            return (
              <div className="cs-dv-transit-rows">
                <div className="cs-dv-transit-row">
                  <div className="cs-dv-tr-icon cs-dv-tr-icon--planet">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={transitCutout} alt="" width={42} height={42} style={{ objectFit:"contain", display:"block" }} />
                  </div>
                  <div className="cs-dv-tr-content">
                    <span className="cs-dv-tr-meaning">{PLANET_MEANING[p.transitPlanet] ?? p.transitPlanet}</span>
                    <span className="cs-dv-tr-tag">{todayReport.transitLabel}</span>
                  </div>
                </div>
                <div className="cs-dv-transit-row">
                  <div className="cs-dv-tr-icon cs-dv-tr-icon--aspect">
                    <span className="cs-dv-tr-angle-text">{aspectAngle}</span>
                  </div>
                  <div className="cs-dv-tr-content">
                    <span className="cs-dv-tr-meaning">{ASPECT_VERB[p.aspectType] ?? p.aspectType}</span>
                    <span className="cs-dv-tr-tag cs-dv-tr-tag--light">{todayReport.aspectLabel}</span>
                  </div>
                </div>
                <div className="cs-dv-transit-row">
                  <div className="cs-dv-tr-icon cs-dv-tr-icon--natal">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={natalCutout} alt="" width={42} height={42} style={{ objectFit:"contain", display:"block", opacity: 0.80 }} />
                  </div>
                  <div className="cs-dv-tr-content">
                    <span className="cs-dv-tr-meaning">{p.verbPhrase}</span>
                    <span className="cs-dv-tr-tag cs-dv-tr-tag--dark">{todayReport.natalLabel}</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Frequency + timeline */}
          {todayReport && (
            <>
              <p className="cs-dv-freq">
                {PLANET_FREQ[todayReport.primary.transitPlanet]?.text ?? todayReport.primary.frequency}에 찾아오는 흐름입니다.
              </p>
              {todayTimeline.length > 0 && (
                <div className="cs-dv-timeline">
                  {todayTimeline.map((t, i) => (
                    <div key={i} className={t.isCurrent ? "cs-dv-tl-item cs-dv-tl-item--current" : "cs-dv-tl-item"}>
                      <div className="cs-dv-tl-dot" />
                      <span className="cs-dv-tl-label">{t.label}</span>
                    </div>
                  ))}
                </div>
              )}
              <Link href="/home/transits" className="cs-dv-what-link">이게 뭔가요? →</Link>
            </>
          )}
        </section>

        {/* ?�?� EARTH: how it shows up in daily life ?�?� */}
        {todayReport?.bullets && todayReport.bullets.length > 0 && (
          <section className="cs-dv-earth-section">
            <p className="cs-dv-section-eyebrow">일상에서는</p>
            <h2 className="cs-dv-earth-headline">{todayReport.earthHeadline}</h2>
            <ul className="cs-dv-checklist">
              {todayReport.bullets.map((item, i) => (
                <li key={i} className="cs-dv-check-item">
                  <span className="cs-dv-check-mark">—</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        )}



        {/* ?�?� THE LESSON ?�?� */}
        {todayReport?.lessonText && (
          <section className="cs-dv-lesson">
            <p className="cs-dv-section-eyebrow">오늘의 메시지</p>
            <h2 className="cs-dv-lesson-text">{todayReport.lessonText}</h2>
            {todayReport.lessonSub && (
              <p className="cs-dv-lesson-sub">{todayReport.lessonSub}</p>
            )}
            <div className="cs-dv-lesson-deco">
              <Image
                src={lessonDecoSrc}
                alt=""
                width={90}
                height={90}
                className="cs-dv-lesson-img"
                unoptimized
                onError={() => {
                  if (lessonDecoSrc !== "/luna/assets/home/home-orb-primary.webp") {
                    setLessonDecoSrc("/luna/assets/home/home-orb-primary.webp");
                  }
                }}
              />
            </div>
          </section>
        )}

      </main>

      <BottomNav />
    </div>
  );
}
function DomainDetailPageContent() {
  const params = useParams<{ domain: string }>();
  const searchParams = useSearchParams();
  const domainKey = (params.domain ?? "today").toLowerCase();
  const dateKey = searchParams.get("date") ?? "";

  return <DomainDetailPageInner key={`${domainKey}:${dateKey}`} />;
}

export default function DomainDetailPage() {
  return <Suspense><DomainDetailPageContent /></Suspense>;
}
