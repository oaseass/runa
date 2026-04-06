import type { NatalChart, PlanetName } from "@/lib/astrology/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const CX = 150, CY = 150;
const R_OUTER   = 128; // outer edge of zodiac ring
const R_SIGN_IN = 106; // inner edge of zodiac ring
const R_PLANET  = 82;  // primary planet radius
const R_PLANET2 = 97;  // offset radius for clustered planets
const R_INNER   = 44;  // innermost decorative circle

const SIGN_GLYPH = ["♈","♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓"] as const;

const PLANET_GLYPH: Partial<Record<PlanetName, string>> = {
  Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀",
  Mars: "♂", Jupiter: "♃", Saturn: "♄", Uranus: "♅",
  Neptune: "♆", Pluto: "♇",
};

// ── Geometry helpers ──────────────────────────────────────────────────────────

/**
 * Converts ecliptic longitude to SVG angle (radians).
 * ASC placed at 9 o'clock (left); ecliptic advances clockwise in the SVG.
 */
function lonToTheta(lon: number, ascLon: number): number {
  const offset = ((lon - ascLon) % 360 + 360) % 360;
  return (180 - offset) * (Math.PI / 180);
}

function pt(r: number, theta: number): readonly [number, number] {
  return [
    Math.round((CX + r * Math.cos(theta)) * 100) / 100,
    Math.round((CY + r * Math.sin(theta)) * 100) / 100,
  ] as const;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NatalChartViz({ chart }: { chart: NatalChart }) {
  const ascLon  = chart.ascendant.longitude;
  const mcTheta = lonToTheta(chart.midheaven.longitude, ascLon);

  // Whole-sign: H1 starts at the beginning of the ASC sign (nearest 30° floor)
  const h1Start = Math.floor(ascLon / 30) * 30;

  const sectors = Array.from({ length: 12 }, (_, i) => {
    const s = h1Start + i * 30;
    return {
      startTheta: lonToTheta(s, ascLon),
      midTheta:   lonToTheta(s + 15, ascLon),
      signIdx:    ((Math.floor(s / 30)) % 12 + 12) % 12,
      houseNum:   i + 1,
    };
  });

  // Simple collision avoidance: if two planets are within 16° assign the second
  // one to the alternate (outer) radius track.
  const sortedPlanets = [...chart.planets].sort((a, b) => a.longitude - b.longitude);
  const rMap = new Map<string, number>();
  sortedPlanets.forEach((p, i) => {
    const prev = sortedPlanets[i - 1];
    if (prev) {
      const gap = Math.min(
        ((p.longitude - prev.longitude) + 360) % 360,
        ((prev.longitude - p.longitude) + 360) % 360,
      );
      if (gap < 16 && (rMap.get(prev.planet) ?? R_PLANET) === R_PLANET) {
        rMap.set(p.planet, R_PLANET2);
        return;
      }
    }
    rMap.set(p.planet, R_PLANET);
  });

  // Axis endpoints
  const [ax, ay]   = pt(R_OUTER, Math.PI);           // ASC (left)
  const [dx, dy]   = pt(R_OUTER, 0);                 // DSC (right)
  const [mx, my]   = pt(R_OUTER, mcTheta);            // MC
  const [icx, icy] = pt(R_OUTER, mcTheta + Math.PI);  // IC

  return (
    <svg
      viewBox="0 0 300 300"
      width="100%"
      style={{ maxWidth: "260px", display: "block", margin: "0 auto" }}
      aria-label="출생 별 지도 차트"
    >
      {/* ── Ring outlines ── */}
      <circle cx={CX} cy={CY} r={R_OUTER}
        fill="none" stroke="rgba(20,21,22,0.14)" strokeWidth="0.75" />
      <circle cx={CX} cy={CY} r={R_SIGN_IN}
        fill="none" stroke="rgba(20,21,22,0.07)" strokeWidth="0.5" />
      <circle cx={CX} cy={CY} r={R_INNER}
        fill="none" stroke="rgba(20,21,22,0.1)" strokeWidth="0.5" />

      {/* ── House spokes ── */}
      {sectors.map(s => {
        const [ox, oy]   = pt(R_OUTER, s.startTheta);
        const [inx, iny] = pt(R_INNER, s.startTheta);
        const isAxis = [1, 4, 7, 10].includes(s.houseNum);
        return (
          <line key={s.houseNum}
            x1={inx} y1={iny} x2={ox} y2={oy}
            stroke={isAxis ? "rgba(20,21,22,0.13)" : "rgba(20,21,22,0.052)"}
            strokeWidth={isAxis ? 0.75 : 0.45}
          />
        );
      })}

      {/* ── Sign glyphs in zodiac band ── */}
      {sectors.map(s => {
        const r = (R_OUTER + R_SIGN_IN) / 2;
        const [x, y] = pt(r, s.midTheta);
        return (
          <text key={`sg${s.signIdx}`} x={x} y={y}
            textAnchor="middle" dominantBaseline="central"
            fontSize="7.5" fill="rgba(20,21,22,0.3)" fontFamily="serif">
            {SIGN_GLYPH[s.signIdx]}
          </text>
        );
      })}

      {/* ── House numbers ── */}
      {sectors.map(s => {
        const r = (R_SIGN_IN + R_INNER) / 2;
        const [x, y] = pt(r, s.midTheta);
        return (
          <text key={`hn${s.houseNum}`} x={x} y={y}
            textAnchor="middle" dominantBaseline="central"
            fontSize="5.5" fill="rgba(20,21,22,0.18)">
            {s.houseNum}
          </text>
        );
      })}

      {/* ── ASC–DSC axis ── */}
      <line x1={ax} y1={ay} x2={dx} y2={dy}
        stroke="rgba(20,21,22,0.22)" strokeWidth="0.75" strokeDasharray="3 2.5" />

      {/* ── MC–IC axis ── */}
      <line x1={mx} y1={my} x2={icx} y2={icy}
        stroke="rgba(20,21,22,0.22)" strokeWidth="0.75" strokeDasharray="3 2.5" />

      {/* ── ASC dot marker ── */}
      {(() => {
        const [x, y] = pt(R_OUTER, Math.PI);
        return <circle cx={x} cy={y} r="2.5" fill="rgba(20,21,22,0.45)" />;
      })()}

      {/* ── MC dot marker ── */}
      {(() => {
        const [x, y] = pt(R_OUTER, mcTheta);
        return <circle cx={x} cy={y} r="2" fill="none" stroke="rgba(20,21,22,0.4)" strokeWidth="1" />;
      })()}

      {/* ── Planet glyphs ── */}
      {chart.planets.map(p => {
        const theta = lonToTheta(p.longitude, ascLon);
        const r = rMap.get(p.planet) ?? R_PLANET;
        const [x, y] = pt(r, theta);
        return (
          <text key={p.planet} x={x} y={y}
            textAnchor="middle" dominantBaseline="central"
            fontSize="10" fill="rgba(20,21,22,0.82)" fontFamily="serif">
            {PLANET_GLYPH[p.planet] ?? "·"}
          </text>
        );
      })}

      {/* ── Retrograde markers ── */}
      {chart.planets.filter(p => p.retrograde).map(p => {
        const theta = lonToTheta(p.longitude, ascLon);
        const r = (rMap.get(p.planet) ?? R_PLANET) - 10;
        const [x, y] = pt(r, theta);
        return (
          <text key={`rx${p.planet}`} x={x} y={y}
            textAnchor="middle" dominantBaseline="central"
            fontSize="5" fill="rgba(20,21,22,0.32)">℞</text>
        );
      })}
    </svg>
  );
}
