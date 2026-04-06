import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/server/auth-session";
import { getOrComputeNatalChart, getNatalInterpretation } from "@/lib/server/chart-store";
import type { NatalInterpretation } from "@/lib/astrology/types";
import BottomNav from "@/components/BottomNav";
import BackButton from "@/components/BackButton";
import NatalChartViz from "./NatalChartViz";

const SIGN_KO: Record<string, string> = {
  Aries: "양자리", Taurus: "황소자리", Gemini: "쌍둥이자리",
  Cancer: "게자리", Leo: "사자자리", Virgo: "처녀자리",
  Libra: "천칭자리", Scorpio: "전갈자리", Sagittarius: "사수자리",
  Capricorn: "염소자리", Aquarius: "물병자리", Pisces: "물고기자리",
};

function NoDataState() {
  return (
    <main className="screen luna-article-screen" aria-label="Birth chart detail">
      <article className="luna-article-wrap">
        <BackButton />
        <header>
          <p className="luna-article-kicker">별 지도</p>
          <h1 className="luna-article-headline">차트를 아직 계산하지 못했습니다.</h1>
          <p className="luna-article-lede">생년월일, 출생 시각, 출생지를 입력하면 차트가 생성됩니다.</p>
        </header>
        <Link
          href="/birth-time?edit=1"
          className="luna-black-cta"
          style={{ marginTop: "1.6rem", display: "flex" }}
        >
          출생 정보 입력하기
        </Link>
        <BottomNav />
      </article>
    </main>
  );
}

export default async function ProfileChartPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);

  if (!session) {
    return <NoDataState />;
  }

  const chart = getOrComputeNatalChart(session.userId);
  const interp: NatalInterpretation | null = chart ? getNatalInterpretation(session.userId) : null;

  if (!chart || !interp) {
    return <NoDataState />;
  }

  return (
    <main className="screen luna-article-screen" aria-label="Birth chart detail">
      <article className="luna-article-wrap">
        <BackButton />

        {/* ── Natal wheel ── */}
        <div style={{ margin: "1rem 0 2rem" }}>
          <NatalChartViz chart={chart} />
          <p style={{
            fontSize: "0.5rem", letterSpacing: "0.18em", textAlign: "center",
            opacity: 0.22, marginTop: "0.7rem", textTransform: "uppercase",
          }}>
            탄생점 ● &nbsp;&nbsp; 중천 ○
          </p>
        </div>

        <header>
          <p className="luna-article-kicker">별 지도</p>
          <div className="luna-article-meta" role="note" aria-label="Chart metadata">
            <span className="luna-article-meta-text">루나</span>
            <span className="luna-article-meta-dot" aria-hidden="true" />
            <span className="luna-article-meta-text">{SIGN_KO[chart.ascendant.sign] ?? chart.ascendant.sign} 탄생점</span>
            <span className="luna-article-meta-dot" aria-hidden="true" />
            <span className="luna-article-meta-text">{chart.houseSystem === "whole-sign" ? "전체 사인 방식" : chart.houseSystem}</span>
          </div>
          <h1 className="luna-article-headline">{interp.headline}</h1>
          <p className="luna-article-lede">{interp.lede}</p>
        </header>

        <section className="luna-article-section" aria-label="Planet placements">
          <h2 className="luna-article-section-title">행성 배치</h2>
          <div className="luna-chart-list" role="list" aria-label="Planet placements">
            {interp.placements.map((p) => (
              <div key={p.planet} className="luna-chart-item" role="listitem">
                <div className="luna-chart-item-header">
                  <span className="luna-chart-planet">{p.planet}</span>
                  <span className="luna-chart-sign">{p.sign}</span>
                  <span className="luna-chart-house">{p.house}영역</span>
                </div>
                <p className="luna-chart-note">{p.note}</p>
              </div>
            ))}
          </div>
        </section>

        <Image
          src="/luna/assets/home/jupiter_planet_white_bg.jpg"
          alt=""
          width={80}
          height={80}
          style={{ width: "4.6rem", height: "4.6rem", display: "block", marginLeft: "auto",
            borderRadius: "999px", objectFit: "cover", filter: "grayscale(1)", opacity: 0.38,
            marginTop: "0.25rem", marginBottom: "0.1rem" }}
        />

        <section className="luna-article-section" aria-label="Sun + Moon summary">
          <h2 className="luna-article-section-title">태양과 달의 구조</h2>
          <p className="luna-article-body">{interp.sunSummary}</p>
          <p className="luna-article-body">{interp.moonSummary}</p>
        </section>

        <section className="luna-article-section" aria-label="Relationship pattern">
          <h2 className="luna-article-section-title">관계 에너지</h2>
          <p className="luna-article-body">{interp.venusSummary}</p>
        </section>

        <section className="luna-article-section" aria-label="Work and drive">
          <h2 className="luna-article-section-title">행동 · 방향 · 구조</h2>
          {interp.marsSaturnSummary.split("\n").map((line, i) => (
            <p key={i} className="luna-article-body">{line}</p>
          ))}
          <p className="luna-article-body" style={{ marginTop: "0.5rem", opacity: 0.8 }}>{interp.mcSummary}</p>
        </section>

        <section className="luna-article-section" aria-label="ASC summary">
          <h2 className="luna-article-section-title">탄생점</h2>
          <p className="luna-article-body">{interp.ascSummary}</p>
        </section>

        <section className="luna-article-section" aria-label="Dominant pattern">
          <h2 className="luna-article-section-title">지배적 에너지</h2>
          <p className="luna-article-body">{interp.dominantPattern}</p>
          {interp.keyAspects.map((text, i) => (
            <p key={i} className="luna-article-body">{text}</p>
          ))}
        </section>

        <div className="luna-article-pullquote" aria-label="Ascendant synthesis">
          <p className="luna-article-pullquote-kicker">{interp.pullquoteKicker}</p>
          <p className="luna-article-pullquote-text">
            {interp.pullquoteText.split("\n").map((line, i) => (
              <span key={i}>{line}{i === 0 ? <br /> : null}</span>
            ))}
          </p>
        </div>

        <BottomNav />
      </article>
    </main>
  );
}

