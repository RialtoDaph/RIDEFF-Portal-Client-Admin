import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isLocale, LOCALE_COOKIE } from "./config";
import de from "../../messages/de.json";

type Messages = { [key: string]: string | Messages };

// EN and ID fall back to the German source for keys that are not translated yet
// (see messages/MISSING.md).
function withFallback(base: Messages, over: Messages): Messages {
  const out: Messages = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = base[k];
    out[k] = typeof v === "object" && typeof b === "object" ? withFallback(b, v) : v;
  }
  return out;
}

export default getRequestConfig(async () => {
  const raw = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(raw) ? raw : defaultLocale;
  const messages =
    locale === "de"
      ? (de as Messages)
      : withFallback(de as Messages, (await import(`../../messages/${locale}.json`)).default);
  return { locale, messages, timeZone: "Europe/Berlin" };
});
