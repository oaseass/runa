"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import TransitChartViz from "@/app/insight/today/_components/TransitChartViz";
import type { TransitChartData, TransitInterpretation } from "@/lib/astrology/types";

const PLANET_KO: Record<string, string> = {
  Sun: "태양", Moon: "달", Mercury: "수성", Venus: "금성",
  Mars: "화성", Jupiter: "목성", Saturn: "토성", Uranus: "천왕성",
  Neptune: "해왕성", Pluto: "명왕성",
};
const PLANET_MEANING: Record<string, string> = {
  Sun: "정체성·의지",  Moon: "감정·직관",  Mercury: "사고·소통",
  Venus: "사랑·가치", Mars: "행동·욕구",  Jupiter: "성장·확장",
  Saturn: "구조·책임", Uranus: "변화·반란", Neptune: "꿈·초월",
  Pluto: "변혁·심층",
};
const GLYPH: Record<string, string> = {
  Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀", Mars: "♂",
  Jupiter: "♃", Saturn: "♄", Uranus: "♅", Neptune: "♆", Pluto: "♇",
};
const ASPECT_KO: Record<string, string> = {
  conjunction: "합", sextile: "육분", square: "긴장", trine: "조화", opposition: "대립",
};

export default function SpacePage() {
  const router = useRouter();
  const [chartData, setChartData] = useState<TransitChartData | null>(null);
  const [interp, setInterp]       = useState<TransitInterpretation | null>(null);
  const [loaded, setLoaded]       = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [r1, r2] = await Promise.all([
          fetch("/api/chart/transit-data", { cache: "no-store" }),
          fetch("/api/chart/today",        { cache: "no-store" }),
        ]);
        if (r1.ok) setChartData((await r1.json() as { data: TransitChartData }).data);
        if (r2.ok) setInterp((await r2.json() as { interpretation: TransitInterpretation }).interpretation);
      } catch { /* silent */ } finally { setLoaded(true); }
    })();
  }, []);

  // Map transit planet → its active aspect (for planet key display)
  const aspectMap = new Map(
    (interp?.activeAspects ?? []).map((a) => [a.transitPlanet, a])
  );

  return (
    <div className="cs-root cs-root--light">
      <header className="cs-detail-header">
        <button type="button" onClick={() => router.back()} className="cs-detail-back">←</button>
        <span className="cs-detail-header-title">Today</span>
        <span />
      </header>

      <main className="cs-space-main">
        <p className="cs-space-eyebrow">지금 하늘에서는</p>

        {/* chart — full-bleed so wheel is dominant */}
        <div className="cs-space-viz">
          {chartData ? (
            <TransitChartViz data={chartData} />
          ) : !loaded ? (
            <div className="cs-space-viz-loading" />
          ) : (
            <p style={{ textAlign: "center", opacity: 0.4 }}>차트 데이터 없음</p>
          )}
        </div>

        {/* editorial interpretation — real computed data, not generic strings */}
        {interp && (
          <div className="cs-space-interp">
            <p className="cs-space-interp-head">{interp.section1.title}</p>
            <p className="cs-space-interp-lede">{interp.lede}</p>
            <p className="cs-space-interp-body">{interp.section1.body}</p>
            {interp.keyPhraseKicker && (
              <p className="cs-space-interp-kicker">{interp.keyPhraseKicker}</p>
            )}
          </div>
        )}

        {/* planet reference — glyph · name · active aspect or domain meaning */}
        {chartData?.transitPlanets && (
          <div className="cs-space-key">
            <p className="cs-space-key-title">오늘 하늘의 행성</p>
            {chartData.transitPlanets.slice(0, 7).map((p) => {
              const asp = aspectMap.get(p.planet);
              return (
                <div
                  key={p.planet}
                  className={"cs-space-key-row" + (asp ? " cs-space-key-row--active" : "")}
                >
                  <span className="cs-space-key-glyph">{GLYPH[p.planet] ?? "·"}</span>
                  <span className="cs-space-key-name">{PLANET_KO[p.planet] ?? p.planet}</span>
                  {asp ? (
                    <span className="cs-space-key-aspect">
                      {ASPECT_KO[asp.aspect] ?? asp.aspect} {PLANET_KO[asp.natalPlanet] ?? asp.natalPlanet}
                    </span>
                  ) : (
                    <span className="cs-space-key-meaning">{PLANET_MEANING[p.planet] ?? ""}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
