/**
 * Normalizes a raw phone number string to E.164 format.
 * Returns null for incomplete or unparseable numbers.
 * Handles Korean domestic format (010-XXXX-XXXX → +8210XXXXXXXX).
 * Safe to import on both server and client (no Node APIs).
 */
export function normalizePhone(raw: string): string | null {
  if (!raw || typeof raw !== "string") return null;

  // Strip whitespace, dashes, parentheses, dots, spaces
  let s = raw.replace(/[\s\-().]/g, "");
  // Remove any remaining non-digit / non-plus chars
  s = s.replace(/[^\d+]/g, "");

  if (!s) return null;

  // Korean mobile domestic: 010XXXXXXXX (11 digits, no country prefix)
  if (/^010\d{8}$/.test(s)) {
    s = "+82" + s.slice(1); // 010 → +8210
  }
  // Korean with country code but no + (8210XXXXXXXX)
  else if (/^8210\d{8}$/.test(s)) {
    s = "+" + s;
  }
  // Other Korean numbers with 82 prefix but no +
  else if (/^82\d{9,11}$/.test(s) && !s.startsWith("+")) {
    s = "+" + s;
  }

  // Must start with + for E.164
  if (!s.startsWith("+")) return null;

  // E.164: 8–15 digits after the +
  if (s.length < 8 || s.length > 16) return null;
  if (!/^\+\d+$/.test(s)) return null;

  return s;
}

/**
 * Deduplicates and normalizes an array of raw phone strings.
 * Silently drops invalid/incomplete entries.
 */
export function normalizePhones(raws: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of raws) {
    const n = normalizePhone(raw);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}
