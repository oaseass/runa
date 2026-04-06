"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { COUNTRY_DIAL_OPTIONS, DEFAULT_COUNTRY } from "@/lib/onboarding/country-calling-codes";
import { getBirthPlaceSelection } from "@/lib/onboarding/birth-place-storage";
import {
  isValidNationalNumber,
  isValidPhoneNumber,
  normalizePhoneNumber,
  sanitizeNationalNumber,
} from "@/lib/onboarding/phone";
import { savePhoneData } from "@/lib/onboarding/phone-storage";

function PhonePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isLoginFlow = searchParams.get("flow") === "login";
  const [selectedCountryCode, setSelectedCountryCode] = useState(DEFAULT_COUNTRY.dialCode);
  const [countrySheetOpen, setCountrySheetOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isLoginFlow) {
      return;
    }

    const birthPlace = getBirthPlaceSelection();

    if (!birthPlace) {
      router.replace("/birth-place");
    }
  }, [isLoginFlow, router]);

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
    return (
      COUNTRY_DIAL_OPTIONS.find((country) => country.dialCode === selectedCountryCode) ?? DEFAULT_COUNTRY
    );
  }, [selectedCountryCode]);

  const normalizedNationalNumber = useMemo(() => sanitizeNationalNumber(phoneNumber), [phoneNumber]);
  const fullPhoneNumber = useMemo(() => {
    return normalizePhoneNumber(normalizedNationalNumber, selectedCountryCode);
  }, [normalizedNationalNumber, selectedCountryCode]);

  const canContinue =
    isValidNationalNumber(selectedCountryCode, normalizedNationalNumber) &&
    isValidPhoneNumber(fullPhoneNumber);

  function handleCountryPick(dialCode: string) {
    setSelectedCountryCode(dialCode);
    setCountrySheetOpen(false);
    setCountrySearch("");
    setErrorMessage(null);
  }

  function handlePhoneChange(value: string) {
    const digits = sanitizeNationalNumber(value).slice(0, 14);
    setPhoneNumber(digits);
    setErrorMessage(null);
  }

  function handleContinue() {
    if (!canContinue || isSendingCode) {
      return;
    }

    void (async () => {
      try {
        setIsSendingCode(true);
        setErrorMessage(null);

        if (!isLoginFlow) {
          const res = await fetch(`/api/auth/check-phone?phone=${encodeURIComponent(fullPhoneNumber)}`);
          const data = (await res.json()) as { exists?: boolean };

          if (data.exists) {
            setErrorMessage("이미 가입된 번호예요. 로그인해 주세요.");
            return;
          }
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

        const data = (await response.json()) as {
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

        if (!response.ok && !data.canProceedToVerify) {
          setErrorMessage(data.error ?? "인증번호를 전송할 수 없어요");
          return;
        }

        savePhoneData({
          countryCode: data.countryCode ?? selectedCountryCode,
          nationalNumber: data.nationalNumber ?? normalizedNationalNumber,
          fullPhoneNumber: data.fullPhoneNumber ?? fullPhoneNumber,
          otpSentAt: data.otpSentAt ?? Date.now(),
          otpExpiresAt: data.otpExpiresAt ?? null,
          resendAvailableAt: data.resendAvailableAt ?? null,
          verificationStatus: "otp_sent",
        });

        router.push(isLoginFlow ? "/phone/verify?flow=login" : "/phone/verify");
      } catch {
        setErrorMessage(isLoginFlow ? "인증번호를 전송할 수 없어요" : "전화번호 확인 또는 인증번호 전송 중 오류가 발생했어요");
      } finally {
        setIsSendingCode(false);
      }
    })();
  }

  return (
    <main className="screen screen-dark">
      <section className="step-wrap step-wrap-dark phone-step phone-step-dark" aria-label="Phone step">
        <p className="dark-brand">LUNA</p>
        <h1 className="step-title step-title-strong">{isLoginFlow ? "로그인 확인" : "전화번호"}</h1>

        <div className="phone-entry-wrap">
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

            <label htmlFor="phone" className="a11y-hidden">
              Phone number
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="10 1234 5678"
              value={phoneNumber}
              onChange={(event) => handlePhoneChange(event.target.value)}
              className="phone-input phone-input-dark"
            />
          </div>

          <p className="dark-copy">
            {isLoginFlow
              ? "등록된 번호로 인증을 완료하면 바로 메인으로 이동합니다."
              : "가입 확인을 위해 인증 가능한 번호로 문자를 받아야 합니다."}
          </p>
          {errorMessage ? <p className="dark-copy">{errorMessage}</p> : null}
          {errorMessage === "이미 가입된 번호예요. 로그인해 주세요." ? (
            <Link href="/phone?flow=login" className="cta cta-solid" style={{ marginTop: "0.5rem" }}>
              로그인하기
            </Link>
          ) : null}
        </div>

        <div className="phone-cta-row">
          <button
            type="button"
            className="arrow-cta arrow-cta-dark"
            aria-label={isLoginFlow ? "Send verification code" : "Continue to username"}
            onClick={handleContinue}
            disabled={!canContinue || isSendingCode}
          >
            {isSendingCode ? "..." : "→"}
          </button>
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

export default function PhonePage() {
  return <Suspense><PhonePageInner /></Suspense>;
}
