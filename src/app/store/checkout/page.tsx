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
import {
  isAnnualReportProductId,
  isAreaReportProductId,
  isVoidCreditPackProductId,
  isVipCheckoutProductId,
} from "@/lib/products";
import { getUnifiedPurchaseStateSafe } from "@/lib/server/purchase-state";
import { CheckoutPurchasePanel } from "@/components/store/CheckoutPurchasePanel";

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

  const purchaseState = getUnifiedPurchaseStateSafe(claims.userId);

  if (isVipCheckoutProductId(productId) && purchaseState?.isVip) {
    redirect("/home");
  }

  if (isAnnualReportProductId(productId) && purchaseState?.annualReportOwned) {
    redirect("/store/report/yearly");
  }

  if (isAreaReportProductId(productId) && purchaseState?.areaReportOwned) {
    redirect("/store/report/area");
  }

  // If already paid, jump straight to the result
  let alreadyPaid = null;
  try {
    alreadyPaid = getLatestPaidOrderByProduct(claims.userId, productId);
  } catch (error) {
    console.error("[store/checkout] paid-order lookup fallback", error);
  }

  if (alreadyPaid) {
    if (isVipCheckoutProductId(productId)) redirect("/home");
    if (isAnnualReportProductId(productId) || isAreaReportProductId(productId)) {
      redirect(`/store/report/${alreadyPaid.id}`);
    }
    if (isVoidCreditPackProductId(productId)) {
      redirect("/void");
    }
  }

  // Reuse an existing pending order when one is already encoded in the URL.
  const requestedOrderId = params.order;
  let initialOrderId: string | undefined;
  if (requestedOrderId) {
    try {
      const existing = getOrder(requestedOrderId);
      const isReusable =
        existing &&
        existing.userId === claims.userId &&
        existing.productId === productId &&
        existing.status === "pending";
      if (isReusable) {
        initialOrderId = requestedOrderId;
      }
    } catch (error) {
      console.error("[store/checkout] pending-order lookup fallback", error);
    }
  }

  // Dev mode: Skip payment and go directly to success
  const skipPayment = process.env.SKIP_PAYMENT === "true" || process.env.NEXT_PUBLIC_SKIP_PAYMENT === "true";
  if (skipPayment) {
    let orderId = initialOrderId;
    if (!orderId) {
      try {
        orderId = createOrder(claims.userId, productId).id;
      } catch (error) {
        console.error("[store/checkout] skip-payment order creation failed", error);
        redirect(
          "/payment/fail?code=ORDER_CREATE_FAILED&message=" +
            encodeURIComponent("주문 정보를 준비하지 못했습니다."),
        );
      }
    }

    const dummyPaymentKey = `test_${orderId}`;
    redirect(
      `/payment/success?paymentKey=${dummyPaymentKey}&orderId=${orderId}&amount=${product.amount}`,
    );
    // This will not be reached, but TypeScript needs it
    return null;
  }

  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? null;

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

        {/* Native app purchase or TossPayments widget */}
        <section className="luna-article-section">
          <CheckoutPurchasePanel
            productId={productId}
            orderId={initialOrderId}
            amount={product.amount}
            productName={product.name}
            clientKey={clientKey}
            customerKey={claims.userId}
            customerName={claims.username}
          />
        </section>
      </article>
    </main>
  );
}
