"use client";

/**
 * VipPaywall
 * ─────────────────────────────────────────────────────────────────────────────
 * Main subscription paywall — shown as first paywall in the user journey.
 *
 * Displays VIP Monthly / Yearly toggle with features list.
 * Handles native IAP (Capacitor) or falls back to web checkout (Toss).
 * Shows legal links, restore purchases, and subscription management CTA.
 */

import { useCallback, useState } from "react";
import { SKUS, formatAmount, LEGAL_LINKS, VIP_MONTHLY, VIP_YEARLY } from "@/lib/products";
import type { SubscriptionSkuId } from "@/lib/products";
import { restoreNativePurchases } from "@/lib/native-iap";

// ── Features list ─────────────────────────────────────────────────────────────

const VIP_FEATURES = [
  { icon: "✦", text: "깊이 보기와 프리미엄 해석 이용" },
  { icon: "✦", text: "매일 더 깊은 별자리 해석" },
  { icon: "✦", text: "VOID 월 30회 크레딧 지급" },
  { icon: "✦", text: "두 사람의 관계 분석" },
  { icon: "✦", text: "VIP 전용 리딩 · 결제 우선 해금" },
];

// ── Props ─────────────────────────────────────────────────────────────────────

export type VipPaywallProps = {
  /** Called when user successfully subscribes */
  onSuccess?: () => void;
  /** Called when user dismisses */
  onDismiss?: () => void;
  /** Show as a bottom-sheet modal style (overlay) */
  mode?: "page" | "overlay";
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function VipPaywall({ onSuccess, onDismiss, mode = "page" }: VipPaywallProps) {
  const [selected, setSelected]  = useState<SubscriptionSkuId>(VIP_YEARLY);
  const [loading,  setLoading]   = useState(false);
  const [error,    setError]     = useState<string | null>(null);
  const [notice,   setNotice]    = useState<string | null>(null);

  const handleSubscribe = useCallback(async () => {
    setError(null);
    setNotice(null);
    setLoading(true);

    try {
      window.location.href = `/store/checkout?product=${selected}`;
    } catch {
      setError("구매 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }, [selected]);

  const handleRestore = useCallback(async () => {
    setError(null);
    setNotice(null);
    setLoading(true);

    try {
      const result = await restoreNativePurchases();
      if ((result.entitlement?.isVip as boolean | undefined) || result.restoredCount > 0) {
        setNotice("구매 내역을 불러왔어요.");
        onSuccess?.();
        if (!onSuccess) {
          window.location.reload();
        }
      } else {
        setNotice("복원할 구매 내역이 없어요.");
      }
    } catch {
      setError("구매 복원 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }, [onSuccess]);

  const isOverlay = mode === "overlay";

  return (
    <div style={isOverlay ? overlayStyle : pageStyle}>
      {isOverlay && onDismiss && (
        <button onClick={onDismiss} style={closeBtnStyle} aria-label="닫기">✕</button>
      )}

      {/* Header */}
      <div style={{ textAlign: "center", paddingBottom: "1.5rem" }}>
        <p style={{ fontSize: "0.72rem", letterSpacing: "0.18em", color: "#a78bfa", textTransform: "uppercase", marginBottom: "0.5rem" }}>
          LUNA VIP
        </p>
        <h2 style={{ fontSize: "1.45rem", fontWeight: 700, color: "#f1f5f9", lineHeight: 1.25, margin: 0 }}>
          별이 보내는 신호를<br />매달 더 깊게 읽어요
        </h2>
      </div>

      {/* Plan toggle */}
      <div style={{ display: "flex", gap: "0.6rem", marginBottom: "1.25rem" }}>
        {([VIP_MONTHLY, VIP_YEARLY] as SubscriptionSkuId[]).map((id) => {
          const sku = SKUS[id];
          const isSelected = selected === id;
          const isSub = sku.type === "subscription";
          const isYearly = id === VIP_YEARLY;
          return (
            <button
              key={id}
              onClick={() => setSelected(id)}
              style={{
                flex: 1,
                padding: "0.85rem 0.75rem",
                borderRadius: 12,
                border: isSelected ? "1.5px solid #7c3aed" : "1px solid rgba(255,255,255,0.1)",
                background: isSelected ? "rgba(124,58,237,0.15)" : "rgba(255,255,255,0.03)",
                cursor: "pointer",
                textAlign: "left",
                position: "relative",
              }}
            >
              {isYearly && (
                <span style={{ position: "absolute", top: -10, right: 10, background: "#7c3aed", color: "#fff", fontSize: "0.62rem", fontWeight: 700, padding: "0.15rem 0.45rem", borderRadius: 99, letterSpacing: "0.04em" }}>
                  34% 절약
                </span>
              )}
              <p style={{ margin: 0, fontSize: "0.78rem", fontWeight: 600, color: isSelected ? "#c4b5fd" : "#6b7280" }}>
                {sku.name.replace("LUNA VIP ", "")}
              </p>
              <p style={{ margin: "0.2rem 0 0", fontSize: "1.1rem", fontWeight: 700, color: isSelected ? "#f1f5f9" : "#9ca3af" }}>
                {formatAmount(sku.amount)}
                <span style={{ fontSize: "0.72rem", fontWeight: 400, color: "#6b7280" }}>
                  {isSub && sku.type === "subscription" && (id === VIP_MONTHLY ? "/월" : "/년")}
                </span>
              </p>
              {isYearly && sku.type === "subscription" && sku.monthlyEquivalent && (
                <p style={{ margin: "0.15rem 0 0", fontSize: "0.68rem", color: "#6b7280" }}>
                  월 {formatAmount(sku.monthlyEquivalent)} 상당
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* Features */}
      <div style={{ marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "0.55rem" }}>
        {VIP_FEATURES.map((f, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span style={{ color: "#7c3aed", fontSize: "0.75rem", flexShrink: 0 }}>{f.icon}</span>
            <span style={{ fontSize: "0.82rem", color: "#9ca3af" }}>{f.text}</span>
          </div>
        ))}
      </div>

      {/* CTA */}
      {notice && (
        <p style={{ color: "#a78bfa", fontSize: "0.76rem", textAlign: "center", marginBottom: "0.75rem" }}>{notice}</p>
      )}
      {error && (
        <p style={{ color: "#f87171", fontSize: "0.76rem", textAlign: "center", marginBottom: "0.75rem" }}>{error}</p>
      )}
      <button
        onClick={handleSubscribe}
        disabled={loading}
        style={ctaBtnStyle(loading)}
      >
        {loading ? "처리 중..." : `${SKUS[selected].name} 시작하기`}
      </button>

      {/* Legal */}
      <div style={{ marginTop: "1rem", textAlign: "center" }}>
        <p style={{ fontSize: "0.68rem", color: "#4b5563", margin: "0 0 0.4rem", lineHeight: 1.5 }}>
          {selected === VIP_YEARLY
            ? `연간 ${formatAmount(SKUS[VIP_YEARLY].amount)} · 자동 갱신 · 언제든 해지 가능`
            : `월 ${formatAmount(SKUS[VIP_MONTHLY].amount)} · 자동 갱신 · 언제든 해지 가능`
          }
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: "1rem", flexWrap: "wrap" }}>
          <a href={LEGAL_LINKS.privacyPolicy}    style={legalLinkStyle}>개인정보처리방침</a>
          <a href={LEGAL_LINKS.termsOfService}   style={legalLinkStyle}>이용약관</a>
          <a href={LEGAL_LINKS.subscriptionInfo} style={legalLinkStyle}>구독 안내</a>
        </div>
        <div style={{ marginTop: "0.6rem" }}>
          <button onClick={handleRestore} style={ghostSmallStyle}>구매 내역 복원</button>
          <span style={{ color: "#374151", margin: "0 0.5rem" }}>·</span>
          <a href="/settings" style={{ ...legalLinkStyle }}>구독 관리</a>
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  maxWidth: 420,
  margin: "0 auto",
  padding: "2rem 1.25rem 3rem",
};

const overlayStyle: React.CSSProperties = {
  position: "relative",
  background: "#0a0a0f",
  borderRadius: "1.25rem 1.25rem 0 0",
  padding: "2rem 1.25rem 2.5rem",
  maxHeight: "92dvh",
  overflowY: "auto",
};

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

function ctaBtnStyle(loading: boolean): React.CSSProperties {
  return {
    width: "100%",
    padding: "0.9rem",
    background: loading ? "rgba(124,58,237,0.5)" : "#7c3aed",
    border: "none",
    borderRadius: 12,
    color: "#fff",
    fontSize: "0.95rem",
    fontWeight: 700,
    cursor: loading ? "not-allowed" : "pointer",
    letterSpacing: "-0.01em",
    transition: "opacity 0.2s",
  };
}

const legalLinkStyle: React.CSSProperties = {
  fontSize: "0.66rem",
  color: "#4b5563",
  textDecoration: "underline",
  cursor: "pointer",
};

const ghostSmallStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  fontSize: "0.66rem",
  color: "#4b5563",
  cursor: "pointer",
  textDecoration: "underline",
  padding: 0,
};
