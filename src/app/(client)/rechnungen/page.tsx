import { requireClient } from "@/lib/auth/session";
import { loadInvoices } from "@/lib/client/data";
import { billingSettings } from "@/lib/billing/settings";
import { stripeConfigured } from "@/lib/billing/stripe";
import { InvoiceTable } from "@/components/client/invoice-table";

export default async function InvoicesPage({ searchParams }: PageProps<"/rechnungen">) {
  const session = await requireClient();
  const { checkout } = await searchParams;
  const [invoices, { bank }] = await Promise.all([loadInvoices(session.membership.org.id), billingSettings()]);
  return (
    <InvoiceTable
      invoices={invoices}
      canPay={session.membership.role === "inhaber"}
      bank={bank}
      stripeReady={stripeConfigured()}
      returningFrom={typeof checkout === "string" && invoices.some((i) => i.id === checkout) ? checkout : null}
    />
  );
}
