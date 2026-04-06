import Link from "next/link";
import StarField from "../start/_components/StarField";

export default function AccountAccessPage() {
  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        background:
          "radial-gradient(ellipse 120% 80% at 50% 65%, #0c0820 0%, #05030e 45%, #000004 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        overflow: "hidden",
      }}
      aria-label="로그인 화면"
    >
      {/* ── 별 파티클 ── */}
      <StarField />

      {/* ── 성운 글로우 ── */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 70% 45% at 50% 62%, rgba(110,60,200,0.13) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* ── 로고 ── */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          paddingTop: "max(3.5rem, env(safe-area-inset-top, 3.5rem))",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.25rem",
        }}
      >
        <span
          style={{
            fontSize: "0.52rem",
            letterSpacing: "0.38em",
            color: "rgba(255,255,255,0.28)",
            textTransform: "uppercase",
            fontWeight: 400,
          }}
        >
          루나
        </span>
        <span
          style={{
            fontSize: "1.05rem",
            letterSpacing: "0.28em",
            color: "rgba(255,255,255,0.62)",
            fontWeight: 300,
            textTransform: "uppercase",
          }}
        >
          LUNA
        </span>
      </div>

      {/* ── 메인 카피 ── */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          textAlign: "center",
          padding: "0 2rem",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1.5rem",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: "1px",
            height: "2.8rem",
            background:
              "linear-gradient(to bottom, transparent, rgba(255,255,255,0.18), transparent)",
          }}
        />

        <h1
          style={{
            fontSize: "clamp(2rem, 8vw, 2.8rem)",
            fontWeight: 300,
            lineHeight: 1.14,
            letterSpacing: "-0.025em",
            color: "rgba(255,255,255,0.93)",
            margin: 0,
            wordBreak: "keep-all",
          }}
        >
          다시<br />돌아왔군요
        </h1>

        <p
          style={{
            fontSize: "0.8rem",
            lineHeight: 1.75,
            color: "rgba(255,255,255,0.36)",
            letterSpacing: "0.025em",
            maxWidth: "20rem",
            margin: 0,
            wordBreak: "keep-all",
          }}
        >
          별자리가 당신을 기억합니다.
        </p>

        <div
          aria-hidden="true"
          style={{
            width: "1px",
            height: "2.2rem",
            background:
              "linear-gradient(to bottom, rgba(255,255,255,0.14), transparent)",
          }}
        />
      </div>

      {/* ── 버튼 영역 ── */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "min(100%, 22rem)",
          padding: "0 2rem",
          paddingBottom: "max(3.5rem, env(safe-area-inset-bottom, 3.5rem))",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.75rem",
        }}
      >
        <Link
          href="/phone?flow=login"
          style={{
            display: "block",
            width: "100%",
            padding: "1rem 1.6rem",
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: "0.45rem",
            color: "rgba(255,255,255,0.88)",
            textDecoration: "none",
            textAlign: "center",
            fontSize: "0.84rem",
            letterSpacing: "0.08em",
            fontWeight: 500,
            backdropFilter: "blur(10px)",
          }}
        >
          핸드폰으로 확인하기
        </Link>

        <Link
          href="/login/username"
          style={{
            display: "block",
            width: "100%",
            padding: "1rem 1.6rem",
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "0.45rem",
            color: "rgba(255,255,255,0.45)",
            textDecoration: "none",
            textAlign: "center",
            fontSize: "0.84rem",
            letterSpacing: "0.08em",
            fontWeight: 400,
          }}
        >
          아이디로 확인하기
        </Link>

        <Link
          href="/start"
          style={{
            marginTop: "0.35rem",
            fontSize: "0.72rem",
            color: "rgba(255,255,255,0.22)",
            textDecoration: "none",
            letterSpacing: "0.05em",
          }}
        >
          ← 처음으로
        </Link>
      </div>
    </main>
  );
}
