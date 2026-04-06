"use client";

import type { TransitChartData, PlanetName } from "@/lib/astrology/types";

type Props = {
  chartData: TransitChartData | null;
  date: Date;
};

const SIZE = 240;
const CX = SIZE / 2;
const CY = SIZE / 2;

// Ring radii (inner → outer)
const RINGS = [44, 68, 92] as const;

// Static fallback planet placements (ring index + base angle offset in degrees)
const STATIC_PLANETS: Array<{ glyph: string; ring: 0 | 1 | 2; base: number; speed: number }> = [
  { glyph: "☉", ring: 1, base: 0,   speed: 0.98 },   // Sun
  { glyph: "☽", ring: 0, base: 72,  speed: 13.2 },   // Moon
  { glyph: "♀", ring: 1, base: 144, speed: 1.6 },    // Venus
  { glyph: "☿", ring: 0, base: 216, speed: 4.1 },    // Mercury
  { glyph: "♂", ring: 2, base: 288, speed: 0.52 },   // Mars
];

const GLYPH_MAP: Partial<Record<PlanetName, string>> = {
  Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀",
  Mars: "♂", Jupiter: "♃", Saturn: "♄",
};

const MAIN_PLANETS: PlanetName[] = ["Sun", "Moon", "Mercury", "Venus", "Mars"];

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function lonToSvgDeg(lon: number, ascLon: number): number {
  return ((180 + lon - ascLon) % 360 + 360) % 360;
}

// Epoch day (deterministic per calendar day)
function epochDay(date: Date): number {
  return Math.floor(date.getTime() / 86_400_000);
}

export default function OrbitViz({ chartData, date }: Props) {
  const day = epochDay(date);

  // Build rendered planet list
  const planets: Array<{ glyph: string; x: number; y: number }> = [];

  if (chartData && chartData.transitPlanets.length > 0) {
    const ascLon = chartData.ascendantLon;
    MAIN_PLANETS.forEach((name, idx) => {
      const found = chartData.transitPlanets.find((p) => p.planet === name);
      if (!found) return;
      const glyph = GLYPH_MAP[name] ?? "·";
      const r = RINGS[idx % RINGS.length];
      const svgDeg = lonToSvgDeg(found.longitude, ascLon);
      const rad = toRad(svgDeg);
      planets.push({ glyph, x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) });
    });
  } else {
    // Date-seeded fallback so it changes daily but is stable within a render
    for (const p of STATIC_PLANETS) {
      const angle = ((p.base + day * p.speed) % 360 + 360) % 360;
      const r = RINGS[p.ring];
      const rad = toRad(angle);
      planets.push({ glyph: p.glyph, x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) });
    }
  }

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      aria-hidden="true"
      style={{ display: "block", margin: "0 auto" }}
    >
      {/* Concentric orbit rings */}
      <circle cx={CX} cy={CY} r={RINGS[0]} fill="none" stroke="rgba(20,21,22,0.07)" strokeWidth={0.75} strokeDasharray="1.5 5" />
      <circle cx={CX} cy={CY} r={RINGS[1]} fill="none" stroke="rgba(20,21,22,0.09)" strokeWidth={0.75} />
      <circle cx={CX} cy={CY} r={RINGS[2]} fill="none" stroke="rgba(20,21,22,0.06)" strokeWidth={0.75} strokeDasharray="4 8" />

      {/* Inner halo + center dot (self) */}
      <circle cx={CX} cy={CY} r={14} fill="none" stroke="rgba(20,21,22,0.1)" strokeWidth={0.5} />
      <circle cx={CX} cy={CY} r={3.5} fill="rgba(20,21,22,0.6)" />

      {/* Planet glyphs */}
      {planets.map((p, i) => (
        <text
          key={i}
          x={p.x}
          y={p.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={11}
          fontFamily="inherit"
          fill="rgba(20,21,22,0.38)"
        >
          {p.glyph}
        </text>
      ))}
    </svg>
  );
}
