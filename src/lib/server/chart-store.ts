/**
 * Server-side natal chart persistence.
 * Caches computed charts keyed by userId + calc_version.
 * Recomputes only when input data changes or version bumps.
 */
import crypto from "node:crypto";
import { db } from "./db";
import { computeNatalChart, computeTransitPositions, localBirthToUtc, CALC_VERSION, findAspect, angularSeparation } from "@/lib/astrology/calculate";
import { interpretNatalChart, interpretTransits, interpretDomains, buildDomainDetail, buildTransitDeepList, buildTodayDeepReport } from "@/lib/astrology/interpret";
import type { NatalChart, NatalInterpretation, TransitInterpretation, TodayDeepReport, BirthProfileStatus, DomainReading, DomainDetail, TransitDeepDetail, TransitChartData, PlanetName, AspectName } from "@/lib/astrology/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export type OnboardingProfile = {
  birthDate: string | null;         // YYYY-MM-DD
  birthHour: number | null;         // 0–23
  birthMinute: number | null;       // 0–59
  birthPlaceFullText: string | null;
  birthLatitude: number | null;
  birthLongitude: number | null;
  birthTimezone: string | null;
};

// ── Fingerprint ──────────────────────────────────────────────────────────────

/**
 * SHA-256 fingerprint of the deterministic chart inputs.
 * Same birth data + same CALC_VERSION always produces the same hash.
 * Changes when birth data or engine version changes.
 */
function computeChartHash(birthUtc: Date, latitude: number, longitude: number): string {
  return crypto
    .createHash("sha256")
    .update(`${birthUtc.toISOString()}|${latitude.toFixed(6)}|${longitude.toFixed(6)}|${CALC_VERSION}`)
    .digest("hex")
    .slice(0, 16); // 64-bit prefix — sufficient for cache fingerprinting
}

// ── DB helpers ────────────────────────────────────────────────────────────────

export function getOnboardingProfile(userId: string): OnboardingProfile | null {
  const row = db.prepare(`
    SELECT birth_date, birth_hour, birth_minute,
           birth_place_full_text, birth_latitude, birth_longitude, birth_timezone
    FROM onboarding_profiles WHERE user_id = ?
  `).get(userId) as {
    birth_date: string | null;
    birth_hour: number | null;
    birth_minute: number | null;
    birth_place_full_text: string | null;
    birth_latitude: number | null;
    birth_longitude: number | null;
    birth_timezone: string | null;
  } | undefined;

  if (!row) return null;

  return {
    birthDate: row.birth_date,
    birthHour: row.birth_hour,
    birthMinute: row.birth_minute,
    birthPlaceFullText: row.birth_place_full_text,
    birthLatitude: row.birth_latitude,
    birthLongitude: row.birth_longitude,
    birthTimezone: row.birth_timezone,
  };
}

function getCachedChart(userId: string): NatalChart | null {
  const row = db.prepare(
    "SELECT chart_json, calc_version FROM natal_charts WHERE user_id = ?"
  ).get(userId) as { chart_json: string; calc_version: string } | undefined;

  if (!row || row.calc_version !== CALC_VERSION) return null;

  try {
    const chart = JSON.parse(row.chart_json) as NatalChart;
    // Charts cached before chartHash was added lack the field; force recompute.
    if (!chart.chartHash) return null;
    return chart;
  } catch {
    return null;
  }
}

function saveChart(userId: string, chart: NatalChart): void {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO natal_charts (id, user_id, calc_version, chart_json, computed_at)
    VALUES (@id, @userId, @version, @json, @computedAt)
    ON CONFLICT(user_id) DO UPDATE SET
      calc_version = excluded.calc_version,
      chart_json   = excluded.chart_json,
      computed_at  = excluded.computed_at
  `).run({
    id, userId,
    version: chart.version,
    json: JSON.stringify(chart),
    computedAt: chart.computedAt,
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

// ── Birth profile status ─────────────────────────────────────────────────────

/**
 * Returns which birth profile fields are complete for the given user.
 * Does not throw — returns all-false if the user has no profile row.
 */
export function getBirthProfileStatus(userId: string): BirthProfileStatus {
  const profile = getOnboardingProfile(userId);
  const hasDate = Boolean(profile?.birthDate);
  const hasTime = profile?.birthHour != null && profile?.birthMinute != null;
  const hasPlace = Boolean(profile?.birthPlaceFullText);
  const hasCoordinates = profile?.birthLatitude != null && profile?.birthLongitude != null;
  const hasTimezone = Boolean(profile?.birthTimezone);
  return {
    hasDate,
    hasTime,
    hasPlace,
    hasCoordinates,
    hasTimezone,
    isComplete: hasDate && hasTime && hasCoordinates && hasTimezone,
  };
}

/**
 * Returns the natal chart for a user.
 * Computes and caches if not already stored at current CALC_VERSION.
 * Returns null if birth data is incomplete.
 */
export function getOrComputeNatalChart(userId: string): NatalChart | null {
  const cached = getCachedChart(userId);
  if (cached) return cached;

  const profile = getOnboardingProfile(userId);
  if (
    !profile ||
    !profile.birthDate ||
    profile.birthHour == null ||
    profile.birthMinute == null ||
    profile.birthLatitude == null ||
    profile.birthLongitude == null ||
    !profile.birthTimezone
  ) {
    return null;
  }

  const [year, month, day] = profile.birthDate.split("-").map(Number);
  const birthUtc = localBirthToUtc(
    year, month, day,
    profile.birthHour, profile.birthMinute,
    profile.birthTimezone,
  );

  const chart = computeNatalChart({
    birthUtc,
    latitude: profile.birthLatitude,
    longitude: profile.birthLongitude,
    timezone: profile.birthTimezone,
  });

  // Attach deterministic fingerprint before persisting
  chart.chartHash = computeChartHash(birthUtc, profile.birthLatitude, profile.birthLongitude);

  saveChart(userId, chart);
  return chart;
}

/**
 * Returns natal + transit interpretation, or null if birth data incomplete.
 */
export function getNatalInterpretation(userId: string): NatalInterpretation | null {
  const chart = getOrComputeNatalChart(userId);
  if (!chart) return null;
  return interpretNatalChart(chart);
}

export function getTodayInterpretation(userId: string): TransitInterpretation | null {
  const chart = getOrComputeNatalChart(userId);
  if (!chart) return null;
  return interpretTransits(chart, new Date());
}

/**
 * Returns per-domain daily readings, or null if birth data is incomplete.
 * Content is keyed by today's Moon sign; tone is personalized by natal chart.
 */
export function getDomainReadings(userId: string): DomainReading[] | null {
  const chart = getOrComputeNatalChart(userId);
  if (!chart) return null;
  return interpretDomains(chart, new Date());
}

/**
 * Returns a unified TodayDeepReport where ALL editorial sections derive from
 * the same primary transit (buildTransitDeepList[0]). No mixed data sources.
 * Returns null if birth data is incomplete or no transits are active.
 */
export function getTodayDeepReport(userId: string, date?: Date): TodayDeepReport | null {
  const chart = getOrComputeNatalChart(userId);
  if (!chart) return null;
  return buildTodayDeepReport(chart, date ?? new Date());
}

/**
 * Returns transit interpretation for a specific calendar date.
 * Used by the date-navigation strip on the daily reading surface.
 */
export function getDateInterpretation(userId: string, date: Date): TransitInterpretation | null {
  const chart = getOrComputeNatalChart(userId);
  if (!chart) return null;
  return interpretTransits(chart, date);
}

/**
 * Returns per-domain readings for a specific calendar date.
 * Used by the date-navigation strip on the daily reading surface.
 */
export function getDomainReadingsByDate(userId: string, date: Date): DomainReading[] | null {
  const chart = getOrComputeNatalChart(userId);
  if (!chart) return null;
  return interpretDomains(chart, date);
}

/**
 * Returns a full DomainDetail for the given domain key (love/friends/work/family)
 * on the given date. Returns null if birth data is incomplete.
 */
export function getDomainDetail(userId: string, domainKey: string, date: Date): DomainDetail | null {
  const chart = getOrComputeNatalChart(userId);
  if (!chart) return null;
  return buildDomainDetail(domainKey, chart, date);
}

/**
 * Returns the sorted list of all active transit-to-natal aspects as TransitDeepDetail.
 * List index matches the [id] parameter used by /home/transits/[id].
 * Returns null if birth data is incomplete.
 */
export function getTransitDeepList(userId: string, date: Date): TransitDeepDetail[] | null {
  const chart = getOrComputeNatalChart(userId);
  if (!chart) return null;
  return buildTransitDeepList(chart, date);
}

/**
 * Returns a serialisable snapshot of natal + transit positions for SVG chart rendering.
 * All 10 natal planets and all 10 transit planets are included.
 * Returns null if the user's natal chart is not yet available.
 */
export function getTransitChartData(userId: string, date: Date): TransitChartData | null {
  const chart = getOrComputeNatalChart(userId);
  if (!chart) return null;

  const transitPositionsMap = computeTransitPositions(date);
  const interp = interpretTransits(chart, date);

  return {
    natalPlanets: chart.planets.map((p) => ({
      planet: p.planet,
      longitude: p.longitude,
      retrograde: p.retrograde,
    })),
    transitPlanets: Array.from(transitPositionsMap.entries()).map(([planet, longitude]) => ({
      planet,
      longitude,
    })),
    houses: chart.houses.map((h) => ({ house: h.house, longitude: h.longitude })),
    ascendantLon: chart.ascendant.longitude,
    activeAspects: interp.activeAspects,
  };
}

// ── Month-level day scoring ───────────────────────────────────────────────────

export type DayScore = {
  day: number;             // day of month (1–31)
  score: number;           // 0–100 overall favorability
  tone: "strength" | "challenge" | "neutral";
  topDomain: string | null;    // domain with strongest reading (Korean label)
  secondDomain: string | null; // second-strongest domain
  icons: string[];             // 1–3 domain-derived indicator icons
  aspectType: AspectName | null; // strongest active transit-to-natal aspect
  applying: boolean | null;      // is the aspect applying (moving toward exact)?
  dominantHouse: number | null;  // natal planet house hit by strongest transit
  planetPair: string | null;     // e.g. "Jupiter-Sun", "Moon-Venus"
};

/** Maps Korean domain label to a representative icon */
const DOMAIN_ICON: Record<string, string> = {
  "관계":    "♡",
  "루틴·일":  "★",
  "사고·표현": "💬",
  "감정·내면": "✦",
};

/**
 * Computes per-day scores for a given year/month using the user's natal chart.
 * For each day: calls interpretDomains → derives score from domain tones.
 * Returns null if birth data is incomplete.
 *
 * Score formula: strength=2pts, neutral=1pt, challenge=0pt; max=8; normalized to 0–100.
 */
// Transit planets in significance order (outer/slow planets weighted higher)
const TRANSIT_PRIORITY = ["Jupiter", "Saturn", "Mars", "Venus", "Sun", "Moon"] as const;
type TransitPrio = typeof TRANSIT_PRIORITY[number];
const ASP_SCORE: Record<AspectName, number> = { conjunction: 5, trine: 4, opposition: 3, square: 3, sextile: 2 };
const ASP_ANGLE: Record<AspectName, number> = { conjunction: 0, sextile: 60, square: 90, trine: 120, opposition: 180 };

export function scoreMonthDays(userId: string, year: number, month: number): { days: DayScore[]; chartHash: string } | null {
  const chart = getOrComputeNatalChart(userId);
  if (!chart) return null;

  const daysInMonth = new Date(year, month, 0).getDate(); // month is 1-indexed here
  const result: DayScore[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    // month is 1-indexed for new Date(y, m-1, d)
    const date = new Date(year, month - 1, day, 12, 0, 0); // noon local to avoid DST edge cases
    const domains = interpretDomains(chart, date);

    let pts = 0;
    let topDomain: string | null = null;
    let topPts = -1;
    let secondDomain: string | null = null;
    let secondPts = -1;
    const icons: string[] = [];

    for (const d of domains) {
      if (d.domain === "나") continue; // skip self-domain for calendar display
      const p = d.tone === "strength" ? 2 : d.tone === "neutral" ? 1 : 0;
      pts += p;
      if (p > topPts) {
        secondPts = topPts; secondDomain = topDomain;
        topPts = p; topDomain = d.domain;
      } else if (p > secondPts) {
        secondPts = p; secondDomain = d.domain;
      }
      if (d.tone === "strength" && DOMAIN_ICON[d.domain]) {
        icons.push(DOMAIN_ICON[d.domain]);
      }
    }

    // Overall day tone: any challenge → challenge, any strength → strength, else neutral
    const tone: "strength" | "challenge" | "neutral" =
      domains.some((d) => d.tone === "challenge") ? "challenge" :
      domains.some((d) => d.tone === "strength")  ? "strength"  : "neutral";

    // Score: normalize 0-8 → 0-100; high score gets ⭐ bonus icon
    const score = Math.round((pts / 8) * 100);
    if (score >= 75 && !icons.includes("⭐")) icons.push("⭐");

    // ── Find strongest transit-to-natal aspect ─────────────────────────────
    const tLons = computeTransitPositions(date);
    const nextDate = new Date(date.getTime() + 86400000); // +1 day for applying check
    const tLonsNext = computeTransitPositions(nextDate);

    let bestAspType: AspectName | null = null;
    let bestApplying: boolean | null = null;
    let bestHouse: number | null = null;
    let bestPair: string | null = null;
    let bestW = -1;

    for (const tp of TRANSIT_PRIORITY as readonly TransitPrio[]) {
      const tLon = tLons.get(tp as PlanetName);
      if (tLon == null) continue;
      const tLonN = tLonsNext.get(tp as PlanetName)!;
      for (const np of chart.planets) {
        const asp = findAspect(tLon, np.longitude);
        if (!asp) continue;
        const w = ASP_SCORE[asp.name] / (1 + asp.orb);
        if (w > bestW) {
          bestW = w;
          const targetAng = ASP_ANGLE[asp.name];
          const curDev = Math.abs(angularSeparation(tLon, np.longitude) - targetAng);
          const nxtDev = Math.abs(angularSeparation(tLonN, np.longitude) - targetAng);
          bestAspType  = asp.name;
          bestApplying = nxtDev < curDev;
          bestHouse    = np.house;
          bestPair     = `${tp}-${np.planet}`;
        }
      }
    }

    result.push({
      day, score, tone, topDomain, secondDomain,
      icons: icons.slice(0, 3),
      aspectType:    bestAspType,
      applying:      bestApplying,
      dominantHouse: bestHouse,
      planetPair:    bestPair,
    });
  }

  return { days: result, chartHash: chart.chartHash ?? "" };
}

export type BestDay = {
  date: string;    // ISO "YYYY-MM-DD"
  label: string;   // human-readable recommendation label
  score: number;   // 0–100
  topDomain: string | null;
  tone: "strength" | "challenge" | "neutral";
};

/** Maps domain label to a Korean insight title */
function bestDayLabel(topDomain: string | null, score: number): string {
  if (score >= 85) {
    if (topDomain === "관계")     return "지금 연결해야 할 사람이 있다면 이 날";
    if (topDomain === "루틴·일")   return "가장 잘 나아갈 수 있는 날";
    if (topDomain === "사고·표현") return "중요한 말을 꺼낼 최적의 날";
    if (topDomain === "감정·내면") return "자신을 가장 잘 이해할 수 있는 날";
    return "이번 달 최고의 흐름";
  }
  if (score >= 65) {
    if (topDomain === "관계")     return "관계 에너지가 활발한 날";
    if (topDomain === "루틴·일")   return "일을 추진하기 좋은 날";
    if (topDomain === "사고·표현") return "생각이 잘 정리되는 날";
    if (topDomain === "감정·내면") return "내면을 돌아보기 좋은 날";
    return "흐름이 좋은 날";
  }
  return "눈여겨볼 흐름";
}

/**
 * Returns the top N scoring days across the next `daysAhead` days for the user.
 * Days are sorted by score descending, then returned chronologically.
 * Returns null if birth data is incomplete.
 */
export function getPersonalizedBestDays(
  userId: string,
  count: number = 10,
  daysAhead: number = 45,
): BestDay[] | null {
  const chart = getOrComputeNatalChart(userId);
  if (!chart) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const scored: Array<{ date: Date; score: number; topDomain: string | null; tone: "strength" | "challenge" | "neutral" }> = [];

  for (let i = 1; i <= daysAhead; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    date.setHours(12, 0, 0, 0); // noon to avoid DST edge

    const domains = interpretDomains(chart, date);
    let pts = 0;
    let topDomain: string | null = null;
    let topPts = -1;

    for (const d of domains) {
      const p = d.tone === "strength" ? 2 : d.tone === "neutral" ? 1 : 0;
      pts += p;
      if (p > topPts) { topPts = p; topDomain = d.domain; }
    }

    const tone: "strength" | "challenge" | "neutral" =
      domains.some((d) => d.tone === "challenge") ? "challenge" :
      domains.some((d) => d.tone === "strength")  ? "strength"  : "neutral";

    scored.push({ date, score: Math.round((pts / 8) * 100), topDomain, tone });
  }

  // Keep top `count` by score, then sort chronologically
  const top = scored
    .sort((a, b) => b.score - a.score)
    .filter((d) => d.score >= 50) // skip really low-scoring days
    .slice(0, count)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return top.map((d) => ({
    date: d.date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" }).replace(" ", " ").toUpperCase(),
    label: bestDayLabel(d.topDomain, d.score),
    score: d.score,
    topDomain: d.topDomain,
    tone: d.tone,
  }));
}

// ── Birth profile normalization status ────────────────────────────────────────

export type NormalizationStatus =
  | "complete"
  | "missing_date"
  | "missing_time"
  | "missing_place"
  | "missing_coordinates"
  | "missing_timezone";

/**
 * Returns which normalization stage is incomplete, or "complete" if all fields
 * required for chart calculation are present.
 * Does not throw — returns "missing_date" if the user has no profile row at all.
 */
export function getNormalizationStatus(userId: string): NormalizationStatus {
  const profile = getOnboardingProfile(userId);
  if (!profile || !profile.birthDate) return "missing_date";
  if (profile.birthHour == null || profile.birthMinute == null) return "missing_time";
  if (!profile.birthPlaceFullText) return "missing_place";
  if (profile.birthLatitude == null || profile.birthLongitude == null) return "missing_coordinates";
  if (!profile.birthTimezone) return "missing_timezone";
  return "complete";
}
