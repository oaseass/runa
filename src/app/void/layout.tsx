import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getVoidEligibility } from "@/lib/server/void-eligibility";
import {
  TEMP_PURCHASE_COOKIE_NAME,
  getEffectivePurchaseState,
  readTemporaryPurchaseState,
} from "@/lib/server/temporary-purchase";
import { VoidEligibilityProvider } from "./_context/VoidEligibilityContext";

/** Redirect destination for each missing birth field */
const MISSING_FIELD_REDIRECT: Record<string, string> = {
  date: "/birth-time?edit=1",
  time: "/birth-time?edit=1",
  coordinates: "/birth-place?edit=1",
  timezone: "/birth-place?edit=1",
  place: "/birth-place?edit=1",
};

/**
 * Guard layout for all /void/** routes.
 *
 * Gate A: unauthenticated          → /account-access
 * Gate B: incomplete birth data    → most-specific birth edit route
 * Gate C: chart-pending            → /profile/chart (trigger chart generation UI)
 * Gate PASS: chart-ready           → render with VoidEligibilityProvider ctx
 */
export default async function VoidLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const eligibility = await getVoidEligibility();

  if (eligibility.status === "unauthenticated") {
    redirect("/account-access");
  }

  if (eligibility.status === "incomplete-birth-data") {
    const dest = MISSING_FIELD_REDIRECT[eligibility.missingField] ?? "/birth-time?edit=1";
    redirect(dest);
  }

  if (eligibility.status === "chart-pending") {
    // Birth data is present but chart computation failed.
    // Send user to chart page so they can trigger recomputation.
    redirect("/profile/chart?from=void");
  }

  // eligibility.status === "chart-ready"
  const skipPayment = process.env.SKIP_PAYMENT === "true" || process.env.NEXT_PUBLIC_SKIP_PAYMENT === "true";
  const cookieStore = await cookies();
  const temporaryPurchaseState = readTemporaryPurchaseState(
    cookieStore.get(TEMP_PURCHASE_COOKIE_NAME)?.value,
  );
  let purchaseState = null;

  if (!skipPayment) {
    try {
      const { getUnifiedPurchaseStateSafe } = await import("@/lib/server/purchase-state");
      purchaseState = getEffectivePurchaseState(
        getUnifiedPurchaseStateSafe(eligibility.userId),
        temporaryPurchaseState,
      );
    } catch (error) {
      console.error("[void/layout] purchase-state import fallback", error);
      purchaseState = getEffectivePurchaseState(null, temporaryPurchaseState);
    }
  }

  const isVip = skipPayment || Boolean(purchaseState?.isVip);
  const voidCredits = skipPayment ? 0 : (purchaseState?.voidCredits ?? 0);
  const isAdminVip = Boolean(purchaseState?.isVip && purchaseState?.vipSource === "admin");
  const canSend = skipPayment || isAdminVip || voidCredits > 0;

  const ctxValue = {
    userId: eligibility.userId,
    username: eligibility.username,
    chartAvailable: true,
    chartHash: eligibility.chartHash,
    isVip,
    voidCredits,
    canSend,
  };

  return (
    <VoidEligibilityProvider value={ctxValue}>
      {children}
    </VoidEligibilityProvider>
  );
}
