"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type AndroidUpdateManifest = {
  enabled: boolean;
  versionCode: number;
  versionName: string;
  apkUrl: string;
  required: boolean;
  headline: string;
  message: string;
  releaseNotes: string[];
  publishedAt: string | null;
};

type NativeAppInfo = {
  versionCode: number;
  versionName: string;
  packageName: string;
};

const FALLBACK_VERSION_CODE = 1;
const FALLBACK_VERSION_NAME = "1.0.0";

function toAbsoluteUrl(url: string) {
  if (typeof window === "undefined") {
    return url;
  }

  return new URL(url, window.location.origin).toString();
}

function buildUpdateHelperUrl(url: string) {
  const absoluteUrl = toAbsoluteUrl(url);
  const params = new URLSearchParams({ apk: absoluteUrl });
  return `/app-update/android?${params.toString()}`;
}

function getCapacitor() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.Capacitor ?? null;
}

function isNativeAndroid(): boolean {
  const capacitor = getCapacitor();
  if (capacitor?.isNativePlatform?.() && capacitor.getPlatform?.() === "android") {
    return true;
  }

  return /; wv\)|\bwv\b|Android/i.test(navigator.userAgent);
}

function getDevicePlugin() {
  return getCapacitor()?.Plugins?.LunaDevice;
}

async function getCurrentAppInfo(): Promise<NativeAppInfo> {
  const plugin = getDevicePlugin();
  if (plugin?.getAppInfo) {
    const info = await plugin.getAppInfo();
    return {
      versionCode: Number(info.versionCode || FALLBACK_VERSION_CODE),
      versionName: info.versionName || FALLBACK_VERSION_NAME,
      packageName: info.packageName || "com.lunastar.app",
    };
  }

  return {
    versionCode: FALLBACK_VERSION_CODE,
    versionName: FALLBACK_VERSION_NAME,
    packageName: "com.lunastar.app",
  };
}

async function openUpdateUrl(url: string) {
  const absoluteUrl = toAbsoluteUrl(url);
  const plugin = getDevicePlugin();
  if (plugin?.startApkUpdate) {
    await plugin.startApkUpdate({ url: absoluteUrl });
    return;
  }

  if (plugin?.openExternalUrl) {
    await plugin.openExternalUrl({ url: absoluteUrl });
    return;
  }

  window.location.assign(buildUpdateHelperUrl(absoluteUrl));
}

export default function NativeAndroidUpdateGate() {
  const pathname = usePathname();
  const [manifest, setManifest] = useState<AndroidUpdateManifest | null>(null);
  const [appInfo, setAppInfo] = useState<NativeAppInfo | null>(null);
  const [launching, setLaunching] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const isUpdateHelperPage = pathname?.startsWith("/app-update/android") ?? false;

  useEffect(() => {
    if (!isNativeAndroid() || isUpdateHelperPage) {
      return;
    }

    let active = true;

    void (async () => {
      try {
        const [manifestResponse, currentAppInfo] = await Promise.all([
          fetch("/api/app-update/android", {
            method: "GET",
            cache: "no-store",
            headers: {
              "cache-control": "no-cache",
              pragma: "no-cache",
            },
          }),
          getCurrentAppInfo(),
        ]);

        if (!manifestResponse.ok) {
          return;
        }

        const nextManifest = (await manifestResponse.json()) as AndroidUpdateManifest;
        if (!active || !nextManifest.enabled) {
          return;
        }

        if (currentAppInfo.versionCode >= nextManifest.versionCode) {
          return;
        }

        setManifest(nextManifest);
        setAppInfo(currentAppInfo);
      } catch {
        // silent: update gating is best effort
      }
    })();

    return () => {
      active = false;
    };
  }, [isUpdateHelperPage]);

  const needsUpdate = useMemo(() => {
    if (!manifest || !appInfo) {
      return false;
    }

    return appInfo.versionCode < manifest.versionCode;
  }, [appInfo, manifest]);

  useEffect(() => {
    if (!manifest || typeof localStorage === "undefined") {
      return;
    }

    const dismissedKey = `luna-android-update-dismissed:${manifest.versionCode}`;
    setDismissed(localStorage.getItem(dismissedKey) === "1");
  }, [manifest]);

  useEffect(() => {
    if (!needsUpdate || !manifest?.required) {
      return;
    }

    const sessionKey = `luna-android-update-opened:${manifest.versionCode}`;
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(sessionKey) === "1") {
      return;
    }

    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(sessionKey, "1");
    }

    setLaunching(true);
    void openUpdateUrl(manifest.apkUrl)
      .catch(() => {
        window.location.assign(buildUpdateHelperUrl(manifest.apkUrl));
      })
      .finally(() => {
        setLaunching(false);
      });
  }, [manifest, needsUpdate]);

  async function handleUpdateNow() {
    if (!manifest) {
      return;
    }

    setLaunching(true);
    try {
      await openUpdateUrl(manifest.apkUrl);
    } catch {
      window.location.assign(buildUpdateHelperUrl(manifest.apkUrl));
    } finally {
      setLaunching(false);
    }
  }

  function handleDismiss() {
    if (!manifest) {
      return;
    }

    if (typeof localStorage !== "undefined") {
      localStorage.setItem(`luna-android-update-dismissed:${manifest.versionCode}`, "1");
    }

    setDismissed(true);
  }

  if (isUpdateHelperPage || !needsUpdate || !manifest || !appInfo || (!manifest.required && dismissed)) {
    return null;
  }

  return (
    <div className="luna-update-gate" role="dialog" aria-modal="true" aria-label="앱 업데이트">
      <div className="luna-update-gate__backdrop" />
      <section className="luna-update-gate__panel">
        <p className="luna-update-gate__eyebrow">native update</p>
        <h2 className="luna-update-gate__title">{manifest.headline}</h2>
        <p className="luna-update-gate__body">{manifest.message}</p>

        <div className="luna-update-gate__meta">
          <span>현재 {appInfo.versionName}</span>
          <span>새 버전 {manifest.versionName}</span>
        </div>

        <div className="luna-update-gate__notes">
          {manifest.releaseNotes.map((note) => (
            <p key={note} className="luna-update-gate__note">{note}</p>
          ))}
        </div>

        <div className="luna-update-gate__actions">
          <button
            type="button"
            className="luna-update-gate__primary"
            onClick={() => void handleUpdateNow()}
            disabled={launching}
          >
            {launching ? "업데이트 여는 중..." : "지금 업데이트"}
          </button>

          <a
            className="luna-update-gate__helper-link"
            href={buildUpdateHelperUrl(manifest.apkUrl)}
          >
            이 버전에서 버튼이 안 먹으면 링크를 복사해 외부 브라우저 주소창에 붙여 넣기
          </a>

          {!manifest.required && (
            <button
              type="button"
              className="luna-update-gate__secondary"
              onClick={handleDismiss}
              disabled={launching}
            >
              나중에
            </button>
          )}
        </div>
      </section>
    </div>
  );
}