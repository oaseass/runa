import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/server/otp-rate-limit";
import { findAccountDraftByRecoveryInfo, updateAccountDraftPassword } from "@/lib/server/account-draft-store";
import { deleteOtpSession, verifyOtpCode } from "@/lib/server/otp-store";
import { AuthStorageConfigurationError } from "@/lib/server/auth-storage";

type ResetPasswordRequest = {
  username?: string;
  fullPhoneNumber?: string;
  otpCode?: string;
  newPassword?: string;
};

const USERNAME_REGEX = /^[a-z0-9._\u3131-\u314e\u314f-\u3163\uac00-\ud7a3]{2,20}$/;

function getClientKey(request: Request, phoneNumber: string, username: string) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  return `${forwardedFor}:${phoneNumber}:${username}`;
}

export async function POST(request: Request) {
  const body = (await request.json()) as ResetPasswordRequest;
  const username = (body.username ?? "").trim();
  const fullPhoneNumber = (body.fullPhoneNumber ?? "").trim();
  const otpCode = (body.otpCode ?? "").replace(/\D/g, "").slice(0, 6);
  const newPassword = body.newPassword ?? "";

  if (!USERNAME_REGEX.test(username) || !fullPhoneNumber.startsWith("+") || otpCode.length !== 6 || newPassword.length < 8) {
    return NextResponse.json({ success: false, error: "입력한 정보를 다시 확인해 주세요." }, { status: 400 });
  }

  const rateKey = `${getClientKey(request, fullPhoneNumber, username)}:password-reset`;
  const rate = checkRateLimit(rateKey, 8, 60_000);
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

    const account = await findAccountDraftByRecoveryInfo(username, fullPhoneNumber);

    if (!account) {
      return NextResponse.json(
        { success: false, error: "입력한 정보와 일치하는 계정을 찾지 못했어요." },
        { status: 404 },
      );
    }

    const updatedAccount = await updateAccountDraftPassword(account.id, newPassword);

    if (!updatedAccount) {
      return NextResponse.json({ success: false, error: "비밀번호를 바꾸지 못했어요." }, { status: 404 });
    }

    await deleteOtpSession(fullPhoneNumber);

    return NextResponse.json(
      {
        success: true,
        username: updatedAccount.username,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof AuthStorageConfigurationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    }

    return NextResponse.json({ success: false, error: "비밀번호를 재설정하지 못했어요." }, { status: 500 });
  }
}