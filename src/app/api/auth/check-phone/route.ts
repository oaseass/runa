import { NextResponse } from "next/server";
import { hasAccountDraftByPhoneNumber } from "@/lib/server/account-draft-store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const phone = (searchParams.get("phone") ?? "").trim();

  if (!phone.startsWith("+")) {
    return NextResponse.json({ exists: false }, { status: 400 });
  }

  const exists = hasAccountDraftByPhoneNumber(phone);
  return NextResponse.json({ exists });
}
