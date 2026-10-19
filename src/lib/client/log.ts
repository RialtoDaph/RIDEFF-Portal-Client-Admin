import { pick, type L10n, type Locale } from "@/i18n/config";
import { formatMoney, formatMonth } from "@/lib/format";
import type { LogEntry } from "./data";

type T = (key: string, values?: Record<string, string | number>) => string;

/** One LOG / AKTIVITÄT line: system events render from message keys, team notes from their text. */
export function logText(entry: Pick<LogEntry, "event" | "params" | "text">, t: T, locale: Locale): string {
  const p = entry.params as Record<string, unknown>;
  const title = p.title && typeof p.title === "object" ? pick(p.title as L10n, locale) : String(p.title ?? "");
  switch (entry.event) {
    case "itemApproved":
      return t("log.itemApproved", { title });
    case "changeRequested":
      return t("log.changeRequested", { title, text: String(p.text ?? "") });
    case "fileUploaded":
      return t("log.fileUploaded", { file: String(p.file ?? "") });
    case "paid":
      return t("log.paid", {
        month: formatMonth(`${p.month}-15T12:00:00Z`, locale),
        amount: formatMoney(Number(p.amount_cents ?? 0), locale),
      });
    default:
      return pick(entry.text, locale);
  }
}

/** Colour of the tag column, as in the prototype. */
export function tagColor(tag: string): string {
  if (["zahlung", "freigabe", "vertrag", "start", "testlauf"].includes(tag)) return "text-success-ink";
  if (tag === "build" || tag === "update") return "text-accent";
  if (tag === "rechnung") return "text-danger";
  return "text-muted";
}
