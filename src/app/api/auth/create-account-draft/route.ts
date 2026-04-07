import { NextResponse } from "next/server";
import { AccountStoreError, createAccountDraft } from "@/lib/server/account-draft-store";
import { AuthStorageConfigurationError } from "@/lib/server/auth-storage";

type CreateDraftRequest = {
  username?: string;
  password?: string;
  fullPhoneNumber?: string;
  verificationStatus?: string;
  birthTime?: {
    birthDate: string | null;
    hour: number;
    minute: number;
    formatted: string;
  } | null;
  birthPlace?: {
    placeId: string;
    fullText: string;
    mainText: string;
    secondaryText: string;
    latitude: number | null;
    longitude: number | null;
    timezone: string | null;
  } | null;
};

const USERNAME_REGEX = /^[a-z0-9._\u3131-\u314e\u314f-\u3163\uac00-\ud7a3]{2,20}$/;
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export async function POST(request: Request) {
  const body = (await request.json()) as CreateDraftRequest;
  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  const fullPhoneNumber = (body.fullPhoneNumber ?? "").trim();
  const verificationStatus = body.verificationStatus ?? "";

  if (!USERNAME_REGEX.test(username)) {
    return NextResponse.json({ success: false, error: "Invalid username" }, { status: 400 });
  }

  if (!PASSWORD_REGEX.test(password)) {
    return NextResponse.json({ success: false, error: "Invalid password" }, { status: 400 });
  }

  if (!fullPhoneNumber.startsWith("+")) {
    return NextResponse.json({ success: false, error: "Invalid phone number" }, { status: 400 });
  }

  if (verificationStatus !== "verified") {
    return NextResponse.json({ success: false, error: "Phone verification is required" }, { status: 400 });
  }

  try {
    const draft = await createAccountDraft({
      username,
      phoneNumber: fullPhoneNumber,
      password,
      onboardingProfile: {
        birthTime: body.birthTime ?? null,
        birthPlace: body.birthPlace ?? null,
      },
    });

    return NextResponse.json(
      {
        success: true,
        draft,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof AccountStoreError) {
      if (error.code === "USERNAME_EXISTS") {
        return NextResponse.json({ success: false, error: "이미 사용 중인 아이디예요." }, { status: 409 });
      }

      if (error.code === "PHONE_EXISTS") {
        return NextResponse.json({ success: false, error: "이미 등록된 전화번호예요." }, { status: 409 });
      }
    }

    if (error instanceof AuthStorageConfigurationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    }

    return NextResponse.json({ success: false, error: "계정 생성에 실패했어요." }, { status: 500 });
  }
}
