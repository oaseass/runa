import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/server/otp-rate-limit";
import { generateOtpCode, getOtpSession, upsertOtpSession } from "@/lib/server/otp-store";
import { sendOtpMessage, SolapiError } from "@/lib/server/solapi";
import { AuthStorageConfigurationError } from "@/lib/server/auth-storage";
import { isValidPhoneNumber, normalizePhoneNumber, sanitizeNationalNumber } from "@/lib/onboarding/phone";

type SendOtpRequest = {
  countryCode?: string;
  nationalNumber?: string;
};

const OTP_SEND_UNAVAILABLE = "지금은 인증 문자를 보낼 수 없어요";
const OTP_PROVIDER_REJECTED = "문자 발신 설정을 확인해 주세요";
const OTP_PROVIDER_AUTH_REJECTED = "문자 서비스 인증이 거절됐어요. SOLAPI 키 또는 사용 권한을 확인해 주세요";

function getClientKey(request: Request, phoneNumber: string) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  return `${forwardedFor}:${phoneNumber}`;
}

function getEnvNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

export async function POST(request: Request) {
  const body = (await request.json()) as SendOtpRequest;
  const countryCode = body.countryCode?.trim() ?? "";
  const nationalNumber = sanitizeNationalNumber(body.nationalNumber ?? "");

  if (!countryCode || !nationalNumber) {
    return NextResponse.json({ success: false, error: "Phone number is required" }, { status: 400 });
  }

  const fullPhoneNumber = normalizePhoneNumber(nationalNumber, countryCode);

  if (!isValidPhoneNumber(fullPhoneNumber)) {
    return NextResponse.json({ success: false, error: "Invalid phone number" }, { status: 400 });
  }

  const otpExpiresSeconds = getEnvNumber("OTP_EXPIRES_SECONDS", 300);
  const resendCooldownSeconds = getEnvNumber("OTP_RESEND_COOLDOWN_SECONDS", 60);

  const rateKey = getClientKey(request, fullPhoneNumber);
  const rate = checkRateLimit(rateKey, 5, 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: "Too many requests. Try again shortly.",
      },
      { status: 429 },
    );
  }

  const now = Date.now();
  const otpExpiresAt = now + otpExpiresSeconds * 1000;
  const resendAvailableAt = now + resendCooldownSeconds * 1000;
  const otpBypassEnabled =
    process.env.OTP_BYPASS_ENABLED === "true" ||
    process.env.NEXT_PUBLIC_OTP_BYPASS_ENABLED === "true";
  const otpCode = otpBypassEnabled ? "123456" : generateOtpCode();

  try {
    const existing = await getOtpSession(fullPhoneNumber);
    if (existing && Date.now() < existing.resendAvailableAt) {
      return NextResponse.json(
        {
          success: false,
          canProceedToVerify: true,
          countryCode: existing.countryCode,
          nationalNumber: existing.nationalNumber,
          fullPhoneNumber: existing.fullPhoneNumber,
          otpSentAt: existing.otpSentAt,
          otpExpiresAt: existing.otpExpiresAt,
          error: "Please wait before requesting a new code",
          resendAvailableAt: existing.resendAvailableAt,
        },
        { status: 429 },
      );
    }

    if (otpBypassEnabled) {
      await upsertOtpSession({
        countryCode,
        nationalNumber,
        fullPhoneNumber,
        otpCode,
        otpSentAt: now,
        otpExpiresAt,
        resendAvailableAt,
      });

      return NextResponse.json(
        {
          success: true,
          countryCode,
          nationalNumber,
          fullPhoneNumber,
          otpSentAt: now,
          otpExpiresAt,
          resendAvailableAt,
          bypass: true,
        },
        { status: 200 },
      );
    }

    const providerResult = await sendOtpMessage({
      to: fullPhoneNumber,
      otpCode,
    });

    console.info("[auth/send-otp] solapi accepted", {
      fullPhoneNumber,
      messageId: providerResult.messageId,
      groupId: providerResult.groupId,
      status: providerResult.status,
    });

    await upsertOtpSession({
      countryCode,
      nationalNumber,
      fullPhoneNumber,
      otpCode,
      otpSentAt: now,
      otpExpiresAt,
      resendAvailableAt,
    });

    return NextResponse.json(
      {
        success: true,
        countryCode,
        nationalNumber,
        fullPhoneNumber,
        otpSentAt: now,
        otpExpiresAt,
        resendAvailableAt,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof AuthStorageConfigurationError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 503 },
      );
    }

    if (error instanceof SolapiError) {
      console.error("[auth/send-otp] solapi error", {
        status: error.status,
        message: error.message,
        providerReason: error.providerReason,
        fullPhoneNumber,
      });

      const clientError =
        error.status === 400
          ? OTP_PROVIDER_REJECTED
          : error.status === 401 || error.status === 403
            ? OTP_PROVIDER_AUTH_REJECTED
            : OTP_SEND_UNAVAILABLE;

      return NextResponse.json(
        {
          success: false,
          error: clientError,
        },
        { status: error.status >= 400 && error.status < 500 ? error.status : 503 },
      );
    }

    console.error("[auth/send-otp] unexpected error", error);

    return NextResponse.json(
      {
        success: false,
        error: OTP_SEND_UNAVAILABLE,
      },
      { status: 503 },
    );
  }
}
