import crypto from "node:crypto";
import {
  CALC_VERSION,
  angularSeparation,
  computeNatalChart,
  computeTransitPositions,
  findAspect,
  localBirthToUtc,
} from "@/lib/astrology/calculate";
import {
  buildDomainDetail,
  buildTodayDeepReport,
  buildTransitDeepList,
  interpretNatalChart,
  interpretDomains,
  interpretTransits,
} from "@/lib/astrology/interpret";
import type {
  AspectName,
  BirthProfileStatus,
  DomainDetail,
  DomainReading,
  NatalChart,
  NatalInterpretation,
  PlanetName,
  TodayDeepReport,
  TransitChartData,
  TransitDeepDetail,
  TransitInterpretation,
} from "@/lib/astrology/types";
import {
  type StoredOnboardingProfile,
} from "@/lib/server/auth-storage";
import { findStoredAuthAccountById } from "@/lib/server/auth-account-store";

type RuntimeBirthProfile = {
  birthDate: string | null;
  birthHour: number | null;
  birthMinute: number | null;
  birthPlaceFullText: string | null;
  birthLatitude: number | null;
  birthLongitude: number | null;
  birthTimezone: string | null;
};

export type RuntimeOnboardingProfile = RuntimeBirthProfile;

type LocalOnboardingProfileRow = {
  birth_date: string | null;
  birth_hour: number | null;
  birth_minute: number | null;
  birth_place_full_text: string | null;
  birth_latitude: number | null;
  birth_longitude: number | null;
  birth_timezone: string | null;
};

async function getLocalDb() {
  try {
    const { db } = await import("@/lib/server/db");
    return db;
  } catch {
    return null;
  }
}

function mapStoredOnboardingProfile(profile: StoredOnboardingProfile | null | undefined): RuntimeBirthProfile | null {
  if (!profile) {
    return null;
  }

  return {
    birthDate: profile.birthTime?.birthDate ?? null,
    birthHour: profile.birthTime?.hour ?? null,
    birthMinute: profile.birthTime?.minute ?? null,
    birthPlaceFullText: profile.birthPlace?.fullText ?? null,
    birthLatitude: profile.birthPlace?.latitude ?? null,
    birthLongitude: profile.birthPlace?.longitude ?? null,
    birthTimezone: profile.birthPlace?.timezone ?? null,
  };
}

function mergeRuntimeProfiles(
  primary: RuntimeOnboardingProfile | null,
  fallback: RuntimeOnboardingProfile | null,
): RuntimeOnboardingProfile | null {
  if (!primary && !fallback) {
    return null;
  }

  const merged: RuntimeOnboardingProfile = {
    birthDate: primary?.birthDate ?? fallback?.birthDate ?? null,
    birthHour: primary?.birthHour ?? fallback?.birthHour ?? null,
    birthMinute: primary?.birthMinute ?? fallback?.birthMinute ?? null,
    birthPlaceFullText: primary?.birthPlaceFullText ?? fallback?.birthPlaceFullText ?? null,
    birthLatitude: primary?.birthLatitude ?? fallback?.birthLatitude ?? null,
    birthLongitude: primary?.birthLongitude ?? fallback?.birthLongitude ?? null,
    birthTimezone: primary?.birthTimezone ?? fallback?.birthTimezone ?? null,
  };

  if (
    merged.birthDate === null &&
    merged.birthHour === null &&
    merged.birthMinute === null &&
    merged.birthPlaceFullText === null &&
    merged.birthLatitude === null &&
    merged.birthLongitude === null &&
    merged.birthTimezone === null
  ) {
    return null;
  }

  return merged;
}

function isCompleteRuntimeProfile(
  profile: RuntimeBirthProfile | null,
): profile is RuntimeBirthProfile & {
  birthDate: string;
  birthHour: number;
  birthMinute: number;
  birthLatitude: number;
  birthLongitude: number;
  birthTimezone: string;
} {
  return Boolean(
    profile &&
    profile.birthDate &&
    profile.birthHour != null &&
    profile.birthMinute != null &&
    profile.birthLatitude != null &&
    profile.birthLongitude != null &&
    profile.birthTimezone,
  );
}

function computeChartHash(birthUtc: Date, latitude: number, longitude: number) {
  return crypto
    .createHash("sha256")
    .update(`${birthUtc.toISOString()}|${latitude.toFixed(6)}|${longitude.toFixed(6)}|${CALC_VERSION}`)
    .digest("hex")
    .slice(0, 16);
}

async function getCachedLocalNatalChart(userId: string): Promise<NatalChart | null> {
  const db = await getLocalDb();
  if (!db) {
    return null;
  }

  const row = db.prepare(
    "SELECT chart_json, calc_version FROM natal_charts WHERE user_id = ?",
  ).get(userId) as { chart_json: string; calc_version: string } | undefined;

  if (!row || row.calc_version !== CALC_VERSION) {
    return null;
  }

  try {
    const chart = JSON.parse(row.chart_json) as NatalChart;
    if (!chart.chartHash) {
      return null;
    }

    return chart;
  } catch {
    return null;
  }
}

async function saveLocalNatalChart(userId: string, chart: NatalChart): Promise<void> {
  const db = await getLocalDb();
  if (!db) {
    return;
  }

  db.prepare(`
    INSERT INTO natal_charts (id, user_id, calc_version, chart_json, computed_at)
    VALUES (@id, @userId, @version, @json, @computedAt)
    ON CONFLICT(user_id) DO UPDATE SET
      calc_version = excluded.calc_version,
      chart_json   = excluded.chart_json,
      computed_at  = excluded.computed_at
  `).run({
    id: crypto.randomUUID(),
    userId,
    version: chart.version,
    json: JSON.stringify(chart),
    computedAt: chart.computedAt,
  });
}

async function getRuntimeStoredAccount(userId: string) {
  try {
    return await findStoredAuthAccountById(userId);
  } catch {
    return null;
  }
}

async function getLocalOnboardingProfile(userId: string): Promise<RuntimeOnboardingProfile | null> {
  const db = await getLocalDb();
  if (!db) {
    return null;
  }

  const row = db.prepare(`
    SELECT birth_date, birth_hour, birth_minute,
           birth_place_full_text, birth_latitude, birth_longitude, birth_timezone
    FROM onboarding_profiles WHERE user_id = ?
  `).get(userId) as LocalOnboardingProfileRow | undefined;

  if (!row) {
    return null;
  }

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

export async function getOnboardingProfileForUser(userId: string): Promise<RuntimeOnboardingProfile | null> {
  const account = await getRuntimeStoredAccount(userId);
  const runtimeProfile = mapStoredOnboardingProfile(account?.onboardingProfile);
  const localProfile = await getLocalOnboardingProfile(userId);
  return mergeRuntimeProfiles(runtimeProfile, localProfile);
}

async function getOrComputeRuntimeNatalChart(
  userId: string,
  profile: RuntimeBirthProfile | null,
): Promise<NatalChart | null> {
  if (!isCompleteRuntimeProfile(profile)) {
    return null;
  }

  const [year, month, day] = profile.birthDate.split("-").map(Number);
  const birthUtc = localBirthToUtc(
    year,
    month,
    day,
    profile.birthHour,
    profile.birthMinute,
    profile.birthTimezone,
  );
  const chartHash = computeChartHash(birthUtc, profile.birthLatitude, profile.birthLongitude);
  const cachedChart = await getCachedLocalNatalChart(userId);
  if (cachedChart?.chartHash === chartHash) {
    return cachedChart;
  }

  const chart = computeNatalChart({
    birthUtc,
    latitude: profile.birthLatitude,
    longitude: profile.birthLongitude,
    timezone: profile.birthTimezone,
  });
  chart.chartHash = chartHash;
  await saveLocalNatalChart(userId, chart);
  return chart;
}

export async function getBirthProfileStatusForUser(userId: string): Promise<BirthProfileStatus> {
  const profile = await getOnboardingProfileForUser(userId);
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

export async function getNatalChartForUser(userId: string): Promise<NatalChart | null> {
  const profile = await getOnboardingProfileForUser(userId);
  return getOrComputeRuntimeNatalChart(userId, profile);
}

export async function getNatalInterpretationForUser(userId: string): Promise<NatalInterpretation | null> {
  const chart = await getNatalChartForUser(userId);
  return chart ? interpretNatalChart(chart) : null;
}

export async function getTodayInterpretationForUser(userId: string): Promise<TransitInterpretation | null> {
  return getTransitInterpretationForUser(userId, new Date());
}

export async function getDateInterpretationForUser(userId: string, date: Date): Promise<TransitInterpretation | null> {
  return getTransitInterpretationForUser(userId, date);
}

export async function getDomainReadingsByDateForUser(userId: string, date: Date): Promise<DomainReading[] | null> {
  return getDomainReadingsForUser(userId, date);
}

export async function getTransitInterpretationForUser(userId: string, date: Date): Promise<TransitInterpretation | null> {
  const chart = await getNatalChartForUser(userId);
  return chart ? interpretTransits(chart, date) : null;
}

export async function getDomainReadingsForUser(userId: string, date: Date): Promise<DomainReading[] | null> {
  const chart = await getNatalChartForUser(userId);
  return chart ? interpretDomains(chart, date) : null;
}

export async function getDomainDetailForUser(userId: string, domainKey: string, date: Date): Promise<DomainDetail | null> {
  const chart = await getNatalChartForUser(userId);
  return chart ? buildDomainDetail(domainKey, chart, date) : null;
}

export async function getTodayDeepReportForUser(userId: string, date: Date): Promise<TodayDeepReport | null> {
  const chart = await getNatalChartForUser(userId);
  return chart ? buildTodayDeepReport(chart, date) : null;
}

export async function getTransitDeepListForUser(userId: string, date: Date): Promise<TransitDeepDetail[] | null> {
  const chart = await getNatalChartForUser(userId);
  return chart ? buildTransitDeepList(chart, date) : null;
}

export async function getTransitChartDataForUser(userId: string, date: Date): Promise<TransitChartData | null> {
  const chart = await getNatalChartForUser(userId);
  if (!chart) {
    return null;
  }

  const transitPositionsMap = computeTransitPositions(date);
  const interpretation = interpretTransits(chart, date);

  return {
    natalPlanets: chart.planets.map((planet) => ({
      planet: planet.planet,
      longitude: planet.longitude,
      retrograde: planet.retrograde,
    })),
    transitPlanets: Array.from(transitPositionsMap.entries()).map(([planet, longitude]) => ({
      planet,
      longitude,
    })),
    houses: chart.houses.map((house) => ({ house: house.house, longitude: house.longitude })),
    ascendantLon: chart.ascendant.longitude,
    activeAspects: interpretation.activeAspects,
  };
}

export type DayScore = {
  day: number;
  score: number;
  tone: "strength" | "challenge" | "neutral";
  topDomain: string | null;
  secondDomain: string | null;
  icons: string[];
  aspectType: AspectName | null;
  applying: boolean | null;
  dominantHouse: number | null;
  planetPair: string | null;
};

const DOMAIN_ICON: Record<string, string> = {
  "관계": "♡",
  "루틴·일": "★",
  "사고·표현": "💬",
  "감정·내면": "✦",
};

const TRANSIT_PRIORITY = ["Jupiter", "Saturn", "Mars", "Venus", "Sun", "Moon"] as const;
type TransitPriority = typeof TRANSIT_PRIORITY[number];

const ASPECT_SCORE: Record<AspectName, number> = {
  conjunction: 5,
  trine: 4,
  opposition: 3,
  square: 3,
  sextile: 2,
};

const ASPECT_ANGLE: Record<AspectName, number> = {
  conjunction: 0,
  sextile: 60,
  square: 90,
  trine: 120,
  opposition: 180,
};

export async function scoreMonthDaysForUser(
  userId: string,
  year: number,
  month: number,
): Promise<{ days: DayScore[]; chartHash: string } | null> {
  const chart = await getNatalChartForUser(userId);
  if (!chart) {
    return null;
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const result: DayScore[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day, 12, 0, 0);
    const domains = interpretDomains(chart, date);

    let points = 0;
    let topDomain: string | null = null;
    let topPoints = -1;
    let secondDomain: string | null = null;
    let secondPoints = -1;
    const icons: string[] = [];

    for (const domain of domains) {
      if (domain.domain === "나") {
        continue;
      }

      const point = domain.tone === "strength" ? 2 : domain.tone === "neutral" ? 1 : 0;
      points += point;

      if (point > topPoints) {
        secondPoints = topPoints;
        secondDomain = topDomain;
        topPoints = point;
        topDomain = domain.domain;
      } else if (point > secondPoints) {
        secondPoints = point;
        secondDomain = domain.domain;
      }

      if (domain.tone === "strength" && DOMAIN_ICON[domain.domain]) {
        icons.push(DOMAIN_ICON[domain.domain]);
      }
    }

    const tone: "strength" | "challenge" | "neutral" =
      domains.some((domain) => domain.tone === "challenge")
        ? "challenge"
        : domains.some((domain) => domain.tone === "strength")
          ? "strength"
          : "neutral";

    const score = Math.round((points / 8) * 100);
    if (score >= 75 && !icons.includes("⭐")) {
      icons.push("⭐");
    }

    const transitPositions = computeTransitPositions(date);
    const nextDate = new Date(date.getTime() + 86_400_000);
    const nextTransitPositions = computeTransitPositions(nextDate);

    let bestAspectType: AspectName | null = null;
    let bestApplying: boolean | null = null;
    let bestHouse: number | null = null;
    let bestPair: string | null = null;
    let bestWeight = -1;

    for (const transitPlanet of TRANSIT_PRIORITY as readonly TransitPriority[]) {
      const transitLongitude = transitPositions.get(transitPlanet as PlanetName);
      if (transitLongitude == null) {
        continue;
      }

      const nextTransitLongitude = nextTransitPositions.get(transitPlanet as PlanetName);
      if (nextTransitLongitude == null) {
        continue;
      }

      for (const natalPlanet of chart.planets) {
        const aspect = findAspect(transitLongitude, natalPlanet.longitude);
        if (!aspect) {
          continue;
        }

        const weight = ASPECT_SCORE[aspect.name] / (1 + aspect.orb);
        if (weight <= bestWeight) {
          continue;
        }

        bestWeight = weight;
        const targetAngle = ASPECT_ANGLE[aspect.name];
        const currentDeviation = Math.abs(angularSeparation(transitLongitude, natalPlanet.longitude) - targetAngle);
        const nextDeviation = Math.abs(angularSeparation(nextTransitLongitude, natalPlanet.longitude) - targetAngle);
        bestAspectType = aspect.name;
        bestApplying = nextDeviation < currentDeviation;
        bestHouse = natalPlanet.house;
        bestPair = `${transitPlanet}-${natalPlanet.planet}`;
      }
    }

    result.push({
      day,
      score,
      tone,
      topDomain,
      secondDomain,
      icons: icons.slice(0, 3),
      aspectType: bestAspectType,
      applying: bestApplying,
      dominantHouse: bestHouse,
      planetPair: bestPair,
    });
  }

  return { days: result, chartHash: chart.chartHash ?? "" };
}

export type BestDay = {
  date: string;
  label: string;
  score: number;
  topDomain: string | null;
  tone: "strength" | "challenge" | "neutral";
};

function bestDayLabel(topDomain: string | null, score: number): string {
  if (score >= 85) {
    if (topDomain === "관계") return "지금 연결해야 할 사람이 있다면 이 날";
    if (topDomain === "루틴·일") return "가장 잘 나아갈 수 있는 날";
    if (topDomain === "사고·표현") return "중요한 말을 꺼낼 최적의 날";
    if (topDomain === "감정·내면") return "자신을 가장 잘 이해할 수 있는 날";
    return "이번 달 최고의 흐름";
  }

  if (score >= 65) {
    if (topDomain === "관계") return "관계 에너지가 활발한 날";
    if (topDomain === "루틴·일") return "일을 추진하기 좋은 날";
    if (topDomain === "사고·표현") return "생각이 잘 정리되는 날";
    if (topDomain === "감정·내면") return "내면을 돌아보기 좋은 날";
    return "흐름이 좋은 날";
  }

  return "눈여겨볼 흐름";
}

export async function getPersonalizedBestDaysForUser(
  userId: string,
  count = 10,
  daysAhead = 45,
): Promise<BestDay[] | null> {
  const chart = await getNatalChartForUser(userId);
  if (!chart) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const scored: Array<{
    date: Date;
    score: number;
    topDomain: string | null;
    tone: "strength" | "challenge" | "neutral";
  }> = [];

  for (let index = 1; index <= daysAhead; index++) {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    date.setHours(12, 0, 0, 0);

    const domains = interpretDomains(chart, date);
    let points = 0;
    let topDomain: string | null = null;
    let topPoints = -1;

    for (const domain of domains) {
      const point = domain.tone === "strength" ? 2 : domain.tone === "neutral" ? 1 : 0;
      points += point;
      if (point > topPoints) {
        topPoints = point;
        topDomain = domain.domain;
      }
    }

    const tone: "strength" | "challenge" | "neutral" =
      domains.some((domain) => domain.tone === "challenge")
        ? "challenge"
        : domains.some((domain) => domain.tone === "strength")
          ? "strength"
          : "neutral";

    scored.push({
      date,
      score: Math.round((points / 8) * 100),
      topDomain,
      tone,
    });
  }

  const topDays = scored
    .sort((left, right) => right.score - left.score)
    .filter((entry) => entry.score >= 50)
    .slice(0, count)
    .sort((left, right) => left.date.getTime() - right.date.getTime());

  return topDays.map((entry) => ({
    date: entry.date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" }).replace(" ", " ").toUpperCase(),
    label: bestDayLabel(entry.topDomain, entry.score),
    score: entry.score,
    topDomain: entry.topDomain,
    tone: entry.tone,
  }));
}