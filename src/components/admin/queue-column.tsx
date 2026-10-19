import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import type { StaffRole } from "@/lib/auth/session";
import { loadIntroCalls, loadQueue, type QueueCard } from "@/lib/admin/data";
import { formatMonth, formatTime, formatWeekdayDate } from "@/lib/format";
import { DecisionQueue, type QueueView } from "./decision-queue";

/** The right-hand column of Kunden, Pipeline, Rechnungen and Vorlagen. */
export async function QueueColumn({ role }: { role: StaffRole }) {
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const [queue, intro] = await Promise.all([loadQueue(role), loadIntroCalls()]);
  const title = (c: QueueCard): string => {
    switch (c.type) {
      case "offerAccepted":
        return t("queue.offerAccepted", { org: c.org });
      case "changeRequested":
        return t("queue.changeRequested", { org: c.org, text: c.text });
      case "offerDraft":
        return t("queue.offerWaiting", { org: c.org, days: c.days });
      case "invoiceOverdue":
        return t("queue.invoiceOpen", { org: c.org, month: formatMonth(c.month, locale), days: c.days });
    }
  };
  const cards: QueueView[] = queue.map((c) => ({
    key: c.key,
    title: title(c),
    kind: c.type === "offerDraft" ? "offer" : c.type === "invoiceOverdue" ? "invoice" : "info",
    snoozed: "snoozed" in c ? c.snoozed : false,
    href: c.type === "offerAccepted" && (role === "owner" || role === "support") ? `/admin/kunden/neu?org=${c.orgId}` : undefined,
    target: c.type === "offerDraft" ? c.offerId : c.type === "invoiceOverdue" ? c.invoiceId : undefined,
  }));
  return (
    <DecisionQueue
      cards={cards}
      intro={intro.map((l) => ({ id: l.id, name: l.name, when: `${formatWeekdayDate(l.at, locale).split(" ")[0].toLocaleUpperCase(locale)} ${formatTime(l.at, locale)}` }))}
    />
  );
}

/** Two columns as in the design: content left, decision queue right (single column below 820px). */
export function WithQueue({ role, children }: { role: StaffRole; children: React.ReactNode }) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-[14px] wide:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] wide:grid-rows-[minmax(0,1fr)]">
      {children}
      <QueueColumn role={role} />
    </div>
  );
}
