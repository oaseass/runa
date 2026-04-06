import crypto from "node:crypto";
import { db } from "./db";
import type { SynastryAnalysis } from "@/lib/astrology/synastry";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConnectionRow = {
  id: string;
  ownerUserId: string;
  name: string;
  birthDate: string;          // YYYY-MM-DD
  birthHour: number | null;
  birthMinute: number | null;
  birthLatitude: number | null;
  birthLongitude: number | null;
  birthTimezone: string | null;
  birthUtcDatetime: string | null;
  timeKnown: boolean;
  chartJson: string | null;
  createdAt: string;
  updatedAt: string;
};

type DbConnectionRow = {
  id: string;
  owner_user_id: string;
  name: string;
  birth_date: string;
  birth_hour: number | null;
  birth_minute: number | null;
  birth_latitude: number | null;
  birth_longitude: number | null;
  birth_timezone: string | null;
  birth_utc_datetime: string | null;
  time_known: number;
  chart_json: string | null;
  created_at: string;
  updated_at: string;
};

function rowToConnection(row: DbConnectionRow): ConnectionRow {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    name: row.name,
    birthDate: row.birth_date,
    birthHour: row.birth_hour,
    birthMinute: row.birth_minute,
    birthLatitude: row.birth_latitude,
    birthLongitude: row.birth_longitude,
    birthTimezone: row.birth_timezone,
    birthUtcDatetime: row.birth_utc_datetime,
    timeKnown: row.time_known === 1,
    chartJson: row.chart_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type CreateConnectionInput = {
  ownerUserId: string;
  name: string;
  birthDate: string;          // YYYY-MM-DD
  birthHour: number | null;
  birthMinute: number | null;
  birthLatitude: number | null;
  birthLongitude: number | null;
  birthTimezone: string | null;
  birthUtcDatetime: string | null;
  timeKnown: boolean;
  chartJson: string | null;
};

// ── Connection CRUD ───────────────────────────────────────────────────────────

export function createConnection(input: CreateConnectionInput): ConnectionRow {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO connections
      (id, owner_user_id, name, birth_date, birth_hour, birth_minute,
       birth_latitude, birth_longitude, birth_timezone, birth_utc_datetime,
       time_known, chart_json, created_at, updated_at)
    VALUES
      (@id, @ownerUserId, @name, @birthDate, @birthHour, @birthMinute,
       @birthLatitude, @birthLongitude, @birthTimezone, @birthUtcDatetime,
       @timeKnown, @chartJson, @now, @now)
  `).run({
    id,
    ownerUserId: input.ownerUserId,
    name: input.name.trim(),
    birthDate: input.birthDate,
    birthHour: input.birthHour,
    birthMinute: input.birthMinute,
    birthLatitude: input.birthLatitude,
    birthLongitude: input.birthLongitude,
    birthTimezone: input.birthTimezone,
    birthUtcDatetime: input.birthUtcDatetime,
    timeKnown: input.timeKnown ? 1 : 0,
    chartJson: input.chartJson,
    now,
  });

  const row = db.prepare(
    "SELECT * FROM connections WHERE id = @id"
  ).get({ id }) as DbConnectionRow;

  return rowToConnection(row);
}

export function getConnection(
  id: string,
  ownerUserId: string,
): ConnectionRow | null {
  const row = db.prepare(
    "SELECT * FROM connections WHERE id = @id AND owner_user_id = @ownerUserId"
  ).get({ id, ownerUserId }) as DbConnectionRow | undefined;
  return row ? rowToConnection(row) : null;
}

export function listConnections(ownerUserId: string): ConnectionRow[] {
  const rows = db.prepare(
    "SELECT * FROM connections WHERE owner_user_id = @ownerUserId ORDER BY created_at DESC"
  ).all({ ownerUserId }) as DbConnectionRow[];
  return rows.map(rowToConnection);
}

export function deleteConnection(id: string, ownerUserId: string): void {
  db.prepare(
    "DELETE FROM connections WHERE id = @id AND owner_user_id = @ownerUserId"
  ).run({ id, ownerUserId });
}

// ── Synastry cache ────────────────────────────────────────────────────────────

export function getCachedSynastry(
  ownerUserId: string,
  connectionId: string,
  ownerChartHash: string,
): SynastryAnalysis | null {
  const row = db.prepare(`
    SELECT analysis_json FROM synastry_cache
    WHERE owner_user_id = @ownerUserId
      AND connection_id = @connectionId
      AND owner_chart_hash = @ownerChartHash
  `).get({ ownerUserId, connectionId, ownerChartHash }) as
    { analysis_json: string } | undefined;

  if (!row) return null;
  try {
    return JSON.parse(row.analysis_json) as SynastryAnalysis;
  } catch {
    return null;
  }
}

export function saveSynastry(
  ownerUserId: string,
  connectionId: string,
  ownerChartHash: string,
  analysis: SynastryAnalysis,
): void {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO synastry_cache
      (id, owner_user_id, connection_id, owner_chart_hash, analysis_json, computed_at)
    VALUES
      (@id, @ownerUserId, @connectionId, @ownerChartHash, @analysisJson, @now)
    ON CONFLICT(owner_user_id, connection_id, owner_chart_hash)
    DO UPDATE SET analysis_json = @analysisJson, computed_at = @now
  `).run({
    id,
    ownerUserId,
    connectionId,
    ownerChartHash,
    analysisJson: JSON.stringify(analysis),
    now,
  });
}
