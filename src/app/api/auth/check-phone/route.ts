import { NextResponse } from "next/server";
import { hasAccountDraftByPhoneNumber } from "@/lib/server/account-draft-store";
import { AuthStorageConfigurationError } from "@/lib/server/auth-storage";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const phone = (searchParams.get("phone") ?? "").trim();

  if (!phone.startsWith("+")) {
    return NextResponse.json({ exists: false }, { status: 400 });
  }

  try {
    const exists = await hasAccountDraftByPhoneNumber(phone);
    return NextResponse.json({ exists });
  } catch (error) {
    if (error instanceof AuthStorageConfigurationError) {
      return NextResponse.json({ exists: false, error: error.message }, { status: 503 });
    }

    return NextResponse.json({ exists: false, error: "전화번호 확인에 실패했어요." }, { status: 500 });
  }
}
