import BackButton from "@/components/BackButton";
import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/server/auth-session";
import { getVoidEligibility } from "@/lib/server/void-eligibility";
import { createOrder } from "@/lib/server/order-store";
import { createAnalysisRequestAction } from "@/app/void/_actions/createAnalysisRequest";
import { TossPaymentWidget } from "@/components/TossPaymentWidget";

const CATEGORY_LABELS: Record<string, string> = {
  self: "나",
  love: "연애",
  work: "일",
  social: "관계",
};

export default async function VoidCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string; type?: string }>;
}) {
  const params = await searchParams;
  const question = params.q ? decodeURIComponent(params.q) : null;
  const cat = params.cat && params.cat in CATEGORY_LABELS ? params.cat : "self";
  const type = params.type === "custom" ? "custom" : "preset";

  // Re-read eligibility only for display values (layout has already enforced chart-ready)
  const eligibility = await getVoidEligibility();
  const username =
    eligibility.status !== "unauthenticated" ? eligibility.username : null;
  const chartHash =
    eligibility.status === "chart-ready" ? eligibility.chartHash : null;
  const catLabel = CATEGORY_LABELS[cat];

  if (!question) {
    return (
      <div className="void-root">
        <div className="void-canvas void-co-empty">
          <p className="void-co-empty-msg">선택된 질문이 없습니다</p>
          <BackButton className="void-co-back" />
        </div>
      </div>
    );
  }

  // Auth (layout guarantees this, but we need userId to create order)
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const claims = verifySessionToken(token);

  // Dev mode: Skip payment and go directly to analysis
  const skipPayment = process.env.SKIP_PAYMENT === "true" || process.env.NEXT_PUBLIC_SKIP_PAYMENT === "true";
  if (skipPayment && claims) {
    const formData = new FormData();
    formData.set("category", cat);
    formData.set("questionText", question);
    formData.set("questionType", type);
    await createAnalysisRequestAction(formData);
    // createAnalysisRequestAction redirects, so code below won't execute
  }

  // Check TossPayments client key
  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
  const tossReady = clientKey && !clientKey.startsWith("test_ck_placeholder");

  // Create a pending order (fresh per checkout visit; only one gets confirmed)
  let orderId: string | null = null;
  if (claims && tossReady) {
    const order = createOrder(claims.userId, "question", {
      questionText: question,
      category: cat,
      questionType: type,
      chartHash: chartHash ?? null,
    });
    orderId = order.id;
  }

  return (
    <div className="void-root">
      <div className="void-canvas">
        {/* Back navigation */}
        <div className="void-co-nav">
          <BackButton className="void-co-back" />
        </div>

        {/* Page header */}
        <p className="void-system-line" style={{ marginBottom: "0.35rem" }}>
          LUNA — {catLabel}
        </p>
        <h1 className="void-co-title">질문 해석 확인</h1>

        {/* Question card */}
        <div className="void-co-card">
          <p className="void-co-card-label">
            {type === "custom" ? "직접 입력한 질문" : "선택한 질문"}
          </p>
          <p className="void-co-card-text">{question}</p>
        </div>

        {/* Analysis request summary */}
        <div className="void-co-detail">
          <div className="void-co-detail-row">
            <span>분석 기준</span>
            <span>출생 차트 + 현재 행성 배치</span>
          </div>
          <div className="void-co-detail-row">
            <span>차트 상태</span>
            <span>
              {chartHash
                ? `준비 완료 · ${chartHash.slice(0, 8)}`
                : "준비 완료"}
            </span>
          </div>
          {username && (
            <div className="void-co-detail-row">
              <span>계정</span>
              <span>{username}</span>
            </div>
          )}
          <div className="void-co-detail-row">
            <span>결과물</span>
            <span>텍스트 보고서 1건</span>
          </div>
          <div className="void-co-detail-row void-co-detail-price">
            <span>가격</span>
            <span>₩4,900</span>
          </div>
        </div>

        {/* Payment widget or fallback notice */}
        {tossReady && orderId && claims ? (
          <div className="void-co-payment">
            <TossPaymentWidget
              clientKey={clientKey!}
              customerKey={claims.userId}
              orderId={orderId}
              amount={4_900}
              orderName="Void 질문 보고서"
              customerName={username ?? undefined}
            />
          </div>
        ) : (
          <p className="void-co-notice">
            결제 수단이 아직 연결되지 않았습니다.{" "}
            <code>NEXT_PUBLIC_TOSS_CLIENT_KEY</code> 환경 변수를 설정해 주세요.
          </p>
        )}
      </div>
    </div>
  );
}
