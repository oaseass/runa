"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  AUTH_COOKIE_NAME,
  verifySessionToken,
  createSessionToken,
} from "@/lib/server/auth-session";
import { verifyAccountDraftPassword } from "@/lib/server/account-draft-store";
import { changeUsername, upsertUserPreferences } from "@/lib/server/settings-store";

// ── Logout ────────────────────────────────────────────────────────────────────

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set({
    name: AUTH_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  redirect("/start");
}

// ── Change username ───────────────────────────────────────────────────────────

export type UsernameActionState = {
  success: boolean;
  error?: "wrong-password" | "taken" | "invalid" | "auth" | "same";
  newUsername?: string;
} | null;

export async function changeUsernameAction(
  _prevState: UsernameActionState,
  formData: FormData,
): Promise<UsernameActionState> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const claims = verifySessionToken(token);
  if (!claims) return { success: false, error: "auth" };

  const newUsername = (formData.get("newUsername") as string | null)?.trim() ?? "";
  const password    = (formData.get("currentPassword") as string | null) ?? "";

  if (!newUsername) return { success: false, error: "invalid" };
  if (newUsername.toLowerCase() === claims.username.toLowerCase()) {
    return { success: false, error: "same" };
  }

  // Verify current password
  const verified = verifyAccountDraftPassword(claims.username, password);
  if (!verified) return { success: false, error: "wrong-password" };

  const result = changeUsername(claims.userId, newUsername);
  if (result === "taken")  return { success: false, error: "taken" };
  if (result === "invalid") return { success: false, error: "invalid" };

  // Re-issue session cookie with new username
  const newToken = createSessionToken({
    userId:      claims.userId,
    username:    newUsername,
    phoneNumber: claims.phoneNumber,
    loginMethod: claims.loginMethod,
  });

  cookieStore.set({
    name: AUTH_COOKIE_NAME,
    value: newToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  revalidatePath("/settings");

  return { success: true, newUsername };
}

// ── Notification preferences ──────────────────────────────────────────────────

export type NotifActionState = { success: boolean } | null;

export async function updateNotificationAction(
  _prevState: NotifActionState,
  formData: FormData,
): Promise<NotifActionState> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const claims = verifySessionToken(token);
  if (!claims) return { success: false };

  const dailyReading  = formData.get("notifyDailyReading")  === "1";
  const analysisDone  = formData.get("notifyAnalysisDone")  === "1";

  upsertUserPreferences(claims.userId, {
    notifyDailyReading: dailyReading,
    notifyAnalysisDone: analysisDone,
  });

  revalidatePath("/settings");
  return { success: true };
}
