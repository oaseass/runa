import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/server/auth-session";
import { sendPushTestToUser } from "@/lib/server/push-service";

type TestPushBody = {
  title?: unknown;
  body?: unknown;
  deepLink?: unknown;
};

export const dynamic = "force-dynamic";

function readSession(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  return verifySessionToken(token);
}

function normalizeBody(body: TestPushBody | null | undefined) {
  return {
    title: typeof body?.title === "string" ? body.title : undefined,
    body: typeof body?.body === "string" ? body.body : undefined,
    deepLink: typeof body?.deepLink === "string" ? body.deepLink : undefined,
  };
}

async function handleRequest(request: NextRequest, body?: TestPushBody | null) {
  const session = readSession(request);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await sendPushTestToUser({
    userId: session.userId,
    ...normalizeBody(body),
  });

  return NextResponse.json(
    {
      ok: result.sent > 0 && result.failed === 0,
      ...result,
    },
    { status: result.failed === 0 ? 200 : 207 },
  );
}

export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function POST(request: NextRequest) {
  let body: TestPushBody | null = null;

  try {
    body = (await request.json()) as TestPushBody;
  } catch {
  }

  return handleRequest(request, body);
}