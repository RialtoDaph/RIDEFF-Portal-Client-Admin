import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { pick, type Locale } from "@/i18n/config";
import { requireStaff } from "@/lib/auth/session";
import { tabsFor } from "@/lib/admin/tabs";
import { loadClients } from "@/lib/admin/data";
import { phaseLabel, TONE_CLASS } from "@/lib/admin/labels";
import { ClientsTable } from "@/components/admin/clients-table";
import { WithQueue } from "@/components/admin/queue-column";

// Kunden: table + decision queue (the KPI strip comes from the layout).
export default async function AdminHome({ searchParams }: PageProps<"/admin">) {
  const session = await requireStaff();
  const first = tabsFor(session.staffRole)[0];
  if (first.href !== "/admin") redirect(first.href);

  const { f } = await searchParams;
  const locale = (await getLocale()) as Locale;
  const clients = await loadClients();

  return (
    <WithQueue role={session.staffRole}>
      <ClientsTable
        key={f === "1" ? "filtered" : "all"}
        initialFilter={f === "1"}
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
    </WithQueue>
  );
}
