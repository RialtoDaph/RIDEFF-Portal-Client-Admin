import { createClient } from "@/lib/supabase/server";
import { pick } from "@/i18n/config";
import { billingSettings } from "@/lib/billing/settings";
import { buildInvoicePdf } from "@/lib/billing/invoice-pdf";

// "↓ PDF" for clients and the team. RLS decides who may read the invoice
// (members of the org, Finanzen and the owner).
export async function GET(_req: Request, ctx: RouteContext<"/rechnungen/[nr]/pdf">) {
  const { nr } = await ctx.params;
  if (!/^R-\d{4}-\d{3,}$/.test(nr)) return new Response(null, { status: 404 });
  const supabase = await createClient();
  const { data: iv } = await supabase
    .from("invoices")
    .select("number, issued_on, service_from, service_to, due_on, description, net_cents, vat_cents, gross_cents, status, paid_at, organizations(name, contact_name, street, postal_code, city, country)")
    .eq("number", nr)
    .maybeSingle();
  if (!iv) return new Response(null, { status: 404 });
  const org = iv.organizations as unknown as { name: string; contact_name: string | null; street: string | null; postal_code: string | null; city: string | null; country: string };
  const { seller, bank } = await billingSettings();
  const pdf = await buildInvoicePdf({
    number: iv.number,
    issuedOn: iv.issued_on,
    serviceFrom: iv.service_from,
    serviceTo: iv.service_to,
    dueOn: iv.due_on,
    description: pick(iv.description, "de"),
    netCents: iv.net_cents,
    vatCents: iv.vat_cents,
    grossCents: iv.gross_cents,
    status: iv.status,
    paidAt: iv.paid_at,
    recipient: { name: org.name, contact: org.contact_name, street: org.street, postalCode: org.postal_code, city: org.city, country: org.country },
    seller,
    bank,
  });
  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${iv.number}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
