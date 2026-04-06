/**
 * Resolves a Google Place ID to WGS-84 coordinates and IANA timezone.
 * GET /api/places/geocode?placeId={id}
 * Returns { success, latitude, longitude, timezone }
 */
import { NextResponse } from "next/server";

type PlaceDetailsResponse = {
  location?: {
    latitude?: number;
    longitude?: number;
  };
};

type TimezoneApiResponse = {
  status?: string;
  timeZoneId?: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const placeId = searchParams.get("placeId")?.trim() ?? "";

  if (!placeId) {
    return NextResponse.json({ success: false, error: "placeId is required" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ success: false, error: "Geocoding unavailable" }, { status: 503 });
  }

  // 1. Place Details → lat/lng
  let latitude: number;
  let longitude: number;
  try {
    const detailsRes = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "location",
        },
        cache: "no-store",
      },
    );

    if (!detailsRes.ok) {
      return NextResponse.json({ success: false, error: "Place lookup failed" }, { status: 502 });
    }

    const details = (await detailsRes.json()) as PlaceDetailsResponse;
    const loc = details.location;
    if (!loc?.latitude || !loc?.longitude) {
      return NextResponse.json({ success: false, error: "Coordinates not found for this place" }, { status: 422 });
    }

    latitude = loc.latitude;
    longitude = loc.longitude;
  } catch {
    return NextResponse.json({ success: false, error: "Place lookup failed" }, { status: 502 });
  }

  // 2. Timezone API → IANA timezone id
  let timezone = "UTC";
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const tzRes = await fetch(
      `https://maps.googleapis.com/maps/api/timezone/json?location=${latitude},${longitude}&timestamp=${timestamp}&key=${apiKey}`,
      { cache: "no-store" },
    );
    const tzData = (await tzRes.json()) as TimezoneApiResponse;
    if (tzData.status === "OK" && tzData.timeZoneId) {
      timezone = tzData.timeZoneId;
    }
  } catch {
    // Non-fatal — fall back to UTC offset later if needed
  }

  return NextResponse.json({ success: true, latitude, longitude, timezone });
}
