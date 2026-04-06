"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getPhoneData } from "@/lib/onboarding/phone-storage";
import { getUsernameData } from "@/lib/onboarding/username-storage";
import { saveAccountDraft } from "@/lib/onboarding/account-draft-storage";
import { getBirthTimeSelection } from "@/lib/onboarding/birth-time-storage";
import { getBirthPlaceSelection } from "@/lib/onboarding/birth-place-storage";

const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export default function PasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPhoneTaken, setIsPhoneTaken] = useState(false);

  useEffect(() => {
    const usernameData = getUsernameData();
    const phoneData = getPhoneData();

    if (!phoneData) {
      router.replace("/phone");
      return;
    }

    if (!usernameData) {
      router.replace("/username");
    }
  }, [router]);

  const canContinue = useMemo(() => PASSWORD_REGEX.test(password), [password]);

  function handleContinue() {
    if (!canContinue || isSaving) {
      return;
    }

    void (async () => {
      const usernameData = getUsernameData();
      const phoneData = getPhoneData();
      const birthTime = getBirthTimeSelection();
      const birthPlace = getBirthPlaceSelection();

      if (!usernameData || !phoneData) {
        router.replace("/username");
        return;
      }

      try {
        setIsSaving(true);
        setErrorMessage(null);
        setIsPhoneTaken(false);

        const response = await fetch("/api/auth/create-account-draft", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: usernameData.username,
            password,
            fullPhoneNumber: phoneData.fullPhoneNumber,
            verificationStatus: phoneData.verificationStatus,
            birthTime,
            birthPlace,
          }),
        });

        const data = (await response.json()) as {
          success?: boolean;
          error?: string;
          draft?: {
            id: string;
            username: string;
            phoneNumber: string;
            createdAt: string;
          };
        };

        if (!response.ok || !data.success || !data.draft) {
          if (data.error === "이미 등록된 전화번호예요.") {
            setIsPhoneTaken(true);
          }
          setErrorMessage(data.error ?? "계정 정보를 저장하지 못했어요");
          return;
        }

        saveAccountDraft({
          draftId: data.draft.id,
          username: data.draft.username,
          phoneNumber: data.draft.phoneNumber,
          createdAt: data.draft.createdAt,
        });

        router.push("/permissions");
      } catch {
        setErrorMessage("계정 정보를 저장하지 못했어요");
      } finally {
        setIsSaving(false);
      }
    })();
  }

  return (
    <main className="screen screen-dark">
      <section className="step-wrap step-wrap-dark" aria-label="Password step">
        <p className="dark-brand">LUNA</p>
        <h1 className="step-title step-title-strong">비밀번호 설정</h1>

        <div>
          <label htmlFor="password" className="a11y-hidden">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="비밀번호"
            className="field-dark"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <button type="button" className="cta cta-solid" disabled={!canContinue || isSaving} onClick={handleContinue}>
          {isSaving ? "저장 중..." : "저장하고 계속"}
        </button>

        {errorMessage ? <p className="dark-copy">{errorMessage}</p> : null}

        {isPhoneTaken ? (
          <div style={{ display: "grid", gap: "0.56rem", marginTop: "0.25rem" }}>
            <Link href="/login/username" className="cta cta-solid">
              로그인하기
            </Link>
            <Link href="/account-access" className="cta account-access-ghost">
              아이디 찾기
            </Link>
          </div>
        ) : null}
      </section>
    </main>
  );
}
