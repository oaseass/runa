export const BIRTH_PLACE_STORAGE_KEY = "luna.onboarding.birthPlace";

export type StoredBirthPlace = {
  placeId: string;
  fullText: string;
  mainText: string;
  secondaryText: string;
  /** WGS-84 latitude, null if geocoding failed */
  latitude: number | null;
  /** WGS-84 longitude, null if geocoding failed */
  longitude: number | null;
  /** IANA timezone, null if geocoding failed */
  timezone: string | null;
};

export function saveBirthPlaceSelection(data: StoredBirthPlace) {
  sessionStorage.setItem(BIRTH_PLACE_STORAGE_KEY, JSON.stringify(data));
}

export function getBirthPlaceSelection(): StoredBirthPlace | null {
  const raw = sessionStorage.getItem(BIRTH_PLACE_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredBirthPlace>;

    if (!parsed.placeId || !parsed.fullText || !parsed.mainText || parsed.secondaryText === undefined) {
      return null;
    }

    return {
      placeId: parsed.placeId,
      fullText: parsed.fullText,
      mainText: parsed.mainText,
      secondaryText: parsed.secondaryText,
      latitude: parsed.latitude ?? null,
      longitude: parsed.longitude ?? null,
      timezone: parsed.timezone ?? null,
    };
  } catch {
    return null;
  }
}
