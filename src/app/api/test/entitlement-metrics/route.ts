/**
 * GET /api/test/entitlement-metrics
 *
 * Dev-only: returns getEntitlementStats() + getRevenueMetrics() for E2E test validation.
 * Returns 404 in production.
 */
import { NextResponse } from "next/server";
import { getEntitlementStats, getRevenueMetrics } from "@/lib/server/entitlement-store";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const metrics = await getRevenueMetrics();

  return NextResponse.json({
    stats:   getEntitlementStats(),
    metrics,
  });
}
