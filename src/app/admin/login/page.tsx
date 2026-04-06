"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        router.push("/admin");
        router.refresh();
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "로그인에 실패했습니다.");
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f8f8f7",
        color: "#1a1a1a",
        padding: "1.5rem",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "360px",
        }}
      >
        <p
          style={{
            fontSize: "0.6rem",
            letterSpacing: "0.14em",
            opacity: 0.4,
            marginBottom: "0.3rem",
          }}
        >
          LUNA ADMIN
        </p>
        <h1
          style={{
            fontSize: "1.4rem",
            fontWeight: 600,
            letterSpacing: "-0.02em",
            marginBottom: "2rem",
          }}
        >
          관리자 로그인
        </h1>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div>
            <label
              htmlFor="username"
              style={{
                display: "block",
                fontSize: "0.65rem",
                letterSpacing: "0.08em",
                opacity: 0.45,
                marginBottom: "0.4rem",
              }}
            >
              아이디
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              style={{
                width: "100%",
                padding: "0.75rem 0.9rem",
                borderRadius: "0.5rem",
                border: "1px solid rgba(0,0,0,0.12)",
                background: "#fff",
                fontSize: "0.95rem",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              style={{
                display: "block",
                fontSize: "0.65rem",
                letterSpacing: "0.08em",
                opacity: 0.45,
                marginBottom: "0.4rem",
              }}
            >
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              style={{
                width: "100%",
                padding: "0.75rem 0.9rem",
                borderRadius: "0.5rem",
                border: "1px solid rgba(0,0,0,0.12)",
                background: "#fff",
                fontSize: "0.95rem",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {error && (
            <p
              style={{
                fontSize: "0.78rem",
                color: "#c0392b",
                margin: 0,
              }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: "0.5rem",
              padding: "0.8rem",
              borderRadius: "0.5rem",
              border: "none",
              background: "#1a1a1a",
              color: "#fff",
              fontSize: "0.9rem",
              fontWeight: 500,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "확인 중…" : "로그인"}
          </button>
        </form>
      </div>
    </main>
  );
}
