"use client";

import { useEffect, useState } from "react";
import { getNativePlatform, restoreNativePurchases } from "@/lib/native-iap";

type NativePurchaseRestoreCardProps = {
  mode?: "inline" | "panel";
  reloadOnSuccess?: boolean;
  onRestored?: () => void;
};

function hasRestoredEntitlement(entitlement: Record<string, unknown> | undefined) {
  if (!entitlement) {
    return false;
  }

  return Boolean(
    entitlement.isVip ||
    entitlement.annualReportOwned ||
    entitlement.areaReportsOwned ||
    (typeof entitlement.voidCredits === "number" && entitlement.voidCredits > 0),
  );
}

function toRestoreErrorMessage(error: unknown) {
  const message = error instanceof Error && error.message
    ? error.message
    : "구매 복원 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.";

  if (message.includes("브리지가 연결되지 않았어요")) {
    return "현재 앱 버전에서는 구매 복구가 연결되지 않았어요. 앱을 최신 버전으로 업데이트한 뒤 다시 시도해 주세요.";
  }

  return message;
}

export function NativePurchaseRestoreCard({
  mode = "panel",
  reloadOnSuccess = false,
  onRestored,
}: NativePurchaseRestoreCardProps) {
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setPlatform(getNativePlatform());
    setReady(true);
  }, []);

  async function handleRestore() {
    setError(null);
    setNotice(null);
    setLoading(true);

    try {
      const result = await restoreNativePurchases();
      if (result.restoredCount > 0 || hasRestoredEntitlement(result.entitlement)) {
        setNotice("구매 내역을 불러왔어요.");
        onRestored?.();
        if (reloadOnSuccess) {
          window.location.reload();
        }
      } else {
        setNotice("복원할 구매 내역이 없어요.");
      }
    } catch (restoreError) {
      setError(toRestoreErrorMessage(restoreError));
    } finally {
      setLoading(false);
    }
  }

  if (!ready || !platform) {
    return null;
  }

  const buttonLabel = loading
    ? "복구 중..."
    : `${platform === "android" ? "Google Play" : "App Store"} 구매 복구하기`;

  if (mode === "inline") {
    return (
      <div style={{ marginTop: "1rem", padding: "0.9rem 1rem", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
        <p style={{ margin: 0, fontSize: "0.83rem", fontWeight: 600, color: "#f3f4f6" }}>앱을 다시 설치했다면 구매를 복구하세요</p>
        <p className="luna-settings-note" style={{ marginTop: "0.45rem" }}>
          같은 계정으로 로그인한 상태에서 누르면 VIP, 리포트, VOID 크레딧을 다시 불러옵니다.
        </p>
        {notice && (
          <p className="luna-settings-note" style={{ color: "#a78bfa", marginTop: "0.55rem" }}>{notice}</p>
        )}
        {error && (
          <p className="luna-settings-note" style={{ color: "#f87171", marginTop: "0.55rem" }}>{error}</p>
        )}
        {error?.includes("앱을 최신 버전으로 업데이트") && platform === "android" && (
          <a href="/app-update/android" className="luna-settings-note" style={{ display: "inline-block", marginTop: "0.45rem", color: "#c4b5fd", textDecoration: "underline" }}>
            앱 업데이트 열기
          </a>
        )}
        <button type="button" className="toss-pay-btn" onClick={() => void handleRestore()} disabled={loading} style={{ marginTop: "0.85rem" }}>
          {buttonLabel}
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: "0.9rem", padding: "0.95rem 1rem", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
      <p style={{ margin: 0, fontSize: "0.78rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "#9ca3af" }}>purchase restore</p>
      <p style={{ margin: "0.45rem 0 0", fontSize: "0.92rem", fontWeight: 600, color: "#f3f4f6" }}>앱을 지웠다가 다시 깔았나요?</p>
      <p className="luna-settings-note" style={{ marginTop: "0.45rem" }}>
        같은 계정으로 로그인한 뒤 버튼을 누르면 기존 결제 이력을 다시 확인해 VIP, 리포트, VOID 크레딧을 복구합니다.
      </p>
      {notice && (
        <p className="luna-settings-note" style={{ color: "#a78bfa", marginTop: "0.55rem" }}>{notice}</p>
      )}
      {error && (
        <p className="luna-settings-note" style={{ color: "#f87171", marginTop: "0.55rem" }}>{error}</p>
      )}
      {error?.includes("앱을 최신 버전으로 업데이트") && platform === "android" && (
        <a href="/app-update/android" className="luna-settings-note" style={{ display: "inline-block", marginTop: "0.45rem", color: "#c4b5fd", textDecoration: "underline" }}>
          앱 업데이트 열기
        </a>
      )}
      <button type="button" className="luna-settings-form-submit" onClick={() => void handleRestore()} disabled={loading} style={{ marginTop: "0.85rem" }}>
        {buttonLabel}
      </button>
    </div>
  );
}