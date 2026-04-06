"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import TransitDiagramViz from "@/components/TransitDiagramViz";
import type { TransitDeepDetail } from "@/lib/astrology/types";

const PLANET_KO: Record<string, string> = {
  Sun: "태양", Moon: "달", Mercury: "수성", Venus: "금성",
  Mars: "화성", Jupiter: "목성", Saturn: "토성", Uranus: "천왕성",
  Neptune: "해왕성", Pluto: "명왕성",
};

const SIGN_KO: Record<string, string> = {
  Aries: "양자리", Taurus: "황소자리", Gemini: "쌍둥이자리", Cancer: "게자리",
  Leo: "사자자리", Virgo: "처녀자리", Libra: "천칭자리", Scorpio: "전갈자리",
  Sagittarius: "사수자리", Capricorn: "염소자리", Aquarius: "물병자리", Pisces: "물고기자리",
};

const ASPECT_KO: Record<string, string> = {
  conjunction: "합", sextile: "육분각", square: "긴장각", trine: "조화각", opposition: "대립각",
};

const ASPECT_FULL: Record<string, string> = {
  conjunction: "합",
  sextile:     "육분각",
  square:      "긴장각",
  trine:       "조화각",
  opposition:  "대립각",
};

const ASPECT_MEANING: Record<string, string> = {
  conjunction: "두 에너지가 완전히 융합됩니다. 강렬하고 집중된 흐름입니다.",
  sextile:     "부드러운 기회와 협력의 에너지가 열립니다.",
  square:      "마찰과 긴장이 성장을 유발합니다. 직면하면 해결됩니다.",
  trine:       "에너지가 자연스럽고 흐르듯 연결됩니다.",
  opposition:  "긴장 속에서 균형을 찾는 에너지입니다.",
};

const TONE_COLOR: Record<string, string> = {
  strength:  "rgba(79,168,130,0.9)",
  challenge: "rgba(192,80,80,0.9)",
  neutral:   "rgba(240,240,238,0.45)",
};

function Skel({ w = "100%", h = "0.9rem" }: { w?: string; h?: string }) {
  return (
    <span style={{
      display: "block", width: w, height: h,
      background: "rgba(240,240,238,0.06)", borderRadius: 3, marginBottom: "0.4rem",
    }} />
  );
}

function TransitDeepPageInner() {
  const router      = useRouter();
  const params      = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const idx         = Number(params.id ?? 0);

  const dateParam   = searchParams.get("date") ?? null;
  const tpParam     = searchParams.get("tp") ?? null;
  const npParam     = searchParams.get("np") ?? null;

  // Build API query: prefer tp/np lookup for label-accurate detail; fall back to idx
  const dateQuery = (() => {
    const qs = new URLSearchParams();
    if (dateParam) qs.set("date", dateParam);
    if (tpParam && npParam) {
      qs.set("tp", tpParam);
      qs.set("np", npParam);
    } else {
      qs.set("idx", String(idx));
    }
    return `?${qs.toString()}`;
  })();

  const [detail, setDetail] = useState<TransitDeepDetail | null>(null);
  const [total,  setTotal]  = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    void (async () => {
      try {
        const r = await fetch(`/api/chart/transit-deep${dateQuery}`, { cache: "no-store" });
        if (r.ok) {
          const json = await r.json() as { detail: TransitDeepDetail; total: number };
          setDetail(json.detail);
          setTotal(json.total);
        }
      } catch { /* silent */ }
      finally { setIsLoading(false); }
    })();
  }, [dateQuery]);

  const transitKo  = detail ? (PLANET_KO[detail.transitPlanet] ?? detail.transitPlanet) : "";
  const natalKo    = detail ? (PLANET_KO[detail.natalPlanet] ?? detail.natalPlanet) : "";
  const natalSignKo = detail ? (SIGN_KO[detail.natalSign] ?? detail.natalSign) : "";
  const aspectKo   = detail ? (ASPECT_KO[detail.aspectType] ?? detail.aspectType) : "";
  const aspectFull = detail ? (ASPECT_FULL[detail.aspectType] ?? detail.aspectType.toUpperCase()) : "";
  const toneColor  = detail ? TONE_COLOR[detail.tone] : TONE_COLOR.neutral;

  /** 받침 유무로 조사 반환 */
  function josa(word: string, type: "이/가" | "을/를" | "와/과"): string {
    const code = word.charCodeAt(word.length - 1);
    const has = code >= 0xAC00 && ((code - 0xAC00) % 28) !== 0;
    if (type === "이/가") return has ? "이" : "가";
    if (type === "을/를") return has ? "을" : "를";
    return has ? "과" : "와";
  }

  return (
    <div className="cs-root cs-root--dark">
      <header className="cs-detail-header cs-detail-header--dark">
        <button type="button" onClick={() => router.back()} className="cs-detail-back cs-detail-back--light">←</button>
        <span className="cs-detail-header-title cs-detail-header-title--light">
          {detail ? `${transitKo} ${aspectKo} ${natalKo}` : "흐름 분석"}
        </span>
        <span />
      </header>

      <main className="cs-transit-detail-main">
        {isLoading ? (
          <>
            <Skel w="45%" h="0.65rem" />
            <Skel w="90%" h="1.4rem" />
            <Skel w="75%" h="1.4rem" />
            <Skel w="82%" h="1.4rem" />
            <div style={{ marginTop: "2rem" }}><Skel w="100%" h="180px" /></div>
          </>
        ) : !detail ? (
          <p className="cs-td-loading">별 지도 데이터를 불러올 수 없습니다.</p>
        ) : (
          <>
            {/* ── eyebrow ── */}
            <p className="cs-td-intro">지금 이 에너지는—</p>

            {/* ── 3-line sentence ── */}
            <div className="cs-td-sentence">
              <p className="cs-td-sentence-subject">{detail.subjectPhrase}</p>
              <p className="cs-td-sentence-verb">{detail.verbPhrase},</p>
              <p className="cs-td-sentence-object">{detail.objectPhrase}.</p>
            </div>

            {/* ── SVG diagram ── */}
            <div className="cs-td-diagram-wrap">
              <TransitDiagramViz
                transitPlanet={detail.transitPlanet}
                natalPlanet={detail.natalPlanet}
                natalSignKo={natalSignKo}
                aspectType={detail.aspectType}
                aspectAngle={detail.aspectAngle}
                tone={detail.tone}
              />
            </div>

            {/* ── planet + aspect labels ── */}
            <div className="cs-td-labels">
              <div className="cs-td-label-col">
                <span className="cs-td-label-name" style={{ color: toneColor }}>{transitKo}</span>
                <span className="cs-td-label-sub">현재</span>
              </div>
              <div className="cs-td-label-center">
                <span className="cs-td-label-aspect">{aspectFull}</span>
                <span className="cs-td-label-angle">{detail.aspectAngle}°</span>
              </div>
              <div className="cs-td-label-col cs-td-label-col--right">
                <span className="cs-td-label-name">내 {natalSignKo} {natalKo}</span>
                <span className="cs-td-label-sub">탄생점</span>
              </div>
            </div>

            {/* ── aspect meaning ── */}
            <p className="cs-td-meaning">{ASPECT_MEANING[detail.aspectType]}</p>

            {/* ── domain tags ── */}
            <div className="cs-td-tags">
              {detail.domainTags.map((tag) => (
                <span key={tag} className="cs-td-tag">#{tag}</span>
              ))}
            </div>

            {/* ── orb info ── */}
            <p className="cs-td-orb">현재 오차각: {detail.orb.toFixed(1)}°</p>

            {/* ── recurrence ── */}
            <div className="cs-td-recurrence">
              <span className="cs-td-recurrence-label">반복 주기</span>
              <p className="cs-td-recurrence-text">
                이 흐름은 <strong>{transitKo}</strong>{josa(transitKo,"와/과")} <strong>{natalKo}</strong>{josa(natalKo,"이/가")} {aspectKo}를 이루는 매다 찾아옵니다.{" "}
                <strong>{detail.frequency}</strong> 나타나는 흐름이에요.
              </p>
            </div>

            {/* ── navigation ── */}
            {total > 1 && (
              <div className="cs-td-nav">
                {idx > 0 && (
                  <button
                    type="button"
                    className="cs-td-nav-btn"
                    onClick={() => router.push(`/home/transits/${idx - 1}${dateParam ? `?date=${dateParam}` : ""}`)}
                  >
                    ← 이전 흐름
                  </button>
                )}
                <span className="cs-td-nav-count">{idx + 1} / {total}</span>
                {idx < total - 1 && (
                  <button
                    type="button"
                    className="cs-td-nav-btn"
                    onClick={() => router.push(`/home/transits/${idx + 1}${dateParam ? `?date=${dateParam}` : ""}`)}
                  >
                    다음 흐름 →
                  </button>
                )}
              </div>
            )}

            {/* ── footer ── */}
            <p className="cs-td-footer">
              흔름(Transit)이란 하늘의 행성이 내 별 지도의 행성과 특정 각도를 이룰 때 발생하는 에너지입니다. 이 각도가 삶의 특정 영역을 활성화합니다.
            </p>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

export default function TransitDeepPage() {
  return <Suspense><TransitDeepPageInner /></Suspense>;
}
