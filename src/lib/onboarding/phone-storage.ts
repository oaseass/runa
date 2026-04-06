export const PHONE_STORAGE_KEY = "luna.onboarding.phone";

export type PhoneVerificationStatus = "idle" | "otp_sent" | "verified";

export type StoredPhoneData = {
  countryCode: string;
  nationalNumber: string;
  fullPhoneNumber: string;
  otpSentAt: number | null;
  otpExpiresAt: number | null;
  resendAvailableAt: number | null;
  verificationStatus: PhoneVerificationStatus;
};

export function savePhoneData(payload: StoredPhoneData) {
  sessionStorage.setItem(PHONE_STORAGE_KEY, JSON.stringify(payload));
}

export function mergePhoneData(patch: Partial<StoredPhoneData>) {
  const current = getPhoneData();

  if (!current) {
    return;
  }

  savePhoneData({
    ...current,
    ...patch,
  });
}

export function getPhoneData(): StoredPhoneData | null {
  const raw = sessionStorage.getItem(PHONE_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredPhoneData>;

    if (
      !parsed.countryCode ||
      !parsed.nationalNumber ||
      !parsed.fullPhoneNumber ||
      parsed.otpSentAt === undefined ||
      parsed.otpExpiresAt === undefined ||
      parsed.resendAvailableAt === undefined ||
      !parsed.verificationStatus
    ) {
      return null;
    }

    return {
      countryCode: parsed.countryCode,
      nationalNumber: parsed.nationalNumber,
      fullPhoneNumber: parsed.fullPhoneNumber,
      otpSentAt: parsed.otpSentAt,
      otpExpiresAt: parsed.otpExpiresAt,
      resendAvailableAt: parsed.resendAvailableAt,
      verificationStatus: parsed.verificationStatus,
    };
  } catch {
    return null;
  }
}
