import crypto from "node:crypto";
import { db } from "@/lib/server/db";

export type OtpSession = {
  countryCode: string;
  nationalNumber: string;
  fullPhoneNumber: string;
  otpHash: string;
  otpSentAt: number;
  otpExpiresAt: number;
  resendAvailableAt: number;
  verificationStatus: boolean;
  failedAttempts: number;
};

function hashOtp(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export function generateOtpCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

export function getOtpSession(fullPhoneNumber: string) {
  const row = db
    .prepare(
      `
      SELECT
        country_code,
        national_number,
        phone_number,
        otp_hash,
        otp_sent_at,
        otp_expires_at,
        resend_available_at,
        verification_status,
        failed_attempts
      FROM otp_sessions
      WHERE phone_number = ?
      `,
    )
    .get(fullPhoneNumber) as
    | {
        country_code: string;
        national_number: string;
        phone_number: string;
        otp_hash: string;
        otp_sent_at: number;
        otp_expires_at: number;
        resend_available_at: number;
        verification_status: number;
        failed_attempts: number;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    countryCode: row.country_code,
    nationalNumber: row.national_number,
    fullPhoneNumber: row.phone_number,
    otpHash: row.otp_hash,
    otpSentAt: row.otp_sent_at,
    otpExpiresAt: row.otp_expires_at,
    resendAvailableAt: row.resend_available_at,
    verificationStatus: Boolean(row.verification_status),
    failedAttempts: row.failed_attempts,
  };
}

export function upsertOtpSession(payload: {
  countryCode: string;
  nationalNumber: string;
  fullPhoneNumber: string;
  otpCode: string;
  otpSentAt: number;
  otpExpiresAt: number;
  resendAvailableAt: number;
}) {
  const now = new Date().toISOString();
  const record: OtpSession = {
    countryCode: payload.countryCode,
    nationalNumber: payload.nationalNumber,
    fullPhoneNumber: payload.fullPhoneNumber,
    otpHash: hashOtp(payload.otpCode),
    otpSentAt: payload.otpSentAt,
    otpExpiresAt: payload.otpExpiresAt,
    resendAvailableAt: payload.resendAvailableAt,
    verificationStatus: false,
    failedAttempts: 0,
  };

  db.prepare(
    `
    INSERT INTO otp_sessions (
      phone_number,
      country_code,
      national_number,
      otp_hash,
      otp_sent_at,
      otp_expires_at,
      resend_available_at,
      verification_status,
      failed_attempts,
      updated_at
    )
    VALUES (
      @phoneNumber,
      @countryCode,
      @nationalNumber,
      @otpHash,
      @otpSentAt,
      @otpExpiresAt,
      @resendAvailableAt,
      0,
      0,
      @updatedAt
    )
    ON CONFLICT(phone_number) DO UPDATE SET
      country_code = excluded.country_code,
      national_number = excluded.national_number,
      otp_hash = excluded.otp_hash,
      otp_sent_at = excluded.otp_sent_at,
      otp_expires_at = excluded.otp_expires_at,
      resend_available_at = excluded.resend_available_at,
      verification_status = 0,
      failed_attempts = 0,
      updated_at = excluded.updated_at
    `,
  ).run({
    phoneNumber: payload.fullPhoneNumber,
    countryCode: payload.countryCode,
    nationalNumber: payload.nationalNumber,
    otpHash: record.otpHash,
    otpSentAt: payload.otpSentAt,
    otpExpiresAt: payload.otpExpiresAt,
    resendAvailableAt: payload.resendAvailableAt,
    updatedAt: now,
  });

  return record;
}

export function verifyOtpCode(fullPhoneNumber: string, otpCode: string) {
  const record = getOtpSession(fullPhoneNumber);

  if (!record) {
    return { ok: false, reason: "missing" as const };
  }

  if (Date.now() > record.otpExpiresAt) {
    return { ok: false, reason: "expired" as const };
  }

  if (record.failedAttempts >= 8) {
    return { ok: false, reason: "too_many_attempts" as const };
  }

  if (record.otpHash !== hashOtp(otpCode)) {
    db.prepare(
      `
      UPDATE otp_sessions
      SET failed_attempts = failed_attempts + 1,
          updated_at = @updatedAt
      WHERE phone_number = @phoneNumber
      `,
    ).run({
      updatedAt: new Date().toISOString(),
      phoneNumber: fullPhoneNumber,
    });

    return { ok: false, reason: "invalid" as const };
  }

  db.prepare(
    `
    UPDATE otp_sessions
    SET verification_status = 1,
        failed_attempts = 0,
        updated_at = @updatedAt
    WHERE phone_number = @phoneNumber
    `,
  ).run({
    updatedAt: new Date().toISOString(),
    phoneNumber: fullPhoneNumber,
  });

  return {
    ok: true,
    reason: "verified" as const,
    record: {
      ...record,
      verificationStatus: true,
      failedAttempts: 0,
    },
  };
}
