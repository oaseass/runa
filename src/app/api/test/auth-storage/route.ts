import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  AuthStorageConfigurationError,
  getExternalAuthStorage,
  hasExternalAuthStorageConfig,
} from "@/lib/server/auth-storage";

export const dynamic = "force-dynamic";

export async function GET() {
  const hasConfig = hasExternalAuthStorageConfig();

  try {
    const redis = getExternalAuthStorage();

    if (!redis) {
      return NextResponse.json(
        { ok: false, hasConfig, storage: "local" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    const key = "luna:test:auth-storage:health";
    const value = crypto.randomUUID();

    await redis.set(key, value, { ex: 60 });

    const roundTrip = await redis.get<string>(key);

    return NextResponse.json(
      {
        ok: roundTrip === value,
        hasConfig,
        storage: "upstash",
      },
      {
        status: roundTrip === value ? 200 : 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";

    return NextResponse.json(
      {
        ok: false,
        hasConfig,
        error: message,
        type: error instanceof Error ? error.name : "UnknownError",
      },
      {
        status: error instanceof AuthStorageConfigurationError ? 503 : 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}