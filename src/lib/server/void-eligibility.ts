import { cookies } from "next/headers";
import { verifySessionToken } from "./auth-session";
import { getBirthProfileStatus, getOrComputeNatalChart } from "./chart-store";

export type VoidEligibility =
  | { status: "unauthenticated" }
  | {
      status: "incomplete-birth-data";
      userId: string;
      username: string;
      /** Describes the first missing field so the layout can redirect precisely */
      missingField: "date" | "time" | "place" | "coordinates" | "timezone";
    }
  | { status: "chart-pending"; userId: string; username: string }
  | { status: "chart-ready"; userId: string; username: string; chartHash: string };

/**
 * Checks whether the current user is eligible to proceed through the void
 * paid-analysis product flow.
 *
 * Requires:
 *  1. Valid luna_auth session cookie
 *  2. Complete birth data (date + time + coordinates + timezone)
 *  3. Computable natal chart (triggers lazy computation if data is ready)
 *
 * On incomplete birth data, reports the first missing field so callers can
 * redirect to the most specific correction step.
 */
export async function getVoidEligibility(): Promise<VoidEligibility> {
  const cookieStore = await cookies();
  const token = cookieStore.get("luna_auth")?.value;
  if (!token) return { status: "unauthenticated" };

  const claims = verifySessionToken(token);
  if (!claims) return { status: "unauthenticated" };

  const { userId, username } = claims;

  const s = getBirthProfileStatus(userId);
  if (!s.isComplete) {
    // Report the first missing field for precise redirect
    const missingField: VoidEligibility & { status: "incomplete-birth-data" } = {
      status: "incomplete-birth-data",
      userId,
      username,
      missingField:
        !s.hasDate ? "date" :
        !s.hasTime ? "time" :
        !s.hasCoordinates ? "coordinates" :
        !s.hasTimezone ? "timezone" : "place",
    };
    return missingField;
  }

  // Birth data complete — attempt to retrieve (or lazily compute) the natal chart
  const chart = getOrComputeNatalChart(userId);
  if (!chart) {
    return { status: "chart-pending", userId, username };
  }

  return {
    status: "chart-ready",
    userId,
    username,
    chartHash: chart.chartHash ?? "",
  };
}
