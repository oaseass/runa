const E164_REGEX = /^\+[1-9]\d{7,14}$/;

const COUNTRY_LENGTH_RULES: Record<string, { min: number; max: number }> = {
  "+1": { min: 10, max: 10 },
  "+44": { min: 10, max: 10 },
  "+49": { min: 10, max: 11 },
  "+61": { min: 9, max: 9 },
  "+81": { min: 9, max: 10 },
  "+82": { min: 9, max: 10 },
  "+86": { min: 11, max: 11 },
  "+91": { min: 10, max: 10 },
};

export function sanitizeNationalNumber(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function normalizePhoneNumber(raw: string, countryCode: string): string {
  const digits = sanitizeNationalNumber(raw);

  if (!digits) {
    return "";
  }

  const normalizedCountry = countryCode.replace(/\D/g, "");

  // Drop a leading 0 from national format before composing E.164.
  const national = digits.startsWith("0") ? digits.slice(1) : digits;

  return `+${normalizedCountry}${national}`;
}

export function isValidPhoneNumber(e164Phone: string): boolean {
  return E164_REGEX.test(e164Phone);
}

export function isValidNationalNumber(countryCode: string, nationalNumber: string): boolean {
  const digits = sanitizeNationalNumber(nationalNumber);

  if (!digits) {
    return false;
  }

  const rule = COUNTRY_LENGTH_RULES[countryCode];

  if (!rule) {
    return digits.length >= 6 && digits.length <= 14;
  }

  return digits.length >= rule.min && digits.length <= rule.max;
}
