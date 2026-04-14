import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/server/auth-session";
import BottomNav from "@/components/BottomNav";
import BackButton from "@/components/BackButton";
import { getLatestPaidOrderByProduct, type ProductId } from "@/lib/server/order-store";
import { getUnifiedPurchaseStateSafe } from "@/lib/server/purchase-state";
import {
  TEMP_PURCHASE_COOKIE_NAME,
  getEffectivePurchaseState,
  readTemporaryPurchaseState,
} from "@/lib/server/temporary-purchase";
import { devPurchaseAction } from "./_actions/devPurchaseAction";

// ── Zodiac sign list ───────────────────────────────────────────────────────────

const SIGNS = [
  { glyph: "♈", name: "양자리",    slug: "aries" },
  { glyph: "♉", name: "황소자리",  slug: "taurus" },
  { glyph: "♊", name: "쌍둥이자리", slug: "gemini" },
  { glyph: "♋", name: "게자리",    slug: "cancer" },
  { glyph: "♌", name: "사자자리",  slug: "leo" },
  { glyph: "♍", name: "처녀자리",  slug: "virgo" },
  { glyph: "♎", name: "천칭자리",  slug: "libra" },
  { glyph: "♏", name: "전갈자리",  slug: "scorpio" },
  { glyph: "♐", name: "사수자리",  slug: "sagittarius" },
  { glyph: "♑", name: "염소자리",  slug: "capricorn" },
  { glyph: "♒", name: "물병자리",  slug: "aquarius" },
  { glyph: "♓", name: "물고기자리", slug: "pisces" },
] as const;

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function StorePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const claims = verifySessionToken(token);
  const purchaseState = claims
    ? getEffectivePurchaseState(
        getUnifiedPurchaseStateSafe(claims.userId),
        readTemporaryPurchaseState(cookieStore.get(TEMP_PURCHASE_COOKIE_NAME)?.value),
      )
    : null;
  const isDevSkip = process.env.SKIP_PAYMENT === "true" || process.env.NEXT_PUBLIC_SKIP_PAYMENT === "true";

  function resultHref(productIds: ProductId[], fallbackHref: string): string {
    if (!claims) return "/store";
    try {
      for (const productId of productIds) {
        const order = getLatestPaidOrderByProduct(claims.userId, productId);
        if (order) {
          return `/store/report/${order.id}`;
        }
      }
    } catch (error) {
      console.error("[store] resultHref fallback", error);
    }

    return fallbackHref;
  }

  const yearlyPaid = purchaseState?.annualReportOwned ?? false;
  const areaPaid = purchaseState?.areaReportOwned ?? false;
  const membershipPaid = purchaseState?.isVip ?? false;
  const hasVoidCredits = (purchaseState?.voidCredits ?? 0) > 0;
  const voidEntryHref = isDevSkip || hasVoidCredits ? "/void" : "/void?paywall=1";

  return (
    <main className="screen luna-article-screen" aria-label="Shop">
      <article className="luna-article-wrap">
        <BackButton />

        <header className="cs-shop-header">
          <p className="cs-shop-eyebrow">스토어</p>
          <h1 className="cs-shop-title">더 깊이<br />읽는 루나</h1>
          <p className="cs-shop-sub">
            별 지도의 층위를 하나씩 열어갑니다.
          </p>
        </header>

        {/* ── 심층 분석 ─────────────────────────────────────────────────────── */}
        <section className="lsh-section" aria-label="심층 분석">
          <p className="lsh-section-label">심층 분석</p>
          <div className="lsh-list">

            {/* 루나 멤버십 */}
            {membershipPaid ? (
              <div className="lsh-row lsh-row--static">
                <Image src="/luna/assets/costar/cutouts/animated_cutout_07.webp" alt="" width={56} height={56} className="lsh-row-img" unoptimized />
                <div className="lsh-row-body">
                  <p className="lsh-row-title">루나 멤버십</p>
                  <p className="lsh-row-desc">매일의 심층 해석</p>
                </div>
                <span className="lsh-row-badge lsh-row-badge--paid">구독 중</span>
              </div>
            ) : isDevSkip ? (
              <form action={devPurchaseAction} style={{ display: "contents" }}>
                <input type="hidden" name="productId" value="membership" />
                <button type="submit" className="lsh-row">
                  <Image src="/luna/assets/costar/cutouts/animated_cutout_07.webp" alt="" width={56} height={56} className="lsh-row-img" unoptimized />
                  <div className="lsh-row-body">
                    <p className="lsh-row-title">루나 멤버십</p>
                    <p className="lsh-row-desc">매일의 심층 해석</p>
                  </div>
                  <span className="lsh-row-arrow">→</span>
                </button>
              </form>
            ) : (
              <Link href="/store/checkout?product=membership" className="lsh-row">
                <Image src="/luna/assets/costar/cutouts/animated_cutout_07.webp" alt="" width={56} height={56} className="lsh-row-img" unoptimized />
                <div className="lsh-row-body">
                  <p className="lsh-row-title">루나 멤버십</p>
                  <p className="lsh-row-desc">매일의 심층 해석</p>
                </div>
                <span className="lsh-row-arrow">→</span>
              </Link>
            )}

            {/* 별에게 묻다 */}
            <Link href={voidEntryHref} className="lsh-row">
              <Image src="/luna/assets/costar/cutouts/animated_cutout_05.webp" alt="" width={56} height={56} className="lsh-row-img" unoptimized />
              <div className="lsh-row-body">
                <p className="lsh-row-title">별에게 묻다</p>
                <p className="lsh-row-desc">개인 별 지도 기반 질문 답변</p>
              </div>
              <span className="lsh-row-arrow">→</span>
            </Link>

            {/* 관계 리포트 */}
            <Link href="/connections" className="lsh-row">
              <Image src="/luna/assets/costar/cutouts/animated_cutout_03.webp" alt="" width={56} height={56} className="lsh-row-img" unoptimized />
              <div className="lsh-row-body">
                <p className="lsh-row-title">관계 리포트</p>
                <p className="lsh-row-desc">두 사람 사이에 반복되는 패턴 분석</p>
              </div>
              <span className="lsh-row-arrow">→</span>
            </Link>

            {/* 연간 리포트 */}
            {yearlyPaid ? (
              <Link href={resultHref(["annual_report", "yearly"], "/store/report/yearly")} className="lsh-row">
                <Image src="/luna/assets/costar/cutouts/animated_cutout_10.webp" alt="" width={56} height={56} className="lsh-row-img" unoptimized />
                <div className="lsh-row-body">
                  <p className="lsh-row-title">연간 리포트</p>
                  <p className="lsh-row-desc">올해 12개월의 큰 흐름</p>
                </div>
                <span className="lsh-row-badge lsh-row-badge--paid">구매완료</span>
              </Link>
            ) : isDevSkip ? (
              <form action={devPurchaseAction} style={{ display: "contents" }}>
                <input type="hidden" name="productId" value="yearly" />
                <button type="submit" className="lsh-row">
                  <Image src="/luna/assets/costar/cutouts/animated_cutout_10.webp" alt="" width={56} height={56} className="lsh-row-img" unoptimized />
                  <div className="lsh-row-body">
                    <p className="lsh-row-title">연간 리포트</p>
                    <p className="lsh-row-desc">올해 12개월의 큰 흐름</p>
                  </div>
                  <span className="lsh-row-arrow">→</span>
                </button>
              </form>
            ) : (
              <Link href="/store/checkout?product=yearly" className="lsh-row">
                <Image src="/luna/assets/costar/cutouts/animated_cutout_10.webp" alt="" width={56} height={56} className="lsh-row-img" unoptimized />
                <div className="lsh-row-body">
                  <p className="lsh-row-title">연간 리포트</p>
                  <p className="lsh-row-desc">올해 12개월의 큰 흐름</p>
                </div>
                <span className="lsh-row-arrow">→</span>
              </Link>
            )}

            {/* 별 지도 해석 (area report) */}
            {areaPaid ? (
              <Link href={resultHref(["area_reading", "area"], "/store/report/area")} className="lsh-row">
                <Image src="/luna/assets/costar/cutouts/animated_cutout_08.webp" alt="" width={56} height={56} className="lsh-row-img" unoptimized />
                <div className="lsh-row-body">
                  <p className="lsh-row-title">별 지도 해석</p>
                  <p className="lsh-row-desc">나의 별 지도가 말하는 것</p>
                </div>
                <span className="lsh-row-badge lsh-row-badge--paid">구매완료</span>
              </Link>
            ) : isDevSkip ? (
              <form action={devPurchaseAction} style={{ display: "contents" }}>
                <input type="hidden" name="productId" value="area" />
                <button type="submit" className="lsh-row">
                  <Image src="/luna/assets/costar/cutouts/animated_cutout_08.webp" alt="" width={56} height={56} className="lsh-row-img" unoptimized />
                  <div className="lsh-row-body">
                    <p className="lsh-row-title">별 지도 해석</p>
                    <p className="lsh-row-desc">나의 별 지도가 말하는 것</p>
                  </div>
                  <span className="lsh-row-arrow">→</span>
                </button>
              </form>
            ) : (
              <Link href="/store/checkout?product=area" className="lsh-row">
                <Image src="/luna/assets/costar/cutouts/animated_cutout_08.webp" alt="" width={56} height={56} className="lsh-row-img" unoptimized />
                <div className="lsh-row-body">
                  <p className="lsh-row-title">별 지도 해석</p>
                  <p className="lsh-row-desc">나의 별 지도가 말하는 것</p>
                </div>
                <span className="lsh-row-arrow">→</span>
              </Link>
            )}

          </div>
        </section>

        {/* ── 무료로 보기 ───────────────────────────────────────────────────── */}
        <section className="lsh-section" aria-label="무료 콘텐츠">
          <p className="lsh-section-label">무료로 보기</p>
          <div className="lsh-list">
            <Link href="/guide/today-keyword" className="lsh-free-row">
              <span className="lsh-free-icon">✦</span>
              <div className="lsh-row-body">
                <p className="lsh-row-title" style={{ fontSize: "0.82rem" }}>오늘의 키워드</p>
                <p className="lsh-row-desc">오늘 별이 말하는 한 마디</p>
              </div>
              <span className="lsh-row-arrow">→</span>
            </Link>
            <Link href="/guide/areas" className="lsh-free-row">
              <span className="lsh-free-icon">◌</span>
              <div className="lsh-row-body">
                <p className="lsh-row-title" style={{ fontSize: "0.82rem" }}>영역 안내</p>
                <p className="lsh-row-desc">12영역이 뭔지 설명</p>
              </div>
              <span className="lsh-row-arrow">→</span>
            </Link>
            <Link href="/guide/flow" className="lsh-free-row">
              <span className="lsh-free-icon">◎</span>
              <div className="lsh-row-body">
                <p className="lsh-row-title" style={{ fontSize: "0.82rem" }}>행성 가이드</p>
                <p className="lsh-row-desc">행성의 움직임이란?</p>
              </div>
              <span className="lsh-row-arrow">→</span>
            </Link>
          </div>
        </section>

        {/* ── 별자리 알아보기 ───────────────────────────────────────────────── */}
        <section className="lsh-section" aria-label="별자리">
          <p className="lsh-section-label">별자리 알아보기</p>
          <div className="cs-shop-sign-grid">
            {SIGNS.map(s => (
              <Link key={s.slug} href={`/zodiac/${s.slug}`} className="cs-shop-sign-item">
                <span className="cs-shop-sign-glyph">{s.glyph}</span>
                <span className="cs-shop-sign-name">{s.name}</span>
              </Link>
            ))}
          </div>
        </section>

        <BottomNav />
      </article>
    </main>
  );
}
