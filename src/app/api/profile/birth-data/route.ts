import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/server/auth-session";
import { db } from "@/lib/server/db";
import { localBirthToUtc } from "@/lib/astrology/calculate";

type BirthDataPatchRequest = {
  birthDate?: string | null;
  hour?: number | null;
  minute?: number | null;
  formatted?: string | null;
  placeId?: string | null;
  fullText?: string | null;
  mainText?: string | null;
  secondaryText?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string | null;
};

export async function PATCH(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);

  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as BirthDataPatchRequest;
  const now = new Date().toISOString();

  const setClauses: string[] = ["updated_at = @updatedAt"];
  const params: Record<string, unknown> = { userId: session.userId, updatedAt: now };

  if (body.birthDate !== undefined) { setClauses.push("birth_date = @birthDate"); params.birthDate = body.birthDate; }
  if (body.hour !== undefined) { setClauses.push("birth_hour = @birthHour"); params.birthHour = body.hour; }
  if (body.minute !== undefined) { setClauses.push("birth_minute = @birthMinute"); params.birthMinute = body.minute; }
  if (body.formatted !== undefined) { setClauses.push("birth_time_text = @birthTimeText"); params.birthTimeText = body.formatted; }
  if (body.placeId !== undefined) { setClauses.push("birth_place_id = @birthPlaceId"); params.birthPlaceId = body.placeId; }
  if (body.fullText !== undefined) { setClauses.push("birth_place_full_text = @birthPlaceFullText"); params.birthPlaceFullText = body.fullText; }
  if (body.mainText !== undefined) { setClauses.push("birth_place_main_text = @birthPlaceMainText"); params.birthPlaceMainText = body.mainText; }
  if (body.secondaryText !== undefined) { setClauses.push("birth_place_secondary_text = @birthPlaceSecondaryText"); params.birthPlaceSecondaryText = body.secondaryText; }
  if (body.latitude !== undefined) { setClauses.push("birth_latitude = @birthLatitude"); params.birthLatitude = body.latitude; }
  if (body.longitude !== undefined) { setClauses.push("birth_longitude = @birthLongitude"); params.birthLongitude = body.longitude; }
  if (body.timezone !== undefined) { setClauses.push("birth_timezone = @birthTimezone"); params.birthTimezone = body.timezone; }

  db.prepare(`
    INSERT INTO onboarding_profiles (user_id, updated_at)
    VALUES (@userId, @updatedAt)
    ON CONFLICT(user_id) DO UPDATE SET ${setClauses.join(", ")}
  `).run(params);

  // Invalidate cached natal chart — will recompute on next request
  db.prepare("DELETE FROM natal_charts WHERE user_id = @userId").run({ userId: session.userId });

  // If all fields required for UTC computation are now present, persist birth_utc_datetime
  const fullProfile = db.prepare(`
    SELECT birth_date, birth_hour, birth_minute, birth_timezone
    FROM onboarding_profiles WHERE user_id = ?
  `).get(session.userId) as {
    birth_date: string | null;
    birth_hour: number | null;
    birth_minute: number | null;
    birth_timezone: string | null;
  } | undefined;

  if (
    fullProfile?.birth_date &&
    fullProfile.birth_hour != null &&
    fullProfile.birth_minute != null &&
    fullProfile.birth_timezone
  ) {
    const [y, m, d] = fullProfile.birth_date.split("-").map(Number);
    const utc = localBirthToUtc(
      y, m, d,
      fullProfile.birth_hour, fullProfile.birth_minute,
      fullProfile.birth_timezone,
    );
    db.prepare(
      "UPDATE onboarding_profiles SET birth_utc_datetime = @utc WHERE user_id = @userId"
    ).run({ utc: utc.toISOString(), userId: session.userId });
  }

  return NextResponse.json({ success: true });
}
