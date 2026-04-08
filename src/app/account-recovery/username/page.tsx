"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { COUNTRY_DIAL_OPTIONS, DEFAULT_COUNTRY } from "@/lib/onboarding/country-calling-codes";
import {
  isValidNationalNumber,
  isValidPhoneNumber,
  normalizePhoneNumber,
  sanitizeNationalNumber,
} from "@/lib/onboarding/phone";

const OTP_LENGTH = 6;
const DEFAULT_RESEND_COOLDOWN_SECONDS = 60;

type OtpResponse = {
  success?: boolean;
  canProceedToVerify?: boolean;
  countryCode?: string;
  nationalNumber?: string;
  fullPhoneNumber?: string;
  otpSentAt?: number;
  otpExpiresAt?: number;
  resendAvailableAt?: number;
  error?: string;
};

function formatCreatedAt(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "가입일 정보를 불러오지 못했어요.";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(parsed);
}

export default function RecoverUsernamePage() {
  const [selectedCountryCode, setSelectedCountryCode] = useState(DEFAULT_COUNTRY.dialCode);
  const [countrySheetOpen, setCountrySheetOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [otpSent, setOtpSent] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<{ username: string; createdAt: string } | null>(null);

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
  const canSendCode =
    isValidNationalNumber(selectedCountryCode, normalizedNationalNumber) &&
    isValidPhoneNumber(fullPhoneNumber) &&
    !isSendingCode;
  const canSubmit = otpSent && code.length === OTP_LENGTH && !isSubmitting;
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
    setResult(null);
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
      setResult(null);

      const phoneCheckResponse = await fetch(`/api/auth/check-phone?phone=${encodeURIComponent(fullPhoneNumber)}`);
      const phoneCheckData = (await phoneCheckResponse.json()) as { exists?: boolean; error?: string };

      if (!phoneCheckResponse.ok) {
        setErrorMessage(phoneCheckData.error ?? "전화번호를 확인하지 못했어요.");
        return;
      }

      if (!phoneCheckData.exists) {
        setErrorMessage("등록된 계정을 찾지 못했어요.");
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

  async function handleSubmit() {
    if (!canSubmit) {
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const response = await fetch("/api/auth/recovery/find-username", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullPhoneNumber,
          otpCode: code,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        username?: string;
        createdAt?: string;
        error?: string;
      };

      if (!response.ok || !data.success || !data.username || !data.createdAt) {
        setErrorMessage(data.error ?? "아이디를 찾지 못했어요.");
        return;
      }

      setResult({ username: data.username, createdAt: data.createdAt });
    } catch {
      setErrorMessage("아이디를 찾지 못했어요.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="screen screen-dark">
      <section className="step-wrap step-wrap-dark phone-step phone-step-dark" aria-label="Recover username">
        <p className="dark-brand">LUNA</p>
        <h1 className="step-title step-title-strong">아이디 찾기</h1>

        <div className="phone-entry-wrap recovery-stack">
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

            <label htmlFor="recoverPhone" className="a11y-hidden">
              Phone number
            </label>
            <input
              id="recoverPhone"
              name="recoverPhone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="10 1234 5678"
              value={phoneNumber}
              onChange={(event) => handlePhoneChange(event.target.value)}
              className="phone-input phone-input-dark"
            />
          </div>

          <p className="dark-copy">가입 때 등록한 번호로 인증하면 아이디를 바로 보여드려요.</p>

          <button type="button" className="cta cta-solid" onClick={sendCode} disabled={!canSendCode}>
            {otpSent ? "인증번호 다시 받기" : isSendingCode ? "전송 중..." : "인증번호 받기"}
          </button>

          {otpSent ? (
            <div className="phone-verify-wrap recovery-otp-block">
              <p className="phone-verify-target">{fullPhoneNumber}</p>

              <label htmlFor="recoverCode" className="a11y-hidden">
                Verification code
              </label>
              <input
                id="recoverCode"
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
                  번호 바꾸기
                </button>
              </div>

              <button type="button" className="cta cta-solid" onClick={handleSubmit} disabled={!canSubmit}>
                {isSubmitting ? "확인 중..." : "아이디 확인"}
              </button>
            </div>
          ) : null}

          {result ? (
            <section className="recovery-result-card" aria-label="Recovered username">
              <p className="recovery-result-label">찾은 아이디</p>
              <p className="recovery-result-value">@{result.username}</p>
              <p className="dark-copy">가입일 {formatCreatedAt(result.createdAt)}</p>
              <Link href="/login/username" className="cta cta-solid">
                아이디로 로그인하기
              </Link>
            </section>
          ) : null}

          {errorMessage ? <p className="dark-copy">{errorMessage}</p> : null}
        </div>

        <div className="recovery-link-row">
          <Link href="/account-recovery/password" className="tiny-link">
            비밀번호 재설정
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