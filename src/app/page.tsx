"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    void (async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 2200));

      try {
        const response = await fetch("/api/auth/session/me", {
          method: "GET",
          cache: "no-store",
        });

        if (response.ok) {
          router.replace("/home");
          return;
        }
      } catch {
        // network error → treat as unauthenticated
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
      {/* 배경: 동일 GIF 블러 처리로 분위기만 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/luna/assets/splash/galaxy.gif"
        alt=""
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%) scale(3)",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "blur(28px) brightness(0.45) saturate(1.6)",
          opacity: 0.9,
        }}
      />

      {/* 중앙 갤럭시 이미지 — 자연 크기 유지 */}
      <div
        className="luna-intro-brand"
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1.6rem",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/luna/assets/splash/galaxy.gif"
          alt=""
          aria-hidden="true"
          style={{
            width: "min(72vw, 280px)",
            height: "auto",
            borderRadius: "50%",
            objectFit: "cover",
            aspectRatio: "1 / 1",
            boxShadow: "0 0 60px rgba(140, 100, 255, 0.25), 0 0 120px rgba(80, 60, 200, 0.15)",
          }}
          className="luna-intro-orb"
        />

        {/* 브랜드 텍스트 */}
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <p style={{
            margin: 0,
            fontSize: "0.68rem",
            fontWeight: 400,
            letterSpacing: "0.34em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.38)",
          }}>
            your stellar mirror
          </p>
          <h1 style={{
            margin: 0,
            fontSize: "clamp(3rem, 16vw, 5rem)",
            fontWeight: 100,
            letterSpacing: "0.42em",
            paddingLeft: "0.42em", /* letter-spacing 보정 */
            textTransform: "uppercase",
            color: "#fff",
            lineHeight: 1,
            textShadow: "0 0 48px rgba(180,150,255,0.4), 0 0 100px rgba(120,90,220,0.2)",
          }}>
            LUNA
          </h1>
          <p style={{
            margin: 0,
            fontSize: "0.82rem",
            fontWeight: 300,
            letterSpacing: "0.04em",
            color: "rgba(255,255,255,0.52)",
            lineHeight: 1.75,
          }}>
            별의 언어로 읽는 오늘의 나
          </p>
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