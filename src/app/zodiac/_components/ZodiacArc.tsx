"use client";

import { useRouter } from "next/navigation";
import { useState, useCallback, useRef, useEffect } from "react";

const P = "/luna/assets/costar/constellations";

const ARC_SIGNS = [
  { slug: "aries",       en: "Aries",       planet: `${P}/aries.svg` },
  { slug: "taurus",      en: "Taurus",      planet: `${P}/taurus.svg` },
  { slug: "gemini",      en: "Gemini",      planet: `${P}/gemini.svg` },
  { slug: "cancer",      en: "Cancer",      planet: `${P}/cancer.svg` },
  { slug: "leo",         en: "Leo",         planet: `${P}/leo.svg` },
  { slug: "virgo",       en: "Virgo",       planet: `${P}/virgo.svg` },
  { slug: "libra",       en: "Libra",       planet: `${P}/libra.svg` },
  { slug: "scorpio",     en: "Scorpio",     planet: `${P}/scorpius.svg` },
  { slug: "sagittarius", en: "Sagittarius", planet: `${P}/sagittarius.svg` },
  { slug: "capricorn",   en: "Capricorn",   planet: `${P}/capricornus.svg` },
  { slug: "aquarius",    en: "Aquarius",    planet: `${P}/aquarius.svg` },
  { slug: "pisces",      en: "Pisces",      planet: `${P}/pisces.svg` },
];

// Arc geometry — large dome (∩)
// Circle center far below viewport so the top of the arc is near the screen top
const CX = 180;
const CY = 295;
const R = 275;
const ANGLE_STEP = 22;   // degrees per sign step
const GLOBE_R = 80;      // globe radius in SVG units
const VISIBLE_RANGE = 3; // ±3 signs shown

function signPos(offset: number) {
  const deg = -90 + offset * ANGLE_STEP;
  const rad = (deg * Math.PI) / 180;
  return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) };
}

// Precompute the static arc path endpoints (offset ±4 gives bottom extent)
const arcP1 = signPos(-4);
const arcP2 = signPos(4);
const ARC_PATH = `M ${arcP1.x.toFixed(1)} ${arcP1.y.toFixed(1)} A ${R} ${R} 0 0 1 ${arcP2.x.toFixed(1)} ${arcP2.y.toFixed(1)}`;

export function ZodiacArc({ currentSlug }: { currentSlug: string }) {
  const router = useRouter();
  const [navigating, setNavigating] = useState(false);
  // Fractional offset added to every sign during rotation animation
  const [animOffset, setAnimOffset] = useState(0);
  const rafRef = useRef<number | null>(null);

  const activeIdx = ARC_SIGNS.findIndex((s) => s.slug === currentSlug);

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const navigate = useCallback(
    (targetIdx: number) => {
      if (targetIdx === activeIdx || navigating || rafRef.current !== null) return;

      // Shortest arc direction
      let delta = ((targetIdx - activeIdx) % 12 + 12) % 12;
      if (delta > 6) delta -= 12;

      const duration = 480; // ms
      const startTime = performance.now();
      const endAnimOffset = -delta; // signs rotate so target lands at apex

      function frame(now: number) {
        const t = Math.min((now - startTime) / duration, 1);
        // Cubic ease-in-out
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        setAnimOffset(endAnimOffset * e);

        if (t < 1) {
          rafRef.current = requestAnimationFrame(frame);
        } else {
          rafRef.current = null;
          setAnimOffset(0);
          setNavigating(true);
          router.push(`/zodiac/${ARC_SIGNS[targetIdx].slug}`);
        }
      }

      rafRef.current = requestAnimationFrame(frame);
    },
    [activeIdx, navigating, router]
  );

  return (
    <div className="zdv-arc-root">
      {navigating && (
        <div className="zdv-loading-overlay" aria-hidden="true">
          <div className="zdv-ring" />
        </div>
      )}

      <button
        type="button"
        className="zdv-arc-back"
        onClick={() => router.back()}
        aria-label="뒤로"
      >
        ←
      </button>

      <svg
        viewBox="0 0 360 250"
        className="zdv-arc-svg"
        aria-label="별자리 탐색"
        role="navigation"
        style={{ overflow: "visible" }}
      >
        <defs>
          <clipPath id="zdv-globe-clip">
            <circle cx={CX} cy={0} r={GLOBE_R} />
          </clipPath>
        </defs>

        {/* Static arc guide line */}
        <path
          d={ARC_PATH}
          fill="none"
          stroke="rgba(20,21,22,0.1)"
          strokeWidth="0.6"
        />

        {/* Globe — active sign's constellation, fixed at arc apex */}
        <image
          href={ARC_SIGNS[activeIdx].planet}
          x={CX - GLOBE_R}
          y={-GLOBE_R}
          width={GLOBE_R * 2}
          height={GLOBE_R * 2}
          clipPath="url(#zdv-globe-clip)"
          preserveAspectRatio="xMidYMid slice"
        />

        {/* Active sign label below globe */}
        <text
          x={CX}
          y={GLOBE_R + 16}
          textAnchor="middle"
          fontSize="7"
          fill="rgba(20,21,22,0.48)"
          letterSpacing="1.8"
          style={{ userSelect: "none", fontFamily: "inherit" }}
        >
          {ARC_SIGNS[activeIdx].en.toUpperCase()}
        </text>

        {/* Other signs: animated dot + label */}
        {ARC_SIGNS.map((sign, i) => {
          let rawOffset = ((i - activeIdx) % 12 + 12) % 12;
          if (rawOffset > 6) rawOffset -= 12;
          if (rawOffset === 0) return null; // active sign shown as globe

          const displayOffset = rawOffset + animOffset;
          if (Math.abs(displayOffset) > VISIBLE_RANGE + 0.6) return null;

          const { x, y } = signPos(displayOffset);
          const dist = Math.abs(displayOffset);
          const opacity = Math.max(0.12, 0.62 - dist * 0.1);
          const fontSize = Math.max(4.5, 6.2 - dist * 0.35);

          return (
            <g
              key={sign.slug}
              onClick={() => navigate(i)}
              style={{ cursor: "pointer" }}
              opacity={opacity}
              aria-label={sign.en}
            >
              <circle cx={x} cy={y} r="2" fill="rgba(20,21,22,0.32)" />
              <text
                x={x}
                y={y + 10}
                textAnchor="middle"
                fontSize={fontSize}
                fill="rgba(20,21,22,0.6)"
                letterSpacing="0.3"
                style={{ userSelect: "none", fontFamily: "inherit" }}
              >
                {sign.en}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
