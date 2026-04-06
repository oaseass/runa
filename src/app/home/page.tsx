"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import VipBadge from "@/components/VipBadge";
import type { DomainReading, TransitInterpretation } from "@/lib/astrology/types";

/* ── DO / DON'T fallbacks (used when interp is not yet loaded) ──── */

const DO_FALLBACK   = ["느린 답장","한 사람에게 집중","기록하기"];
const DONT_FALLBACK = ["즉흥 결론","감정적 소비","늦은 밤 확신"];

const SIGN_KO: Record<string, string> = {
  Aries:"양자리", Taurus:"황소자리", Gemini:"쌍둥이자리",
  Cancer:"게자리", Leo:"사자자리", Virgo:"처녀자리",
  Libra:"천칭자리", Scorpio:"전갈자리", Sagittarius:"사수자리",
  Capricorn:"염소자리", Aquarius:"물병자리", Pisces:"물고기자리",
};

/* ── domain tabs ────────────────────────────────────────────────── */

type DomainKey = "LOVE" | "FRIENDS" | "WORK" | "FAMILY";

const DOMAIN_TABS: { key: DomainKey; label: string; apiDomain: string }[] = [
  { key:"LOVE",    label:"연애",    apiDomain:"관계" },
  { key:"FRIENDS", label:"친구", apiDomain:"사고·표현" },
  { key:"WORK",    label:"일",    apiDomain:"루틴·일" },
  { key:"FAMILY",  label:"가정",  apiDomain:"감정·내면" },
];

function domainTonePrefix(dr: { tone: string; statusLabel?: string } | undefined, label: string): string {
  if (!dr) return label;
  if (dr.statusLabel) return dr.statusLabel;
  if (dr.tone === "strength") return `${label} 힘이 붙는 날`;
  if (dr.tone === "challenge") return `${label} 속도 조절`;
  return `${label} 조용한 변화`;
}

/* ── date strip helpers ─────────────────────────────────────────── */



/* ── skeleton ───────────────────────────────────────────────────── */

function Skel({ w = "100%", h = "0.85rem" }: { w?: string; h?: string }) {
  return (
    <span style={{
      display:"block", width:w, height:h,
      background:"rgba(20,21,22,0.07)", borderRadius:3, marginBottom:"0.35rem",
      animation:"csSkelPulse 1.8s ease-in-out infinite",
    }} />
  );
}

/* ── Best-day supporting sentence ───────────────────────────────── */
function bestDaySupporting(topDomain: string | null): string {
  if (topDomain === "관계")     return "대화와 조율이 잘 풀리는 날이에요. 중요한 이야기를 꺼내기 좋습니다.";
  if (topDomain === "루틴·일")  return "집중력과 실행력이 높은 날이에요. 미뤄둔 일을 정리하기 좋습니다.";
  if (topDomain === "사고·표현") return "말과 생각이 선명해지는 날이에요. 발표나 소통에 잘 맞습니다.";
  if (topDomain === "감정·내면") return "내면을 살피기 좋은 날이에요. 느리게, 깊이 생각할 시간입니다.";
  return "전반적으로 균형이 좋은 날이에요. 어느 쪽이든 첫발을 떼기 좋습니다.";
}

/* ── page ───────────────────────────────────────────────────────── */

export default function HomePage() {
  const router = useRouter();
  const [interp, setInterp]     = useState<TransitInterpretation | null>(null);
  const [domains, setDomains]   = useState<DomainReading[] | null>(null);
  const [tab, setTab]           = useState<DomainKey>("LOVE");
  const [isPro, setIsPro]       = useState<boolean | null>(null);
  const [isVip, setIsVip]        = useState(false);
  const [hdrUsername, setHdrUsername] = useState<string | null>(null);
  const [isInterpLoading, setIsInterpLoading] = useState(true);
  const [isDomainsLoading, setIsDomainsLoading] = useState(true);
  const [topOrbSrc, setTopOrbSrc] = useState("/luna/assets/home/home-orb-primary.webp");
  const [bestDays, setBestDays] = useState<{ label: string; date: string; topDomain: string | null }[]>([]);
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [pickerOpen, setPickerOpen]     = useState(false);

  const isToday = selectedDate.toDateString() === today.toDateString();
  const dateParam = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth()+1).padStart(2,"0")}-${String(selectedDate.getDate()).padStart(2,"0")}`;

  const firstBestDay = bestDays[0] ?? null;
  const restBestDays = bestDays.slice(1);

  const moonSign = interp?.transitMoonSign ?? null;
  // Use natal-aware DO/DON'T computed server-side from active transits.
  // Falls back to static arrays only while interp is loading.
  const dos   = interp?.dos   ?? DO_FALLBACK;
  const donts = interp?.donts ?? DONT_FALLBACK;

  /* auth guard */
  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/auth/session/me", { cache:"no-store" });
      if (!r.ok) router.replace("/");
    })();
  }, [router]);

  /* fetch interpretation + domain readings (re-runs on date change) */
  useEffect(() => {
    let cancelled = false;
    setIsInterpLoading(true);
    setIsDomainsLoading(true);
    void (async () => {
      try {
        const [r1, r2] = await Promise.all([
          fetch(`/api/chart/today?date=${dateParam}`,   { cache: "no-store" }),
          fetch(`/api/chart/domains?date=${dateParam}`, { cache: "no-store" }),
        ]);
        if (cancelled) return;
        if (r1.ok) setInterp((await r1.json() as { interpretation: TransitInterpretation }).interpretation);
        if (r2.ok) {
          const j = await r2.json() as { success: boolean; domains?: DomainReading[] };
          if (j.success && j.domains) setDomains(j.domains);
        }
      } catch { /* silent */ } finally {
        if (!cancelled) { setIsInterpLoading(false); setIsDomainsLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [dateParam]);

  /* fetch pro status once */
  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/user/status", { cache: "no-store" });
      if (r.ok) {
        const j = await r.json() as { isPro: boolean; isVip?: boolean; username?: string };
        setIsPro(j.isPro);
        setIsVip(j.isVip ?? false);
        setHdrUsername(j.username ?? null);
      }
    })();
  }, []);

  /* fetch personalized best days (pro section) */
  useEffect(() => {
    if (isPro !== true) return;
    void (async () => {
      try {
        const r = await fetch("/api/chart/best-days?count=3&daysAhead=45", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json() as { success: boolean; bestDays?: { label: string; date: string; topDomain: string | null }[] };
        if (j.success && j.bestDays) setBestDays(j.bestDays);
      } catch { /* silent */ }
    })();
  }, [isPro]);


  // 로그아웃 핸들러
  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/");
    } catch {
      router.replace("/");
    }
  }

  return (
    <div className="cs-root">
      {/* ── Header ── */}
      <header className="cs-header cs-header--week" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {/* Avatar — 왼쪽 */}
        <Link href="/me" className="cs-header-avatar" aria-label="프로필">
          <Image
            src="/luna/assets/home/home-connect-left.webp"
            alt="avatar"
            width={32}
            height={32}
            className="cs-header-avatar-img"
            unoptimized
          />
        </Link>
        {/* 오른쪽: 날짜 버튼 + 로그아웃 버튼 */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {/* 날짜 선택 버튼 */}
          <div className="cs-date-selector" style={{ position: "relative" }}>
            <button
              type="button"
              className="cs-date-btn"
              onClick={() => setPickerOpen((v) => !v)}
              aria-expanded={pickerOpen}
            >
              <span className="cs-date-btn-label">
                {isToday
                  ? "오늘"
                  : `${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일`}
              </span>
              <span className="cs-date-btn-arrow">{pickerOpen ? "▲" : "▼"}</span>
            </button>
            {pickerOpen && (
              <div className="cs-date-picker" role="listbox">
                {[-2, -1, 0, 1, 2].map((offset) => {
                  const d = new Date(today);
                  d.setDate(today.getDate() + offset);
                  const nextDateKey = d.toDateString();
                  const isSelected = nextDateKey === selectedDate.toDateString();
                  const isT = offset === 0;
                  const label = isT ? "오늘" : `${d.getMonth() + 1}월 ${d.getDate()}일`;
                  const weekday = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
                  return (
                    <button
                      key={offset}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={isSelected ? "cs-date-option cs-date-option--sel" : "cs-date-option"}
                      onClick={() => {
                        if (nextDateKey !== selectedDate.toDateString()) {
                          setIsInterpLoading(true);
                          setIsDomainsLoading(true);
                        }
                        setSelectedDate(d);
                        setPickerOpen(false);
                      }}
                    >
                      <span className="cs-date-option-main">{label}</span>
                      <span className="cs-date-option-sub">{weekday}요일</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {/* 로그아웃 버튼 */}
          {hdrUsername && (
            <span style={{ display: "flex", alignItems: "center", gap: "0.22rem", fontSize: "0.76rem", color: "#888", letterSpacing: "-0.01em" }}>
              {isVip && <VipBadge size={12} />}
              {hdrUsername}
            </span>
          )}
          <button
            type="button"
            onClick={handleLogout}
            style={{
              background: "none",
              border: "none",
              color: "#888",
              fontWeight: 600,
              fontSize: "1rem",
              cursor: "pointer",
              padding: "0.25rem 0.75rem"
            }}
            aria-label="로그아웃"
            title="로그아웃"
          >
            로그아웃
          </button>
        </div>
      </header>

      {/* ── Feed ── */}
      <main className="cs-feed">

        {/* [A] YOUR DAY AT A GLANCE */}
        <section className="cs-glance">
          <div className="cs-glance-orb" aria-hidden="true">
            <Image
              src={topOrbSrc}
              alt=""
              width={112}
              height={112}
              className="cs-glance-orb-img"
              unoptimized
              onError={() => {
                if (topOrbSrc !== "/luna/assets/home/home-orb-fallback.webp") {
                  setTopOrbSrc("/luna/assets/home/home-orb-fallback.webp");
                }
              }}
            />
          </div>
          <p className="cs-glance-eyebrow">오늘의 흐름</p>

          {!isInterpLoading && interp ? (
            <h1 className="cs-glance-headline">{interp.headline}</h1>
          ) : (
            <><Skel w="88%" h="1.6rem" /><Skel w="60%" h="1.6rem" /></>
          )}

          {!isInterpLoading && interp ? (
            <p className="cs-glance-body">{interp.lede}</p>
          ) : (
            <><Skel /><Skel /><Skel w="70%" /></>
          )}

          {/* Do / Don't */}
          <div className="cs-dodon">
            <div className="cs-dodon-col">
              <p className="cs-dodon-label">이렇게 해보세요</p>
              <ul className="cs-dodon-list">
                {dos.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div className="cs-dodon-col">
              <p className="cs-dodon-label">이건 피하세요</p>
              <ul className="cs-dodon-list">
                {donts.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </div>

          <Link href={`/home/detail/today${isToday ? "" : `?date=${dateParam}`}`} className="cs-dive-btn">
            깊이 보기 →
          </Link>
        </section>

        {/* [B] LOVE / FRIENDS / WORK / FAMILY — 4 rows always visible */}
        <section className="cs-domain">
          <div className="cs-domain-tabs" role="tablist">
            {DOMAIN_TABS.map((t) => (
              <button key={t.key} role="tab" aria-selected={tab === t.key} type="button"
                onClick={() => setTab(t.key)} className="cs-domain-tab">
                <span className={tab === t.key ? "cs-radio cs-radio--on" : "cs-radio"} />
                {t.label}
              </button>
            ))}
          </div>

          <div className="cs-domain-list">
            {DOMAIN_TABS.map((t) => {
              const dr = domains?.find((d) => d.domain === t.apiDomain);
              const isActive = tab === t.key;
              // Leading transit reason (e.g. "금성 합 출생 달 (1.2°)") shown as a signal chip
              const signalReason = dr?.reasons?.[0] ?? null;
              return (
                <Link key={t.key} href={`/home/detail/${t.key.toLowerCase()}${isToday ? "" : `?date=${dateParam}`}`}
                  className={isActive ? "cs-domain-row cs-domain-row--active" : "cs-domain-row"}>
                  <div className="cs-domain-row-head">
                    <span className={isActive ? "cs-bullet cs-bullet--on" : "cs-bullet"} />
                    <span className="cs-domain-row-title">
                      {dr ? domainTonePrefix(dr, t.label) : t.label}
                    </span>
                    <span className="cs-domain-row-arrow">→</span>
                  </div>
                  {!isDomainsLoading && dr ? (
                    <>
                      <p className="cs-domain-row-body">{dr.headline}</p>
                      {signalReason && (
                        <p className="cs-domain-row-signal">{signalReason}</p>
                      )}
                    </>
                  ) : (
                    <div style={{ paddingLeft:"1.4rem", marginTop:".35rem" }}>
                      <Skel w="90%" h=".75rem" />
                      <Skel w="70%" h=".75rem" />
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </section>

        {/* [B-2] TRANSITS + SPACE */}
        <section className="cs-quick-links">
          <Link href="/home/transits" className="cs-quick-link-row">
            <span className="cs-quick-link-label">행성 흐름</span>
            <span className="cs-quick-link-value">
              {moonSign ? `달 · ${SIGN_KO[moonSign] ?? moonSign}` : "—"}
            </span>
          </Link>
          <Link href="/home/space" className="cs-quick-link-row">
            <span className="cs-quick-link-label">지금 하늘에서는</span>
            <span className="cs-quick-link-arrow">→</span>
          </Link>
        </section>

        {/* [C] EROS */}
        <section className="cs-eros-section">
          <p className="cs-eros-eyebrow">EROS</p>

          <Link href="/eros/select" className="cs-eros-card">
            {/* image frame — portrait, 3:4 */}
            <div className="cs-eros-img-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/luna/assets/home/eros.gif"
                alt=""
                className="cs-eros-img"
              />
            </div>

            {/* editorial text body */}
            <div className="cs-eros-body">
              <p className="cs-eros-label">Introducing Eros</p>
              <div className="cs-eros-copy">
                <p>당신이 사랑하는 방식.</p>
                <p>상대가 사랑하는 방식.</p>
                <p>두 에너지가 만날 때.</p>
              </div>
              <div className="cs-eros-foot">
                <span className="cs-eros-cta-text">내 사람 선택하기</span>
                <span className="cs-eros-cta-arrow">→</span>
              </div>
            </div>
          </Link>
        </section>

        {/* [D] Connect with your friends */}
        <section className="cs-connect-section">
          {/* Top decorative image */}
          <div className="cs-connect-deco cs-connect-deco--top">
            <Image
              src="/luna/assets/home/home-connect-left.webp"
              alt=""
              width={72}
              height={72}
              className="cs-connect-deco-img"
              unoptimized
            />
          </div>
          <div className="cs-connect-body-wrap">
            <h2 className="cs-connect-title">친구와 연결하기</h2>
            <p className="cs-connect-body">
              친구를 추가하면 별이 서로에게 어떤 영향을 주는지 볼 수 있어요. 언제 연락하기 좋은지도 알 수 있습니다.
            </p>
            <Link href="/connections/add" className="cs-connect-btn">
              친구 추가하기
            </Link>
          </div>
          {/* Bottom decorative image */}
          <div className="cs-connect-deco cs-connect-deco--bottom">
            <Image
              src="/luna/assets/home/home-connect-right.webp"
              alt=""
              width={52}
              height={52}
              className="cs-connect-deco-img cs-connect-deco-img--right"
              unoptimized
            />
          </div>
        </section>

        {/* [E] 다가오는 베스트 데이 — PRO only */}
        {isPro === true && (
          <section className="cs-bestdays-feed">
            <div className="cs-bestdays-feed-content">
              {/* ① 섹션 라벨 + PRO 배지 — 한 행에 나란히 */}
              <div className="cs-bestdays-feed-head">
                <span className="cs-bestdays-feed-label">다가오는 베스트 데이</span>
                <span className="cs-bestdays-feed-pro">PRO</span>
              </div>

              {firstBestDay ? (
                <>
                  {/* ② 날짜 */}
                  <p className="cs-bestdays-feed-date">{firstBestDay.date}</p>

                  {/* ③ 메인 인사이트 타이틀 */}
                  <p style={{ fontSize: "1rem", fontWeight: 700, color: "#111", lineHeight: 1.3, marginBottom: "0.4rem" }}>
                    {firstBestDay.label}
                  </p>

                  {/* ④ 짧은 보조 문장 */}
                  <p style={{ fontSize: "0.8rem", color: "#666", lineHeight: 1.65, marginBottom: "1rem" }}>
                    {bestDaySupporting(firstBestDay.topDomain)}
                  </p>

                  {/* 추가 날짜 — 컴팩트 리스트 */}
                  {restBestDays.length > 0 && (
                    <ul className="cs-bestdays-feed-list">
                      {restBestDays.map((bd) => (
                        <li key={bd.date}>
                          <Link href="/calendar" className="cs-bestdays-feed-row">
                            <span style={{ color: "#aaa", fontSize: "0.78rem", marginRight: "0.5rem", flexShrink: 0 }}>
                              {bd.date}
                            </span>
                            <span style={{ flex: 1 }}>{bd.label}</span>
                            <span className="cs-bestdays-feed-arrow">→</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p style={{ fontSize: "0.8rem", color: "#aaa", margin: "0.5rem 0 1rem" }}>
                  베스트 데이를 계산 중이에요…
                </p>
              )}

              {/* ⑤ 전체 달력 보기 */}
              <Link href="/calendar" className="cs-bestdays-feed-cal">
                전체 달력 보기 →
              </Link>
            </div>
          </section>
        )}

        {/* PRO 구매 유도 — 비구독자 전용 */}
        {isPro === false && (
          <section className="cs-pro-upsell">
            <div className="cs-pro-upsell-head">
              <span className="cs-pro-upsell-label">다가오는 베스트 데이</span>
              <span className="cs-bestdays-feed-pro">PRO</span>
            </div>
            <p className="cs-pro-upsell-locked">
              멤버십으로 나만의 베스트 데이를 확인하세요.
            </p>
            <Link href="/store/checkout?product=membership" className="cs-pro-upsell-btn">
              멤버십 시작하기 →
            </Link>
          </section>
        )}

        {/* [F] The end */}
        <section className="cs-the-end">
          <div className="cs-the-end-bg">
            <Image
              src="/luna/assets/home/home-end-arc.webp"
              alt=""
              fill
              className="cs-the-end-img cs-the-end-img--arc"
              unoptimized
            />
            <div className="cs-the-end-particles" aria-hidden="true">
              <Image
                src="/luna/assets/home/home-end-particles.gif"
                alt=""
                fill
                className="cs-the-end-img cs-the-end-img--particles"
                unoptimized
              />
            </div>
          </div>
          <div className="cs-the-end-content">
            <h2 className="cs-the-end-title">오늘은 여기까지</h2>
            <Link href="/me" className="cs-the-end-cta">
              미래의 나에게 메시지 보내기
            </Link>
          </div>
        </section>

        <div style={{ height:"6rem" }} />
      </main>

      <BottomNav />
    </div>
  );
}