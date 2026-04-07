import { NextResponse } from "next/server";
import { findAccountDraftByUsername } from "@/lib/server/account-draft-store";
import { setAuthCookie } from "@/lib/server/auth-session";
import { AuthStorageConfigurationError } from "@/lib/server/auth-storage";

function getRedirectPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/home";
  }

  return value;
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const username = url.searchParams.get("username")?.trim() ?? "";
  const redirectPath = getRedirectPath(url.searchParams.get("redirect"));

  if (!username) {
    return NextResponse.json({ error: "username required" }, { status: 400 });
  }

  let account;
  try {
    account = await findAccountDraftByUsername(username);
  } catch (error) {
    if (error instanceof AuthStorageConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  }

  if (!account) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }

  const response = NextResponse.redirect(new URL(redirectPath, url.origin));

  setAuthCookie(response, {
    userId: account.id,
    username: account.username,
    phoneNumber: account.phoneNumber,
    loginMethod: "username",
  });

  return response;
}