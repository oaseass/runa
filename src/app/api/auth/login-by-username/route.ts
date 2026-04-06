import { NextResponse } from "next/server";
import { verifyAccountDraftPassword } from "@/lib/server/account-draft-store";
import { setAuthCookie } from "@/lib/server/auth-session";

type LoginByUsernameRequest = {
  username?: string;
  password?: string;
};

const USERNAME_REGEX = /^[a-z0-9._\u3131-\u314e\u314f-\u3163\uac00-\ud7a3]{2,20}$/;

export async function POST(request: Request) {
  const body = (await request.json()) as LoginByUsernameRequest;
  const username = (body.username ?? "").trim();
  const password = body.password ?? "";

  if (!USERNAME_REGEX.test(username) || password.length < 8) {
    return NextResponse.json({ success: false, error: "아이디 또는 비밀번호를 확인해 주세요." }, { status: 400 });
  }

  const account = verifyAccountDraftPassword(username, password);

  if (!account) {
    return NextResponse.json({ success: false, error: "아이디 또는 비밀번호를 확인해 주세요." }, { status: 401 });
  }

  const response = NextResponse.json(
    {
      success: true,
      account,
    },
    { status: 200 },
  );

  setAuthCookie(response, {
    userId: account.id,
    username: account.username,
    phoneNumber: account.phoneNumber,
    loginMethod: "username",
  });

  return response;
}
