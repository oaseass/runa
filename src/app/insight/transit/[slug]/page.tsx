import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import BackButton from "@/components/BackButton";
import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/server/auth-session";
import { getTransitChartData } from "@/lib/server/chart-store";
import type { PlanetName, AspectName, TransitChartData } from "@/lib/astrology/types";
import TransitChartViz from "@/app/insight/today/_components/TransitChartViz";

/* ── Lookup tables ──────────────────────────────────────────── */

const PLANET_KO: Record<string, string> = {
  Sun: "태양", Moon: "달", Mercury: "수성", Venus: "금성",
  Mars: "화성", Jupiter: "목성", Saturn: "토성", Uranus: "천왕성",
  Neptune: "해왕성", Pluto: "명왕성",
};

const PLANET_GLYPH: Record<string, string> = {
  Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀",
  Mars: "♂", Jupiter: "♃", Saturn: "♄", Uranus: "♅",
  Neptune: "♆", Pluto: "♇",
};

const ASPECT_KO: Record<string, string> = {
  conjunction: "합", sextile: "육분", square: "긴장",
  trine: "조화", opposition: "대립",
};

const VALID_PLANETS = new Set([
  "Sun","Moon","Mercury","Venus","Mars",
  "Jupiter","Saturn","Uranus","Neptune","Pluto",
]);
const VALID_ASPECTS = new Set([
  "conjunction","sextile","square","trine","opposition",
]);

/* ── Slug parsing ───────────────────────────────────────────── */

function parseSlug(slug: string): {
  transitPlanet: PlanetName;
  aspect: AspectName;
  natalPlanet: PlanetName;
} | null {
  // format: {TransitPlanet}-{aspect}-{NatalPlanet}
  // e.g. Moon-trine-Sun  |  Mars-square-Jupiter
  const parts = slug.split("-");
  if (parts.length !== 3) return null;
  const [tp, asp, np] = parts;
  if (!VALID_PLANETS.has(tp) || !VALID_ASPECTS.has(asp) || !VALID_PLANETS.has(np)) return null;
  return {
    transitPlanet: tp as PlanetName,
    aspect: asp as AspectName,
    natalPlanet: np as PlanetName,
  };
}

/* ── Focused chart: only the two planets involved ──────────── */

function focusedChartData(
  full: TransitChartData,
  transitPlanet: PlanetName,
  natalPlanet: PlanetName,
  aspect: AspectName,
): TransitChartData {
  return {
    natalPlanets:   full.natalPlanets.filter((p) => p.planet === natalPlanet),
    transitPlanets: full.transitPlanets.filter((p) => p.planet === transitPlanet),
    houses:         full.houses,
    ascendantLon:   full.ascendantLon,
    activeAspects:  full.activeAspects.filter(
      (a) => a.transitPlanet === transitPlanet && a.natalPlanet === natalPlanet && a.aspect === aspect,
    ),
  };
}

/* ── Page ───────────────────────────────────────────────────── */

export default async function TransitDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const parsed = parseSlug(slug);
  if (!parsed) notFound();

  const { transitPlanet, aspect, natalPlanet } = parsed;

  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);
  if (!session) redirect("/");

  const fullData = getTransitChartData(session.userId, new Date());
  if (!fullData) redirect("/home");

  // Find the matching aspect record for phrase + orb
  const aspectRecord = fullData.activeAspects.find(
    (a) => a.transitPlanet === transitPlanet && a.natalPlanet === natalPlanet && a.aspect === aspect,
  );
  if (!aspectRecord) notFound();

  const focused = focusedChartData(fullData, transitPlanet, natalPlanet, aspect);

  const tpGlyph = PLANET_GLYPH[transitPlanet] ?? "";
  const npGlyph = PLANET_GLYPH[natalPlanet]   ?? "";
  const tpKo    = PLANET_KO[transitPlanet]    ?? transitPlanet;
  const npKo    = PLANET_KO[natalPlanet]      ?? natalPlanet;
  const aspKo   = ASPECT_KO[aspect]           ?? aspect;

  return (
    <main className="screen luna-editorial-screen" aria-label="흐름 상세">
      <div className="luna-dr-wrap">

        {/* ── 상단 ── */}
        <p className="luna-dr-system-line" aria-hidden="true">
          LUNA · 흐름 상세
        </p>

        <BackButton />

        {/* ── 행성 헤더 ── */}
        <header style={{ marginBottom: "1.5rem" }}>
          <p style={{
            fontSize: "0.58rem",
            letterSpacing: "0.14em",
            opacity: 0.35,
            marginBottom: "0.5rem",
          }}>
            {aspKo}
          </p>

          <div style={{
            display: "flex",
            alignItems: "baseline",
            gap: "0.6rem",
            flexWrap: "wrap",
            marginBottom: "0.4rem",
          }}>
            <span style={{ fontSize: "1.6rem", opacity: 0.55, lineHeight: 1 }}>{tpGlyph}</span>
            <span style={{ fontSize: "1.1rem", fontWeight: 500, letterSpacing: "-0.01em" }}>{tpKo}</span>
            <span style={{ fontSize: "0.9rem", opacity: 0.32, padding: "0 0.2rem" }}>
              {aspKo}각
            </span>
            <span style={{ fontSize: "1.6rem", opacity: 0.55, lineHeight: 1 }}>{npGlyph}</span>
            <span style={{ fontSize: "1.1rem", fontWeight: 500, letterSpacing: "-0.01em" }}>{npKo}</span>
            <span style={{ fontSize: "0.72rem", opacity: 0.28 }}>orb {aspectRecord.orb.toFixed(1)}°</span>
          </div>
        </header>

        {/* ── 집중 차트 (두 행성만) ── */}
        <div style={{ marginBottom: "1.6rem" }}>
          <TransitChartViz data={focused} />
        </div>

        {/* ── 해석 문장 ── */}
        <div style={{
          borderLeft: "1.5px solid rgba(20,21,22,0.18)",
          paddingLeft: "1.1rem",
          marginBottom: "2rem",
        }}>
          <p style={{
            fontSize: "0.96rem",
            lineHeight: 1.72,
            fontStyle: "italic",
            opacity: 0.65,
          }}>
            &ldquo;{aspectRecord.phrase}&rdquo;
          </p>
        </div>

        {/* ── 전체 해석으로 ── */}
        <Link
          href="/insight/today"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "0.76rem",
            opacity: 0.45,
            textDecoration: "none",
            color: "inherit",
            borderTop: "1px solid rgba(20,21,22,0.07)",
            paddingTop: "0.75rem",
            marginBottom: "0.6rem",
          }}
        >
          <span>오늘 전체 해석 읽기</span>
          <span>→</span>
        </Link>

        <Link
          href="/void"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "0.76rem",
            opacity: 0.38,
            textDecoration: "none",
            color: "inherit",
            borderTop: "1px solid rgba(20,21,22,0.06)",
            paddingTop: "0.65rem",
            marginBottom: "1.2rem",
          }}
        >
          <span>이 에너지에 대해 Void에게 물어보기</span>
          <span>→</span>
        </Link>

        <BottomNav />
      </div>
    </main>
  );
}
