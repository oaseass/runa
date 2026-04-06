"use client";

/**
 * VoidPaywall
 * ─────────────────────────────────────────────────────────────────────────────
 * VOID credit pack paywall — shown when user runs out of VOID credits.
 *
 * Shows 3-pack and 10-pack options. No single-use purchase.
 * Credits are non-expiring.
 */

import { useCallback, useState } from "react";
import { SKUS, formatAmount, LEGAL_LINKS, VOID_PACK_3, VOID_PACK_10 } from "@/lib/products";
import type { OnetimeSkuId } from "@/lib/products";

export type VoidPaywallProps = {
  remainingCredits?: number;
  onSuccess?: (creditsAdded: number) => void;
  onDismiss?: () => void;
  /** Also show VIP upsell (bigger value push) */
  showVipUpsell?: boolean;
};

export default function VoidPaywall({
  remainingCredits = 0,
  onSuccess,
  onDismiss,
  showVipUpsell = true,
}: VoidPaywallProps) {
  const [selected, setSelected] = useState<OnetimeSkuId>(VOID_PACK_10);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  void onSuccess;

  function getVoidCredits(skuId: OnetimeSkuId): number {
    const sku = SKUS[skuId] as { voidCredits?: number };
    return sku.voidCredits ?? 0;
  }

  const handleBuy = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      window.location.href = `/store/checkout?product=${selected}`;
    } finally {
      setLoading(false);
    }
  }, [selected]);

  return (
    <div style={{ padding: "1.75rem 1.25rem 2rem" }}>
      {onDismiss && (
        <button onClick={onDismiss} style={closeBtnStyle} aria-label="닫기">✕</button>
      )}

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
        <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>◈</div>
        {remainingCredits === 0 ? (
          <>
            <p style={{ fontSize: "0.72rem", color: "#f87171", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "0.4rem" }}>VOID 크레딧 소진</p>
            <h2 style={{ fontSize: "1.3rem", fontWeight: 700, color: "#f1f5f9", margin: 0 }}>
              다음 질문을 이어가려면<br />크레딧이 필요해요
            </h2>
          </>
        ) : (
          <>
            <p style={{ fontSize: "0.72rem", color: "#a78bfa", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "0.4rem" }}>VOID 질문권</p>
            <h2 style={{ fontSize: "1.3rem", fontWeight: 700, color: "#f1f5f9", margin: 0 }}>
              더 깊이 물어볼수 있어요
            </h2>
          </>
        )}
      </div>

      {/* Pack options */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem", marginBottom: "1.25rem" }}>
        {([VOID_PACK_3, VOID_PACK_10] as OnetimeSkuId[]).map((id) => {
          const sku = SKUS[id];
          const credits = getVoidCredits(id);
          const isSelected = selected === id;
          const isBetter = id === VOID_PACK_10;
          return (
            <button
              key={id}
              onClick={() => setSelected(id)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.85rem 1rem",
                borderRadius: 12,
                border: isSelected ? "1.5px solid #7c3aed" : "1px solid rgba(255,255,255,0.1)",
                background: isSelected ? "rgba(124,58,237,0.12)" : "rgba(255,255,255,0.03)",
                cursor: "pointer",
                position: "relative",
              }}
            >
              {isBetter && (
                <span style={{ position: "absolute", top: -9, right: 12, background: "#7c3aed", color: "#fff", fontSize: "0.6rem", fontWeight: 700, padding: "0.12rem 0.4rem", borderRadius: 99 }}>
                  BEST VALUE
                </span>
              )}
              <div style={{ textAlign: "left" }}>
                <p style={{ margin: 0, fontSize: "0.88rem", fontWeight: 600, color: isSelected ? "#e2e8f0" : "#9ca3af" }}>
                  VOID {credits}회권
                </p>
                <p style={{ margin: "0.15rem 0 0", fontSize: "0.7rem", color: "#4b5563" }}>
                  {sku.description}
                </p>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <p style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: isSelected ? "#f1f5f9" : "#6b7280" }}>
                  {formatAmount(sku.amount)}
                </p>
                <p style={{ margin: "0.1rem 0 0", fontSize: "0.65rem", color: "#4b5563" }}>
                  회당 {formatAmount(Math.round(sku.amount / credits))}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* VIP upsell banner */}
      {showVipUpsell && (
        <a
          href="/store/checkout?product=vip_monthly"
          style={{
            display: "block",
            padding: "0.75rem 1rem",
            background: "rgba(124,58,237,0.08)",
            border: "1px solid rgba(124,58,237,0.2)",
            borderRadius: 10,
            textDecoration: "none",
            marginBottom: "1.25rem",
          }}
        >
          <p style={{ margin: 0, fontSize: "0.76rem", color: "#a78bfa", fontWeight: 600 }}>
            ✦ VIP로 VOID 무제한 사용 — 월 ₩9,900
          </p>
          <p style={{ margin: "0.2rem 0 0", fontSize: "0.68rem", color: "#6b7280" }}>
            크레딧 없이 매달 10회 기본 제공 + 무제한 확장
          </p>
        </a>
      )}

      {error && <p style={{ color: "#f87171", fontSize: "0.76rem", textAlign: "center", marginBottom: "0.6rem" }}>{error}</p>}

      <button
        onClick={handleBuy}
        disabled={loading}
        style={{
          width: "100%",
          padding: "0.85rem",
          background: loading ? "rgba(124,58,237,0.5)" : "#7c3aed",
          border: "none",
          borderRadius: 12,
          color: "#fff",
          fontSize: "0.92rem",
          fontWeight: 700,
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "처리 중..." : `VOID ${getVoidCredits(selected)}회권 구매`}
      </button>

      <div style={{ marginTop: "0.75rem", textAlign: "center" }}>
        <p style={{ fontSize: "0.65rem", color: "#374151", margin: "0 0 0.3rem" }}>
          크레딧은 기간 제한 없이 유효해요
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: "0.75rem" }}>
          <a href={LEGAL_LINKS.privacyPolicy}  style={legalLinkStyle}>개인정보처리방침</a>
          <a href={LEGAL_LINKS.termsOfService} style={legalLinkStyle}>이용약관</a>
        </div>
      </div>
    </div>
  );
}

const closeBtnStyle: React.CSSProperties = {
  position: "absolute",
  top: "1rem",
  right: "1rem",
  background: "none",
  border: "none",
  color: "#4b5563",
  fontSize: "1.1rem",
  cursor: "pointer",
  padding: "0.25rem",
};

const legalLinkStyle: React.CSSProperties = {
  fontSize: "0.63rem",
  color: "#4b5563",
  textDecoration: "underline",
  cursor: "pointer",
};
