"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getAccountDraft } from "@/lib/onboarding/account-draft-storage";

type PermissionState = "idle" | "requesting" | "granted" | "denied" | "blocked";
type PermissionChoice = "allowed" | "skipped";

export default function PermissionsPage() {
  const router = useRouter();
  const [permissionState, setPermissionState] = useState<PermissionState>("idle");
  const [choice, setChoice] = useState<PermissionChoice | null>(null);

  useEffect(() => {
    const accountDraft = getAccountDraft();

    if (!accountDraft) {
      router.replace("/password");
    }
  }, [router]);

  const isRequesting = permissionState === "requesting";
  const isResolvedAfterAllow =
    choice === "allowed" && ["granted", "denied", "blocked"].includes(permissionState);

  const stateCopy = useMemo(() => {
    if (permissionState === "granted") {
      return "연락처 접근이 허용되었습니다.";
    }

    if (permissionState === "denied") {
      return "권한이 거부되었습니다. 설정에서 언제든 바꿀 수 있어요.";
    }

    if (permissionState === "blocked") {
      return "현재 환경에서는 연락처 권한을 바로 요청할 수 없어요.";
    }

    if (permissionState === "requesting") {
      return "연락처 권한을 요청하고 있어요...";
    }

    return null;
  }, [permissionState]);

  function saveOnboardingCompletion(
    permissionChoice: PermissionChoice,
    resolvedPermissionState: PermissionState | null,
  ) {
    const updatedAt = new Date().toISOString();

    localStorage.setItem(
      "luna_onboarding_permissions",
      JSON.stringify({
        contactsPermissionChoice: permissionChoice,
        permissionState: resolvedPermissionState,
        onboardingCompleted: true,
        updatedAt,
      }),
    );

    localStorage.setItem(
      "luna_onboarding_completion",
      JSON.stringify({
        completed: true,
        step: "permissions",
        updatedAt,
      }),
    );
  }

  async function requestContactsPermission(): Promise<"granted" | "denied" | "blocked"> {
    if (typeof window === "undefined") {
      return "blocked";
    }

    const globalScope = window as typeof window & {
      Capacitor?: {
        isNativePlatform?: () => boolean;
        Plugins?: Record<string, unknown>;
      };
    };

    // Native integration point (Capacitor/React Native bridge).
    if (globalScope.Capacitor?.isNativePlatform?.()) {
      try {
        const plugin = globalScope.Capacitor.Plugins?.Contacts;

        if (
          plugin &&
          typeof (plugin as { requestPermissions?: () => Promise<{ contacts?: string }> }).requestPermissions ===
            "function"
        ) {
          const result = await (
            plugin as { requestPermissions: () => Promise<{ contacts?: string }> }
          ).requestPermissions();
          const contacts = result.contacts;

          if (contacts === "granted") {
            return "granted";
          }

          if (contacts === "denied") {
            return "denied";
          }
        }
      } catch (error) {
        console.error("[permissions] native contacts request failed", error);
        return "blocked";
      }

      return "blocked";
    }

    // Web: keep state accurate and do not fake a successful contacts permission.
    return "blocked";
  }

  function finishOnboarding(permissionChoice: PermissionChoice, resolvedPermissionState: PermissionState | null) {
    saveOnboardingCompletion(permissionChoice, resolvedPermissionState);

    void (async () => {
      const accountDraft = getAccountDraft();

      if (!accountDraft?.draftId) {
        router.push("/");
        return;
      }

      const response = await fetch("/api/auth/session/login-draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          draftId: accountDraft.draftId,
        }),
      });

      if (!response.ok) {
        router.push("/");
        return;
      }

      router.push("/home");
    })();
  }

  async function handleAllowPermissions() {
    if (isRequesting) {
      return;
    }

    setChoice("allowed");
    setPermissionState("requesting");

    const result = await requestContactsPermission();
    setPermissionState(result);
  }

  function handleSkipPermissions() {
    setChoice("skipped");
    finishOnboarding("skipped", null);
  }

  function handleContinueAfterResolution() {
    if (!isResolvedAfterAllow) {
      return;
    }

    finishOnboarding("allowed", permissionState);
  }

  return (
    <main className="screen screen-dark">
      <section className="step-wrap step-wrap-dark" aria-label="Permissions step">
        <p className="dark-brand">LUNA</p>
        <h1 className="step-title step-title-strong">연락처 권한</h1>
        <p className="dark-copy">연결 흐름을 더 정확히 읽기 위해 연락처 권한을 사용합니다.</p>

        <button type="button" className="cta cta-solid" onClick={handleAllowPermissions} disabled={isRequesting}>
          권한 허용하기
        </button>

        {stateCopy ? <p className="dark-copy">{stateCopy}</p> : null}

        {isResolvedAfterAllow ? (
          <button type="button" className="tiny-link" style={{ width: "fit-content" }} onClick={handleContinueAfterResolution}>
            계속
          </button>
        ) : null}

        <button type="button" className="tiny-link" style={{ width: "fit-content" }} onClick={handleSkipPermissions}>
          나중에 하기
        </button>
      </section>
    </main>
  );
}
