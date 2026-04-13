import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/server/auth-session";
import {
  getOrder,
  markOrderFailed,
  PRODUCTS,
} from "@/lib/server/order-store";
import { finalizePaidOrder, getPaidOrderRedirectPath } from "@/lib/server/order-fulfillment";

// ── TossPayments server-side confirm ─────────────────────────────────────────

type TossConfirmOk = {
  paymentKey: string;
  orderId: string;
  orderName: string;
  status: string;
  method: string;
  type: string;
  totalAmount: number;
};

type TossConfirmErr = {
  code: string;
  message: string;
};

async function confirmTossPayment(
  paymentKey: string,
  orderId: string,
  amount: number,
): Promise<{ ok: true; data: TossConfirmOk } | { ok: false; code: string; message: string }> {
  const secretKey = process.env.TOSS_SECRET_KEY ?? "";
  const encoded = Buffer.from(`${secretKey}:`).toString("base64");

  let resp: Response;
  try {
    resp = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: {
        Authorization: `Basic ${encoded}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, code: "NETWORK_ERROR", message: "결제 서버에 연결하지 못했습니다." };
  }

  if (!resp.ok) {
    const err = (await resp.json().catch(() => ({}))) as Partial<TossConfirmErr>;
    return {
      ok: false,
      code: err.code ?? "CONFIRM_FAILED",
      message: err.message ?? "결제 확인에 실패했습니다.",
    };
  }

  const data = (await resp.json()) as TossConfirmOk;
  return { ok: true, data };
}

// ── Report success UI ─────────────────────────────────────────────────────────

function ReportSuccessScreen({
  productId,
  paidAt,
}: {
  productId: string;
  paidAt: string | null;
}) {
  const product = PRODUCTS[productId as keyof typeof PRODUCTS];
  const dateStr = paidAt
    ? new Date(paidAt).toLocaleString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <main className="screen luna-article-screen">
      <article className="luna-article-wrap">
        <header style={{ marginBottom: "2rem" }}>
          <p className="luna-article-kicker">결제 완료</p>
          <h1 className="luna-article-headline" style={{ fontSize: "1.4rem" }}>
            구매해 주셔서 감사합니다
          </h1>
        </header>

        <section className="luna-article-section">
          <div className="luna-settings-group">
            <div className="luna-settings-row">
              <span className="luna-settings-row-label">상품</span>
              <span className="luna-settings-row-value">{product?.name ?? productId}</span>
            </div>
            {dateStr && (
              <div className="luna-settings-row">
                <span className="luna-settings-row-label">결제 일시</span>
                <span className="luna-settings-row-value">{dateStr}</span>
              </div>
            )}
          </div>
        </section>

        <div style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <Link
            href="/home"
            className="luna-settings-form-submit"
            style={{ display: "block", textAlign: "center", padding: "0.75rem 1rem", textDecoration: "none" }}
          >
            홈으로 이동
          </Link>
          <Link
            href="/store"
            style={{ display: "block", textAlign: "center", padding: "0.75rem 1rem", textDecoration: "none", fontSize: "0.85rem", opacity: 0.5 }}
          >
            스토어로 돌아가기
          </Link>
        </div>
      </article>
    </main>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ paymentKey?: string; orderId?: string; amount?: string }>;
}) {
  const params = await searchParams;
  const { paymentKey, orderId, amount: amountStr } = params;

  // Validate required params
  if (!paymentKey || !orderId || !amountStr) {
    redirect("/payment/fail?code=INVALID_PARAMS&message=" + encodeURIComponent("잘못된 접근입니다."));
  }

  const amount = parseInt(amountStr, 10);
  if (isNaN(amount)) {
    redirect("/payment/fail?code=INVALID_AMOUNT&message=" + encodeURIComponent("결제 금액이 올바르지 않습니다."));
  }

  // Auth
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const claims = verifySessionToken(token);
  if (!claims) redirect("/account-access");

  // Look up order
  const order = getOrder(orderId);
  if (!order || order.userId !== claims.userId) {
    redirect("/payment/fail?code=ORDER_NOT_FOUND&message=" + encodeURIComponent("주문을 찾을 수 없습니다."));
  }

  // Idempotency: already paid
  if (order.status === "paid") {
    redirect(getPaidOrderRedirectPath(order));
  }

  // Verify amount matches what we stored
  if (order.amount !== amount) {
    redirect("/payment/fail?code=AMOUNT_MISMATCH&message=" + encodeURIComponent("결제 금액이 일치하지 않습니다."));
  }

  // Dev mode: Skip TossPayments confirm
  const skipPayment = process.env.SKIP_PAYMENT === "true" || process.env.NEXT_PUBLIC_SKIP_PAYMENT === "true";

  // Confirm with TossPayments (skip in dev mode)
  type ConfirmResult = Awaited<ReturnType<typeof confirmTossPayment>>;
  let confirmResult: ConfirmResult;
  if (skipPayment) {
    confirmResult = { ok: true, data: { paymentKey, orderId, orderName: "", status: "DONE", method: "CARD", type: "PAYMENT", totalAmount: amount } };
  } else {
    confirmResult = await confirmTossPayment(paymentKey, orderId, amount);
  }

  if (!confirmResult.ok) {
    markOrderFailed(orderId, confirmResult.code, confirmResult.message);
    redirect(
      `/payment/fail?code=${encodeURIComponent(confirmResult.code)}&message=${encodeURIComponent(confirmResult.message)}&orderId=${orderId}`,
    );
  }

  const finalized = await finalizePaidOrder({
    orderId,
    userId: claims.userId,
    paymentKey,
    paymentType: confirmResult.data.type,
    purchaseDate: new Date(),
    receiptPlatform: "toss",
  });

  redirect(finalized.redirectTo);

  // Fallback for unknown products
  const fallbackOrderId = order?.id;
  let freshOrder: ReturnType<typeof getOrder> = null;
  if (typeof fallbackOrderId === "string") {
    freshOrder = getOrder(fallbackOrderId as string);
  }
  return <ReportSuccessScreen productId={order?.productId ?? ""} paidAt={freshOrder?.paidAt ?? null} />;
}
