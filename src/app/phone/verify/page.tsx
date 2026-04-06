"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getPhoneData, mergePhoneData } from "@/lib/onboarding/phone-storage";

const OTP_LENGTH = 6;
const DEFAULT_RESEND_COOLDOWN_SECONDS = 60;

function PhoneVerifyPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isLoginFlow = searchParams.get("flow") === "login";
  const [phoneDataReady, setPhoneDataReady] = useState(false);
  const [fullPhoneNumber, setFullPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cooldownLeft, setCooldownLeft] = useState(0);

  useEffect(() => {
    const phoneData = getPhoneData();

    if (!phoneData || phoneData.verificationStatus === "verified") {
      router.replace("/phone");
      return;
    }

    if (!phoneData.otpSentAt) {
      router.replace("/phone");
      return;
    }

    setFullPhoneNumber(phoneData.fullPhoneNumber);

    const fallbackResendAt = phoneData.otpSentAt + DEFAULT_RESEND_COOLDOWN_SECONDS * 1000;
    const resendAvailableAt = phoneData.resendAvailableAt ?? fallbackResendAt;
    const left = Math.max(0, Math.floor((resendAvailableAt - Date.now()) / 1000));
    setCooldownLeft(left);
    setPhoneDataReady(true);
  }, [router]);

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

  const canVerify = useMemo(() => code.length === OTP_LENGTH, [code]);
  const canResend = cooldownLeft === 0 && !isResending;

  function handleCodeChange(value: string) {
    setErrorMessage(null);
    const digitsOnly = value.replace(/\D/g, "").slice(0, OTP_LENGTH);
    setCode(digitsOnly);
  }

  async function handleVerify() {
    if (!canVerify || !fullPhoneNumber || isVerifying) {
      return;
    }

    try {
      setIsVerifying(true);
      setErrorMessage(null);

      const response = await fetch("/api/auth/verify-otp", {
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
        verificationStatus?: boolean;
        verified?: boolean;
        accountExists?: boolean;
        account?: {
          id: string;
          username: string;
          phoneNumber: string;
          createdAt: string;
        };
        error?: string;
      };

      const isVerified = data.verificationStatus ?? data.verified ?? false;

      if (!response.ok || !data.success || !isVerified) {
        setErrorMessage(data.error ?? "인증번호를 확인해 주세요.");
        return;
      }

      mergePhoneData({ verificationStatus: "verified" });

      if (isLoginFlow) {
        if (data.accountExists) {
          router.push("/home");
          return;
        }

        setErrorMessage("등록된 계정을 찾지 못했어요. 새로 시작하기로 가입을 진행해 주세요.");
        return;
      }

      router.push("/username");
    } catch {
      setErrorMessage("인증을 완료하지 못했어요.");
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleResendCode() {
    if (!fullPhoneNumber || !canResend) {
      return;
    }

    try {
      setIsResending(true);
      setErrorMessage(null);

      const phoneData = getPhoneData();

      if (!phoneData) {
        router.replace("/phone");
        return;
      }

      const response = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          countryCode: phoneData.countryCode,
          nationalNumber: phoneData.nationalNumber,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        otpSentAt?: number;
        otpExpiresAt?: number;
        resendAvailableAt?: number;
        error?: string;
      };

      if (!response.ok || !data.success) {
        setErrorMessage(data.error ?? "지금은 인증번호를 보낼 수 없어요.");
        return;
      }

      mergePhoneData({
        otpSentAt: data.otpSentAt ?? Date.now(),
        otpExpiresAt: data.otpExpiresAt ?? null,
        resendAvailableAt: data.resendAvailableAt ?? null,
        verificationStatus: "otp_sent",
      });

      const nextCooldown = data.resendAvailableAt
        ? Math.max(0, Math.floor((data.resendAvailableAt - Date.now()) / 1000))
        : DEFAULT_RESEND_COOLDOWN_SECONDS;

      setCooldownLeft(nextCooldown);
    } catch {
      setErrorMessage("지금은 인증번호를 보낼 수 없어요.");
    } finally {
      setIsResending(false);
    }
  }

  if (!phoneDataReady) {
    return null;
  }

  return (
    <main className="screen screen-light">
      <section className="step-wrap step-wrap-light phone-verify-step" aria-label="Phone verification step">
        <p className="step-note">Enter the 6-digit code</p>

        <div className="phone-verify-wrap">
          <p className="phone-verify-target">{fullPhoneNumber}</p>

          <label htmlFor="otpCode" className="a11y-hidden">
            Verification code
          </label>
          <input
            id="otpCode"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            className="otp-input"
            value={code}
            onChange={(event) => handleCodeChange(event.target.value)}
            placeholder="000000"
          />

          <div className="otp-actions">
            <button
              type="button"
              className="otp-link"
              disabled={!canResend}
              onClick={handleResendCode}
            >
              {canResend ? "Resend code" : `Resend in ${cooldownLeft}s`}
            </button>
            <Link href={isLoginFlow ? "/phone?flow=login" : "/phone"} className="otp-link">
              Change number
            </Link>
          </div>

          {errorMessage ? <p className="policy-note">{errorMessage}</p> : null}
        </div>

        <div className="phone-cta-row">
          <button
            type="button"
            className="arrow-cta"
            aria-label="Verify code"
            onClick={handleVerify}
            disabled={!canVerify || isVerifying}
          >
            {isVerifying ? "..." : "→"}
          </button>
        </div>
      </section>
    </main>
  );
}

export default function PhoneVerifyPage() {
  return <Suspense><PhoneVerifyPageInner /></Suspense>;
}
