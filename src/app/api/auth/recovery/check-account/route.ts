import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/server/otp-rate-limit";
import { findAccountDraftByRecoveryInfo } from "@/lib/server/account-draft-store";
import { AuthStorageConfigurationError } from "@/lib/server/auth-storage";

type CheckAccountRequest = {
  username?: string;
  fullPhoneNumber?: string;
};

const USERNAME_REGEX = /^[a-z0-9._\u3131-\u314e\u314f-\u3163\uac00-\ud7a3]{2,20}$/;

function getClientKey(request: Request, phoneNumber: string, username: string) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  return `${forwardedFor}:${phoneNumber}:${username}`;
}

export async function POST(request: Request) {
  const body = (await request.json()) as CheckAccountRequest;
  const username = (body.username ?? "").trim();
  const fullPhoneNumber = (body.fullPhoneNumber ?? "").trim();

  if (!USERNAME_REGEX.test(username) || !fullPhoneNumber.startsWith("+")) {
    return NextResponse.json({ success: false, error: "입력한 정보를 다시 확인해 주세요." }, { status: 400 });
  }

  const rateKey = `${getClientKey(request, fullPhoneNumber, username)}:recovery-check`;
  const rate = checkRateLimit(rateKey, 8, 60_000);
  if (!rate.allowed) {
    return NextResponse.json({ success: false, error: "잠시 후 다시 시도해 주세요." }, { status: 429 });
  }

  try {
    const account = await findAccountDraftByRecoveryInfo(username, fullPhoneNumber);

    if (!account) {
      return NextResponse.json(
        { success: false, error: "입력한 정보와 일치하는 계정을 찾지 못했어요." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthStorageConfigurationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    }

    return NextResponse.json({ success: false, error: "계정 정보를 확인하지 못했어요." }, { status: 500 });
  }
}