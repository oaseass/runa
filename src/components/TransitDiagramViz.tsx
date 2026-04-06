"use client";

import { useId } from "react";
import type { PlanetName, AspectName } from "@/lib/astrology/types";

const GLYPH: Record<PlanetName, string> = {
  Sun:     "\u2609",
  Moon:    "\u263D",
  Mercury: "\u263F",
  Venus:   "\u2640",
  Mars:    "\u2642",
  Jupiter: "\u2643",
  Saturn:  "\u2644",
  Uranus:  "\u2645",
  Neptune: "\u2646",
  Pluto:   "\u2647",
};

const ASPECT_COLOR: Record<AspectName, string> = {
  conjunction: "#d4c8a8",
  trine:       "#5dc4a0",
  sextile:     "#6ab88a",
  square:      "#d46060",
  opposition:  "#d4904a",
};

const ASPECT_DASH: Record<AspectName, string> = {
  conjunction: "none",
  trine:       "none",
  sextile:     "7 4",
  square:      "3 3",
  opposition:  "10 5",
};

// Deterministic star field
const BIG_STARS = [
  { cx: 26,  cy: 28,  r: 1.4, op: 0.55 },
  { cx: 288, cy: 42,  r: 1.6, op: 0.6  },
  { cx: 160, cy: 18,  r: 1.2, op: 0.4  },
  { cx: 56,  cy: 148, r: 1.8, op: 0.45 },
  { cx: 264, cy: 155, r: 1.5, op: 0.5  },
  { cx: 110, cy: 8,   r: 1.0, op: 0.35 },
  { cx: 210, cy: 170, r: 1.1, op: 0.38 },
];

const SMALL_STARS = Array.from({ length: 38 }, (_, i) => ({
  cx: ((i * 43 + i * i * 11) % 304) + 8,
  cy: ((i * 61 + i * i * 7)  % 164) + 8,
  r:  i % 5 === 0 ? 0.9 : 0.55,
  op: 0.08 + (i % 6) * 0.028,
}));

const W = 320, H = 184;
const PR = 28; // planet circle radius

/* ?? Per-aspect geometry ??????????????????????????????????????????????????????
   Each returns planet centers (tx,ty) and (nx,ny), the SVG path for the
   aspect line(s), and badge position (bx,by).
   ???????????????????????????????????????????????????????????????????????????? */

type Geom = {
  tx: number; ty: number;  // transit planet center
  nx: number; ny: number;  // natal planet center
  linePath: string;        // full SVG d= string for the aspect geometry
  bx: number; by: number;  // badge center
};

function geomConjunction(): Geom {
  // Two planets nearly overlapping on the same axis, offset slightly
  const tx = 130, ty = H / 2;
  const nx = 190, ny = H / 2;
  // Short arc bridge between them (gap = 60 ??2*PR ??4px only)
  const linePath = `M ${tx + PR} ${ty} L ${nx - PR} ${ny}`;
  return { tx, ty, nx, ny, linePath, bx: (tx + nx) / 2, by: ty - 20 };
}

function geomSextile(): Geom {
  // 60deg -- gentle diagonal: transit top-left, natal bottom-right
  const tx = 76,  ty = 62;
  const nx = 244, ny = 122;
  const linePath = `M ${tx + PR * 0.70} ${ty + PR * 0.70} L ${nx - PR * 0.70} ${ny - PR * 0.70}`;
  return { tx, ty, nx, ny, linePath, bx: (tx + nx) / 2 - 4, by: (ty + ny) / 2 - 8 };
}

function geomSquare(): Geom {
  // 90deg -- L-shape: transit top-left, natal bottom-left of a right-angle corner
  // The corner vertex is at (tx, ny) ??forms a perfect right angle
  const tx = 80,  ty = 54;
  const cx = 200, cy = 130;   // corner point ??shifted right at ny height
  // Path: transit ??corner ??natal  (two segments, right angle at corner)
  const linePath =
    `M ${tx} ${ty + PR}` +          // bottom of transit planet
    ` L ${tx} ${cy}` +              // vertical drop to corner row
    ` L ${cx - PR} ${cy}`;          // horizontal run to natal ??right-angle corner
  // Actual planet positions: transit at (tx, ty), natal at (cx, cy=ny)
  return { tx, ty, nx: cx, ny: cy, linePath, bx: tx + (cx - tx) / 2, by: cy - 18 };
}

function geomTrine(): Geom {
  // 120deg -- wide triangle top-center as apex, two planets at base
  const tx = 70,  ty = 130;  // base-left
  const nx = 250, ny = 130;  // base-right
  const apexX = W / 2, apexY = 32; // apex top-center
  const linePath =
    `M ${tx + PR * 0.80} ${ty - PR * 0.30}` +  // from transit
    ` L ${apexX} ${apexY + 8}` +                // up to apex
    ` L ${nx - PR * 0.80} ${ny - PR * 0.30}`;   // down to natal
  return { tx, ty, nx, ny, linePath, bx: apexX, by: apexY - 10 };
}

function geomOpposition(): Geom {
  // 180deg -- perfect horizontal opposition
  const tx = 60,  ty = H / 2;
  const nx = 260, ny = H / 2;
  const linePath = `M ${tx + PR} ${ty} L ${nx - PR} ${ny}`;
  return { tx, ty, nx, ny, linePath, bx: W / 2, by: ty - 18 };
}

const GEOM_FN: Record<AspectName, () => Geom> = {
  conjunction: geomConjunction,
  sextile:     geomSextile,
  square:      geomSquare,
  trine:       geomTrine,
  opposition:  geomOpposition,
};

/* ?? Component ?????????????????????????????????????????????????????????????? */

type Props = {
  transitPlanet: PlanetName;
  natalPlanet: PlanetName;
  natalSignKo: string;
  aspectType: AspectName;
  aspectAngle: number;
  tone?: "strength" | "challenge" | "neutral";
};

export default function TransitDiagramViz({
  transitPlanet, natalPlanet, natalSignKo, aspectType, aspectAngle, tone,
}: Props) {
  const uid = useId().replace(/:/g, "");

  const color = ASPECT_COLOR[aspectType];
  const dash  = ASPECT_DASH[aspectType];
  const { tx, ty, nx, ny, linePath, bx, by } = (GEOM_FN[aspectType] ?? geomOpposition)();

  const glowR  = tone === "strength" ? PR + 18 : tone === "challenge" ? PR + 14 : PR + 10;
  const glowOp = tone === "strength" ? 0.22    : tone === "challenge" ? 0.17    : 0.12;

  // clamp badge inside SVG bounds
  const bx2 = Math.max(22, Math.min(W - 22, bx));
  const by2 = Math.max(12, Math.min(H - 12, by));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <defs>
        <radialGradient id={`${uid}Bg`} cx="50%" cy="50%" r="70%">
          <stop offset="0%"   stopColor="#111625" />
          <stop offset="100%" stopColor="#060810" />
        </radialGradient>
        <radialGradient id={`${uid}GlowT`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor={color}              stopOpacity={0.45} />
          <stop offset="100%" stopColor={color}              stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`${uid}GlowN`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="rgba(200,200,220,0.25)" />
          <stop offset="100%" stopColor="rgba(200,200,220,0)" />
        </radialGradient>
        <radialGradient id={`${uid}FillT`} cx="38%" cy="35%" r="65%">
          <stop offset="0%"   stopColor={color} stopOpacity={0.30} />
          <stop offset="100%" stopColor={color} stopOpacity={0.05} />
        </radialGradient>
      </defs>

      {/* Background */}
      <rect width={W} height={H} fill={`url(#${uid}Bg)`} rx={8} />

      {/* Stars */}
      {SMALL_STARS.map((s, i) => (
        <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill="#c8cce8" opacity={s.op} />
      ))}
      {BIG_STARS.map((s, i) => (
        <g key={`b${i}`} opacity={s.op}>
          <circle cx={s.cx} cy={s.cy} r={s.r} fill="white" />
          <line x1={s.cx - s.r*2.5} y1={s.cy} x2={s.cx + s.r*2.5} y2={s.cy}
            stroke="white" strokeWidth={0.5} opacity={0.5} />
          <line x1={s.cx} y1={s.cy - s.r*2.5} x2={s.cx} y2={s.cy + s.r*2.5}
            stroke="white" strokeWidth={0.5} opacity={0.5} />
        </g>
      ))}

      {/* ?? Aspect geometry ?? */}
      {/* Glow layer */}
      <path d={linePath} fill="none" stroke={color} strokeWidth={6}
        strokeOpacity={0.10} strokeLinecap="round" strokeLinejoin="round" />
      {/* Main line(s) */}
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.3}
        strokeDasharray={dash} strokeOpacity={0.72}
        strokeLinecap="round" strokeLinejoin="round" />

      {/* Square right-angle marker at corner */}
      {aspectType === "square" && (() => {
        // corner is at (tx, ny) in the square geometry: x=80, y=130
        const cornerX = tx, cornerY = ny;
        const s = 9; // marker size
        return (
          <path
            d={`M ${cornerX} ${cornerY - s} L ${cornerX + s} ${cornerY - s} L ${cornerX + s} ${cornerY}`}
            fill="none" stroke={color} strokeWidth={1.1} strokeOpacity={0.6}
            strokeLinejoin="round"
          />
        );
      })()}

      {/* ?? Transit planet ?? */}
      <circle cx={tx} cy={ty} r={glowR} fill={`url(#${uid}GlowT)`} opacity={glowOp} />
      <circle cx={tx} cy={ty} r={PR + 5}
        fill="none" stroke={color} strokeWidth={0.6} strokeOpacity={0.22} />
      <circle cx={tx} cy={ty} r={PR}
        fill={`url(#${uid}FillT)`} stroke={color} strokeWidth={1.5} strokeOpacity={0.88} />
      <text x={tx} y={ty - 1}
        textAnchor="middle" dominantBaseline="middle"
        fill="rgba(240,240,238,0.95)" fontSize={21}
        fontFamily="'Segoe UI Symbol','Apple Symbols','Noto Sans Symbols',serif">
        {GLYPH[transitPlanet]}
      </text>
      <text x={tx} y={ty + PR + 16}
        textAnchor="middle"
        fill={color} fontSize={8.5} letterSpacing="0.18em" fontWeight="700"
        fontFamily="inherit" opacity={0.92}>
        현재
      </text>

      {/* ?? Natal planet ?? */}
      <circle cx={nx} cy={ny} r={PR + 10} fill={`url(#${uid}GlowN)`} opacity={0.8} />
      <circle cx={nx} cy={ny} r={PR + 5}
        fill="none" stroke="rgba(200,200,220,0.18)" strokeWidth={1} strokeDasharray="2 3" />
      <circle cx={nx} cy={ny} r={PR}
        fill="rgba(200,200,220,0.05)"
        stroke="rgba(200,200,220,0.38)"
        strokeWidth={1.2} strokeDasharray="4 2" />
      <text x={nx} y={ny - 1}
        textAnchor="middle" dominantBaseline="middle"
        fill="rgba(220,220,230,0.88)" fontSize={21}
        fontFamily="'Segoe UI Symbol','Apple Symbols','Noto Sans Symbols',serif">
        {GLYPH[natalPlanet]}
      </text>
      <text x={nx} y={ny + PR + 16}
        textAnchor="middle"
        fill="rgba(200,200,220,0.72)" fontSize={8.5} letterSpacing="0.10em"
        fontFamily="inherit">
        {natalSignKo}
      </text>

      {/* ?? Angle badge ?? */}
      <rect x={bx2 - 22} y={by2 - 13} width={44} height={26} rx={13}
        fill="#0c0e1a" stroke={color} strokeWidth={1.0} strokeOpacity={0.75} />
      <text x={bx2} y={by2 + 1}
        textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize={11} fontWeight="700" letterSpacing="0.04em"
        fontFamily="inherit">
        {aspectAngle}°
      </text>
    </svg>
  );
}
