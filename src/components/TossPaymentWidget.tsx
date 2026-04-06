"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  clientKey: string;
  customerKey: string;
  orderId: string;
  amount: number;
  orderName: string;
  customerName?: string;
}

export function TossPaymentWidget({
  clientKey,
  customerKey,
  orderId,
  amount,
  orderName,
  customerName,
}: Props) {
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const widgetsRef = useRef<import("@tosspayments/tosspayments-sdk").TossPaymentsWidgets | null>(null);
  const initDoneRef = useRef(false);

  useEffect(() => {
    if (initDoneRef.current) return;
    initDoneRef.current = true;

    async function init() {
      const { loadTossPayments } = await import("@tosspayments/tosspayments-sdk");
      const tossPayments = await loadTossPayments(clientKey);
      const widgets = tossPayments.widgets({ customerKey });

      await widgets.setAmount({ currency: "KRW", value: amount });

      await Promise.all([
        widgets.renderPaymentMethods({
          selector: "#toss-payment-methods",
          variantKey: "DEFAULT",
        }),
        widgets.renderAgreement({
          selector: "#toss-agreement",
          variantKey: "AGREEMENT",
        }),
      ]);

      widgetsRef.current = widgets;
      setReady(true);
    }

    init().catch((err: Error) => {
      setInitError(err.message ?? "결제 모듈 초기화에 실패했습니다.");
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handlePay() {
    if (!widgetsRef.current || !ready || paying) return;
    setPaying(true);

    try {
      await widgetsRef.current.requestPayment({
        orderId,
        orderName,
        successUrl: `${window.location.origin}/payment/success`,
        failUrl: `${window.location.origin}/payment/fail`,
        customerName,
      });
      // TossPayments handles the redirect on success; this line is rarely reached.
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "USER_CANCEL") {
        // User dismissed the payment sheet — stay on page.
        setPaying(false);
        return;
      }
      const message = (err as { message?: string }).message ?? "결제 오류";
      window.location.href =
        `/payment/fail?code=${encodeURIComponent(code ?? "UNKNOWN")}` +
        `&message=${encodeURIComponent(message)}&orderId=${orderId}`;
    }
  }

  if (initError) {
    return (
      <div className="toss-widget-error">
        결제 모듈을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        <br />
        <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>{initError}</span>
      </div>
    );
  }

  return (
    <div className="toss-widget-wrap">
      <div id="toss-payment-methods" className="toss-payment-methods" />
      <div id="toss-agreement" className="toss-agreement" />
      <button
        className="toss-pay-btn"
        onClick={handlePay}
        disabled={!ready || paying}
      >
        {paying
          ? "결제 처리 중…"
          : ready
            ? `₩${amount.toLocaleString()} 결제하기`
            : "결제 수단 불러오는 중…"}
      </button>
    </div>
  );
}
