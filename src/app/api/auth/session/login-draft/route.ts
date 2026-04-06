import { NextResponse } from "next/server";
import { getAccountDraft } from "@/lib/server/account-draft-store";
import { setAuthCookie } from "@/lib/server/auth-session";

type LoginDraftRequest = {
  draftId?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as LoginDraftRequest;
  const draftId = body.draftId?.trim() ?? "";

  if (!draftId) {
    return NextResponse.json({ success: false, error: "draftId is required" }, { status: 400 });
  }

  const account = getAccountDraft(draftId);

  if (!account) {
    return NextResponse.json({ success: false, error: "account not found" }, { status: 404 });
  }

  const response = NextResponse.json({ success: true, account }, { status: 200 });
  setAuthCookie(response, {
    userId: account.id,
    username: account.username,
    phoneNumber: account.phoneNumber,
    loginMethod: "username",
  });

  return response;
}
