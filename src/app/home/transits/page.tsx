"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import type { TransitDeepDetail, TransitInterpretation } from "@/lib/astrology/types";

const PLANET_KO: Record<string, string> = {
  Sun: "태양", Moon: "달", Mercury: "수성", Venus: "금성",
  Mars: "화성", Jupiter: "목성", Saturn: "토성", Uranus: "천왕성",
  Neptune: "해왕성", Pluto: "명왕성",
};
const MOON_KO: Record<string, string> = {
  Aries: "양자리", Taurus: "황소자리", Gemini: "쌍둥이자리", Cancer: "게자리",
  Leo: "사자자리", Virgo: "처녀자리", Libra: "천칭자리", Scorpio: "전갈자리",
  Sagittarius: "사수자리", Capricorn: "염소자리", Aquarius: "물병자리", Pisces: "물고기자리",
};
const ASPECT_EN: Record<string, string> = {
  conjunction: "합",
  sextile:     "육분각",
  square:      "긴장각",
  trine:       "조화각",
  opposition:  "대립각",
};
const FREQ_SHORT: Record<string, string> = {
  Moon:    "며칠마다", Mercury: "3~4주마다", Venus: "6개월마다",
  Sun:     "1년마다",  Mars:    "2년마다",   Jupiter: "12년마다",
  Saturn:  "30년마다", Uranus:  "일생에 한 번", Neptune: "일생에 한 번", Pluto: "일생에 한 번",
};
const TONE_DOT: Record<string, string> = {
  strength:  "#4fa882",
  challenge: "#c05050",
  neutral:   "rgba(20,21,22,0.20)",
};

// Mock fallback (shown if API unavailable / no natal chart)
const MOCK_LIST: Pick<TransitDeepDetail, "transitPlanet"|"natalPlanet"|"aspectType"|"tone">[] = [
  { transitPlanet: "Moon",    natalPlanet: "Sun",    aspectType: "trine",       tone: "strength"  },
  { transitPlanet: "Mercury", natalPlanet: "Venus",  aspectType: "conjunction", tone: "neutral"   },
  { transitPlanet: "Mars",    natalPlanet: "Moon",   aspectType: "square",      tone: "challenge" },
  { transitPlanet: "Jupiter", natalPlanet: "Saturn", aspectType: "sextile",     tone: "strength"  },
];

export default function TransitsPage() {
  const router = useRouter();
  const [deepList, setDeepList] = useState<TransitDeepDetail[] | null>(null);
  const [moonSign, setMoonSign] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => setIsLoading(false), 600);
    void (async () => {
      try {
        const [r1, r2] = await Promise.all([
          fetch("/api/chart/transit-deep", { cache: "no-store" }),
          fetch("/api/chart/today",        { cache: "no-store" }),
        ]);
        if (r1.ok) {
          const json = await r1.json() as { list: TransitDeepDetail[] };
          setDeepList(json.list);
        }
        if (r2.ok) {
          const json = await r2.json() as { interpretation: TransitInterpretation };
          setMoonSign(json.interpretation?.transitMoonSign ?? null);
        }
      } catch { /* silent */ }
      finally { clearTimeout(timeout); setIsLoading(false); }
    })();
    return () => clearTimeout(timeout);
  }, []);

  const list = isLoading ? [] : (deepList?.length ? deepList : MOCK_LIST as TransitDeepDetail[]);
  const isMock = !isLoading && !deepList?.length;

  return (
    <div className="cs-root cs-root--light">
      <header className="cs-detail-header">
        <button type="button" onClick={() => router.back()} className="cs-detail-back">←</button>
        <span className="cs-detail-header-title">오늘</span>
        <span />
      </header>

      <main className="cs-transit-list-main">
        {moonSign && (
          <p className="cs-transit-moon-badge">
            달 · {MOON_KO[moonSign] ?? moonSign}
          </p>
        )}

        <p className="cs-transit-list-eyebrow">행성 흐름</p>

        {isLoading ? (
          <div className="cs-transit-list">
            {[1, 2, 3].map((n) => (
              <div key={n} className="cs-transit-row" style={{ pointerEvents: "none" }}>
                <span className="cs-transit-row-body">
                  <span style={{ display: "block", width: `${60 + n * 12}%`, height: ".75rem", background: "rgba(20,21,22,0.07)", borderRadius: 3 }} />
                  <span style={{ display: "block", width: "30%", height: ".65rem", background: "rgba(20,21,22,0.05)", borderRadius: 3, marginTop: ".3rem" }} />
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="cs-transit-list">
            {list.map((a, i) => (
              <Link
                key={i}
                href={isMock ? "#" : `/home/transits/${i}`}
                className="cs-transit-row"
              >
                {/* tone dot */}
                <span
                  className="cs-transit-row-dot"
                  style={{ background: TONE_DOT[a.tone ?? "neutral"] }}
                />
                <span className="cs-transit-row-body">
                  <span className="cs-transit-row-label">
                    {PLANET_KO[a.transitPlanet] ?? a.transitPlanet} · {ASPECT_EN[a.aspectType] ?? a.aspectType} · {PLANET_KO[a.natalPlanet] ?? a.natalPlanet}
                  </span>
                  <span className="cs-transit-row-duration">
                    {FREQ_SHORT[a.transitPlanet] ?? "주기적으로"}
                  </span>
                </span>
                <span className="cs-transit-row-arrow">→</span>
              </Link>
            ))}
          </div>
        )}

        <div className="cs-transit-space-link">
          <Link href="/home/space" className="cs-space-teaser">
            지금 하늘에서는 →
          </Link>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
