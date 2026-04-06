"use client";

import type { PlanetName, AspectName, TransitChartData } from "@/lib/astrology/types";

/* ─────────────────────────────────────────────────────────────
   Geometry constants
   ───────────────────────────────────────────────────────────── */
const CX   = 160;
const CY   = 160;
const SIZE = 320;

const R = {
  earth:     22,
  earthGlow: 30,
  natal:     84,   // inner ring  — natal planets
  transit:  122,   // outer ring  — transit planets
  houseTick: 131,  // house cusp tick outer end
  houseNum:  148,  // house number text placement
  ctrlPt:    46,   // bézier control-point radius (curves toward earth)
} as const;

/* ─────────────────────────────────────────────────────────────
   Look-up tables
   ───────────────────────────────────────────────────────────── */
const GLYPH: Record<PlanetName, string> = {
  Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀", Mars: "♂",
  Jupiter: "♃", Saturn: "♄", Uranus: "♅", Neptune: "♆", Pluto: "♇",
};

// Darker colours that read well on #f2f2ef
const ASPECT_COLOR: Record<AspectName, string> = {
  conjunction: "rgba(20,21,22,0.65)",
  trine:       "#2a7d66",
  sextile:     "#3a7244",
  square:      "#a03535",
  opposition:  "#8a5518",
};

const ASPECT_LABEL: Record<AspectName, string> = {
  conjunction: "합",
  trine:       "조화",
  sextile:     "육분",
  square:      "긴장",
  opposition:  "대립",
};

/* ─────────────────────────────────────────────────────────────
   Math helpers
   ───────────────────────────────────────────────────────────── */

/**
 * Ecliptic longitude → SVG angle (degrees).
 *
 * Ascendant placed at 9 o'clock (SVG 180°).
 * Ecliptic longitude increases counter-clockwise on screen
 * = increasing SVG angle (because SVG y-axis points down).
 *
 *   svgAngle = (180 + lon − ascLon) mod 360
 */
function lonToSvgDeg(lon: number, ascLon: number): number {
  return ((180 + lon - ascLon) % 360 + 360) % 360;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function polar(angleDeg: number, r: number): { x: number; y: number } {
  const a = toRad(angleDeg);
  return {
    x: Math.round((CX + r * Math.cos(a)) * 1e4) / 1e4,
    y: Math.round((CY + r * Math.sin(a)) * 1e4) / 1e4,
  };
}

/** Point on a cubic Bézier at t = 0.5 */
function bezierMid(
  p0: { x: number; y: number },
  c1: { x: number; y: number },
  c2: { x: number; y: number },
  p3: { x: number; y: number },
) {
  const round = (v: number) => Math.round(v * 1e4) / 1e4;
  return {
    x: round(p0.x / 8 + (3 * c1.x) / 8 + (3 * c2.x) / 8 + p3.x / 8),
    y: round(p0.y / 8 + (3 * c1.y) / 8 + (3 * c2.y) / 8 + p3.y / 8),
  };
}

/* ─────────────────────────────────────────────────────────────
   Component
   ───────────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────
   Color palettes — light (default) vs dark backgrounds
   ───────────────────────────────────────────────────────────── */
function makeColors(dark: boolean) {
  return dark ? {
    ring1:          "rgba(255,255,255,0.48)",
    ring2:          "rgba(255,255,255,0.64)",
    cusp:           "rgba(255,255,255,0.28)",
    houseNum:       "rgba(255,255,255,0.65)",
    axisLabel:      "rgba(255,255,255,0.70)",
    natalActive:    (a: number) => `rgba(255,255,255,${a})`,
    natalInactive:  "rgba(255,255,255,0.72)",
    transitActive:  (a: number) => `rgba(255,255,255,${a})`,
    transitInactive:"rgba(255,255,255,0.62)",
    legendText:     "rgba(255,255,255,0.62)",
  } : {
    ring1:          "rgba(20,21,22,0.26)",
    ring2:          "rgba(20,21,22,0.40)",
    cusp:           "rgba(20,21,22,0.16)",
    houseNum:       "rgba(20,21,22,0.48)",
    axisLabel:      "rgba(20,21,22,0.50)",
    natalActive:    (a: number) => `rgba(20,21,22,${a})`,
    natalInactive:  "rgba(20,21,22,0.56)",
    transitActive:  (a: number) => `rgba(20,21,22,${a})`,
    transitInactive:"rgba(20,21,22,0.42)",
    legendText:     "rgba(20,21,22,0.46)",
  };
}

export default function TransitChartViz({ data, dark = false }: { data: TransitChartData; dark?: boolean }) {
  const { natalPlanets, transitPlanets, houses, ascendantLon, activeAspects } = data;
  const C = makeColors(dark);

  const transitLonMap = new Map(transitPlanets.map((p) => [p.planet, p.longitude]));
  const natalLonMap   = new Map(natalPlanets.map((p) => [p.planet, p.longitude]));
  const activeTNames  = new Set(activeAspects.map((a) => a.transitPlanet));
  const activeNNames  = new Set(activeAspects.map((a) => a.natalPlanet));

  return (
    <figure aria-label="Transit chart" style={{ margin: "0 0 0.6rem" }}>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width="100%"
        style={{ display: "block", maxHeight: "72vw" }}
        role="img"
        aria-label="행성 흐름 휠 차트"
      >
        <defs>
          {/* Earth core gradient */}
          <radialGradient id="tcv-earth" cx="38%" cy="32%" r="68%">
            <stop offset="0%"   stopColor="#5a80a8" />
            <stop offset="55%"  stopColor="#2a4060" />
            <stop offset="100%" stopColor="#0e1e30" />
          </radialGradient>

          {/* Earth atmospheric glow */}
          <radialGradient id="tcv-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="rgba(80,120,180,0.22)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>

          {/* Arrowhead markers — one per aspect colour */}
          {(Object.entries(ASPECT_COLOR) as [AspectName, string][]).map(([name, color]) => (
            <marker
              key={name}
              id={`tcv-arrow-${name}`}
              markerWidth="6"
              markerHeight="6"
              refX="5"
              refY="3"
              orient="auto"
            >
              <path d="M0 0 L6 3 L0 6 Z" fill={color} fillOpacity="0.8" />
            </marker>
          ))}
        </defs>

        {/* ── House cusp lines — from center to just past transit ring ── */}
        {houses.map((h) => {
          const angle = lonToSvgDeg(h.longitude, ascendantLon);
          const inner = polar(angle, 6);
          const outer = polar(angle, R.houseTick);
          return (
            <line
              key={`hcusp-${h.house}`}
              x1={inner.x} y1={inner.y}
              x2={outer.x} y2={outer.y}
              stroke={C.cusp}
              strokeWidth="0.6"
            />
          );
        })}

        {/* ── Transit ring (outer) ── */}
        <circle
          cx={CX} cy={CY} r={R.transit}
          fill="none"
          stroke={C.ring1}
          strokeWidth="0.8"
        />

        {/* ── Natal ring (inner) ── */}
        <circle
          cx={CX} cy={CY} r={R.natal}
          fill="none"
          stroke={C.ring2}
          strokeWidth="0.8"
        />

        {/* ── Aspect curves: transit → natal ── */}
        {activeAspects.map((asp, i) => {
          const tLon = transitLonMap.get(asp.transitPlanet);
          const nLon = natalLonMap.get(asp.natalPlanet);
          if (tLon == null || nLon == null) return null;

          const tAngle = lonToSvgDeg(tLon, ascendantLon);
          const nAngle = lonToSvgDeg(nLon, ascendantLon);

          const p0 = polar(tAngle, R.transit);  // start: transit planet
          const p3 = polar(nAngle, R.natal);    // end: natal planet
          const c1 = polar(tAngle, R.ctrlPt);   // control: inward from transit
          const c2 = polar(nAngle, R.ctrlPt);   // control: inward from natal

          const color = ASPECT_COLOR[asp.aspect as AspectName] ?? "rgba(20,21,22,0.5)";
          const label = ASPECT_LABEL[asp.aspect as AspectName] ?? asp.aspect;

          // Label at bézier midpoint, nudged radially outward from center
          const mid = bezierMid(p0, c1, c2, p3);
          const dx  = mid.x - CX;
          const dy  = mid.y - CY;
          const len = Math.hypot(dx, dy) || 1;
          const lx  = mid.x + (dx / len) * 10;
          const ly  = mid.y + (dy / len) * 10;

          return (
            <g key={`asp-${i}`}>
              <path
                d={`M ${p0.x} ${p0.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p3.x} ${p3.y}`}
                fill="none"
                stroke={color}
                strokeWidth="1"
                strokeOpacity="0.65"
                markerEnd={`url(#tcv-arrow-${asp.aspect})`}
              />
              <text
                x={lx} y={ly}
                textAnchor="middle"
                dominantBaseline="middle"
                fontFamily="inherit"
                fontSize="6.5"
                fontStyle="italic"
                fill={color}
                fillOpacity="0.75"
                style={{ userSelect: "none", pointerEvents: "none" }}
              >
                {label}
              </text>
            </g>
          );
        })}

        {/* ── House numbers ── */}
        {houses.map((h) => {
          const midAngle = lonToSvgDeg(h.longitude + 15, ascendantLon);
          const pos = polar(midAngle, R.houseNum);
          return (
            <text
              key={`hnum-${h.house}`}
              x={pos.x} y={pos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily="inherit"
              fontSize="7.5"
              fill={C.houseNum}
              style={{ userSelect: "none" }}
            >
              {h.house}
            </text>
          );
        })}

        {/* ── Natal planet glyphs (inner ring) ── */}
        {natalPlanets.map((p) => {
          const angle  = lonToSvgDeg(p.longitude, ascendantLon);
          const pos    = polar(angle, R.natal);
          const active = activeNNames.has(p.planet);
          return (
            <text
              key={`natal-${p.planet}`}
              x={pos.x} y={pos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily="'Segoe UI Symbol', 'Apple Symbols', 'Noto Sans Symbols', 'DejaVu Sans', serif"
              fontSize={active ? "12" : "10.5"}
              fill={active ? C.natalActive(0.82) : C.natalInactive}
              style={{ userSelect: "none" }}
            >
              {GLYPH[p.planet as PlanetName]}
              {p.retrograde && (
                <tspan fontSize="5.5" baselineShift="super" dx="0.5">R</tspan>
              )}
            </text>
          );
        })}

        {/* ── Transit planet glyphs (outer ring) ── */}
        {transitPlanets.map((p) => {
          const angle  = lonToSvgDeg(p.longitude, ascendantLon);
          const pos    = polar(angle, R.transit);
          const active = activeTNames.has(p.planet);
          return (
            <text
              key={`transit-${p.planet}`}
              x={pos.x} y={pos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily="'Segoe UI Symbol', 'Apple Symbols', 'Noto Sans Symbols', 'DejaVu Sans', serif"
              fontSize={active ? "13" : "11"}
              fontWeight={active ? "500" : "400"}
              fill={active ? C.transitActive(0.88) : C.transitInactive}
              style={{ userSelect: "none" }}
            >
              {GLYPH[p.planet as PlanetName]}
            </text>
          );
        })}

        {/* ── Earth: atmospheric glow ── */}
        <circle cx={CX} cy={CY} r={R.earthGlow} fill="url(#tcv-glow)" />

        {/* ── Earth: planet body ── */}
        <circle cx={CX} cy={CY} r={R.earth} fill="url(#tcv-earth)" />

        {/* ── Earth: specular highlight ── */}
        <ellipse
          cx={CX - 7} cy={CY - 7}
          rx="5" ry="3.2"
          fill="rgba(255,255,255,0.12)"
        />

        {/* ── Earth: rim ── */}
        <circle
          cx={CX} cy={CY} r={R.earth}
          fill="none"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth="0.5"
        />

        {/* ── AC / DC axis labels ── */}
        {(() => {
          const ac = polar(180, R.natal - 7);
          const dc = polar(0,   R.natal - 7);
          return (
            <>
              <text x={ac.x - 4} y={ac.y}
                textAnchor="end" dominantBaseline="middle"
                fontSize="6" fill={C.axisLabel}
                style={{ userSelect: "none" }}>AC</text>
              <text x={dc.x + 4} y={dc.y}
                textAnchor="start" dominantBaseline="middle"
                fontSize="6" fill={C.axisLabel}
                style={{ userSelect: "none" }}>DC</text>
            </>
          );
        })()}
      </svg>

      {/* ── Legend ── */}
      <div style={{
        display: "flex",
        justifyContent: "center",
        gap: "1.4rem",
        padding: "0.4rem 0 0.1rem",
        fontSize: "0.58rem",
        letterSpacing: "0.1em",
        color: C.legendText,
      }}>
        <span>안쪽 — 출생 행성</span>
        <span>바깥쪽 — 흐름 행성</span>
      </div>
    </figure>
  );
}
