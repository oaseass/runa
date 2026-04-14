import crypto from "node:crypto";
import { db } from "./db";
import type { SynastryAnalysis } from "@/lib/astrology/synastry";
import { getExternalAuthStorage } from "@/lib/server/auth-storage";

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

const CONNECTION_KEY_PREFIX = "luna:connections:v1";

function connectionKey(id: string) {
  return `${CONNECTION_KEY_PREFIX}:item:${id}`;
}

function connectionOwnerListKey(ownerUserId: string) {
  return `${CONNECTION_KEY_PREFIX}:owner:${ownerUserId}`;
}

function synastryCacheKey(ownerUserId: string, connectionId: string, ownerChartHash: string) {
  return `${CONNECTION_KEY_PREFIX}:synastry:${ownerUserId}:${connectionId}:${ownerChartHash}`;
}

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

async function getExternalConnectionStorage() {
  try {
    return getExternalAuthStorage();
  } catch {
    return null;
  }
}

async function createExternalConnection(input: CreateConnectionInput): Promise<ConnectionRow> {
  const redis = await getExternalConnectionStorage();
  if (!redis) {
    throw new Error("EXTERNAL_CONNECTION_STORAGE_UNAVAILABLE");
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const record: ConnectionRow = {
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
    timeKnown: input.timeKnown,
    chartJson: input.chartJson,
    createdAt: now,
    updatedAt: now,
  };

  const ownerListKey = connectionOwnerListKey(input.ownerUserId);
  const existingIds = (await redis.get<string[]>(ownerListKey)) ?? [];

  await Promise.all([
    redis.set(connectionKey(id), record),
    redis.set(ownerListKey, [id, ...existingIds.filter((value) => value !== id)]),
  ]);

  return record;
}

async function getExternalConnection(id: string, ownerUserId: string): Promise<ConnectionRow | null> {
  const redis = await getExternalConnectionStorage();
  if (!redis) {
    return null;
  }

  const record = await redis.get<ConnectionRow>(connectionKey(id));
  if (!record || record.ownerUserId !== ownerUserId) {
    return null;
  }

  return record;
}

async function listExternalConnections(ownerUserId: string): Promise<ConnectionRow[]> {
  const redis = await getExternalConnectionStorage();
  if (!redis) {
    return [];
  }

  const ids = (await redis.get<string[]>(connectionOwnerListKey(ownerUserId))) ?? [];
  if (ids.length === 0) {
    return [];
  }

  const records = await Promise.all(ids.map((id) => redis.get<ConnectionRow>(connectionKey(id))));
  return records.filter((record): record is ConnectionRow => record !== null && record.ownerUserId === ownerUserId);
}

async function deleteExternalConnection(id: string, ownerUserId: string): Promise<void> {
  const redis = await getExternalConnectionStorage();
  if (!redis) {
    return;
  }

  const ownerListKey = connectionOwnerListKey(ownerUserId);
  const ids = (await redis.get<string[]>(ownerListKey)) ?? [];

  await Promise.all([
    redis.del(connectionKey(id)),
    redis.set(ownerListKey, ids.filter((value) => value !== id)),
  ]);
}

// ── Connection CRUD ───────────────────────────────────────────────────────────

export async function createConnection(input: CreateConnectionInput): Promise<ConnectionRow> {
  const externalStorage = await getExternalConnectionStorage();
  if (externalStorage) {
    return createExternalConnection(input);
  }

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

  if (!row) {
    throw new Error("CONNECTION_CREATE_FAILED");
  }

  return rowToConnection(row);
}

export async function getConnection(
  id: string,
  ownerUserId: string,
): Promise<ConnectionRow | null> {
  const externalStorage = await getExternalConnectionStorage();
  if (externalStorage) {
    return getExternalConnection(id, ownerUserId);
  }

  const row = db.prepare(
    "SELECT * FROM connections WHERE id = @id AND owner_user_id = @ownerUserId"
  ).get({ id, ownerUserId }) as DbConnectionRow | undefined;
  return row ? rowToConnection(row) : null;
}

export async function listConnections(ownerUserId: string): Promise<ConnectionRow[]> {
  const externalStorage = await getExternalConnectionStorage();
  if (externalStorage) {
    return listExternalConnections(ownerUserId);
  }

  const rows = db.prepare(
    "SELECT * FROM connections WHERE owner_user_id = @ownerUserId ORDER BY created_at DESC"
  ).all({ ownerUserId }) as DbConnectionRow[];
  return rows.map(rowToConnection);
}

export async function deleteConnection(id: string, ownerUserId: string): Promise<void> {
  const externalStorage = await getExternalConnectionStorage();
  if (externalStorage) {
    await deleteExternalConnection(id, ownerUserId);
    return;
  }

  db.prepare(
    "DELETE FROM connections WHERE id = @id AND owner_user_id = @ownerUserId"
  ).run({ id, ownerUserId });
}

// ── Synastry cache ────────────────────────────────────────────────────────────

export async function getCachedSynastry(
  ownerUserId: string,
  connectionId: string,
  ownerChartHash: string,
): Promise<SynastryAnalysis | null> {
  const externalStorage = await getExternalConnectionStorage();
  if (externalStorage) {
    return (await externalStorage.get<SynastryAnalysis>(synastryCacheKey(ownerUserId, connectionId, ownerChartHash))) ?? null;
  }

  try {
    const row = db.prepare(`
      SELECT analysis_json FROM synastry_cache
      WHERE owner_user_id = @ownerUserId
        AND connection_id = @connectionId
        AND owner_chart_hash = @ownerChartHash
    `).get({ ownerUserId, connectionId, ownerChartHash }) as
      { analysis_json: string } | undefined;

    if (!row) return null;

    return JSON.parse(row.analysis_json) as SynastryAnalysis;
  } catch {
    return null;
  }
}

export async function saveSynastry(
  ownerUserId: string,
  connectionId: string,
  ownerChartHash: string,
  analysis: SynastryAnalysis,
): Promise<void> {
  const externalStorage = await getExternalConnectionStorage();
  if (externalStorage) {
    await externalStorage.set(synastryCacheKey(ownerUserId, connectionId, ownerChartHash), analysis);
    return;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
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
  } catch {
    // Cache persistence is best-effort only.
  }
}
