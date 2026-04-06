/**
 * POST /api/test/mutate-entitlement
 *
 * Dev-only: manipulates entitlement rows for E2E state-change tests.
 * Returns 404 in production.
 *
 * Body: { username: string; action: MutateAction; value?: number }
 *
 * Actions:
 *   expire_vip        – set vip_expires_at to yesterday (simulates renewal lapse)
 *   grant_vip         – set is_vip=1, vip_source=vip_monthly, +30d expiry
 *   revoke_vip        – is_vip=0, clear all vip fields (cancellation / refund)
 *   use_void_credit   – decrement void_credits by 1 (floor 0)
 *   add_void_credit   – increment void_credits by value (default 1)
 *   set_void_credits  – set void_credits to value
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";

export const dynamic = "force-dynamic";

type MutateAction =
  | "expire_vip"
  | "set_grace_period"
  | "grant_vip"
  | "revoke_vip"
  | "use_void_credit"
  | "add_void_credit"
  | "set_void_credits";

interface MutateBody {
  username: string;
  action: MutateAction;
  value?: number;
  vipSource?: "vip_monthly" | "vip_yearly";
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  let body: MutateBody;
  try {
    body = (await request.json()) as MutateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { username, action, value, vipSource = "vip_monthly" } = body;
  if (!username || !action) {
    return NextResponse.json({ error: "username and action are required" }, { status: 400 });
  }

  const userRow = db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(username) as { id: string } | undefined;

  if (!userRow) {
    return NextResponse.json({ error: `user not found: ${username}` }, { status: 404 });
  }

  const userId = userRow.id;
  const now    = new Date().toISOString();

  switch (action) {
    case "expire_vip": {
      // Simulate subscription lapse: keep is_vip=1 but set expires to yesterday
      const yesterday = new Date(Date.now() - 86_400_000).toISOString();
      db.prepare(`
        UPDATE entitlements
        SET vip_expires_at = @exp, vip_grace_until = NULL, updated_at = @now
        WHERE user_id = @userId
      `).run({ exp: yesterday, userId, now });
      break;
    }

    case "set_grace_period": {
      // Simulate grace period: expires yesterday but grace_until = +16 days
      const yesterday = new Date(Date.now() - 86_400_000).toISOString();
      const graceEnd  = new Date(Date.now() + 16 * 86_400_000).toISOString();
      db.prepare(`
        UPDATE entitlements
        SET vip_expires_at = @exp, vip_grace_until = @grace, updated_at = @now
        WHERE user_id = @userId
      `).run({ exp: yesterday, grace: graceEnd, userId, now });
      break;
    }

    case "grant_vip": {
      const expires = new Date(Date.now() + 30 * 86_400_000).toISOString();
      db.prepare(`
        INSERT INTO entitlements
          (user_id, is_vip, vip_source, vip_expires_at, annual_report_owned, area_reports_owned, void_credits, updated_at)
          VALUES (@userId, 1, @vipSource, @expires, 0, 0, 0, @now)
        ON CONFLICT (user_id) DO UPDATE SET
          is_vip         = 1,
          vip_source     = @vipSource,
          vip_expires_at = @expires,
          updated_at     = @now
      `).run({ userId, vipSource, expires, now });
      break;
    }

    case "revoke_vip": {
      db.prepare(`
        UPDATE entitlements
        SET is_vip = 0, vip_source = NULL, vip_expires_at = NULL, vip_grace_until = NULL, updated_at = @now
        WHERE user_id = @userId
      `).run({ userId, now });
      break;
    }

    case "use_void_credit": {
      db.prepare(`
        UPDATE entitlements
        SET void_credits = MAX(0, void_credits - 1), updated_at = @now
        WHERE user_id = @userId
      `).run({ userId, now });
      break;
    }

    case "add_void_credit": {
      const n = value ?? 1;
      db.prepare(`
        UPDATE entitlements
        SET void_credits = void_credits + @n, updated_at = @now
        WHERE user_id = @userId
      `).run({ n, userId, now });
      break;
    }

    case "set_void_credits": {
      const n = Math.max(0, value ?? 0);
      db.prepare(`
        UPDATE entitlements
        SET void_credits = @n, updated_at = @now
        WHERE user_id = @userId
      `).run({ n, userId, now });
      break;
    }

    default:
      return NextResponse.json({ error: `unknown action: ${String(action)}` }, { status: 400 });
  }

  const ent = db
    .prepare("SELECT * FROM entitlements WHERE user_id = ?")
    .get(userId) as Record<string, unknown> | undefined;

  return NextResponse.json({ ok: true, action, username, entitlement: ent });
}
