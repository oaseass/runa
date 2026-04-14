import { NextRequest, NextResponse } from "next/server";
import { insertPageView, insertAnalyticsEvent } from "@/lib/server/analytics-data";
import { cookies } from "next/headers";
import { verifySessionToken, AUTH_COOKIE_NAME } from "@/lib/server/auth-session";

const MAX_PATH_LEN = 200;
const MAX_EVT_LEN  = 60;

function isReadonlySqliteError(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "SQLITE_READONLY"
  );
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null)
    return NextResponse.json({ error: "bad body" }, { status: 400 });

  const b = body as Record<string, unknown>;
  const sessionId = typeof b.sessionId === "string" ? b.sessionId.slice(0, 64) : null;
  if (!sessionId) return NextResponse.json({ error: "missing sessionId" }, { status: 400 });

  /* resolve authenticated user */
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const claim = token ? verifySessionToken(token) : null;
  const userId = claim?.userId ?? null;

  const type = b.type;

  if (type === "pageview") {
    const path = typeof b.path === "string" ? b.path.slice(0, MAX_PATH_LEN) : null;
    const referrer = typeof b.referrer === "string" ? b.referrer.slice(0, MAX_PATH_LEN) : null;
    const duration = typeof b.durationMs === "number" ? Math.max(0, Math.floor(b.durationMs)) : null;
    if (!path) return NextResponse.json({ error: "missing path" }, { status: 400 });
    try {
      insertPageView(sessionId, path, userId, referrer, duration);
    } catch (error) {
      if (!isReadonlySqliteError(error)) {
        return NextResponse.json({ error: "track_failed" }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (type === "event") {
    const event = typeof b.event === "string" ? b.event.slice(0, MAX_EVT_LEN) : null;
    const path  = typeof b.path  === "string" ? b.path.slice(0, MAX_PATH_LEN) : null;
    const props = typeof b.properties === "object" && b.properties !== null
      ? b.properties as Record<string, unknown>
      : null;
    if (!event) return NextResponse.json({ error: "missing event" }, { status: 400 });
    try {
      insertAnalyticsEvent(sessionId, event, userId, path, props);
    } catch (error) {
      if (!isReadonlySqliteError(error)) {
        return NextResponse.json({ error: "track_failed" }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown type" }, { status: 400 });
}