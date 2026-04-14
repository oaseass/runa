"use client";

/**
 * ResultPaywall
 * ─────────────────────────────────────────────────────────────────────────────
 * Mid-results paywall — shown inline between partial report sections.
 *
 * Strategy: VIP first (highest value), then targeted one-time purchase.
 * Context determines which one-time report to upsell.
 */

import { SKUS, formatAmount, LEGAL_LINKS, VIP_MONTHLY, VIP_YEARLY, ANNUAL_REPORT, AREA_READING } from "@/lib/products";

export type ResultPaywallContext = "annual" | "area" | "generic";

export type ResultPaywallProps = {
  context?: ResultPaywallContext;
  /** User is already VIP — only show one-time report upsell */
  isVip?: boolean;
};

const CONTEXT_COPY: Record<ResultPaywallContext, { title: string; body: string; cta: string; productId: string }> = {
  annual: {
    title:    "나머지 흐름이 잠겨 있어요",
    body:     "올해 주요 변곡점과 월별 에너지 전체를 보려면 연간 리포트가 필요해요.",
    cta:      `연간 리포트 ${formatAmount(SKUS[ANNUAL_REPORT].amount)}`,
    productId: ANNUAL_REPORT,
  },
  area: {
    title:    "심층 분석은 영역 보고서에서",
    body:     "연애·직업·재물 중 하나를 행성 위치와 각도까지 파고드는 리포트예요.",
    cta:      `영역 보고서 ${formatAmount(SKUS[AREA_READING].amount)}`,
    productId: AREA_READING,
  },
  generic: {
    title:    "더 깊은 리딩을 원하세요?",
    body:     "VIP로 깊이 보기와 매달 지급되는 VOID 30회 크레딧을 이용해 보세요.",
    cta:      `VIP 시작 ${formatAmount(SKUS[VIP_MONTHLY].amount)}/월`,
    productId: VIP_MONTHLY,
  },
};

export default function ResultPaywall({ context = "generic", isVip = false }: ResultPaywallProps) {
  const copy = CONTEXT_COPY[context];

  if (isVip && context === "generic") return null;

  return (
    <div style={containerStyle}>
      {/* Blur gate visual */}
      <div style={blurGateStyle} aria-hidden="true">
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{ height: "1rem", background: "rgba(255,255,255,0.05)", borderRadius: 4, marginBottom: "0.45rem", width: `${85 - i * 10}%` }} />
        ))}
      </div>

      {/* Lock card */}
      <div style={lockCardStyle}>
        <div style={{ fontSize: "1.5rem", marginBottom: "0.6rem", textAlign: "center" }}>◈</div>
        <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem", fontWeight: 700, color: "#f1f5f9", textAlign: "center" }}>
          {copy.title}
        </h3>
        <p style={{ margin: "0 0 1.1rem", fontSize: "0.78rem", color: "#6b7280", textAlign: "center", lineHeight: 1.55 }}>
          {copy.body}
        </p>

        {/* Report CTA (if not VIP and not generic) */}
        {!isVip && context !== "generic" && (
          <a
            href={`/store/checkout?product=${copy.productId}`}
            style={primaryBtnLinkStyle}
          >
            {copy.cta}
          </a>
        )}

        {/* VIP CTA */}
        {!isVip && (
          <div style={{ marginTop: context !== "generic" ? "0.6rem" : 0 }}>
            {context !== "generic" && (
              <p style={{ textAlign: "center", fontSize: "0.68rem", color: "#4b5563", margin: "0 0 0.5rem" }}>또는</p>
            )}
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <a href={`/store/checkout?product=${VIP_MONTHLY}`} style={vipBtnStyle("secondary")}>
                월간 {formatAmount(SKUS[VIP_MONTHLY].amount)}
              </a>
              <a href={`/store/checkout?product=${VIP_YEARLY}`} style={vipBtnStyle("primary")}>
                연간 {formatAmount(SKUS[VIP_YEARLY].amount)} <span style={{ fontSize: "0.62rem", opacity: 0.7 }}>34% 절약</span>
              </a>
            </div>
            <p style={{ textAlign: "center", fontSize: "0.62rem", color: "#374151", marginTop: "0.4rem" }}>
              VIP · 자동 갱신 · 언제든 해지 가능
            </p>
          </div>
        )}

        {/* VIP one-time report CTA */}
        {isVip && context !== "generic" && (
          <a href={`/store/checkout?product=${copy.productId}`} style={primaryBtnLinkStyle}>
            {copy.cta}
          </a>
        )}

        {/* Legal */}
        <div style={{ marginTop: "0.8rem", display: "flex", justifyContent: "center", gap: "0.75rem" }}>
          <a href={LEGAL_LINKS.privacyPolicy}  style={legalLinkStyle}>개인정보처리방침</a>
          <a href={LEGAL_LINKS.termsOfService} style={legalLinkStyle}>이용약관</a>
          <a href={LEGAL_LINKS.subscriptionInfo} style={legalLinkStyle}>구독 안내</a>
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  position: "relative",
  overflow: "hidden",
  borderRadius: 14,
  margin: "1.5rem 0",
};

const blurGateStyle: React.CSSProperties = {
  padding: "1rem",
  filter: "blur(3px)",
  pointerEvents: "none",
  userSelect: "none",
  opacity: 0.4,
};

const lockCardStyle: React.CSSProperties = {
  background: "rgba(10,10,20,0.92)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(124,58,237,0.25)",
  borderRadius: 14,
  padding: "1.5rem 1.25rem",
  marginTop: "-0.5rem",
};

const primaryBtnLinkStyle: React.CSSProperties = {
  display: "block",
  textAlign: "center",
  padding: "0.8rem",
  background: "#7c3aed",
  borderRadius: 10,
  color: "#fff",
  textDecoration: "none",
  fontSize: "0.88rem",
  fontWeight: 700,
};

function vipBtnStyle(variant: "primary" | "secondary"): React.CSSProperties {
  return {
    flex: 1,
    display: "block",
    textAlign: "center",
    padding: "0.65rem 0.5rem",
    background: variant === "primary" ? "rgba(124,58,237,0.2)" : "rgba(255,255,255,0.04)",
    border: variant === "primary" ? "1px solid rgba(124,58,237,0.4)" : "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10,
    color: variant === "primary" ? "#c4b5fd" : "#6b7280",
    textDecoration: "none",
    fontSize: "0.78rem",
    fontWeight: 600,
  };
}

const legalLinkStyle: React.CSSProperties = {
  fontSize: "0.62rem",
  color: "#374151",
  textDecoration: "underline",
  cursor: "pointer",
};
