"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

const USERNAME_REGEX = /^[a-z0-9._\u3131-\u314e\u314f-\u3163\uac00-\ud7a3]{2,20}$/;

export default function LoginByUsernamePage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function normalizeUsername(value: string) {
    return value
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/@/g, "")
      .replace(/[^a-z0-9._가-힣ㄱ-ㅎㅏ-ㅣ]/g, "")
      .slice(0, 20);
  }

  const canSubmit = USERNAME_REGEX.test(username) && password.length >= 8;

  async function handleSubmit() {
    if (!canSubmit || isSubmitting) {
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const response = await fetch("/api/auth/login-by-username", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        account?: {
          id: string;
          username: string;
          phoneNumber: string;
          createdAt: string;
        };
      };

      if (!response.ok || !data.success || !data.account) {
        setErrorMessage(data.error ?? "로그인에 실패했어요.");
        return;
      }

      router.push("/home");
    } catch {
      setErrorMessage("로그인에 실패했어요.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="screen screen-dark">
      <section className="step-wrap step-wrap-dark" aria-label="Login by username">
        <p className="dark-brand">LUNA</p>
        <h1 className="step-title step-title-strong">아이디로 로그인</h1>

        <div className="username-input-wrap">
          <label htmlFor="loginUsername" className="a11y-hidden">
            아이디
          </label>
          <div className="username-entry-line">
            <span className="username-prefix" aria-hidden="true">
              @
            </span>
            <input
              id="loginUsername"
              name="loginUsername"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="아이디"
              className="username-input-core"
              value={username}
              onChange={(event) => setUsername(normalizeUsername(event.target.value))}
            />
          </div>
        </div>

        <div>
          <label htmlFor="loginPassword" className="a11y-hidden">
            비밀번호
          </label>
          <input
            id="loginPassword"
            name="loginPassword"
            type="password"
            autoComplete="current-password"
            placeholder="비밀번호"
            className="field-dark"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <button type="button" className="cta cta-solid" onClick={handleSubmit} disabled={!canSubmit || isSubmitting}>
          {isSubmitting ? "확인 중..." : "로그인 완료"}
        </button>

        <div className="recovery-link-row recovery-link-row-centered">
          <Link href="/account-recovery/username" className="tiny-link">
            아이디 찾기
          </Link>
          <Link href="/account-recovery/password" className="tiny-link">
            비밀번호 재설정
          </Link>
        </div>

        {errorMessage ? <p className="dark-copy">{errorMessage}</p> : null}
      </section>
    </main>
  );
}
