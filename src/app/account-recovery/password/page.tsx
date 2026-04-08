"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { COUNTRY_DIAL_OPTIONS, DEFAULT_COUNTRY } from "@/lib/onboarding/country-calling-codes";
import {
  isValidNationalNumber,
  isValidPhoneNumber,
  normalizePhoneNumber,
  sanitizeNationalNumber,
} from "@/lib/onboarding/phone";

const OTP_LENGTH = 6;
const DEFAULT_RESEND_COOLDOWN_SECONDS = 60;
const USERNAME_REGEX = /^[a-z0-9._\u3131-\u314e\u314f-\u3163\uac00-\ud7a3]{2,20}$/;

type OtpResponse = {
  success?: boolean;
  canProceedToVerify?: boolean;
  resendAvailableAt?: number;
  error?: string;
};

export default function RecoverPasswordPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [selectedCountryCode, setSelectedCountryCode] = useState(DEFAULT_COUNTRY.dialCode);
  const [countrySheetOpen, setCountrySheetOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [otpSent, setOtpSent] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const filteredCountries = useMemo(() => {
    const query = countrySearch.trim().toLowerCase();

    if (!query) {
      return COUNTRY_DIAL_OPTIONS;
    }

    return COUNTRY_DIAL_OPTIONS.filter((country) => {
      return (
        country.name.toLowerCase().includes(query) ||
        country.dialCode.toLowerCase().includes(query) ||
        country.iso2.toLowerCase().includes(query)
      );
    });
  }, [countrySearch]);

  const selectedCountry = useMemo(() => {
    return COUNTRY_DIAL_OPTIONS.find((country) => country.dialCode === selectedCountryCode) ?? DEFAULT_COUNTRY;
  }, [selectedCountryCode]);

  const normalizedNationalNumber = useMemo(() => sanitizeNationalNumber(phoneNumber), [phoneNumber]);
  const fullPhoneNumber = useMemo(() => {
    return normalizePhoneNumber(normalizedNationalNumber, selectedCountryCode);
  }, [normalizedNationalNumber, selectedCountryCode]);
  const normalizedUsername = useMemo(() => {
    return username
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/@/g, "")
      .replace(/[^a-z0-9._가-힣ㄱ-ㅎㅏ-ㅣ]/g, "")
      .slice(0, 20);
  }, [username]);
  const canSendCode =
    USERNAME_REGEX.test(normalizedUsername) &&
    isValidNationalNumber(selectedCountryCode, normalizedNationalNumber) &&
    isValidPhoneNumber(fullPhoneNumber) &&
    !isSendingCode;
  const passwordsMatch = newPassword.length >= 8 && newPassword === confirmPassword;
  const canSubmit = otpSent && code.length === OTP_LENGTH && passwordsMatch && !isSubmitting;
  const canResend = otpSent && cooldownLeft === 0 && !isSendingCode;

  useEffect(() => {
    if (cooldownLeft <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setCooldownLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [cooldownLeft]);

  function handleCountryPick(dialCode: string) {
    setSelectedCountryCode(dialCode);
    setCountrySheetOpen(false);
    setCountrySearch("");
    setErrorMessage(null);
  }

  function handlePhoneChange(value: string) {
    setPhoneNumber(sanitizeNationalNumber(value).slice(0, 14));
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function handleCodeChange(value: string) {
    setCode(value.replace(/\D/g, "").slice(0, OTP_LENGTH));
    setErrorMessage(null);
  }

  async function sendCode() {
    if (!canSendCode) {
      return;
    }

    try {
      setIsSendingCode(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      const checkResponse = await fetch("/api/auth/recovery/check-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: normalizedUsername,
          fullPhoneNumber,
        }),
      });

      const checkData = (await checkResponse.json()) as { success?: boolean; error?: string };

      if (!checkResponse.ok || !checkData.success) {
        setErrorMessage(checkData.error ?? "입력한 정보와 일치하는 계정을 찾지 못했어요.");
        return;
      }

      const response = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          countryCode: selectedCountryCode,
          nationalNumber: normalizedNationalNumber,
        }),
      });

      const data = (await response.json()) as OtpResponse;

      if (!response.ok && !data.canProceedToVerify) {
        setErrorMessage(data.error ?? "지금은 인증 문자를 보낼 수 없어요.");
        return;
      }

      setOtpSent(true);
      setCode("");
      const nextCooldown = data.resendAvailableAt
        ? Math.max(0, Math.floor((data.resendAvailableAt - Date.now()) / 1000))
        : DEFAULT_RESEND_COOLDOWN_SECONDS;
      setCooldownLeft(nextCooldown);
    } catch {
      setErrorMessage("지금은 인증 문자를 보낼 수 없어요.");
    } finally {
      setIsSendingCode(false);
    }
  }

  async function handleResetPassword() {
    if (!canSubmit) {
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      const response = await fetch("/api/auth/recovery/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: normalizedUsername,
          fullPhoneNumber,
          otpCode: code,
          newPassword,
        }),
      });

      const data = (await response.json()) as { success?: boolean; username?: string; error?: string };

      if (!response.ok || !data.success) {
        setErrorMessage(data.error ?? "비밀번호를 재설정하지 못했어요.");
        return;
      }

      setSuccessMessage("새 비밀번호로 바로 로그인할 수 있어요.");
      setCode("");
      setNewPassword("");
      setConfirmPassword("");
      window.setTimeout(() => {
        router.push("/login/username");
      }, 900);
    } catch {
      setErrorMessage("비밀번호를 재설정하지 못했어요.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="screen screen-dark">
      <section className="step-wrap step-wrap-dark phone-step phone-step-dark" aria-label="Recover password">
        <p className="dark-brand">LUNA</p>
        <h1 className="step-title step-title-strong">비밀번호 재설정</h1>

        <div className="recovery-stack">
          <div className="username-input-wrap">
            <label htmlFor="recoveryUsername" className="a11y-hidden">
              Username
            </label>
            <div className="username-entry-line">
              <span className="username-prefix" aria-hidden="true">
                @
              </span>
              <input
                id="recoveryUsername"
                name="recoveryUsername"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="아이디"
                className="username-input-core"
                value={normalizedUsername}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
          </div>

          <div className="phone-entry-line phone-entry-line-dark">
            <button
              type="button"
              className="country-trigger country-trigger-dark"
              aria-label="Choose country code"
              onClick={() => setCountrySheetOpen(true)}
            >
              <span>{selectedCountryCode}</span>
              <span className="country-trigger-arrow country-trigger-arrow-dark" aria-hidden="true">
                ▾
              </span>
            </button>

            <label htmlFor="recoveryPhone" className="a11y-hidden">
              Phone number
            </label>
            <input
              id="recoveryPhone"
              name="recoveryPhone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="10 1234 5678"
              value={phoneNumber}
              onChange={(event) => handlePhoneChange(event.target.value)}
              className="phone-input phone-input-dark"
            />
          </div>

          <p className="dark-copy">아이디와 가입 전화번호를 확인한 뒤 인증번호를 보내드려요.</p>

          <button type="button" className="cta cta-solid" onClick={sendCode} disabled={!canSendCode}>
            {otpSent ? "인증번호 다시 받기" : isSendingCode ? "전송 중..." : "인증번호 받기"}
          </button>

          {otpSent ? (
            <div className="recovery-otp-block">
              <p className="phone-verify-target">{fullPhoneNumber}</p>

              <label htmlFor="recoveryOtpCode" className="a11y-hidden">
                Verification code
              </label>
              <input
                id="recoveryOtpCode"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="otp-input"
                value={code}
                onChange={(event) => handleCodeChange(event.target.value)}
                placeholder="000000"
              />

              <div className="otp-actions">
                <button type="button" className="otp-link" disabled={!canResend} onClick={sendCode}>
                  {canResend ? "인증번호 다시 보내기" : `${cooldownLeft}초 후 재전송`}
                </button>
                <button type="button" className="otp-link" onClick={() => setOtpSent(false)}>
                  정보 다시 입력
                </button>
              </div>

              <input
                type="password"
                autoComplete="new-password"
                placeholder="새 비밀번호"
                className="field-dark"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />

              <input
                type="password"
                autoComplete="new-password"
                placeholder="새 비밀번호 확인"
                className="field-dark"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />

              {!passwordsMatch && confirmPassword ? <p className="dark-copy">비밀번호가 서로 다르거나 8자 미만이에요.</p> : null}

              <button type="button" className="cta cta-solid" onClick={handleResetPassword} disabled={!canSubmit}>
                {isSubmitting ? "재설정 중..." : "비밀번호 바꾸기"}
              </button>
            </div>
          ) : null}

          {errorMessage ? <p className="dark-copy">{errorMessage}</p> : null}
          {successMessage ? <p className="dark-copy">{successMessage}</p> : null}
        </div>

        <div className="recovery-link-row">
          <Link href="/account-recovery/username" className="tiny-link">
            아이디 찾기
          </Link>
          <Link href="/login/username" className="tiny-link">
            로그인으로 돌아가기
          </Link>
        </div>

        {countrySheetOpen ? (
          <div className="country-sheet-backdrop" role="presentation" onClick={() => setCountrySheetOpen(false)}>
            <section
              className="country-sheet country-sheet-dark"
              aria-label="Country code list"
              onClick={(event) => event.stopPropagation()}
            >
              <input
                type="text"
                className="country-search country-search-dark"
                placeholder="국가 또는 국가번호 검색"
                value={countrySearch}
                onChange={(event) => setCountrySearch(event.target.value)}
              />

              <ul className="country-list" aria-live="polite">
                {filteredCountries.map((country) => (
                  <li key={`${country.iso2}-${country.dialCode}`}>
                    <button
                      type="button"
                      className={`country-option country-option-dark ${selectedCountry.iso2 === country.iso2 ? "country-option-active" : ""}`}
                      onClick={() => handleCountryPick(country.dialCode)}
                    >
                      <span>{country.name}</span>
                      <span>{country.dialCode}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}