"use client";

import { Capacitor } from "@capacitor/core";
import {
  PushNotifications,
  type ActionPerformed,
  type PermissionStatus,
  type Token,
} from "@capacitor/push-notifications";

type PushPermissionState = PermissionStatus["receive"] | "unsupported" | "error";

export type PushRegistrationResult = {
  status: PushPermissionState;
  registered: boolean;
  token?: string;
};

let actionListenerRegistered = false;

function isNativePushSupported(): boolean {
  return Capacitor.isNativePlatform() && ["android", "ios"].includes(Capacitor.getPlatform());
}

function normalizeDeepLink(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (typeof window !== "undefined" && url.origin === window.location.origin) {
        return `${url.pathname}${url.search}${url.hash}`;
      }
      return trimmed;
    } catch {
      return null;
    }
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

async function ensureAndroidChannel() {
  if (Capacitor.getPlatform() !== "android") {
    return;
  }

  try {
    await PushNotifications.createChannel({
      id: "luna-daily",
      name: "오늘의 알림",
      description: "일일 리딩과 분석 알림",
      importance: 5,
      visibility: 1,
    });
  } catch {
  }
}

async function registerForPushToken(): Promise<string> {
  return new Promise(async (resolve, reject) => {
    const handles = [] as Array<{ remove: () => Promise<void> }>;

    const cleanup = async () => {
      for (const handle of handles) {
        try {
          await handle.remove();
        } catch {
        }
      }
    };

    handles.push(await PushNotifications.addListener("registration", async (token: Token) => {
      await cleanup();
      resolve(token.value);
    }));

    handles.push(await PushNotifications.addListener("registrationError", async (error) => {
      await cleanup();
      const message = typeof error?.error === "string" ? error.error : "push_registration_error";
      reject(new Error(message));
    }));

    try {
      await PushNotifications.register();
    } catch (error) {
      await cleanup();
      reject(error);
    }
  });
}

async function postPushRegistration(token: string, permissionState: PermissionStatus["receive"]) {
  const response = await fetch("/api/push/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      platform: Capacitor.getPlatform(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: navigator.language,
      permissionState,
    }),
  });

  if (!response.ok) {
    throw new Error("push_register_failed");
  }
}

export async function syncNativePushRegistration(options?: { prompt?: boolean }): Promise<PushRegistrationResult> {
  if (!isNativePushSupported()) {
    return { status: "unsupported", registered: false };
  }

  try {
    let permissions = await PushNotifications.checkPermissions();
    if (options?.prompt && permissions.receive !== "granted") {
      permissions = await PushNotifications.requestPermissions();
    }

    if (permissions.receive !== "granted") {
      return { status: permissions.receive, registered: false };
    }

    await ensureAndroidChannel();
    const token = await registerForPushToken();
    await postPushRegistration(token, permissions.receive);
    return { status: permissions.receive, registered: true, token };
  } catch {
    return { status: "error", registered: false };
  }
}

function navigateFromPushAction(notification: ActionPerformed["notification"]) {
  const rawDeepLink = notification.data?.deepLink;
  const deepLink = typeof rawDeepLink === "string" ? normalizeDeepLink(rawDeepLink) : null;
  if (typeof window === "undefined") {
    return;
  }

  if (!deepLink) {
    window.location.assign("/home?campaign=push");
    return;
  }

  window.location.assign(deepLink);
}

export async function ensurePushActionListener() {
  if (!isNativePushSupported() || actionListenerRegistered) {
    return;
  }

  actionListenerRegistered = true;
  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    navigateFromPushAction(action.notification);
  });
}