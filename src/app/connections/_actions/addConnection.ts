"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/server/auth-session";
import { createConnection } from "@/lib/server/connection-store";
import { computeNatalChart, localBirthToUtc } from "@/lib/astrology/calculate";

/**
 * Server Action: addConnection
 *
 * 1. Validates session.
 * 2. Parses birth data from FormData.
 * 3. Computes the connection's natal chart synchronously if birth data is sufficient.
 * 4. Persists the connection record.
 * 5. Redirects to the synastry insight page.
 */
export async function addConnectionAction(formData: FormData): Promise<void> {
  // 1. Validate session
  const cookieStore = await cookies();
  const token = cookieStore.get("luna_auth")?.value;
  if (!token) redirect("/account-access");

  const claims = verifySessionToken(token);
  if (!claims) redirect("/account-access");

  const { userId } = claims;

  // 2. Parse inputs
  const rawName = (formData.get("name") as string | null)?.trim() ?? "";
  if (!rawName || rawName.length > 50) redirect("/connections/add?error=name");

  const rawDate = (formData.get("birthDate") as string | null)?.trim() ?? "";
  // Accept "YYYY.MM.DD" or "YYYY-MM-DD"
  const dateParts = rawDate.replace(/\./g, "-").split("-");
  if (dateParts.length !== 3) redirect("/connections/add?error=date");

  const year   = parseInt(dateParts[0], 10);
  const month  = parseInt(dateParts[1], 10);
  const day    = parseInt(dateParts[2], 10);

  if (
    isNaN(year) || isNaN(month) || isNaN(day) ||
    year < 1900 || year > 2100 ||
    month < 1 || month > 12 ||
    day < 1 || day > 31
  ) {
    redirect("/connections/add?error=date");
  }

  // Birth date for storage (YYYY-MM-DD)
  const birthDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  // Birth time (optional)
  const rawTime = (formData.get("birthTime") as string | null)?.trim() ?? "";
  let birthHour: number | null = null;
  let birthMinute: number | null = null;
  let timeKnown = false;

  if (rawTime) {
    // Accept "HH:MM", "오전 HH:MM", "오후 HH:MM", "HH시 MM분"
    const normalized = rawTime
      .replace(/오전\s*/i, "")
      .replace(/오후\s*/i, "PM ")
      .replace(/시\s*/g, ":")
      .replace(/분.*/g, "")
      .trim();
    const isPm = rawTime.includes("오후") || rawTime.toLowerCase().includes("pm");
    const parts = normalized.replace(/PM\s*/i, "").split(":");
    if (parts.length >= 2) {
      let h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (!isNaN(h) && !isNaN(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        if (isPm && h < 12) h += 12;
        if (!isPm && h === 12) h = 0;
        birthHour = h;
        birthMinute = m;
        timeKnown = true;
      }
    }
  }

  // Location (optional hidden fields from places autocomplete)
  const rawLat = formData.get("latitude") as string | null;
  const rawLon = formData.get("longitude") as string | null;
  const rawTz  = formData.get("timezone") as string | null;

  const birthLatitude  = rawLat ? parseFloat(rawLat) : null;
  const birthLongitude = rawLon ? parseFloat(rawLon) : null;
  const birthTimezone  = rawTz?.trim() || null;

  // 3. Compute chart
  let birthUtcDatetime: string | null = null;
  let chartJson: string | null = null;

  const hasLocation = birthLatitude !== null && birthLongitude !== null && birthTimezone;

  if (timeKnown && hasLocation && birthHour !== null && birthMinute !== null) {
    // Full chart: time + location known
    try {
      const birthUtc = localBirthToUtc(
        year, month, day, birthHour, birthMinute, birthTimezone!,
      );
      birthUtcDatetime = birthUtc.toISOString();
      const chart = computeNatalChart({
        birthUtc,
        latitude: birthLatitude!,
        longitude: birthLongitude!,
        timezone: birthTimezone!,
      });
      chartJson = JSON.stringify(chart);
    } catch {
      // Chart computation failed — continue without chart
    }
  } else {
    // No time or no location: compute planets only at noon UTC
    // Use lat/lon 0,0 as placeholder — ASC/houses will be meaningless but planets are accurate
    const approximateLat = birthLatitude ?? 0;
    const approximateLon = birthLongitude ?? 0;
    const approximateTz  = birthTimezone ?? "UTC";
    try {
      const noonUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      birthUtcDatetime = noonUtc.toISOString();
      const chart = computeNatalChart({
        birthUtc: noonUtc,
        latitude: approximateLat,
        longitude: approximateLon,
        timezone: approximateTz,
      });
      chartJson = JSON.stringify(chart);
    } catch {
      // Continue without chart
    }
  }

  // 4. Save connection
  const conn = createConnection({
    ownerUserId: userId,
    name: rawName,
    birthDate,
    birthHour,
    birthMinute,
    birthLatitude,
    birthLongitude,
    birthTimezone,
    birthUtcDatetime,
    timeKnown,
    chartJson,
  });

  // 5. Redirect to insight page
  redirect(`/connections/insight/${conn.id}`);
}
