// Personalized geocentric transit-scene for /home/detail/today.
//
// 3-body model: transit body + natal target + Earth (geocentric observer).
// Lines radiate FROM Earth TO each planet. Arc at Earth shows aspect angle.
// Planets rendered as CSS radial-gradient spheres — never as chart images.
// Each aspect expresses distinct geometry from Earth's perspective:
//   conjunction → tight cluster, small apparent angle from Earth
//   sextile     → open V, ~60° separation at Earth
//   square      → strict L at Earth: one body straight up, one straight right
//   trine       → wide V, ~120° at Earth
//   opposition  → Earth centered on axis, bodies at extreme poles

// ── PLANET_CUTOUT stays exported for transit ROW ICONS only ──────────────
// (44px icons in the dark interpretation block — those stay as cutout images)
export const PLANET_CUTOUT: Record<string, string> = {
  Sun:     "/luna/assets/costar/cutouts/animated_cutout_03.webp",
  Moon:    "/luna/assets/costar/cutouts/animated_cutout_01.webp",
  Mercury: "/luna/assets/costar/cutouts/animated_cutout_04.webp",
  Venus:   "/luna/assets/costar/cutouts/animated_cutout_07.webp",
  Mars:    "/luna/assets/costar/cutouts/animated_cutout_08.webp",
  Jupiter: "/luna/assets/costar/cutouts/animated_cutout_12.webp",
  Saturn:  "/luna/assets/costar/cutouts/animated_cutout_16.webp",
  Uranus:  "/luna/assets/costar/cutouts/animated_cutout_20.webp",
  Neptune: "/luna/assets/costar/cutouts/animated_cutout_24.webp",
  Pluto:   "/luna/assets/costar/cutouts/animated_cutout_28.webp",
};

// ── CSS planet sphere system ──────────────────────────────────────────────
type PlanetColor = { gradient: string; glow: string; shadow: string };

const PLANET_COLORS: Record<string, PlanetColor> = {
  Sun:     { gradient: "radial-gradient(circle at 32% 28%, #fffd80, #ffc000 36%, #e07800 60%, #904000)",
             glow: "rgba(255,200,40,0.50)",  shadow: "rgba(200,120,0,0.55)" },
  Moon:    { gradient: "radial-gradient(circle at 34% 28%, #f8f8fc, #c8c8d8 44%, #909098 66%, #606068)",
             glow: "rgba(200,200,220,0.38)", shadow: "rgba(100,100,110,0.45)" },
  Mercury: { gradient: "radial-gradient(circle at 32% 28%, #e8d8b8, #b09060 46%, #786040 68%, #504030)",
             glow: "rgba(180,140,80,0.36)",  shadow: "rgba(100,80,40,0.42)" },
  Venus:   { gradient: "radial-gradient(circle at 30% 28%, #fff4d8, #e8c87a 40%, #c09038 64%, #806010)",
             glow: "rgba(235,195,100,0.45)", shadow: "rgba(160,110,20,0.45)" },
  Mars:    { gradient: "radial-gradient(circle at 32% 28%, #f8b090, #d04828 44%, #901808 66%, #601008)",
             glow: "rgba(220,80,40,0.45)",   shadow: "rgba(140,30,10,0.52)" },
  Jupiter: { gradient: "radial-gradient(circle at 32% 28%, #f0e0c0, #d0a860 40%, #b07830 63%, #785010)",
             glow: "rgba(210,160,80,0.40)",  shadow: "rgba(130,90,20,0.42)" },
  Saturn:  { gradient: "radial-gradient(circle at 32% 28%, #f8f0d8, #e0c878 40%, #b89840 63%, #806820)",
             glow: "rgba(220,190,100,0.38)", shadow: "rgba(140,110,30,0.42)" },
  Uranus:  { gradient: "radial-gradient(circle at 32% 28%, #d0f4f8, #60c8e0 44%, #2890b0 66%, #105878)",
             glow: "rgba(80,192,224,0.42)",  shadow: "rgba(20,120,160,0.45)" },
  Neptune: { gradient: "radial-gradient(circle at 32% 28%, #9090f8, #4048d0 44%, #2028a0 66%, #101870)",
             glow: "rgba(80,80,220,0.44)",   shadow: "rgba(20,20,140,0.52)" },
  Pluto:   { gradient: "radial-gradient(circle at 32% 28%, #c0b0c8, #806888 46%, #504060 68%, #302040)",
             glow: "rgba(140,100,150,0.36)", shadow: "rgba(60,40,80,0.42)" },
  // Earth — blue/ocean marble, geocentric observer anchor
  Earth:   { gradient: "radial-gradient(circle at 32% 28%, #c8f0e8, #2090d0 38%, #1060a8 62%, #082860)",
             glow: "rgba(32,140,210,0.38)",  shadow: "rgba(8,56,140,0.46)" },
};

const FALLBACK_COLOR: PlanetColor = PLANET_COLORS.Moon;

// PlanetSphere — exported for use in page.tsx hero too
export function PlanetSphere({
  planet,
  size,
  natal = false,
}: {
  planet: string;
  size: number;
  natal?: boolean;
}) {
  const c     = PLANET_COLORS[planet] ?? FALLBACK_COLOR;
  const inset = Math.round(size * 0.22);
  const sh1   = Math.round(size * 0.08);
  const sh2   = Math.round(size * 0.18);
  const sh3   = Math.round(size * 0.04);
  const sh4   = Math.round(size * 0.10);
  const sh5   = Math.round(size * 0.30);
  const ringW = Math.round(size * 1.55);
  const ringB = Math.round(size * 0.055);

  return (
    <div style={{ position:"relative", width:size, height:size, flexShrink:0 }}>
      {/* Atmospheric glow halo */}
      <div style={{
        position:"absolute",
        inset:`-${inset}px`,
        borderRadius:"50%",
        background:`radial-gradient(circle, ${c.glow} 0%, transparent 68%)`,
        pointerEvents:"none",
        opacity: natal ? 0.55 : 0.88,
      }} />
      {/* Saturn ring */}
      {planet === "Saturn" && (
        <div style={{
          position:"absolute",
          left:"50%", top:"50%",
          transform:`translate(-50%, -50%) rotateZ(-28deg) scaleY(0.28)`,
          width:ringW, height:ringW,
          borderRadius:"50%",
          border:`${ringB}px solid rgba(200,175,85,${natal ? 0.28 : 0.42})`,
          boxSizing:"border-box" as const,
          pointerEvents:"none",
        }} />
      )}
      {/* Planet sphere */}
      <div style={{
        position:"absolute",
        inset:0,
        borderRadius:"50%",
        background: c.gradient,
        boxShadow:`inset -${sh1}px -${sh1}px ${sh2}px rgba(0,0,0,0.52), inset ${sh3}px ${sh3}px ${sh4}px rgba(255,255,255,0.16), 0 0 ${sh5}px ${c.shadow}`,
        opacity: natal ? 0.80 : 1.0,
      }} />
    </div>
  );
}

// ── 3-body geocentric layout ──────────────────────────────────────────────
// All values are % of scene dimensions (4:3 container).
// ex/ey = Earth center, tx/ty = transit body, nx/ny = natal body.
// Chip anchors: ecx/ecy (Earth), tcx/tcy (transit), ncx/ncy (natal).
// bx/by = aspect angle badge — positioned near Earth arc.
type Layout3 = {
  ex: number; ey: number;
  tx: number; ty: number;
  nx: number; ny: number;
  ecx: number; ecy: number;
  tcx: number; tcy: number;
  ncx: number; ncy: number;
  bx: number;  by: number;
};

const ASPECT_LAYOUT3: Record<string, Layout3> = {
  // conjunction (0°): tight cluster near top, nearly collinear from Earth
  conjunction: { ex:50, ey:76, tx:32, ty:18, nx:62, ny:22,
                 ecx:50, ecy:90, tcx:22, tcy:40, ncx:68, ncy:42,
                 bx:49, by:58 },
  // sextile (60°): symmetric V — verified 61° at 4:3 aspect ratio
  // formula: Earth(50,78), r=0.45 → Δx=±23%, Δy=52% → ty=ny=26
  sextile:     { ex:50, ey:78, tx:27, ty:26, nx:73, ny:26,
                 ecx:50, ecy:91, tcx:24, tcy:45, ncx:76, ncy:45,
                 bx:50, by:62 },
  // square (90°): L-shape — Earth lower-left, transit straight up, natal hard right — exactly 90°
  square:      { ex:22, ey:72, tx:22, ty: 9, nx:84, ny:72,
                 ecx:22, ecy:87, tcx:22, tcy:34, ncx:84, ncy:87,
                 bx:32, by:57 },
  // trine (120°): symmetric V — verified 120° at 4:3 aspect ratio
  // formula: Earth(50,78), r=0.45 → Δx=±39%, Δy=30% → ty=ny=48
  trine:       { ex:50, ey:78, tx:11, ty:48, nx:89, ny:48,
                 ecx:50, ecy:91, tcx: 7, tcy:64, ncx:91, ncy:64,
                 bx:50, by:62 },
  // opposition (180°): Earth at center, bodies at extreme poles — verified 180°
  opposition:  { ex:50, ey:50, tx: 3, ty:50, nx:95, ny:50,
                 ecx:50, ecy:34, tcx: 8, tcy:70, ncx:90, ncy:70,
                 bx:50, by:42 },
};

// ── SVG arc at Earth — shows aspect angle ────────────────────────────────
// viewBox is "0 0 400 300". % coords: x → ×4, y → ×3.
// Arc sweeps from Earth→transit direction to Earth→natal direction.
function arcPath(
  ex: number, ey: number,
  tx: number, ty: number,
  nx: number, ny: number,
  r = 24,
): string {
  const EX = ex * 4, EY = ey * 3;
  const TX = tx * 4, TY = ty * 3;
  const NX = nx * 4, NY = ny * 3;
  const dtx = TX - EX, dty = TY - EY;
  const dnx = NX - EX, dny = NY - EY;
  const dtLen = Math.hypot(dtx, dty);
  const dnLen = Math.hypot(dnx, dny);
  if (dtLen < 0.001 || dnLen < 0.001) return "";
  const utx = dtx / dtLen, uty = dty / dtLen;
  const unx = dnx / dnLen, uny = dny / dnLen;
  const ax1 = EX + r * utx, ay1 = EY + r * uty;
  const ax2 = EX + r * unx, ay2 = EY + r * uny;
  // Cross product → sweep: clockwise (1) when transit is "left of" natal
  const cross = utx * uny - uty * unx;
  const sweep = cross >= 0 ? 1 : 0;
  // Large arc only for angles > 180° (doesn't occur in practice)
  const dot = utx * unx + uty * uny;
  const largeArc = dot < -0.9999 ? 1 : 0;
  return `M ${ax1.toFixed(1)} ${ay1.toFixed(1)} A ${r} ${r} 0 ${largeArc} ${sweep} ${ax2.toFixed(1)} ${ay2.toFixed(1)}`;
}

// ── Connector line styles ─────────────────────────────────────────────────
type LineStyle = { dash?: string; opacity: number; stroke: string; sw: number };
const LINE_STYLE: Record<string, LineStyle> = {
  conjunction: { opacity:0.62, stroke:"rgba(240,240,238,0.90)", sw:0.85 },
  sextile:     { dash:"3.5 3", opacity:0.44, stroke:"rgba(195,230,205,0.88)", sw:0.75 },
  square:      { opacity:0.60, stroke:"rgba(255,195,185,0.90)", sw:0.90 },
  trine:       { dash:"6 4",   opacity:0.40, stroke:"rgba(180,210,240,0.88)", sw:0.75 },
  opposition:  { opacity:0.52, stroke:"rgba(240,240,238,0.88)", sw:0.95 },
};

// ── Arc accent styles ─────────────────────────────────────────────────────
const ARC_STYLE: Record<string, { stroke: string; sw: number; dash?: string }> = {
  conjunction: { stroke:"rgba(240,240,238,0.55)", sw:1.2 },
  sextile:     { stroke:"rgba(195,230,205,0.55)", sw:1.0, dash:"2 2" },
  square:      { stroke:"rgba(255,195,185,0.55)", sw:1.2 },
  trine:       { stroke:"rgba(180,210,240,0.55)", sw:1.0, dash:"3 2" },
  opposition:  { stroke:"rgba(240,240,238,0.50)", sw:1.2 },
};

// Transit body render size (px) — outer/slow planets visually larger
const PLANET_PX: Record<string, number> = {
  Sun:128, Moon:108, Mercury:92, Venus:118, Mars:105,
  Jupiter:136, Saturn:132, Uranus:112, Neptune:112, Pluto:95,
};
const NATAL_PX = 82;
const EARTH_PX = 88; // Earth is a real anchor body — large enough to read as geocentric origin

const ASPECT_ANGLE: Record<string, string> = {
  conjunction:"0°", sextile:"60°", square:"90°", trine:"120°", opposition:"180°",
};
const ASPECT_KO: Record<string, string> = {
  conjunction:"합", sextile:"60°각", square:"긴장", trine:"조화", opposition:"대립",
};

// ── Main component ────────────────────────────────────────────────────────
type Props = {
  transitPlanet: string;
  natalPlanet:   string;
  natalSign:     string;
  aspectType:    string;
  transitLabel:  string;
  natalLabel:    string;
};

export default function TodaySpaceScene({
  transitPlanet, natalPlanet, natalSign,
  aspectType, transitLabel, natalLabel,
}: Props) {
  void natalSign; // layout uses planet identity, not sign
  const layout = ASPECT_LAYOUT3[aspectType] ?? ASPECT_LAYOUT3.trine;
  const line   = LINE_STYLE[aspectType]     ?? LINE_STYLE.trine;
  const arc    = ARC_STYLE[aspectType]      ?? ARC_STYLE.trine;
  const tSize  = PLANET_PX[transitPlanet]  ?? 110;

  return (
    <div
      className="tsz-scene"
      role="img"
      aria-label={`${transitLabel} ${ASPECT_KO[aspectType] ?? aspectType} ${natalLabel}`}
    >
      {/* Starfield background */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/luna/assets/costar/bg/bg_galaxy.png"
        alt=""
        className="tsz-bg"
        aria-hidden="true"
      />

      {/* Vignette — darkens edges, unifies the scene */}
      <div className="tsz-vignette" aria-hidden="true" />

      {/* SVG — viewBox 0 0 400 300 matches 4:3 for correct angular geometry */}
      <svg
        className="tsz-svg"
        viewBox="0 0 400 300"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {/* Earth → Transit connector */}
        <line
          x1={layout.ex * 4} y1={layout.ey * 3}
          x2={layout.tx * 4} y2={layout.ty * 3}
          stroke={line.stroke} strokeWidth={line.sw}
          strokeDasharray={line.dash} opacity={line.opacity}
        />
        {/* Earth → Natal connector (slightly dimmer) */}
        <line
          x1={layout.ex * 4} y1={layout.ey * 3}
          x2={layout.nx * 4} y2={layout.ny * 3}
          stroke={line.stroke} strokeWidth={line.sw * 0.82}
          strokeDasharray={line.dash} opacity={line.opacity * 0.82}
        />
        {/* Aspect angle arc at Earth */}
        <path
          d={arcPath(layout.ex, layout.ey, layout.tx, layout.ty, layout.nx, layout.ny)}
          stroke={arc.stroke} strokeWidth={arc.sw}
          strokeDasharray={arc.dash} fill="none"
          opacity={0.72}
        />
        {/* Endpoint halos at body centers */}
        <circle cx={layout.tx * 4} cy={layout.ty * 3} r="3" fill="rgba(240,240,238,0.28)" />
        <circle cx={layout.nx * 4} cy={layout.ny * 3} r="3" fill="rgba(240,240,238,0.20)" />
      </svg>

      {/* Transit body — primary planet, full brightness */}
      <div
        className="tsz-body"
        style={{ left:`${layout.tx}%`, top:`${layout.ty}%` }}
        aria-hidden="true"
      >
        <PlanetSphere planet={transitPlanet} size={tSize} />
      </div>

      {/* Natal body — natal planet identity, slightly dimmed */}
      <div
        className="tsz-body"
        style={{ left:`${layout.nx}%`, top:`${layout.ny}%` }}
        aria-hidden="true"
      >
        <PlanetSphere planet={natalPlanet} size={NATAL_PX} natal />
      </div>

      {/* Earth — geocentric anchor, full brightness (distinct from natal which is dimmed) */}
      <div
        className="tsz-body tsz-body--earth"
        style={{ left:`${layout.ex}%`, top:`${layout.ey}%` }}
        aria-hidden="true"
      >
        <PlanetSphere planet="Earth" size={EARTH_PX} />
      </div>

      {/* Transit chip */}
      <div
        className="tsz-chip-anchor"
        style={{ left:`${layout.tcx}%`, top:`${layout.tcy}%` }}
        aria-hidden="true"
      >
        <span className="tsz-chip tsz-chip--transit">{transitLabel}</span>
      </div>

      {/* Natal chip */}
      <div
        className="tsz-chip-anchor"
        style={{ left:`${layout.ncx}%`, top:`${layout.ncy}%` }}
        aria-hidden="true"
      >
        <span className="tsz-chip tsz-chip--natal">{natalLabel}</span>
      </div>

      {/* Earth chip */}
      <div
        className="tsz-chip-anchor"
        style={{ left:`${layout.ecx}%`, top:`${layout.ecy}%` }}
        aria-hidden="true"
      >
        <span className="tsz-chip tsz-chip--earth">지구</span>
      </div>

      {/* Aspect angle badge — near Earth arc */}
      <div
        className="tsz-aspect-badge"
        style={{ left:`${layout.bx}%`, top:`${layout.by}%` }}
        aria-hidden="true"
      >
        <span className="tsz-aspect-deg">{ASPECT_ANGLE[aspectType] ?? ""}</span>
        <span className="tsz-aspect-name">{ASPECT_KO[aspectType] ?? aspectType}</span>
      </div>
    </div>
  );
}
