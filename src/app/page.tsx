"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    void (async () => {
      const minimumIntroDelay = new Promise((resolve) => window.setTimeout(resolve, 4000));

      const sessionCheck = (async () => {
        try {
          const response = await fetch("/api/auth/session/me", {
            method: "GET",
            cache: "no-store",
          });

          return response.ok;
        } catch {
          return false;
        }
      })();

      const [, isAuthenticated] = await Promise.all([minimumIntroDelay, sessionCheck]);

      if (isAuthenticated) {
        router.replace("/home");
        return;
      }

      router.replace("/start");
    })();
  }, [router]);

  return (
    <main
      aria-label="LUNA intro"
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        background: "#04040a",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        gap: "2rem",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/luna/assets/splash/intro-background.gif"
        alt=""
        aria-hidden="true"
        className="luna-intro-bg"
      />

      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, rgba(0,0,0,0.03), rgba(0,0,0,0.14) 58%, rgba(0,0,0,0.34))",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "min(100%, 28rem)",
          paddingInline: "1.25rem",
          boxSizing: "border-box",
          gap: "1.4rem",
        }}
      >
        <div className="luna-intro-object-shell" aria-hidden="true">
          <div className="luna-intro-object-glow" />
          <div className="luna-intro-object-ring" />
          <div className="luna-intro-object">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/luna/assets/splash/intro-blackhole-animated.webp"
              alt=""
              className="luna-intro-orb-media"
            />
          </div>
        </div>

        <div className="luna-intro-brand"
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <p style={{
            margin: 0,
            fontSize: "0.68rem",
            fontWeight: 400,
            letterSpacing: "0.34em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.72)",
            textShadow: "0 2px 12px rgba(0,0,0,0.32)",
          }}>
            your stellar mirror
          </p>
          <h1 style={{
            margin: 0,
            fontSize: "clamp(2.8rem, 15vw, 5rem)",
            fontWeight: 100,
            letterSpacing: "0.26em",
            paddingLeft: "0.26em",
            textTransform: "uppercase",
            color: "#fff",
            lineHeight: 1,
            width: "100%",
            textAlign: "center",
            textShadow: "0 0 36px rgba(255,169,102,0.14), 0 0 100px rgba(0,0,0,0.36)",
          }}>
            LUNA
          </h1>
          <p style={{
            margin: 0,
            fontSize: "0.82rem",
            fontWeight: 300,
            letterSpacing: "0.04em",
            color: "rgba(255,255,255,0.84)",
            lineHeight: 1.75,
            textShadow: "0 2px 16px rgba(0,0,0,0.4)",
          }}>
            별의 언어로 읽는 오늘의 나
          </p>
        </div>
        </div>
      </div>

      {/* 하단 로딩 바 */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          bottom: "max(env(safe-area-inset-bottom, 0px), 2.4rem)",
          left: "50%",
          transform: "translateX(-50%)",
          width: "3.6rem",
          height: "1px",
          background: "rgba(255,255,255,0.12)",
          overflow: "hidden",
          zIndex: 1,
        }}
      >
        <div className="luna-intro-loader-bar" style={{ height: "100%" }} />
      </div>
    </main>
  );
}