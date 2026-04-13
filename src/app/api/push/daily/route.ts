import { NextResponse } from "next/server";
import { sendDailyReadingPushes } from "@/lib/server/push-service";

export const dynamic = "force-dynamic";

function isAuthorizedRequest(request: Request): boolean {
  const secrets = [process.env.CRON_SECRET?.trim()].filter((value): value is string => !!value);

  if (secrets.length === 0) {
    if (process.env.NODE_ENV !== "production") {
      return true;
    }

    const userAgent = request.headers.get("user-agent")?.trim() ?? "";
    return userAgent.startsWith("vercel-cron/");
  }

  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  return secrets.some((secret) => bearerToken === secret);
}

async function handleRequest(request: Request) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const stats = await sendDailyReadingPushes();
  return NextResponse.json(stats, { status: stats.ok ? 200 : 207 });
}

export async function GET(request: Request) {
  return handleRequest(request);
}

export async function POST(request: Request) {
  return handleRequest(request);
}