"use client";

import { createContext, useContext } from "react";

export type VoidEligibilityCtx = {
  userId: string;
  username: string;
  /** true = natal chart is computed and ready; false = birth data complete but chart pending */
  chartAvailable: boolean;
  /** SHA-256 chart fingerprint; null when chartAvailable is false */
  chartHash: string | null;
  /** true = VIP 구독 활성 상태. 깊이 보기 등 프리미엄 접근 권한에 사용됩니다. */
  isVip: boolean;
  /** Remaining VOID question credits, including this month's VIP allocation when active. */
  voidCredits: number;
  /** true = 지금 바로 VOID 분석 실행 가능 */
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
