import crypto from "node:crypto";
import type { NextResponse } from "next/server";

export const AUTH_COOKIE_NAME = "luna_auth";

type SessionClaims = {
  userId: string;
  username: string;
  phoneNumber: string;
  loginMethod: "phone" | "username";
  iat: number;
  exp: number;
};

type SessionInput = {
  userId: string;
  username: string;
  phoneNumber: string;
  loginMethod: "phone" | "username";
};

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function getSecret() {
  return process.env.AUTH_SESSION_SECRET?.trim() || "luna-dev-session-secret-change-me";
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(data: string) {
  return crypto.createHmac("sha256", getSecret()).update(data).digest("base64url");
}

export function createSessionToken(input: SessionInput) {
  const now = Math.floor(Date.now() / 1000);
  const claims: SessionClaims = {
    userId: input.userId,
    username: input.username,
    phoneNumber: input.phoneNumber,
    loginMethod: input.loginMethod,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };

  const payload = base64UrlEncode(JSON.stringify(claims));
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

export function verifySessionToken(token: string | null | undefined) {
  if (!token) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [payload, signature] = parts;
  const expected = sign(payload);

  if (signature !== expected) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as Partial<SessionClaims>;

    if (
      !parsed.userId ||
      !parsed.username ||
      !parsed.phoneNumber ||
      (parsed.loginMethod !== "phone" && parsed.loginMethod !== "username") ||
      typeof parsed.exp !== "number" ||
      parsed.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return {
      userId: parsed.userId,
      username: parsed.username,
      phoneNumber: parsed.phoneNumber,
      loginMethod: parsed.loginMethod,
    };
  } catch {
    return null;
  }
}

export function setAuthCookie(response: NextResponse, input: SessionInput) {
  const token = createSessionToken(input);

  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearAuthCookie(response: NextResponse) {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
