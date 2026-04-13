"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ensurePushActionListener, syncNativePushRegistration } from "@/lib/native-push";

export default function NativePushBootstrap() {
  const pathname = usePathname();

  useEffect(() => {
    void ensurePushActionListener();
  }, []);

  useEffect(() => {
    if (pathname?.startsWith("/admin")) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const response = await fetch("/api/auth/session/me", { cache: "no-store" }).catch(() => null);
      if (!response?.ok) {
        return;
      }

      const data = await response.json().catch(() => null) as { session?: { userId?: string } } | null;
      const userId = data?.session?.userId;
      if (!userId || cancelled) {
        return;
      }

      const promptKey = `luna_push_prompted_v1:${userId}`;
      const hasPrompted = typeof window !== "undefined" && window.localStorage.getItem(promptKey) === "1";
      const result = await syncNativePushRegistration({ prompt: !hasPrompted });

      if (cancelled || typeof window === "undefined") {
        return;
      }

      if (result.status !== "unsupported" && result.status !== "error") {
        window.localStorage.setItem(promptKey, "1");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return null;
}