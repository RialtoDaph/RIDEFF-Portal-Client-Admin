"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireClient } from "@/lib/auth/session";
import { getStripe, paymentMethods, stripeConfigured } from "@/lib/billing/stripe";
import { pick } from "@/i18n/config";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://portal.rideff.com";

/** Loads an open invoice of the user's org through RLS; only the Inhaber pays. */
async function payableInvoice(invoiceId: string) {
  const session = await requireClient();
  if (session.membership.role !== "inhaber" || !z.uuid().safeParse(invoiceId).success) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoices")
    .select("id, number, org_id, kind, description, gross_cents, status, allow_stripe, allow_bank")
    .eq("id", invoiceId)
    .eq("org_id", session.membership.org.id)
    .maybeSingle();
  if (!data || !["open", "overdue"].includes(data.status)) return null;
  return { session, invoice: data };
}

/**
 * "Weiter zu Stripe →": one-time invoices open Checkout in payment mode,
 * monthly invoices start a subscription (Stripe then charges every month until cancelled).
 * Paid status only ever comes from the webhook.
 */
export async function startCheckout(invoiceId: string): Promise<{ url: string } | { error: "not_configured" | "failed" }> {
  const found = await payableInvoice(invoiceId);
  if (!found || !found.invoice.allow_stripe) return { error: "failed" };
  if (!stripeConfigured()) return { error: "not_configured" };
  const { session, invoice } = found;
  const stripe = getStripe();
  const admin = createAdminClient();

  // one Stripe customer per organisation
  const { data: org } = await admin.from("organizations").select("id, name, stripe_customer_id").eq("id", invoice.org_id).single();
  let customer = org?.stripe_customer_id as string | null;
  if (!customer) {
    const created = await stripe.customers.create(
      { name: org?.name, email: session.profile.email, metadata: { org_id: invoice.org_id } },
      { idempotencyKey: `customer-${invoice.org_id}` },
    );
    customer = created.id;
    await admin.from("organizations").update({ stripe_customer_id: customer }).eq("id", invoice.org_id);
  }

  const name = `${invoice.number} · ${pick(invoice.description, "de")}`;
  const metadata = { invoice_id: invoice.id, invoice_number: invoice.number, org_id: invoice.org_id };
  const back = `${SITE}/rechnungen?checkout=${invoice.id}`;
  try {
    const checkout = await stripe.checkout.sessions.create({
      mode: invoice.kind === "subscription" ? "subscription" : "payment",
      customer,
      client_reference_id: invoice.id,
      locale: session.profile.locale === "id" ? "auto" : session.profile.locale,
      allowed_payment_method_types: paymentMethods(invoice.kind),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: invoice.gross_cents, // the portal invoice already includes 19 % VAT
            product_data: { name },
            ...(invoice.kind === "subscription" ? { recurring: { interval: "month" as const } } : {}),
          },
        },
      ],
      metadata,
      ...(invoice.kind === "subscription"
        ? { subscription_data: { metadata } }
        : { payment_intent_data: { metadata } }),
      success_url: back,
      cancel_url: back,
    });
    return checkout.url ? { url: checkout.url } : { error: "failed" };
  } catch (e) {
    console.error("startCheckout:", (e as Error).message);
    return { error: "failed" };
  }
}

/** "ICH HABE ÜBERWIESEN": the invoice becomes ANGEKÜNDIGT until the team confirms the payment. */
export async function announceTransfer(invoiceId: string): Promise<{ ok: boolean }> {
  const found = await payableInvoice(invoiceId);
  if (!found || !found.invoice.allow_bank) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("announce_transfer", { p_invoice: invoiceId });
  if (error) console.warn("announceTransfer:", error.code, error.message);
  revalidatePath("/", "layout");
  return { ok: !error };
}
