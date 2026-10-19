export const locales = ["de", "en", "id"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "de";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/** Text written by the team, stored as {"de": …, "en"?: …, "id"?: …}. German is the fallback. */
export type L10n = { de: string; en?: string; id?: string };

export function pick(text: L10n | null | undefined, locale: Locale): string {
  if (!text) return "";
  return text[locale] ?? text.de;
}
