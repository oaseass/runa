import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/server/otp-rate-limit";
import { verifyOtpCode } from "@/lib/server/otp-store";
import { findAccountDraftByPhoneNumber } from "@/lib/server/account-draft-store";
import { setAuthCookie } from "@/lib/server/auth-session";
import { AuthStorageConfigurationError } from "@/lib/server/auth-storage";

type VerifyOtpRequest = {
  fullPhoneNumber?: string;
  otpCode?: string;
};

function getClientKey(request: Request, phoneNumber: string) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  return `${forwardedFor}:${phoneNumber}`;
}

export async function POST(request: Request) {
  const body = (await request.json()) as VerifyOtpRequest;
  const fullPhoneNumber = body.fullPhoneNumber?.trim() ?? "";
  const otpCode = (body.otpCode ?? "").replace(/\D/g, "").slice(0, 6);

  if (!fullPhoneNumber || otpCode.length !== 6) {
    return NextResponse.json(
      {
        success: false,
        verificationStatus: false,
        error: "Invalid verification payload",
      },
      { status: 400 },
    );
  }

  const rateKey = `${getClientKey(request, fullPhoneNumber)}:verify`;
  const rate = checkRateLimit(rateKey, 10, 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        success: false,
        verificationStatus: false,
        error: "Too many attempts. Try again shortly.",
      },
      { status: 429 },
    );
  }

  let result;
  try {
    result = await verifyOtpCode(fullPhoneNumber, otpCode);
  } catch (error) {
    if (error instanceof AuthStorageConfigurationError) {
      return NextResponse.json(
        {
          success: false,
          verificationStatus: false,
          error: error.message,
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        verificationStatus: false,
        error: "인증 확인 중 오류가 발생했어요.",
      },
      { status: 500 },
    );
  }

  if (!result.ok) {
    if (result.reason === "expired") {
      return NextResponse.json(
        {
          success: false,
          verificationStatus: false,
          error: "Code expired. Request a new code.",
        },
        { status: 400 },
      );
    }

    if (result.reason === "too_many_attempts") {
      return NextResponse.json(
        {
          success: false,
          verificationStatus: false,
          error: "Too many failed attempts. Request a new code.",
        },
        { status: 429 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        verificationStatus: false,
        error: "Invalid verification code",
      },
      { status: 400 },
    );
  }

  const existingAccount = await hasAccount(fullPhoneNumber);

  const response = NextResponse.json(
    {
      success: true,
      verificationStatus: true,
      accountExists: Boolean(existingAccount),
      account: existingAccount,
      error: null,
    },
    { status: 200 },
  );

  if (existingAccount) {
    setAuthCookie(response, {
      userId: existingAccount.id,
      username: existingAccount.username,
      phoneNumber: existingAccount.phoneNumber,
      loginMethod: "phone",
    });
  }

  return response;
}

async function hasAccount(fullPhoneNumber: string) {
  const account = await findAccountDraftByPhoneNumber(fullPhoneNumber);

  if (!account) {
    return null;
  }

  return {
    id: account.id,
    username: account.username,
    phoneNumber: account.phoneNumber,
    createdAt: account.createdAt,
  };
}
