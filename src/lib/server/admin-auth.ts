import { verifySessionToken } from "./auth-session";

export function getAdminPhoneNumbers(): string[] {
  const raw = process.env.ADMIN_PHONE_NUMBERS?.trim() ?? "";
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

export function isAdminToken(token: string | null | undefined): boolean {
  const claims = verifySessionToken(token);
  if (!claims) return false;
  const admins = getAdminPhoneNumbers();
  return admins.includes(claims.phoneNumber);
}
