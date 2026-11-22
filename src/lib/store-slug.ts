export const STORE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const RESERVED_SLUGS = new Set(["admin", "api", "auth", "s", "super-admin", "onboarding", "www", "app"]);

const HEB: Record<string, string> = {
  א: "a", ב: "b", ג: "g", ד: "d", ה: "h", ו: "v", ז: "z", ח: "ch", ט: "t", י: "y",
  כ: "k", ך: "k", ל: "l", מ: "m", ם: "m", נ: "n", ן: "n", ס: "s", ע: "a", פ: "p",
  ף: "f", צ: "tz", ץ: "tz", ק: "k", ר: "r", ש: "sh", ת: "t",
};

/** Latin-only slug. Hebrew is transliterated; anything else falls back to shop-xxxx. */
export function createLatinSlug(name: string, suffix = crypto.randomUUID().slice(0, 6)) {
  const translit = Array.from(name.toLowerCase().trim())
    .map((ch) => HEB[ch] ?? ch)
    .join("");
  const base = translit
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  if (!base || base.length < 3 || RESERVED_SLUGS.has(base)) return `shop-${suffix}`;
  return base;
}

export function isValidSlug(slug: string) {
  return slug.length >= 3 && slug.length <= 40 && STORE_SLUG_PATTERN.test(slug) && !RESERVED_SLUGS.has(slug);
}
