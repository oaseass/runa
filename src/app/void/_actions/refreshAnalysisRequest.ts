"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { verifySessionToken } from "@/lib/server/auth-session";
import { getVoidAnalysisRequest, updateVoidAnalysisRequest } from "@/lib/server/void-store";
import { generateVoidAnalysis } from "@/lib/server/void-analysis";

/**
 * Server Action: refreshAnalysisRequest
 *
 * Re-runs generateVoidAnalysis for an existing record that is stale (e.g. missing
 * decision.headline because it was created before the decision engine was added).
 *
 * Call via form action using .bind(null, requestId) so that requestId is the first
 * argument and Next.js passes formData as the second (discarded) argument.
 *
 * Validates ownership — only the original requester can refresh.
 */
export async function refreshAnalysisAction(requestId: string): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get("luna_auth")?.value;
  if (!token) return;

  const claims = verifySessionToken(token);
  if (!claims) return;

  const request = getVoidAnalysisRequest(requestId, claims.userId);
  if (!request) return;

  try {
    const output = generateVoidAnalysis(claims.userId, request.category, request.questionText);
    if (output) {
      updateVoidAnalysisRequest(requestId, {
        status: "complete",
        analysisJson: JSON.stringify(output),
      });
      revalidatePath(`/void/result/${requestId}`);
    }
  } catch {
    // Silently fail — user can retry by reloading
  }
}
