import "server-only";
import { Redis } from "@upstash/redis";

const AUTH_KEY_PREFIX = "luna:auth:v1";

export class AuthStorageConfigurationError extends Error {
  constructor(message = "외부 인증 저장소가 설정되지 않았어요.") {
    super(message);
    this.name = "AuthStorageConfigurationError";
  }
}

export type StoredOnboardingProfile = {
  birthTime?: {
    birthDate: string | null;
    hour: number;
    minute: number;
    formatted: string;
  } | null;
  birthPlace?: {
    placeId: string;
    fullText: string;
    mainText: string;
    secondaryText: string;
    latitude: number | null;
    longitude: number | null;
    timezone: string | null;
  } | null;
};

export type StoredAuthAccount = {
  id: string;
  username: string;
  phoneNumber: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
  onboardingProfile?: StoredOnboardingProfile | null;
};

export type StoredOtpSession = {
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

let redisClient: Redis | null = null;

function getRedisUrl() {
  return process.env.UPSTASH_REDIS_REST_URL?.trim() || process.env.KV_REST_API_URL?.trim() || process.env.KV_REST_URL?.trim() || "";
}

function getRedisToken() {
  return process.env.UPSTASH_REDIS_REST_TOKEN?.trim() || process.env.KV_REST_API_TOKEN?.trim() || "";
}

export function hasExternalAuthStorageConfig() {
  return Boolean(getRedisUrl() && getRedisToken());
}

function isVercelRuntime() {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV?.trim());
}

export function getExternalAuthStorage() {
  const url = getRedisUrl();
  const token = getRedisToken();

  if (!url || !token) {
    if (isVercelRuntime()) {
      throw new AuthStorageConfigurationError(
        "Upstash Redis 인증 저장소가 없어요. Vercel에 UPSTASH_REDIS_REST_URL과 UPSTASH_REDIS_REST_TOKEN을 추가해 주세요.",
      );
    }

    return null;
  }

  if (!redisClient) {
    redisClient = new Redis({ url, token });
  }

  return redisClient;
}

export function normalizeAuthUsername(username: string) {
  return username.trim().toLowerCase();
}

export function authUserKey(userId: string) {
  return `${AUTH_KEY_PREFIX}:user:id:${userId}`;
}

export function authUserByUsernameKey(username: string) {
  return `${AUTH_KEY_PREFIX}:user:username:${normalizeAuthUsername(username)}`;
}

export function authUserByPhoneKey(phoneNumber: string) {
  return `${AUTH_KEY_PREFIX}:user:phone:${phoneNumber.trim()}`;
}

export function authOtpKey(phoneNumber: string) {
  return `${AUTH_KEY_PREFIX}:otp:${phoneNumber.trim()}`;
}