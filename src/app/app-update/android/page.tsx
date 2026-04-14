"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const DEFAULT_APK_PATH = "/downloads/luna-android-latest.apk";

function toAbsoluteUrl(url: string) {
  if (typeof window === "undefined") {
    return url;
  }

  return new URL(url || DEFAULT_APK_PATH, window.location.origin).toString();
}

function toIntentUrl(url: string) {
  const parsed = new URL(url);
  const scheme = parsed.protocol.replace(":", "");
  return `intent://${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}#Intent;scheme=${scheme};action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`;
}

function toChromeIntentUrl(url: string) {
  const parsed = new URL(url);
  const scheme = parsed.protocol.replace(":", "");
  const fallbackUrl = encodeURIComponent(url);
  return `intent://${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}#Intent;scheme=${scheme};package=com.android.chrome;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=${fallbackUrl};end`;
}

function navigate(url: string) {
  window.location.assign(url);
}

function launchWithFallback(urls: string[], delay = 900) {
  urls.forEach((url, index) => {
    window.setTimeout(() => {
      navigate(url);
    }, index * delay);
  });
}

function AndroidUpdateInstallFallback() {
  return (
    <main className="luna-update-helper">
      <section className="luna-update-helper__panel">
        <p className="luna-update-helper__eyebrow">android install</p>
        <h1 className="luna-update-helper__title">설치 화면을 준비하는 중입니다</h1>
        <p className="luna-update-helper__body">
          잠시 후 설치 링크를 열어요. 바로 열리지 않으면 새로고침 후 다시 시도해 주세요.
        </p>
      </section>
    </main>
  );
}

function AndroidUpdateInstallContent() {
  const searchParams = useSearchParams();
  const [copied, setCopied] = useState(false);
  const [statusText, setStatusText] = useState("설치 화면을 여는 중입니다");
  const apkUrl = toAbsoluteUrl(searchParams.get("apk") || DEFAULT_APK_PATH);

  const intentUrl = useMemo(() => {
    try {
      return toIntentUrl(apkUrl);
    } catch {
      return apkUrl;
    }
  }, [apkUrl]);

  const chromeIntentUrl = useMemo(() => {
    try {
      return toChromeIntentUrl(apkUrl);
    } catch {
      return intentUrl;
    }
  }, [apkUrl, intentUrl]);

  function handleOpenBrowser() {
    setStatusText("브라우저를 여는 중입니다");
    launchWithFallback([chromeIntentUrl, intentUrl, apkUrl]);
  }

  function handleDirectDownload() {
    setStatusText("다운로드를 시작하는 중입니다");
    launchWithFallback([apkUrl]);
  }

  useEffect(() => {
    launchWithFallback([chromeIntentUrl, intentUrl, apkUrl]);
  }, [apkUrl, chromeIntentUrl, intentUrl]);

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(apkUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="luna-update-helper">
      <section className="luna-update-helper__panel">
        <p className="luna-update-helper__eyebrow">android install</p>
        <h1 className="luna-update-helper__title">{statusText}</h1>
        <p className="luna-update-helper__body">
          바로 열리지 않으면 아래 버튼으로 외부 브라우저나 직접 다운로드를 실행하세요.
          설치가 끝나면 루나를 다시 열면 됩니다.
        </p>

        <div className="luna-update-helper__actions">
          <button type="button" className="luna-update-helper__primary" onClick={handleOpenBrowser}>
            브라우저에서 설치 열기
          </button>
          <button
            type="button"
            className="luna-update-helper__secondary"
            onClick={handleDirectDownload}
          >
            직접 다운로드
          </button>
          <button type="button" className="luna-update-helper__ghost" onClick={() => void handleCopyLink()}>
            {copied ? "링크 복사 완료" : "설치 링크 복사"}
          </button>
        </div>

        <p className="luna-update-helper__hint">
          지금 설치된 구버전 셸에서는 버튼이 끝까지 안 먹을 수 있습니다. 그 경우 복사된 링크를 삼성 인터넷이나 크롬 주소창에 직접 붙여 넣어 한 번만 설치하면 됩니다.
        </p>
        <p className="luna-update-helper__link">{apkUrl}</p>
      </section>
    </main>
  );
}

export default function AndroidUpdateInstallPage() {
  return (
    <Suspense fallback={<AndroidUpdateInstallFallback />}>
      <AndroidUpdateInstallContent />
    </Suspense>
  );
}