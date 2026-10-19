import type { Locale } from "@/i18n/config";

const TAG: Record<Locale, string> = { de: "de-DE", en: "en-GB", id: "id-ID" };
export const TIME_ZONE = "Europe/Berlin";

/**
 * Money is stored in cents (net). Shown as €1.990 (DE, ID) or €1,990 (EN).
 * `cents: true` always shows two decimals (€2.368,10), otherwise only when needed.
 */
export function formatMoney(amountCents: number, locale: Locale, opts: { cents?: boolean } = {}): string {
  const euros = amountCents / 100;
  const digits = opts.cents || amountCents % 100 !== 0 ? 2 : 0;
  const n = new Intl.NumberFormat(TAG[locale], { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(
    Math.abs(euros),
  );
  return (euros < 0 ? "−" : "") + "€" + n;
}

/** 19 % VAT on a net amount, rounded to the cent (same rule as the database). */
export function vatCents(netCents: number): number {
  return Math.round((netCents * 19) / 100);
}

function parts(date: Date | string, locale: Locale, options: Intl.DateTimeFormatOptions) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(TAG[locale], { timeZone: TIME_ZONE, ...options }).formatToParts(d);
}
const get = (p: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) =>
  p.find((x) => x.type === type)?.value ?? "";

/** "16.10" in every language, as in the design. */
export function formatDayMonth(date: Date | string, locale: Locale): string {
  const p = parts(date, locale, { day: "2-digit", month: "2-digit" });
  return `${get(p, "day")}.${get(p, "month")}`;
}

/** "Do 16.10" · "Thu 16.10" · "Kam 16.10" */
export function formatWeekdayDate(date: Date | string, locale: Locale): string {
  const wd = get(parts(date, locale, { weekday: "short" }), "weekday").replace(/\.$/, "");
  return `${wd} ${formatDayMonth(date, locale)}`;
}

/** "10:30", Indonesian uses "10.30". */
export function formatTime(date: Date | string, locale: Locale): string {
  const p = parts(date, locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return `${get(p, "hour")}${locale === "id" ? "." : ":"}${get(p, "minute")}`;
}

/** "Sep 2026" for "Kunde seit Sep 2026". */
export function formatMonthYear(date: Date | string, locale: Locale): string {
  const p = parts(date, locale, { month: "short", year: "numeric" });
  return `${get(p, "month").replace(/\.$/, "")} ${get(p, "year")}`;
}

/** Full month name ("Oktober"), for invoice rows and the log. */
export function formatMonth(date: Date | string, locale: Locale): string {
  return get(parts(date, locale, { month: "long" }), "month");
}

/** Whole days from today (Berlin) until the date; negative when past. */
export function daysUntil(date: Date | string, now: Date = new Date()): number {
  const day = (d: Date) => {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    return Date.parse(p + "T00:00:00Z");
  };
  const d = typeof date === "string" ? new Date(date.length === 10 ? date + "T12:00:00Z" : date) : date;
  return Math.round((day(d) - day(now)) / 86_400_000);
}
