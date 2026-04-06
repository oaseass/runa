/**
 * Natal chart calculation engine.
 * Pure function — same input always produces same output.
 * Uses astronomy-engine for planetary positions + manual Whole-Sign house system.
 */
import * as Astronomy from "astronomy-engine";
import {
  SIGNS,
  type SignName,
  type PlanetName,
  type PlanetPosition,
  type Aspect,
  type AspectName,
  type AxisPoint,
  type HouseCusp,
  type NatalChart,
} from "./types";

export const CALC_VERSION = "1.0.0";

// ── Helpers ──────────────────────────────────────────────────────────────────

const DEG = Math.PI / 180;

function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function signFromLongitude(lon: number): SignName {
  return SIGNS[Math.floor(norm360(lon) / 30)];
}

function degreeInSign(lon: number): number {
  return norm360(lon) % 30;
}

/** Julian Day from JavaScript Date */
function toJD(date: Date): number {
  return date.getTime() / 86_400_000 + 2_440_587.5;
}

/** Mean obliquity of ecliptic in degrees (IAU simplified, accurate ~0.01° for 1800–2200) */
function meanObliquity(date: Date): number {
  const T = (toJD(date) - 2_451_545.0) / 36_525;
  const arcsec = 84_381.448 - 46.815 * T - 0.00059 * T * T + 0.001813 * T * T * T;
  return arcsec / 3600;
}

/** Ascendant ecliptic longitude.
 *  Standard formula: atan2(-cos(RAMC), sin(RAMC)·cos(ε) + tan(φ)·sin(ε)) */
function calcAscendant(gastHours: number, lonDeg: number, latDeg: number, oblDeg: number): number {
  const ramc = norm360(gastHours * 15 + lonDeg) * DEG;
  const obl = oblDeg * DEG;
  const lat = latDeg * DEG;
  const asc = Math.atan2(-Math.cos(ramc), Math.sin(ramc) * Math.cos(obl) + Math.tan(lat) * Math.sin(obl));
  return norm360(asc / DEG);
}

/** Midheaven ecliptic longitude. */
function calcMidheaven(gastHours: number, lonDeg: number, oblDeg: number): number {
  const ramc = norm360(gastHours * 15 + lonDeg) * DEG;
  const obl = oblDeg * DEG;
  const mc = Math.atan2(Math.tan(ramc), Math.cos(obl));
  return norm360(mc / DEG);
}

/** Ecliptic longitude of a body at a given UTC date. */
function bodyLongitude(body: Astronomy.Body, date: Date): number {
  const gvec = Astronomy.GeoVector(body, date, false);
  const ecl = Astronomy.Ecliptic(gvec);
  return norm360(ecl.elon);
}

/** Whether a planet is in apparent retrograde motion (moved backward over 1 day). */
function isRetrograde(body: Astronomy.Body, date: Date): boolean {
  if (body === Astronomy.Body.Sun || body === Astronomy.Body.Moon) return false;
  const lon0 = bodyLongitude(body, date);
  const lon1 = bodyLongitude(body, new Date(date.getTime() + 86_400_000));
  // Account for 0/360 wrap
  let diff = lon1 - lon0;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff < 0;
}

// ── Aspect calculation ───────────────────────────────────────────────────────

const ASPECT_TABLE: Array<{ name: AspectName; angle: number; orb: number }> = [
  { name: "conjunction", angle: 0, orb: 8 },
  { name: "sextile", angle: 60, orb: 6 },
  { name: "square", angle: 90, orb: 8 },
  { name: "trine", angle: 120, orb: 8 },
  { name: "opposition", angle: 180, orb: 8 },
];

function angularSeparation(a: number, b: number): number {
  const diff = Math.abs(norm360(a) - norm360(b));
  return diff > 180 ? 360 - diff : diff;
}

function findAspect(lon1: number, lon2: number): { name: AspectName; orb: number } | null {
  const sep = angularSeparation(lon1, lon2);
  for (const { name, angle, orb } of ASPECT_TABLE) {
    const deviation = Math.abs(sep - angle);
    if (deviation <= orb) return { name, orb: parseFloat(deviation.toFixed(2)) };
  }
  return null;
}

/** Determine if aspect is applying (moving toward exactness) using next-day positions. */
function isApplying(lon1: number, lon2: number, lon1Next: number, lon2Next: number): boolean {
  const currentOrb = angularSeparation(lon1, lon2);
  const nextOrb = angularSeparation(lon1Next, lon2Next);
  return nextOrb < currentOrb;
}

// ── Planet list ──────────────────────────────────────────────────────────────

const PLANET_BODIES: Array<{ name: PlanetName; body: Astronomy.Body }> = [
  { name: "Sun", body: Astronomy.Body.Sun },
  { name: "Moon", body: Astronomy.Body.Moon },
  { name: "Mercury", body: Astronomy.Body.Mercury },
  { name: "Venus", body: Astronomy.Body.Venus },
  { name: "Mars", body: Astronomy.Body.Mars },
  { name: "Jupiter", body: Astronomy.Body.Jupiter },
  { name: "Saturn", body: Astronomy.Body.Saturn },
  { name: "Uranus", body: Astronomy.Body.Uranus },
  { name: "Neptune", body: Astronomy.Body.Neptune },
  { name: "Pluto", body: Astronomy.Body.Pluto },
];

// ── Whole-Sign house placement ────────────────────────────────────────────────

function wholeSignHouse(planetLon: number, ascLon: number): number {
  const ascSignIdx = Math.floor(norm360(ascLon) / 30);
  const planetSignIdx = Math.floor(norm360(planetLon) / 30);
  return ((planetSignIdx - ascSignIdx + 12) % 12) + 1;
}

function wholeSignHouses(ascLon: number): HouseCusp[] {
  const ascSignIdx = Math.floor(norm360(ascLon) / 30);
  return Array.from({ length: 12 }, (_, i) => {
    const signIdx = (ascSignIdx + i) % 12;
    return {
      house: i + 1,
      sign: SIGNS[signIdx],
      longitude: signIdx * 30,
    };
  });
}

// ── UTC conversion from local birth time ─────────────────────────────────────

/** Convert local birth time to UTC using IANA timezone. Node.js >= 18 required. */
export function localBirthToUtc(
  year: number, month: number, day: number,
  hour24: number, minute: number,
  timezone: string,
): Date {
  // Technique: create nominal UTC date, find timezone offset at that moment, correct.
  const guessUtc = new Date(Date.UTC(year, month - 1, day, hour24, minute, 0));
  // Convert that UTC moment to the target timezone and parse back
  const localStr = guessUtc.toLocaleString("en-CA", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const localDate = new Date(localStr + "Z"); // treat as UTC for subtraction
  const offsetMs = guessUtc.getTime() - localDate.getTime();
  return new Date(guessUtc.getTime() + offsetMs);
}

// ── Axis point helper ─────────────────────────────────────────────────────────

function toAxisPoint(lon: number): AxisPoint {
  return { longitude: lon, sign: signFromLongitude(lon), degreeInSign: parseFloat(degreeInSign(lon).toFixed(2)) };
}

// ── Main computation entry point ─────────────────────────────────────────────

export type ChartInput = {
  birthUtc: Date;   // UTC birth datetime
  latitude: number;
  longitude: number;
  timezone: string;
};

/**
 * Compute a full natal chart.
 * Pure function — deterministic for the same input.
 */
export function computeNatalChart(input: ChartInput): NatalChart {
  const { birthUtc, latitude, longitude, timezone } = input;

  const obl = meanObliquity(birthUtc);
  const gast = Astronomy.SiderealTime(birthUtc); // hours

  const ascLon = calcAscendant(gast, longitude, latitude, obl);
  const mcLon = calcMidheaven(gast, longitude, obl);

  // Compute planet longitudes
  const planetLons = new Map<PlanetName, number>();
  const nextDay = new Date(birthUtc.getTime() + 86_400_000);
  const planetLonsNext = new Map<PlanetName, number>();

  for (const { name, body } of PLANET_BODIES) {
    planetLons.set(name, bodyLongitude(body, birthUtc));
    planetLonsNext.set(name, bodyLongitude(body, nextDay));
  }

  // Build PlanetPosition array
  const planets: PlanetPosition[] = PLANET_BODIES.map(({ name, body }) => {
    const lon = planetLons.get(name)!;
    return {
      planet: name,
      longitude: parseFloat(lon.toFixed(4)),
      sign: signFromLongitude(lon),
      degreeInSign: parseFloat(degreeInSign(lon).toFixed(2)),
      house: wholeSignHouse(lon, ascLon),
      retrograde: isRetrograde(body, birthUtc),
    };
  });

  // Build aspects (all planet pairs with Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn)
  const slowPlanets: PlanetName[] = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"];
  const aspects: Aspect[] = [];
  for (let i = 0; i < slowPlanets.length; i++) {
    for (let j = i + 1; j < slowPlanets.length; j++) {
      const p1 = slowPlanets[i];
      const p2 = slowPlanets[j];
      const lon1 = planetLons.get(p1)!;
      const lon2 = planetLons.get(p2)!;
      const found = findAspect(lon1, lon2);
      if (found) {
        aspects.push({
          planet1: p1, planet2: p2,
          aspect: found.name, orb: found.orb,
          applying: isApplying(lon1, lon2, planetLonsNext.get(p1)!, planetLonsNext.get(p2)!),
        });
      }
    }
  }

  // Sort aspects by orb (tightest first)
  aspects.sort((a, b) => a.orb - b.orb);

  // Moon phase (0 = new, 180 = full)
  const sunLon = planetLons.get("Sun")!;
  const moonLon = planetLons.get("Moon")!;
  const moonPhase = norm360(moonLon - sunLon);

  return {
    version: CALC_VERSION,
    computedAt: new Date().toISOString(),
    birthUtc: birthUtc.toISOString(),
    latitude,
    longitude,
    timezone,
    planets,
    ascendant: toAxisPoint(ascLon),
    midheaven: toAxisPoint(mcLon),
    houseSystem: "whole-sign",
    houses: wholeSignHouses(ascLon),
    aspects,
    moonPhase: parseFloat(moonPhase.toFixed(2)),
  };
}

/** Compute planetary positions for a given date (for transit analysis). */
export function computeTransitPositions(date: Date): Map<PlanetName, number> {
  const positions = new Map<PlanetName, number>();
  for (const { name, body } of PLANET_BODIES) {
    positions.set(name, bodyLongitude(body, date));
  }
  return positions;
}

export { angularSeparation, findAspect, norm360, signFromLongitude };
