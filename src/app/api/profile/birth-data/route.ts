import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/server/auth-session";
import { updateStoredAuthBirthData } from "@/lib/server/auth-account-store";
import { AuthStorageConfigurationError } from "@/lib/server/auth-storage";

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
  try {
    const account = await updateStoredAuthBirthData(session.userId, body);
    if (!account) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }
  } catch (error) {
    if (error instanceof AuthStorageConfigurationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    }

    return NextResponse.json({ success: false, error: "출생 데이터 저장에 실패했어요." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
