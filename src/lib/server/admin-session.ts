import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextResponse } from "next/server";

export const ADMIN_COOKIE_NAME = "luna_admin";
const ADMIN_SESSION_TTL = 60 * 60 * 8; // 8시간

function getSecret() {
  return process.env.AUTH_SESSION_SECRET?.trim() || "luna-dev-session-secret-change-me";
}

function sign(data: string) {
  return crypto.createHmac("sha256", getSecret()).update(data).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // 타이밍 공격 방지: 길이가 달라도 동일한 시간 소요
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyAdminCredentials(username: string, password: string): boolean {
  const adminUsername = process.env.ADMIN_USERNAME?.trim() ?? "";
  const adminPassword = process.env.ADMIN_PASSWORD?.trim() ?? "";
  if (!adminUsername || !adminPassword) return false;
  return safeEqual(username, adminUsername) && safeEqual(password, adminPassword);
}

export function createAdminToken(): string {
  const exp = Math.floor(Date.now() / 1000) + ADMIN_SESSION_TTL;
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

export function verifyAdminToken(token: string | null | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;
  if (sign(payload) !== signature) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      exp?: unknown;
    };
    return typeof parsed.exp === "number" && parsed.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export async function requireAdminAuth(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!verifyAdminToken(token)) {
    redirect("/admin/login");
  }
}

export function setAdminCookie(response: NextResponse) {
  const token = createAdminToken();
  response.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_TTL,
  });
}

export function clearAdminCookie(response: NextResponse) {
  response.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
