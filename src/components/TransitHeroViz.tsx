"use client";

import { useId } from "react";
import type { PlanetName, AspectName } from "@/lib/astrology/types";

export type TransitHeroVizProps = {
  transitPlanet: PlanetName;
  natalPlanet: PlanetName;
  natalSign: string;          // Korean sign name
  aspectType: AspectName;
  aspectAngle: number;        // 0 | 60 | 90 | 120 | 180
  orb: number;
  tone: "strength" | "challenge" | "neutral";
  transitLabel: string;       // e.g. "금성 NOW"
  natalLabel: string;         // e.g. "YOUR 양자리 토성"
  aspectLabel: string;        // e.g. "CONJUNCTION (0°)"
  frequency: string;          // e.g. "약 6개월마다 한 번씩"
};

// ── Planet visual config ───────────────────────────────────────────────────────

const P: Record<string, {
  color: string;   // base color
  glow: string;    // glow/dark edge color
  r: number;       // radius
  glyph: string;   // astrological symbol
  ring?: boolean;  // Saturn ring
}> = {
  Sun:     { color: "#FFD050", glow: "#FF8800", r: 14, glyph: "☉" },
  Moon:    { color: "#A8BCDE", glow: "#5070A0", r: 12, glyph: "☽" },
  Mercury: { color: "#48A8C0", glow: "#1C7890", r: 9,  glyph: "☿" },
  Venus:   { color: "#E87AB8", glow: "#B03870", r: 12, glyph: "♀" },
  Mars:    { color: "#D84030", glow: "#981000", r: 12, glyph: "♂" },
  Jupiter: { color: "#D8A030", glow: "#986800", r: 14, glyph: "♃" },
  Saturn:  { color: "#C09838", glow: "#786010", r: 12, glyph: "♄", ring: true },
  Uranus:  { color: "#48C8D8", glow: "#188898", r: 10, glyph: "♅" },
  Neptune: { color: "#2848C0", glow: "#102898", r: 10, glyph: "♆" },
  Pluto:   { color: "#683090", glow: "#381060", r: 9,  glyph: "♇" },
};

// ── Aspect layouts — planet centers in 320×230 viewBox ────────────────────────

type Layout = { tx: number; ty: number; nx: number; ny: number };

const LAYOUT: Record<string, Layout> = {
  conjunction: { tx: 160, ty: 74,  nx: 160, ny: 154 },  // tight vertical
  sextile:     { tx: 108, ty: 68,  nx: 216, ny: 156 },  // gentle diagonal ↗
  square:      { tx: 78,  ty: 115, nx: 242, ny: 115 },  // horizontal tension
  trine:       { tx: 90,  ty: 64,  nx: 232, ny: 160 },  // wide diagonal
  opposition:  { tx: 52,  ty: 115, nx: 268, ny: 115 },  // maximum spread
};

// ── Label anchor positions ─────────────────────────────────────────────────────

type LabelPos = { x: number; y: number; anchor: "start" | "middle" | "end" };
type Labels = { tl: LabelPos; nl: LabelPos };

const LABEL_POS: Record<string, Labels> = {
  conjunction: {
    tl: { x: 160, y: 44,  anchor: "middle" },
    nl: { x: 160, y: 188, anchor: "middle" },
  },
  sextile: {
    tl: { x: 108, y: 42,  anchor: "middle" },
    nl: { x: 216, y: 190, anchor: "middle" },
  },
  square: {
    tl: { x: 78,  y: 87,  anchor: "middle" },
    nl: { x: 242, y: 87,  anchor: "middle" },
  },
  trine: {
    tl: { x: 90,  y: 38,  anchor: "middle" },
    nl: { x: 232, y: 196, anchor: "middle" },
  },
  opposition: {
    tl: { x: 52,  y: 87,  anchor: "start" },
    nl: { x: 268, y: 87,  anchor: "end" },
  },
};

// ── Aspect line style by tone ──────────────────────────────────────────────────

const LINE: Record<string, { stroke: string; w: number; dash?: string }> = {
  strength:  { stroke: "rgba(255,195,55,0.52)", w: 1.2 },
  challenge: { stroke: "rgba(218,64,44,0.48)",  w: 1.2, dash: "5 3" },
  neutral:   { stroke: "rgba(155,155,175,0.36)", w: 1 },
};

// ── Decorative stars [x, y, r] ────────────────────────────────────────────────

const STARS: [number, number, number][] = [
  [16,10,0.8],[44,7,0.6],[80,20,0.9],[116,13,0.7],[154,5,0.8],[196,17,0.6],
  [236,9,0.9],[272,23,0.7],[306,15,0.8],[28,44,0.6],[66,57,0.8],[143,37,0.7],
  [202,51,0.9],[258,41,0.7],[298,54,0.6],[12,82,0.7],[54,98,0.8],[136,90,0.6],
  [246,86,0.7],[310,82,0.9],[22,140,0.6],[70,156,0.8],[162,148,0.7],[222,162,0.6],
  [284,145,0.8],[308,160,0.7],[38,188,0.7],[98,198,0.6],[176,205,0.8],
  [238,194,0.7],[295,200,0.6],
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function TransitHeroViz({
  transitPlanet,
  natalPlanet,
  natalSign,
  aspectType,
  aspectAngle,
  orb,
  tone,
  transitLabel,
  natalLabel,
  frequency,
}: TransitHeroVizProps) {
  void natalSign;
  const uid = useId().replace(/:/g, "");

  const tc = P[transitPlanet] ?? P["Sun"];
  const nc = P[natalPlanet]   ?? P["Moon"];
  const ly = LAYOUT[aspectType]    ?? LAYOUT["conjunction"];
  const lb = LABEL_POS[aspectType] ?? LABEL_POS["conjunction"];
  const ln = LINE[tone]            ?? LINE["neutral"];

  const { tx, ty, nx, ny } = ly;
  const mx = (tx + nx) / 2;
  const my = (ty + ny) / 2;

  const isConjunction = aspectType === "conjunction";

  return (
    <svg
      viewBox="0 0 320 230"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      {/* ── Defs ── */}
      <defs>
        <radialGradient id={`${uid}Bg`} cx="50%" cy="46%" r="62%">
          <stop offset="0%"   stopColor="#0E1020" />
          <stop offset="100%" stopColor="#060810" />
        </radialGradient>

        {/* Transit planet: brighter, full saturation */}
        <radialGradient id={`${uid}TF`} cx="32%" cy="28%" r="68%">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="45%"  stopColor={tc.color} />
          <stop offset="100%" stopColor={tc.glow} />
        </radialGradient>
        <radialGradient id={`${uid}TG`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor={tc.color} stopOpacity="0.40" />
          <stop offset="100%" stopColor={tc.glow}  stopOpacity="0" />
        </radialGradient>

        {/* Natal planet: desaturated, slightly dimmer */}
        <radialGradient id={`${uid}NF`} cx="32%" cy="28%" r="68%">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="45%"  stopColor={nc.color} stopOpacity="0.85" />
          <stop offset="100%" stopColor={nc.glow}  stopOpacity="0.85" />
        </radialGradient>
        <radialGradient id={`${uid}NG`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor={nc.color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={nc.glow}  stopOpacity="0" />
        </radialGradient>

        {/* Conjunction merge glow */}
        {isConjunction && (
          <radialGradient id={`${uid}CJ`} cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor={tc.color} stopOpacity="0.20" />
            <stop offset="55%"  stopColor={nc.color} stopOpacity="0.10" />
            <stop offset="100%" stopColor={tc.glow}  stopOpacity="0" />
          </radialGradient>
        )}

        <filter id={`${uid}Blur`} x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation="5.5" />
        </filter>
        {/* Stronger blur for outer glow */}
        <filter id={`${uid}Blur2`} x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      {/* ── Background ── */}
      <rect width="320" height="230" fill={`url(#${uid}Bg)`} />

      {/* ── Stars ── */}
      {STARS.map(([sx, sy, sr], i) => (
        <circle
          key={i}
          cx={sx} cy={sy} r={sr}
          fill="white"
          opacity={0.18 + (i % 5) * 0.07}
        />
      ))}

      {/* ── Conjunction merge halo ── */}
      {isConjunction && (
        <ellipse
          cx={mx} cy={my}
          rx={tc.r * 3.2} ry={tc.r * 2.4}
          fill={`url(#${uid}CJ)`}
          filter={`url(#${uid}Blur2)`}
        />
      )}

      {/* ── Aspect connection ── */}
      {!isConjunction && (
        <>
          {/* Outer soft glow of the line */}
          <line
            x1={tx} y1={ty} x2={nx} y2={ny}
            stroke={ln.stroke}
            strokeWidth={ln.w * 6}
            strokeLinecap="round"
            opacity={0.18}
            filter={`url(#${uid}Blur)`}
          />
          {/* Main line */}
          <line
            x1={tx} y1={ty} x2={nx} y2={ny}
            stroke={ln.stroke}
            strokeWidth={ln.w}
            strokeDasharray={ln.dash}
            strokeLinecap="round"
          />
        </>
      )}

      {/* ── Angle badge at midpoint ── */}
      <g>
        <rect
          x={mx - 17} y={my - 7.5}
          width={34} height={14}
          rx={7}
          fill="rgba(255,255,255,0.07)"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={0.6}
        />
        <text
          x={mx} y={my + 4}
          textAnchor="middle"
          fontSize={7}
          fill="rgba(255,255,255,0.6)"
          fontFamily="system-ui, sans-serif"
          letterSpacing="0.08em"
        >
          {aspectAngle}°
        </text>
      </g>

      {/* ── Transit planet (moving — brighter) ── */}
      {/* Outer diffuse glow */}
      <circle
        cx={tx} cy={ty}
        r={tc.r * 3.2}
        fill={`url(#${uid}TG)`}
        filter={`url(#${uid}Blur2)`}
      />
      {/* Mid glow */}
      <circle
        cx={tx} cy={ty}
        r={tc.r * 2.0}
        fill={`url(#${uid}TG)`}
        opacity={0.55}
        filter={`url(#${uid}Blur)`}
      />
      {/* Planet body */}
      <circle cx={tx} cy={ty} r={tc.r} fill={`url(#${uid}TF)`} />
      {/* Glyph */}
      <text
        x={tx} y={ty + tc.r * 0.38}
        textAnchor="middle"
        fontSize={tc.r * 1.05}
        fill="rgba(255,255,255,0.92)"
        fontFamily="system-ui, sans-serif"
      >
        {tc.glyph}
      </text>
      {/* "NOW" indicator — small dot top-right */}
      <circle
        cx={tx + tc.r * 0.72}
        cy={ty - tc.r * 0.72}
        r={2.5}
        fill={tc.color}
        opacity={0.95}
      />

      {/* ── Natal planet (fixed — slightly dimmer, desaturated) ── */}
      {/* Outer diffuse glow */}
      <circle
        cx={nx} cy={ny}
        r={nc.r * 2.8}
        fill={`url(#${uid}NG)`}
        filter={`url(#${uid}Blur2)`}
      />
      {/* Mid glow */}
      <circle
        cx={nx} cy={ny}
        r={nc.r * 1.7}
        fill={`url(#${uid}NG)`}
        opacity={0.45}
        filter={`url(#${uid}Blur)`}
      />
      {/* Planet body */}
      <circle cx={nx} cy={ny} r={nc.r} fill={`url(#${uid}NF)`} />
      {/* Saturn ring */}
      {nc.ring && (
        <ellipse
          cx={nx} cy={ny}
          rx={nc.r * 1.8}
          ry={nc.r * 0.44}
          fill="none"
          stroke={nc.color}
          strokeWidth={1.1}
          opacity={0.5}
          transform={`rotate(-18, ${nx}, ${ny})`}
        />
      )}
      {/* Glyph */}
      <text
        x={nx} y={ny + nc.r * 0.38}
        textAnchor="middle"
        fontSize={nc.r * 1.05}
        fill="rgba(255,255,255,0.78)"
        fontFamily="system-ui, sans-serif"
      >
        {nc.glyph}
      </text>

      {/* ── Transit label ── */}
      <text
        x={lb.tl.x} y={lb.tl.y}
        textAnchor={lb.tl.anchor}
        fontSize={8}
        fontWeight="600"
        fill="rgba(255,255,255,0.88)"
        fontFamily="system-ui, sans-serif"
        letterSpacing="0.14em"
      >
        {transitLabel}
      </text>

      {/* ── Natal label ── */}
      <text
        x={lb.nl.x} y={lb.nl.y}
        textAnchor={lb.nl.anchor}
        fontSize={7.5}
        fill="rgba(255,255,255,0.58)"
        fontFamily="system-ui, sans-serif"
        letterSpacing="0.1em"
      >
        {natalLabel}
      </text>

      {/* ── Orb + frequency at bottom ── */}
      <text
        x={160} y={222}
        textAnchor="middle"
        fontSize={6.5}
        fill="rgba(255,255,255,0.25)"
        fontFamily="system-ui, sans-serif"
        letterSpacing="0.12em"
      >
        {frequency} · {orb.toFixed(1)}° orb
      </text>
    </svg>
  );
}
