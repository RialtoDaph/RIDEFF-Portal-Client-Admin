import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pick, type Locale } from "@/i18n/config";
import { requireStaff } from "@/lib/auth/session";
import { tabsFor } from "@/lib/admin/tabs";
import { loadClients, loadIntroCalls, loadQueue, type QueueCard } from "@/lib/admin/data";
import { phaseLabel, TONE_CLASS } from "@/lib/admin/labels";
import { formatMonth, formatTime, formatWeekdayDate } from "@/lib/format";
import { ClientsTable } from "@/components/admin/clients-table";
import { DecisionQueue, type QueueView } from "@/components/admin/decision-queue";

// Kunden: table + decision queue (the KPI strip comes from the layout).
export default async function AdminHome() {
  const session = await requireStaff();
  const first = tabsFor(session.staffRole)[0];
  if (first.href !== "/admin") redirect(first.href);

  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const [clients, queue, intro] = await Promise.all([loadClients(), loadQueue(session.staffRole), loadIntroCalls()]);

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
    href: c.type === "offerAccepted" ? `/admin/kunden/neu?org=${c.orgId}` : undefined,
    target: c.type === "offerDraft" ? c.offerId : c.type === "invoiceOverdue" ? c.invoiceId : undefined,
  }));

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-[14px] wide:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] wide:grid-rows-[minmax(0,1fr)]">
      <ClientsTable
        rows={clients.map((c, i) => ({
          id: c.id,
          num: String(i + 1).padStart(2, "0"),
          name: c.name,
          phase: phaseLabel(c),
          step: pick(c.nextStep, locale),
          stepClass: TONE_CLASS[c.tone],
          mrr: c.mrrCents ? new Intl.NumberFormat(locale === "en" ? "en-GB" : "de-DE").format(c.mrrCents / 100) : "–",
          needsAction: c.needsAction,
        }))}
      />
      <DecisionQueue
        cards={cards}
        intro={intro.map((l) => ({ id: l.id, name: l.name, when: `${formatWeekdayDate(l.at, locale).split(" ")[0].toLocaleUpperCase(locale)} ${formatTime(l.at, locale)}` }))}
      />
    </div>
  );
}
