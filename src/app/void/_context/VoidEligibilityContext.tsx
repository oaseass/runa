"use client";

import { createContext, useContext } from "react";

export type VoidEligibilityCtx = {
  userId: string;
  username: string;
  /** true = natal chart is computed and ready; false = birth data complete but chart pending */
  chartAvailable: boolean;
  /** SHA-256 chart fingerprint; null when chartAvailable is false */
  chartHash: string | null;
  /** true = 결제 없이 바로 분석 실행 가능 (멤버십/단품 결제 완료 or SKIP_PAYMENT) */
  canSend: boolean;
};

export const VoidEligibilityContext = createContext<VoidEligibilityCtx | null>(null);

export function VoidEligibilityProvider({
  value,
  children,
}: {
  value: VoidEligibilityCtx;
  children: React.ReactNode;
}) {
  return (
    <VoidEligibilityContext.Provider value={value}>
      {children}
    </VoidEligibilityContext.Provider>
  );
}

export function useVoidEligibility(): VoidEligibilityCtx {
  const ctx = useContext(VoidEligibilityContext);
  if (!ctx) throw new Error("useVoidEligibility must be used within VoidEligibilityProvider");
  return ctx;
}
