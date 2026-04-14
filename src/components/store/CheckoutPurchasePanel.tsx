"use client";

import { useEffect, useState } from "react";
import { purchaseWithNativeIap, getNativePlatform } from "@/lib/native-iap";
import { TossPaymentWidget } from "@/components/TossPaymentWidget";
import { NativePurchaseRestoreCard } from "@/components/store/NativePurchaseRestoreCard";

type CheckoutPurchasePanelProps = {
  productId: string;
  orderId?: string;
  amount: number;
  productName: string;
  customerKey: string;
  customerName?: string;
  clientKey: string | null;
};

type CreateOrderResponse = {
  ok: boolean;
  orderId?: string;
  message?: string;
};

export function CheckoutPurchasePanel({
  productId,
  orderId,
  amount,
  productName,
  customerKey,
  customerName,
  clientKey,
}: CheckoutPurchasePanelProps) {
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webOrderId, setWebOrderId] = useState<string | null>(orderId ?? null);
  const [orderPreparing, setOrderPreparing] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  useEffect(() => {
    setPlatform(getNativePlatform());
    setReady(true);
  }, []);

  useEffect(() => {
    setWebOrderId(orderId ?? null);
  }, [orderId]);

  useEffect(() => {
    if (!ready || platform || webOrderId) {
      return;
    }

    if (!clientKey || clientKey.startsWith("test_ck_placeholder")) {
      return;
    }

    let cancelled = false;

    async function prepareWebOrder() {
      setOrderPreparing(true);
      setOrderError(null);

      try {
        const response = await fetch("/api/store/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId, existingOrderId: orderId ?? null }),
        });

        const result = (await response.json().catch(() => ({ ok: false }))) as CreateOrderResponse;
        if (!response.ok || !result.ok || !result.orderId) {
          throw new Error(result.message ?? "주문 정보를 준비하지 못했어요.");
        }

        if (cancelled) {
          return;
        }

        setWebOrderId(result.orderId);

        const url = new URL(window.location.href);
        url.searchParams.set("order", result.orderId);
        window.history.replaceState(null, "", url.toString());
      } catch (orderCreationError) {
        if (cancelled) {
          return;
        }

        setOrderError(
          orderCreationError instanceof Error
            ? orderCreationError.message
            : "주문 정보를 준비하지 못했어요.",
        );
      } finally {
        if (!cancelled) {
          setOrderPreparing(false);
        }
      }
    }

    void prepareWebOrder();

    return () => {
      cancelled = true;
    };
  }, [ready, platform, webOrderId, clientKey, productId, orderId]);

  async function handleNativePurchase() {
    setError(null);
    setLoading(true);

    try {
      const result = await purchaseWithNativeIap(productId, orderId);
      window.location.href = result.redirectTo ?? "/home";
    } catch (purchaseError) {
      const message = purchaseError instanceof Error
        ? purchaseError.message
        : "앱 결제 처리 중 오류가 발생했어요.";
      setError(
        message.includes("브리지가 연결되지 않았어요")
          ? "현재 앱 버전에서는 결제창을 열 수 없어요. 앱을 최신 버전으로 업데이트한 뒤 다시 시도해 주세요."
          : message,
      );
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <div className="luna-settings-note" style={{ padding: "0.25rem 0" }}>
        결제 수단을 확인하는 중입니다.
      </div>
    );
  }

  if (platform) {
    return (
      <div className="toss-widget-wrap">
        <div className="luna-settings-group" style={{ marginBottom: "1rem" }}>
          <div className="luna-settings-row">
            <span className="luna-settings-row-label">결제 방식</span>
            <span className="luna-settings-row-value">
              {platform === "android" ? "Google Play 결제" : "App Store 결제"}
            </span>
          </div>
          {orderId && (
            <div className="luna-settings-row">
              <span className="luna-settings-row-label">주문 번호</span>
              <span className="luna-settings-row-value">{orderId.slice(0, 8)}</span>
            </div>
          )}
        </div>

        {error && (
          <p className="luna-settings-note" style={{ color: "#ef4444", marginBottom: "0.8rem" }}>
            {error}
          </p>
        )}

        {error?.includes("앱을 최신 버전으로 업데이트") && platform === "android" && (
          <a href="/app-update/android" className="luna-settings-note" style={{ display: "inline-block", marginBottom: "0.85rem", color: "#c4b5fd", textDecoration: "underline" }}>
            앱 업데이트 열기
          </a>
        )}

        <button
          className="toss-pay-btn"
          onClick={handleNativePurchase}
          disabled={loading}
          type="button"
        >
          {loading
            ? "결제 처리 중..."
            : `${platform === "android" ? "Google Play" : "App Store"}에서 ${productName} 결제하기`}
        </button>

        <p className="luna-settings-note" style={{ marginTop: "1rem" }}>
          앱 안에서는 웹 결제가 아니라 스토어 결제로 처리됩니다. 결제 완료 후 소유 상태와 화면을 즉시 동기화합니다.
        </p>

        <NativePurchaseRestoreCard mode="inline" reloadOnSuccess />
      </div>
    );
  }

  if (!clientKey || clientKey.startsWith("test_ck_placeholder")) {
    return (
      <div className="luna-store-checkout-notice">
        <p className="luna-store-checkout-notice-title">결제 미연동</p>
        <p>
          NEXT_PUBLIC_TOSS_CLIENT_KEY 환경 변수에 토스페이먼츠 테스트 클라이언트 키를 입력해 주세요.
        </p>
      </div>
    );
  }

  if (orderError) {
    return (
      <div className="luna-store-checkout-notice">
        <p className="luna-store-checkout-notice-title">주문 준비 실패</p>
        <p>{orderError}</p>
      </div>
    );
  }

  if (!webOrderId || orderPreparing) {
    return (
      <div className="luna-settings-note" style={{ padding: "0.25rem 0" }}>
        주문 정보를 준비하는 중입니다.
      </div>
    );
  }

  return (
    <>
      <TossPaymentWidget
        clientKey={clientKey}
        customerKey={customerKey}
        orderId={webOrderId}
        amount={amount}
        orderName={productName}
        customerName={customerName}
      />
      <p className="luna-settings-note" style={{ marginTop: "1rem" }}>
        결제는 토스페이먼츠가 안전하게 처리합니다. 테스트 모드에서는 실제 결제가 이루어지지 않습니다.
      </p>
    </>
  );
}