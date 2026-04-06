import Link from "next/link";
import BackButton from "@/components/BackButton";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/server/auth-session";
import {
  PRODUCTS,
  createOrder,
  getOrder,
  isValidProductId,
  getLatestPaidOrderByProduct,
} from "@/lib/server/order-store";
import { TossPaymentWidget } from "@/components/TossPaymentWidget";

export default async function StoreCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; order?: string }>;
}) {
  const params = await searchParams;

  // Validate product
  const productId = params.product;
  if (!isValidProductId(productId)) redirect("/store");

  const product = PRODUCTS[productId];

  // Auth check
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const claims = verifySessionToken(token);
  if (!claims) {
    redirect(`/account-access?next=/store/checkout?product=${productId}`);
  }

  // If already paid, jump straight to the result
  const alreadyPaid = getLatestPaidOrderByProduct(claims.userId, productId);
  if (alreadyPaid) {
    if (productId === "membership") redirect("/insight/today");
    redirect(`/store/report/${alreadyPaid.id}`);
  }

  // Reuse existing pending order for this product (prevents duplicate orders on refresh)
  const requestedOrderId = params.order;
  const orderId = (() => {
    if (requestedOrderId) {
      const existing = getOrder(requestedOrderId);
      const isReusable =
        existing &&
        existing.userId === claims.userId &&
        existing.productId === productId &&
        existing.status === "pending";
      if (isReusable) return requestedOrderId;
    }

    const fresh = createOrder(claims.userId, productId);
    redirect(`/store/checkout?product=${productId}&order=${fresh.id}`);
  })();

  // Dev mode: Skip payment and go directly to success
  const skipPayment = process.env.SKIP_PAYMENT === "true" || process.env.NEXT_PUBLIC_SKIP_PAYMENT === "true";
  if (skipPayment) {
    const dummyPaymentKey = `test_${orderId}`;
    redirect(
      `/payment/success?paymentKey=${dummyPaymentKey}&orderId=${orderId}&amount=${product.amount}`,
    );
    // This will not be reached, but TypeScript needs it
    return null;
  }

  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
  if (!clientKey || clientKey.startsWith("test_ck_placeholder")) {
    return (
      <main className="screen luna-article-screen">
        <article className="luna-article-wrap">
          <BackButton />
          <div className="luna-store-checkout-notice">
            <p className="luna-store-checkout-notice-title">결제 미연동</p>
            <p>
              <code>NEXT_PUBLIC_TOSS_CLIENT_KEY</code> 환경 변수에
              토스페이먼츠 테스트 클라이언트 키를 입력해 주세요.
            </p>
            <Link href="https://developers.tosspayments.com/" className="luna-store-checkout-notice-link" target="_blank" rel="noopener noreferrer">
              토스페이먼츠 개발자 센터 →
            </Link>
          </div>
        </article>
      </main>
    );
  }

  return (
    <main className="screen luna-article-screen">
      <article className="luna-article-wrap">
        <BackButton />

        <header style={{ marginBottom: "1.5rem" }}>
          <p className="luna-article-kicker">{product.name}</p>
          <h1 className="luna-article-headline" style={{ fontSize: "1.4rem" }}>
            결제
          </h1>
        </header>

        {/* Order summary */}
        <section className="luna-article-section">
          <div className="luna-settings-group" style={{ marginBottom: "1.5rem" }}>
            <div className="luna-settings-row">
              <span className="luna-settings-row-label">상품</span>
              <span className="luna-settings-row-value">{product.name}</span>
            </div>
            <div className="luna-settings-row">
              <span className="luna-settings-row-label">계정</span>
              <span className="luna-settings-row-value">{claims.username}</span>
            </div>
            <div className="luna-settings-row">
              <span className="luna-settings-row-label">결제 금액</span>
              <span className="luna-settings-row-value" style={{ fontWeight: 600 }}>
                ₩{product.amount.toLocaleString()}
              </span>
            </div>
          </div>
        </section>

        {/* TossPayments widget */}
        <section className="luna-article-section">
          <TossPaymentWidget
            clientKey={clientKey}
            customerKey={claims.userId}
            orderId={orderId!}
            amount={product.amount}
            orderName={product.name}
            customerName={claims.username}
          />
        </section>

        <p className="luna-settings-note" style={{ marginTop: "1rem" }}>
          결제는 토스페이먼츠가 안전하게 처리합니다. 테스트 모드에서는 실제 결제가 이루어지지 않습니다.
        </p>
      </article>
    </main>
  );
}
