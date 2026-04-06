"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // fallback for non-secure contexts (http dev)
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/* Session ID: 탭 세션 유지 (새 탭 = 새 세션) */
function getSessionId(): string {
  if (typeof sessionStorage === "undefined") return "ssr";
  let sid = sessionStorage.getItem("_lsid");
  if (!sid) {
    sid = makeId();
    sessionStorage.setItem("_lsid", sid);
  }
  return sid;
}

function getInitialReferrerPath(): string | null {
  if (typeof document === "undefined" || !document.referrer) return null;
  try {
    const url = new URL(document.referrer);
    if (url.origin !== window.location.origin) return null;
    return url.pathname || null;
  } catch {
    return null;
  }
}

/**
 * 현재 페이지를 analytics API에 기록합니다.
 * 페이지가 바뀌기 직전 duration을 함께 전송합니다.
 */
export default function TrackPageView() {
  const pathname   = usePathname();
  const enterRef   = useRef<number>(0);
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
    const sid = getSessionId();
    const previousPath = prevPathRef.current;

    /* 이전 페이지 종료 시 duration 전송 */
    if (previousPath && previousPath !== pathname) {
      const dur = Date.now() - enterRef.current;
      navigator.sendBeacon(
        "/api/analytics/track",
        JSON.stringify({
          type: "pageview",
          sessionId: sid,
          path: previousPath,
          durationMs: dur,
        }),
      );
    }

    /* 현재 페이지 진입 기록 */
    const referrerPath = previousPath ?? getInitialReferrerPath();
    enterRef.current  = Date.now();
    prevPathRef.current = pathname;

    fetch("/api/analytics/track", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ type: "pageview", sessionId: sid, path: pathname, referrer: referrerPath }),
    }).catch(() => {/* silent */});

    /* 언로드 시 duration flush */
    const onUnload = () => {
      navigator.sendBeacon(
        "/api/analytics/track",
        JSON.stringify({
          type:      "pageview",
          sessionId: sid,
          path:      pathname,
          durationMs: Date.now() - enterRef.current,
        }),
      );
    };
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, [pathname]);

  return null;
}