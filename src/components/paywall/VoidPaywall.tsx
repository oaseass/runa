"use client";

/**
 * VoidPaywall
 * ─────────────────────────────────────────────────────────────────────────────
 * VOID credit paywall — shown when user runs out of VOID credits.
 *
 * Default offer is a single question purchase.
 * VIP users receive 30 credits per month without rollover.
 */

import { useCallback, useState } from "react";
import { SKUS, formatAmount, LEGAL_LINKS, VOID_PACK_5, VOID_SINGLE } from "@/lib/products";

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
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  void onSuccess;

  const handleBuy = useCallback(async (productId: string) => {
    setError(null);
    setLoading(true);
    try {
      window.location.href = `/store/checkout?product=${productId}`;
    } finally {
      setLoading(false);
    }
  }, []);

  const offers = [
    {
      productId: VOID_PACK_5,
      title: "VOID 5회권",
      description: "질문 5회 · 회당 ₩300",
      price: SKUS[VOID_PACK_5].amount,
      originalPrice: 2_500,
      accent: "rgba(239,68,68,0.16)",
      border: "1.5px solid rgba(248,113,113,0.6)",
      badge: "40% 할인",
      recommended: true,
    },
    {
      productId: VOID_SINGLE,
      title: "VOID 1회권",
      description: "질문 1회 · 즉시 해석",
      price: SKUS[VOID_SINGLE].amount,
      originalPrice: null,
      accent: "rgba(124,58,237,0.12)",
      border: "1.5px solid #7c3aed",
      badge: null,
      recommended: false,
    },
  ] as const;

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
              크레딧이 부족합니다.<br />충전해주세요.
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

      <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem", marginBottom: "1.25rem" }}>
        {offers.map((offer) => (
          <button
            key={offer.productId}
            type="button"
            onClick={() => handleBuy(offer.productId)}
            disabled={loading}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              padding: "0.95rem 1rem",
              borderRadius: 12,
              border: offer.border,
              background: offer.accent,
              cursor: loading ? "not-allowed" : "pointer",
              textAlign: "left",
              opacity: loading ? 0.7 : 1,
            }}
          >
            <div style={{ textAlign: "left" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                <p style={{ margin: 0, fontSize: "0.92rem", fontWeight: 700, color: "#f1f5f9" }}>
                  {offer.title}
                </p>
                {offer.badge && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      borderRadius: 999,
                      padding: "0.14rem 0.42rem",
                      fontSize: "0.62rem",
                      fontWeight: 700,
                      color: "#fecaca",
                      background: "rgba(127,29,29,0.28)",
                    }}
                  >
                    {offer.badge}
                  </span>
                )}
              </div>
              <p style={{ margin: "0.15rem 0 0", fontSize: "0.72rem", color: "#9ca3af" }}>
                {offer.description}
              </p>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              {offer.originalPrice ? (
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.68rem",
                    color: "#f87171",
                    textDecoration: "line-through",
                    textDecorationColor: "#ef4444",
                  }}
                >
                  {formatAmount(offer.originalPrice)}
                </p>
              ) : null}
              <p style={{ margin: offer.originalPrice ? "0.1rem 0 0" : 0, fontSize: "1.1rem", fontWeight: 700, color: "#f1f5f9" }}>
                {formatAmount(offer.price)}
              </p>
              <p style={{ margin: "0.1rem 0 0", fontSize: "0.65rem", color: "#6b7280" }}>
                회당 {formatAmount(Math.round(offer.price / (offer.productId === VOID_PACK_5 ? 5 : 1)))}
              </p>
            </div>
          </button>
        ))}
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
            ✦ VIP는 매달 VOID 30회 크레딧 지급
          </p>
          <p style={{ margin: "0.2rem 0 0", fontSize: "0.68rem", color: "#6b7280" }}>
            남은 크레딧은 이월되지 않고 다음 달에 30회로 새로 시작돼요
          </p>
        </a>
      )}

      {error && <p style={{ color: "#f87171", fontSize: "0.76rem", textAlign: "center", marginBottom: "0.6rem" }}>{error}</p>}

      <div style={{ marginTop: "0.75rem", textAlign: "center" }}>
        <p style={{ fontSize: "0.65rem", color: "#374151", margin: "0 0 0.3rem" }}>
          VIP 월 제공 크레딧은 매달 새로 지급되고 이월되지 않아요
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
