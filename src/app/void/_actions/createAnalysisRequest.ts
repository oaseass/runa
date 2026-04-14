"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/server/auth-session";
import { getVoidEligibility } from "@/lib/server/void-eligibility";
import type { CategoryKey } from "@/app/void/types";

const VALID_CATEGORIES: CategoryKey[] = ["self", "love", "work", "social"];

function isUnavailableSqliteError(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    ["SQLITE_READONLY", "SQLITE_CANTOPEN"].includes((error as { code?: string }).code ?? "")
  );
}

/**
 * Server Action: createAnalysisRequest
 *
 * 1. Re-validates session and chart eligibility independently of layout.
 * 2. Persists a void_analysis_requests record (status: "generating").
 * 3. Derives analysis from the real natal chart + today's transits.
 * 4. Updates the record to "complete" (or "chart_missing"/"failed") immediately.
 * 5. Redirects to the durable /void/result/[id] page.
 */
export async function createAnalysisRequestAction(formData: FormData) {
  // 1. Re-validate session
  const cookieStore = await cookies();
  const token = cookieStore.get("luna_auth")?.value;
  if (!token) redirect("/account-access");

  const claims = verifySessionToken(token);
  if (!claims) redirect("/account-access");

  const { userId } = claims;

  // 2. Re-validate eligibility
  const eligibility = await getVoidEligibility();
  if (eligibility.status === "unauthenticated") redirect("/account-access");
  if (eligibility.status === "incomplete-birth-data") redirect("/birth-time?edit=1");
  if (eligibility.status === "chart-pending") redirect("/void?gate=chart-pending");

  // 3. Validate form inputs
  const rawCat = formData.get("category") as string | null;
  const category: CategoryKey =
    rawCat && VALID_CATEGORIES.includes(rawCat as CategoryKey)
      ? (rawCat as CategoryKey)
      : "self";

  const rawQuestion = formData.get("questionText") as string | null;
  const questionText = (rawQuestion ?? "").trim();
  if (!questionText) redirect(`/void/${category}?gate=no-question`);
  if (questionText.length > 500) redirect(`/void/${category}?gate=question-too-long`);

  const questionType =
    formData.get("questionType") === "custom" ? "custom" : ("preset" as const);

  const fallbackParams = new URLSearchParams({
    cat: category,
    q: questionText,
    type: questionType,
  });

  const skipPayment =
    process.env.SKIP_PAYMENT === "true" ||
    process.env.NEXT_PUBLIC_SKIP_PAYMENT === "true";

  if (!skipPayment) {
    try {
      const [{ getUnifiedPurchaseState }, { consumeVoidCredit }] = await Promise.all([
        import("@/lib/server/purchase-state"),
        import("@/lib/server/entitlement-store"),
      ]);
      const purchaseState = getUnifiedPurchaseState(userId);
      const isAdminVip = purchaseState.isVip && purchaseState.vipSource === "admin";
      if (!isAdminVip && !consumeVoidCredit(userId)) {
        redirect(`/void/${category}?gate=no-credits`);
      }
    } catch (error) {
      console.error("[void/createAnalysisRequest] purchase-state fallback", error);
      redirect(`/void/${category}?gate=no-credits`);
    }
  }

  // 4. Persist record with status "generating"
  let record;
  try {
    const { createVoidAnalysisRequest } = await import("@/lib/server/void-store");
    record = createVoidAnalysisRequest({
      userId,
      category,
      questionText,
      questionType,
      chartHash: eligibility.chartHash || null,
      initialStatus: "generating",
    });
  } catch (error) {
    if (isUnavailableSqliteError(error)) {
      redirect(`/void/result?${fallbackParams.toString()}`);
    }
    throw error;
  }

  // 5. Derive analysis from real chart data
  let analysisJson: string | undefined;
  let finalStatus: "complete" | "chart_missing" | "failed" = "failed";

  try {
    const { generateVoidAnalysis } = await import("@/lib/server/void-analysis");
    const output = await generateVoidAnalysis(userId, category, questionText);
    if (output) {
      analysisJson = JSON.stringify(output);
      finalStatus = "complete";
    } else {
      // Chart not resolvable — should not reach here after layout guard
      finalStatus = "chart_missing";
    }
  } catch {
    finalStatus = "failed";
  }

  try {
    const { updateVoidAnalysisRequest } = await import("@/lib/server/void-store");
    updateVoidAnalysisRequest(record.id, { status: finalStatus, analysisJson });
  } catch (error) {
    if (isUnavailableSqliteError(error)) {
      redirect(`/void/result?${fallbackParams.toString()}`);
    }
    throw error;
  }

  // 6. Redirect to durable result route
  redirect(`/void/result/${record.id}`);
}
