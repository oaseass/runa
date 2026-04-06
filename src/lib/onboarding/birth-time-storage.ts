export const BIRTH_TIME_STORAGE_KEY = "luna.onboarding.birthTime";

export type StoredBirthTime = {
  /** YYYY-MM-DD */
  birthDate: string;
  /** 0–23, 24-hour format */
  hour: number;
  minute: number;
  formatted: string;
};

export function saveBirthTimeSelection(data: StoredBirthTime) {
  sessionStorage.setItem(BIRTH_TIME_STORAGE_KEY, JSON.stringify(data));
}

export function getBirthTimeSelection(): StoredBirthTime | null {
  const raw = sessionStorage.getItem(BIRTH_TIME_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredBirthTime>;

    if (
      !parsed.birthDate ||
      typeof parsed.hour !== "number" ||
      typeof parsed.minute !== "number" ||
      !parsed.formatted
    ) {
      return null;
    }

    return {
      birthDate: parsed.birthDate,
      hour: parsed.hour,
      minute: parsed.minute,
      formatted: parsed.formatted,
    };
  } catch {
    return null;
  }
}
