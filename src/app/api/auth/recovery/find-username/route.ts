import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/server/otp-rate-limit";
import { findAccountDraftByPhoneNumber } from "@/lib/server/account-draft-store";
import { verifyOtpCode } from "@/lib/server/otp-store";
import { AuthStorageConfigurationError } from "@/lib/server/auth-storage";

type FindUsernameRequest = {
  fullPhoneNumber?: string;
  otpCode?: string;
};

function getClientKey(request: Request, phoneNumber: string) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  return `${forwardedFor}:${phoneNumber}`;
}

export async function POST(request: Request) {
  const body = (await request.json()) as FindUsernameRequest;
  const fullPhoneNumber = (body.fullPhoneNumber ?? "").trim();
  const otpCode = (body.otpCode ?? "").replace(/\D/g, "").slice(0, 6);

  if (!fullPhoneNumber.startsWith("+") || otpCode.length !== 6) {
    return NextResponse.json({ success: false, error: "인증번호를 다시 확인해 주세요." }, { status: 400 });
  }

  const rateKey = `${getClientKey(request, fullPhoneNumber)}:find-username`;
  const rate = checkRateLimit(rateKey, 10, 60_000);
  if (!rate.allowed) {
    return NextResponse.json({ success: false, error: "잠시 후 다시 시도해 주세요." }, { status: 429 });
  }

  try {
    const result = await verifyOtpCode(fullPhoneNumber, otpCode);

    if (!result.ok) {
      if (result.reason === "expired") {
        return NextResponse.json({ success: false, error: "인증번호가 만료됐어요. 다시 받아 주세요." }, { status: 400 });
      }

      if (result.reason === "too_many_attempts") {
        return NextResponse.json({ success: false, error: "인증 시도가 너무 많아요. 새 번호를 받아 주세요." }, { status: 429 });
      }

      return NextResponse.json({ success: false, error: "인증번호를 다시 확인해 주세요." }, { status: 400 });
    }

    const account = await findAccountDraftByPhoneNumber(fullPhoneNumber);

    if (!account) {
      return NextResponse.json({ success: false, error: "등록된 계정을 찾지 못했어요." }, { status: 404 });
    }

    return NextResponse.json(
      {
        success: true,
        username: account.username,
        createdAt: account.createdAt,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof AuthStorageConfigurationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    }

    return NextResponse.json({ success: false, error: "아이디를 찾지 못했어요." }, { status: 500 });
  }
}