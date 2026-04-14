import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/server/auth-session";
import { getUnifiedPurchaseStateSafe } from "@/lib/server/purchase-state";
import { SKUS, formatAmount, VIP_MONTHLY, VIP_YEARLY, ANNUAL_REPORT, AREA_READING } from "@/lib/products";
import {
  TEMP_PURCHASE_COOKIE_NAME,
  getEffectivePurchaseState,
  readTemporaryPurchaseState,
} from "@/lib/server/temporary-purchase";

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ShopPage() {
  const cookieStore = await cookies();
  const token   = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const claims  = token ? verifySessionToken(token) : null;
  const userId  = claims?.userId ?? null;
  const temporaryPurchaseState = readTemporaryPurchaseState(
    cookieStore.get(TEMP_PURCHASE_COOKIE_NAME)?.value,
  );

  const purchaseState = userId
    ? getEffectivePurchaseState(getUnifiedPurchaseStateSafe(userId), temporaryPurchaseState)
    : null;
  const isVip         = purchaseState?.isVip ?? false;
  const annualOwned   = purchaseState?.annualReportOwned ?? false;
  const areaOwned     = purchaseState?.areaReportOwned ?? false;
  const voidCredits   = purchaseState?.voidCredits ?? 0;

  return (
    <main className="lsp-screen">
      <div className="lsp-wrap">

        {/* ── Centered hero ── */}
        <header className="lsp-hero">
          <p className="lsp-hero-kicker">스토어</p>
          <h1 className="lsp-hero-headline">스토어</h1>
          <p className="lsp-hero-copy">
            별 지도만으로는 다 담기지 않는 당신을 읽는<br />루나의 심층 해석과 가이드.
          </p>
        </header>

        {/* ── VIP Subscription Block ── */}
        <section style={{ marginBottom: "2rem" }} aria-label="VIP 구독">
          <div className="lsp-section-header">
            <p className="lsp-section-kicker">구독</p>
            <h2 className="lsp-section-title">LUNA VIP</h2>
          </div>

          {isVip ? (
            <div style={{ padding: "1rem", background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <p style={{ margin: 0, fontSize: "0.82rem", color: "#c4b5fd", fontWeight: 600 }}>✦ VIP 구독 중</p>
                <p style={{ margin: "0.2rem 0 0", fontSize: "0.72rem", color: "#6b7280" }}>깊이 보기 이용 가능 · VOID 월 30회 크레딧</p>
              </div>
              <Link href="/settings" style={{ fontSize: "0.72rem", color: "#7c3aed", textDecoration: "none" }}>
                구독 관리 →
              </Link>
            </div>
          ) : (
            <div style={{ display: "flex", gap: "0.6rem" }}>
              <Link href={`/store/checkout?product=${VIP_MONTHLY}`} className="lsp-feature-block" style={{ flex: 1 }}>
                <div className="lsp-feature-body">
                  <span className="lsp-feature-title">{SKUS[VIP_MONTHLY].name}</span>
                  <span className="lsp-feature-desc">{SKUS[VIP_MONTHLY].description}</span>
                  <span className="lsp-feature-price">{formatAmount(SKUS[VIP_MONTHLY].amount)}/월</span>
                </div>
                <span className="lsp-feature-arrow" aria-hidden="true">›</span>
              </Link>
              <Link href={`/store/checkout?product=${VIP_YEARLY}`} className="lsp-feature-block" style={{ flex: 1, position: "relative" }}>
                <span style={{ position: "absolute", top: -8, right: 10, background: "#7c3aed", color: "#fff", fontSize: "0.58rem", fontWeight: 700, padding: "0.12rem 0.4rem", borderRadius: 99 }}>34% 절약</span>
                <div className="lsp-feature-body">
                  <span className="lsp-feature-title">{SKUS[VIP_YEARLY].name}</span>
                  <span className="lsp-feature-desc">{SKUS[VIP_YEARLY].description}</span>
                  <span className="lsp-feature-price">{formatAmount(SKUS[VIP_YEARLY].amount)}/년</span>
                </div>
                <span className="lsp-feature-arrow" aria-hidden="true">›</span>
              </Link>
            </div>
          )}
        </section>

        {/* ── One-time Reports ── */}
        <section className="lsp-premium-section" aria-label="일회성 리포트" style={{ marginBottom: "2rem" }}>
          <div className="lsp-section-header">
            <p className="lsp-section-kicker">리포트</p>
            <h2 className="lsp-section-title">심층 분석</h2>
          </div>

          <Link href={annualOwned ? "/home" : `/store/checkout?product=${ANNUAL_REPORT}`} className="lsp-feature-block">
            <div className="lsp-feature-art">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/luna/assets/home/yearly-report.gif" alt="" width={72} height={72} />
            </div>
            <div className="lsp-feature-body">
              <span className="lsp-feature-title">{SKUS[ANNUAL_REPORT].name}</span>
              <span className="lsp-feature-desc">{SKUS[ANNUAL_REPORT].description}</span>
              <span className="lsp-feature-price">
                {annualOwned ? "✓ 구매 완료" : formatAmount(SKUS[ANNUAL_REPORT].amount)}
              </span>
            </div>
            <span className="lsp-feature-arrow" aria-hidden="true">›</span>
          </Link>

          <Link href={areaOwned ? "/home" : `/store/checkout?product=${AREA_READING}`} className="lsp-feature-block">
            <div className="lsp-feature-art">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/luna/assets/home/area-reading.gif" alt="" width={72} height={72} />
            </div>
            <div className="lsp-feature-body">
              <span className="lsp-feature-title">{SKUS[AREA_READING].name}</span>
              <span className="lsp-feature-desc">{SKUS[AREA_READING].description}</span>
              <span className="lsp-feature-price">
                {areaOwned ? "✓ 구매 완료" : formatAmount(SKUS[AREA_READING].amount)}
              </span>
            </div>
            <span className="lsp-feature-arrow" aria-hidden="true">›</span>
          </Link>
        </section>

        {/* ── VOID Credits ── */}
        <section style={{ marginBottom: "2rem" }} aria-label="VOID 크레딧">
          <div className="lsp-section-header">
            <p className="lsp-section-kicker">VOID</p>
            <h2 className="lsp-section-title">질문권</h2>
          </div>

          {voidCredits > 0 && (
            <div style={{ padding: "0.65rem 0.85rem", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, marginBottom: "0.75rem", fontSize: "0.78rem", color: "#9ca3af" }}>
              잔여 크레딧: <strong style={{ color: "#a78bfa" }}>{voidCredits}회</strong>
            </div>
          )}

          <Link href="/store/checkout?product=question" className="lsp-feature-block">
            <div className="lsp-feature-body">
              <span className="lsp-feature-title">VOID 1회권</span>
              <span className="lsp-feature-desc">질문 1회 · 회당 ₩500</span>
              <span className="lsp-feature-price">{formatAmount(500)}</span>
            </div>
            <span className="lsp-feature-arrow" aria-hidden="true">›</span>
          </Link>
        </section>

        {/* ── FREE FOR YOU ── */}
        <section aria-label="무료 콘텐츠">
          <div className="lsp-section-header">
            <p className="lsp-section-kicker">무료</p>
            <h2 className="lsp-section-title">지금 무료로 볼 수 있어요</h2>
          </div>
          <div className="lsp-free-list" role="list">
            {[
              { id: "today",       title: "오늘의 별자리 리딩", desc: "오늘 도드라지는 기운을 읽어드립니다", href: "/home" },
              { id: "void",        title: "VOID — 질문 분석", desc: "지금 품고 있는 질문을 별 지도로 읽어드립니다", href: "/void" },
              { id: "connections", title: "친구와 관계",       desc: "두 사람이 만나면 어떤 패턴이 생기는지 읽어드립니다", href: "/connections" },
            ].map((item) => (
              <Link key={item.id} href={item.href} className="lsp-free-row" role="listitem">
                <div className="lsp-free-row-body">
                  <span className="lsp-free-row-title">{item.title}</span>
                  <span className="lsp-free-row-desc">{item.desc}</span>
                </div>
                <span className="lsp-free-row-arrow" aria-hidden="true">›</span>
              </Link>
            ))}
          </div>
        </section>

        {/* ── 별자리 가이드 ── */}
        <section aria-label="별자리 가이드">
          <div className="lsp-section-header">
            <p className="lsp-section-kicker">별자리</p>
            <h2 className="lsp-section-title">별자리 알아보기</h2>
          </div>
          <Link href="/shop/signs" className="lsp-signs-bridge">
            <span className="lsp-signs-bridge-label">12개 별자리 보기</span>
            <span className="lsp-signs-bridge-arrow" aria-hidden="true">›</span>
          </Link>
        </section>

      </div>
      <BottomNav />
    </main>
  );
}
