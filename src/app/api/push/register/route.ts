import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/server/auth-session";
import { upsertPushDevice } from "@/lib/server/push-store";

type RegisterPushBody = {
  token?: unknown;
  platform?: unknown;
  timezone?: unknown;
  locale?: unknown;
  permissionState?: unknown;
};

export async function POST(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: RegisterPushBody;
  try {
    body = (await request.json()) as RegisterPushBody;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const pushToken = typeof body.token === "string" ? body.token.trim() : "";
  const platform = typeof body.platform === "string" ? body.platform.trim() : "";
  if (!pushToken || !platform) {
    return NextResponse.json({ error: "missing_token" }, { status: 400 });
  }

  const device = upsertPushDevice({
    userId: session.userId,
    platform,
    token: pushToken,
    timezone: typeof body.timezone === "string" ? body.timezone : null,
    locale: typeof body.locale === "string" ? body.locale : null,
    permissionState: typeof body.permissionState === "string" ? body.permissionState : "granted",
  });

  return NextResponse.json({ ok: true, deviceId: device.id });
}