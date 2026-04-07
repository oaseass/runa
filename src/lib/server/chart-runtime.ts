import crypto from "node:crypto";
import {
  CALC_VERSION,
  computeNatalChart,
  computeTransitPositions,
  localBirthToUtc,
} from "@/lib/astrology/calculate";
import {
  buildDomainDetail,
  buildTodayDeepReport,
  buildTransitDeepList,
  interpretDomains,
  interpretTransits,
} from "@/lib/astrology/interpret";
import type {
  DomainDetail,
  DomainReading,
  NatalChart,
  TodayDeepReport,
  TransitChartData,
  TransitDeepDetail,
  TransitInterpretation,
} from "@/lib/astrology/types";
import {
  authUserKey,
  getExternalAuthStorage,
  type StoredAuthAccount,
  type StoredOnboardingProfile,
} from "@/lib/server/auth-storage";
import { getOrComputeNatalChart } from "@/lib/server/chart-store";

type RuntimeBirthProfile = {
  birthDate: string | null;
  birthHour: number | null;
  birthMinute: number | null;
  birthLatitude: number | null;
  birthLongitude: number | null;
  birthTimezone: string | null;
};

function mapStoredOnboardingProfile(profile: StoredOnboardingProfile | null | undefined): RuntimeBirthProfile | null {
  if (!profile) {
    return null;
  }

  return {
    birthDate: profile.birthTime?.birthDate ?? null,
    birthHour: profile.birthTime?.hour ?? null,
    birthMinute: profile.birthTime?.minute ?? null,
    birthLatitude: profile.birthPlace?.latitude ?? null,
    birthLongitude: profile.birthPlace?.longitude ?? null,
    birthTimezone: profile.birthPlace?.timezone ?? null,
  };
}

function computeChartHash(birthUtc: Date, latitude: number, longitude: number) {
  return crypto
    .createHash("sha256")
    .update(`${birthUtc.toISOString()}|${latitude.toFixed(6)}|${longitude.toFixed(6)}|${CALC_VERSION}`)
    .digest("hex")
    .slice(0, 16);
}

function computeRuntimeNatalChart(profile: RuntimeBirthProfile | null): NatalChart | null {
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
    year,
    month,
    day,
    profile.birthHour,
    profile.birthMinute,
    profile.birthTimezone,
  );

  const chart = computeNatalChart({
    birthUtc,
    latitude: profile.birthLatitude,
    longitude: profile.birthLongitude,
    timezone: profile.birthTimezone,
  });

  chart.chartHash = computeChartHash(birthUtc, profile.birthLatitude, profile.birthLongitude);
  return chart;
}

async function getRedisStoredAccount(userId: string) {
  try {
    const redis = getExternalAuthStorage();
    if (!redis) {
      return null;
    }

    return (await redis.get<StoredAuthAccount>(authUserKey(userId))) ?? null;
  } catch {
    return null;
  }
}

async function getRedisNatalChart(userId: string) {
  const account = await getRedisStoredAccount(userId);
  return computeRuntimeNatalChart(mapStoredOnboardingProfile(account?.onboardingProfile));
}

export async function getNatalChartForUser(userId: string): Promise<NatalChart | null> {
  const redisChart = await getRedisNatalChart(userId);
  if (redisChart) {
    return redisChart;
  }

  try {
    return getOrComputeNatalChart(userId);
  } catch {
    return null;
  }
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