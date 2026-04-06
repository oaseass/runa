export const USERNAME_STORAGE_KEY = "luna.onboarding.username";

export type StoredUsernameData = {
  username: string;
};

export function saveUsernameData(payload: StoredUsernameData) {
  sessionStorage.setItem(USERNAME_STORAGE_KEY, JSON.stringify(payload));
}

export function getUsernameData(): StoredUsernameData | null {
  const raw = sessionStorage.getItem(USERNAME_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredUsernameData>;

    if (!parsed.username) {
      return null;
    }

    return {
      username: parsed.username,
    };
  } catch {
    return null;
  }
}
