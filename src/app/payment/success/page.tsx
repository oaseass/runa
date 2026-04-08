import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/server/auth-session";
import {
  getOrder,
  markOrderPaid,
  markOrderFailed,
  setOrderAnalysisId,
  setOrderReportJson,
  PRODUCTS,
} from "@/lib/server/order-store";
import {
  createVoidAnalysisRequest,
  updateVoidAnalysisRequest,
} from "@/lib/server/void-store";
import { generateVoidAnalysis } from "@/lib/server/void-analysis";
import { generateAreaReport } from "@/lib/server/area-report";
import { generateYearlyReport } from "@/lib/server/yearly-report";
import { grantFromSku, recordIapReceipt } from "@/lib/server/entitlement-store";
import { LEGACY_TO_SKU, isValidSkuId } from "@/lib/products";
import type { CategoryKey } from "@/app/void/types";

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
    if (order.productId === "question" && order.analysisId) {
      redirect(`/void/result/${order.analysisId}`);
    }
    if (order.productId === "area" || order.productId === "yearly") {
      redirect(`/store/report/${orderId}`);
    }
    if (order.productId === "membership") {
      redirect("/insight/today");
    }
    return <ReportSuccessScreen productId={order.productId} paidAt={order.paidAt} />;
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

  // Mark order paid
  markOrderPaid(orderId, paymentKey, confirmResult.data.type);

  // ── Update entitlements (new unified system) ──────────────────────────────
  const legacySkuId = LEGACY_TO_SKU[order.productId];
  const skuId = legacySkuId ?? (isValidSkuId(order.productId) ? order.productId : null);
  if (skuId) {
    grantFromSku(claims.userId, skuId, new Date(), undefined, { skipIfAlreadyGranted: false });
    recordIapReceipt({
      userId:        claims.userId,
      platform:      "toss",
      skuId,
      transactionId: paymentKey,
      status:        "valid",
      purchaseDate:  new Date().toISOString(),
    });
  }

  // Deliver product

  // New SKU: VIP subscriptions
  if (order.productId === "vip_monthly" || order.productId === "vip_yearly" || order.productId === "membership") {
    redirect("/home");
  }

  // New SKU: annual report
  if (order.productId === "annual_report") {
    try {
      const report = await generateYearlyReport(claims.userId);
      if (report) setOrderReportJson(orderId, JSON.stringify(report));
    } catch { /* best-effort */ }
    redirect(`/store/report/${orderId}`);
  }

  // New SKU: area reading
  if (order.productId === "area_reading") {
    try {
      const report = await generateAreaReport(claims.userId);
      if (report) setOrderReportJson(orderId, JSON.stringify(report));
    } catch { /* best-effort */ }
    redirect(`/store/report/${orderId}`);
  }

  // New SKU: VOID packs — go to VOID after purchase
  if (order.productId === "void_pack_3" || order.productId === "void_pack_10") {
    redirect("/void");
  }

  if (order.productId === "question") {
    const meta = order.metadata ?? {};
    const category = (meta.category ?? "self") as CategoryKey;
    const questionText = meta.questionText ?? "";
    const questionType = (meta.questionType ?? "preset") as "preset" | "custom";
    const chartHash = meta.chartHash ?? null;

    const record = createVoidAnalysisRequest({
      userId: claims.userId,
      category,
      questionText,
      questionType,
      chartHash,
      initialStatus: "generating",
    });

    let finalStatus: "complete" | "chart_missing" | "failed" = "failed";
    let analysisJson: string | undefined;

    try {
      const output = await generateVoidAnalysis(claims.userId, category, questionText);
      if (output) {
        analysisJson = JSON.stringify(output);
        finalStatus = "complete";
      } else {
        finalStatus = "chart_missing";
      }
    } catch {
      finalStatus = "failed";
    }

    updateVoidAnalysisRequest(record.id, { status: finalStatus, analysisJson });
    setOrderAnalysisId(orderId, record.id);

    redirect(`/void/result/${record.id}`);
  }

  // For yearly / area reports: generate report, store, redirect to result
  if (order.productId === "area") {
    try {
      const report = await generateAreaReport(claims.userId);
      if (report) {
        setOrderReportJson(orderId, JSON.stringify(report));
      }
    } catch { /* best-effort */ }
    redirect(`/store/report/${orderId}`);
  }

  if (order.productId === "yearly") {
    try {
      const report = await generateYearlyReport(claims.userId);
      if (report) {
        setOrderReportJson(orderId, JSON.stringify(report));
      }
    } catch { /* best-effort */ }
    redirect(`/store/report/${orderId}`);
  }

  // Membership: redirect to daily reading
  if (order.productId === "membership") {
    redirect("/insight/today");
  }

  // Fallback for unknown products
  const freshOrder = getOrder(orderId);
  return <ReportSuccessScreen productId={order.productId} paidAt={freshOrder?.paidAt ?? null} />;
}
