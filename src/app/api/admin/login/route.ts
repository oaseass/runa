import { NextRequest, NextResponse } from "next/server";
import { verifyAdminCredentials, setAdminCookie } from "@/lib/server/admin-session";

export async function POST(req: NextRequest) {
  let username: string;
  let password: string;

  try {
    const body = (await req.json()) as { username?: unknown; password?: unknown };
    username = typeof body.username === "string" ? body.username : "";
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  if (!verifyAdminCredentials(username, password)) {
    return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  setAdminCookie(response);
  return response;
}
