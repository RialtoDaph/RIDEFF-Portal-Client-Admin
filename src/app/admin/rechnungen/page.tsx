import { getLocale } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { requireStaff } from "@/lib/auth/session";
import { WithQueue } from "@/components/admin/queue-column";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/format";
import { InvoicesAdmin } from "@/components/admin/invoices-admin";

const TAG = { de: "de-DE", en: "en-GB", id: "id-ID" } as const;

export default async function AdminInvoicesPage() {
  const session = await requireStaff("finanzen");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  const [invoices, orgs] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, number, kind, status, net_cents, issued_on, service_from, due_on, reminded_at, organizations(name)")
      .order("issued_on", { ascending: false })
      .order("number", { ascending: false }),
    supabase.from("organizations").select("id, name").eq("status", "client").order("name"),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const month = (iso: string) =>
    new Intl.DateTimeFormat(TAG[locale], { month: "short", timeZone: "Europe/Berlin" }).format(new Date(iso + "T12:00:00Z")).replace(/\.$/, "").toLocaleUpperCase(locale);

  return (
    <WithQueue role={session.staffRole}>
      <InvoicesAdmin
        clients={orgs.data ?? []}
        invoices={(invoices.data ?? []).map((i) => ({
          id: i.id,
          number: i.number,
          org: (i.organizations as unknown as { name: string } | null)?.name ?? "",
          month: month(i.service_from ?? i.issued_on),
          // an open invoice past its due date is shown as overdue (the nightly job sets the status in step 7)
          status: i.status === "open" && i.due_on && i.due_on < today ? "overdue" : i.status,
          reminded: !!i.reminded_at,
          netLabel: formatMoney(i.net_cents, locale),
        }))}
      />
    </WithQueue>
  );
}
