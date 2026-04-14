import { NextRequest, NextResponse } from "next/server";
import androidUpdate from "@/config/android-update.json";

export async function GET(request: NextRequest) {
  if (!androidUpdate.enabled) {
    return NextResponse.json({ enabled: false }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  }

  const apkUrl = new URL(androidUpdate.apkUrl, request.nextUrl.origin).toString();

  return NextResponse.json(
    {
      ...androidUpdate,
      apkUrl,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}