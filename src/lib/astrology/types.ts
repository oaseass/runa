export const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
] as const;

export type SignName = typeof SIGNS[number];

export type PlanetName =
  | "Sun" | "Moon" | "Mercury" | "Venus" | "Mars"
  | "Jupiter" | "Saturn" | "Uranus" | "Neptune" | "Pluto";

export type AspectName = "conjunction" | "sextile" | "square" | "trine" | "opposition";

export type PlanetPosition = {
  planet: PlanetName;
  longitude: number;     // ecliptic longitude 0–360
  sign: SignName;
  degreeInSign: number;  // 0–30
  house: number;         // 1–12 (whole-sign)
  retrograde: boolean;
};

export type Aspect = {
  planet1: PlanetName;
  planet2: PlanetName;
  aspect: AspectName;
  orb: number;           // degrees deviation from exact
  applying: boolean;
};

export type HouseCusp = {
  house: number;         // 1–12
  sign: SignName;
  longitude: number;     // start of this house (whole-sign = start of sign)
};

export type AxisPoint = {
  longitude: number;
  sign: SignName;
  degreeInSign: number;
};

export type NatalChart = {
  version: string;
  computedAt: string;    // ISO datetime
  birthUtc: string;      // ISO datetime UTC
  latitude: number;
  longitude: number;
  timezone: string;      // IANA
  planets: PlanetPosition[];
  ascendant: AxisPoint;
  midheaven: AxisPoint;
  houseSystem: "whole-sign";
  houses: HouseCusp[];
  aspects: Aspect[];
  moonPhase: number;     // 0–360 degrees (0 = new, 180 = full)
  chartHash?: string;    // SHA-256(birthUtc|lat|lon|version) — deterministic fingerprint
};

/** Completeness status of a user's birth profile fields. */
export type BirthProfileStatus = {
  hasDate: boolean;
  hasTime: boolean;
  hasPlace: boolean;
  hasCoordinates: boolean;
  hasTimezone: boolean;
  /** True only when all fields required for chart computation are present. */
  isComplete: boolean;
};

/** Full detail for a domain page — superset of DomainReading. */
export type DomainDetail = {
  domainKey: string;          // "love" | "friends" | "work" | "family"
  domain: string;             // internal: 관계 | 사고·표현 | 루틴·일 | 감정·내면
  statusLabel: string;        // "Luck in love" etc.
  headline: string;
  bullets: string[];          // 3–4 specific observations
  summary: string;            // paragraph
  reasons: string[];          // active transit aspects
  tone: "strength" | "challenge" | "neutral";
  /** Most relevant transit-to-natal aspect driving this domain today. */
  primaryTransit?: TransitDeepDetail;
};

/** Per–life-domain daily reading, derived from natal chart + today's transit. */
export type DomainReading = {
  domain: string;             // 나 | 관계 | 루틴·일 | 사고·표현 | 감정·내면
  headline: string;           // one-line domain reading
  note: string;               // supporting sentence
  tone: "strength" | "challenge" | "neutral";
  reasons?: string[];         // active transit aspects driving this reading
  /** Short label like "Luck in love" / "Love under pressure" / "Quiet in love" */
  statusLabel?: string;
};

/** Minimal interpretation shaped for /profile/chart */
export type NatalInterpretation = {
  headline: string;
  lede: string;
  sunSummary: string;
  moonSummary: string;
  ascSummary: string;
  /** Midheaven sign interpretation — public direction / career axis */
  mcSummary: string;
  /** Venus sign + house + aspects — relationship / attraction pattern */
  venusSummary: string;
  /** Mars + Saturn synthesis — action drive, structural pressure */
  marsSaturnSummary: string;
  dominantPattern: string;
  keyAspects: string[];
  pullquoteText: string;
  pullquoteKicker: string;
  placements: Array<{
    planet: string;
    sign: string;
    house: number;
    note: string;
  }>;
};

/**
 * Full structured data for one transit-to-natal aspect, used by the deep-dive page.
 * Includes generated sentence fragments, domain tags, and frequency info.
 */
export type TransitDeepDetail = {
  transitPlanet: PlanetName;
  natalPlanet: PlanetName;
  natalSign: SignName;
  aspectType: AspectName;
  aspectAngle: number;       // 0 | 60 | 90 | 120 | 180
  orb: number;
  domainTags: string[];      // e.g. ["관계", "사랑"]
  frequency: string;         // "며칠마다 한 번씩" etc.
  subjectPhrase: string;     // area of life affected
  verbPhrase: string;        // what the transit is doing
  objectPhrase: string;      // natal planet + sign descriptor
  fullPhrase: string;        // assembled sentence
  tone: "strength" | "challenge" | "neutral";
};

/** A single transit-to-natal aspect that is active on the selected date. */
export type ActiveTransitAspect = {
  transitPlanet: PlanetName;
  natalPlanet: PlanetName;
  aspect: AspectName;
  orb: number;
  phrase: string;
};

/**
 * Serialisable snapshot of natal + transit positions for chart visualisation.
 * Passed as a prop from a server component to the client SVG component.
 */
export type TransitChartData = {
  natalPlanets:   Array<{ planet: PlanetName; longitude: number; retrograde: boolean }>;
  transitPlanets: Array<{ planet: PlanetName; longitude: number }>;
  houses:         Array<{ house: number; longitude: number }>;
  ascendantLon:   number;
  activeAspects:  ActiveTransitAspect[];
};

/**
 * Unified editorial report for the /home/detail/today page.
 * ALL sections derive from the same primary transit — no mixed sources.
 */
export type TodayDeepReport = {
  /** The primary active transit that drives every section on the page */
  primary: TransitDeepDetail;
  /** Central block labels */
  transitLabel: string;      // e.g. "금성 NOW"
  natalLabel: string;        // e.g. "YOUR 양자리 토성"
  aspectLabel: string;       // e.g. "CONJUNCTION (0°)"
  /** Editorial content — all derived from primary */
  headline: string;
  lede: string;
  introParagraph: string;
  /** HOW IT PLAYS OUT ON EARTH */
  earthHeadline: string;
  bullets: string[];
  /** TRY THIS — thematic recommendations based on primary domain tag */
  tryThis: Array<{ type: string; title: string; sub: string; mood?: string }>;
  /** THE LESSON */
  lessonText: string;
  lessonSub: string;
  /** BEHIND THIS FORECAST — broader active aspect list */
  activeAspects: ActiveTransitAspect[];
  /** Short bridge sentence before the space section */
  narrativeBridge: string;
  /** Formatted date string */
  date: string;
};

/** Minimal interpretation shaped for /insight/today */
export type TransitInterpretation = {
  date: string;
  headline: string;
  lede: string;
  section1: { title: string; body: string };
  section2: { title: string; body: string };
  keyPhrase: string;
  keyPhraseKicker: string;
  /** Current transit Moon sign (IANA sign name) — changes every ~2.5 days. */
  transitMoonSign: string;
  /** Transit-to-natal aspects active on this date (within orb). */
  activeAspects: ActiveTransitAspect[];
  /** Natal-aware DO items derived from active benefic transits to natal chart. */
  dos: string[];
  /** Natal-aware DON'T items derived from active malefic transits to natal chart. */
  donts: string[];
};
