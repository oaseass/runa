"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getPhoneData } from "@/lib/onboarding/phone-storage";
import { saveUsernameData } from "@/lib/onboarding/username-storage";

const USERNAME_REGEX = /^[a-z0-9._가-힣ㄱ-ㅎㅏ-ㅣ]{2,20}$/;

export default function UsernamePage() {
  const router = useRouter();
  const [username, setUsername] = useState("");

  useEffect(() => {
    const phoneData = getPhoneData();

    if (!phoneData) {
      router.replace("/phone");
    }
  }, [router]);

  const canContinue = useMemo(() => USERNAME_REGEX.test(username), [username]);

  function handleUsernameChange(value: string) {
    const normalized = value
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/@/g, "")
      .replace(/[^a-z0-9._가-힣ㄱ-ㅎㅏ-ㅣ]/g, "")
      .slice(0, 20);

    setUsername(normalized);
  }

  function handleContinue() {
    if (!canContinue) {
      return;
    }

    saveUsernameData({ username });

    router.push("/password");
  }

  return (
    <main className="screen screen-dark">
      <section className="step-wrap step-wrap-dark username-step" aria-label="Username step">
        <p className="dark-brand">LUNA</p>
        <h1 className="step-title step-title-strong">아이디 만들기</h1>

        <div className="username-input-wrap">
          <label htmlFor="username" className="a11y-hidden">
            Username
          </label>
          <div className="username-entry-line">
            <span className="username-prefix" aria-hidden="true">
              @
            </span>
            <input
              id="username"
              name="username"
              type="text"
              inputMode="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="아이디"
              className="username-input-core"
              value={username}
              onChange={(event) => handleUsernameChange(event.target.value)}
            />
          </div>
        </div>
      </section>

      <div className="username-cta-row">
        <button
          type="button"
          className="arrow-cta arrow-cta-dark"
          aria-label="Continue to password"
          disabled={!canContinue}
          onClick={handleContinue}
        >
          →
        </button>
      </div>
    </main>
  );
}
