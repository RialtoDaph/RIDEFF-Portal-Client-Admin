import type Stripe from "stripe";
import { getStripe } from "@/lib/billing/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

// Stripe → portal. The only place that marks invoices paid via Stripe.
// Events to enable in Stripe: checkout.session.completed, checkout.session.async_payment_succeeded, invoice.paid.

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return new Response("not configured", { status: 400 });

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return new Response("invalid signature", { status: 400 });
  }

  const admin = createAdminClient();
  const id = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : v?.id ?? null);

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object;
      // SEPA settles later: "completed" arrives unpaid, "async_payment_succeeded" follows
      if (s.payment_status !== "paid" || !s.client_reference_id) break;
      const { error } = await admin.rpc("stripe_mark_paid", {
        p_invoice: s.client_reference_id,
        p_session: s.id,
        p_payment_intent: id(s.payment_intent),
        p_subscription: id(s.subscription),
      });
      if (error) return new Response(error.message, { status: 500 });
      break;
    }
    case "invoice.paid": {
      const inv = event.data.object;
      // the first month is the portal invoice paid through Checkout; later months get their own
      if (inv.billing_reason !== "subscription_cycle") break;
      const sub = id(inv.parent?.subscription_details?.subscription);
      const period = inv.lines.data[0]?.period;
      if (!sub || !inv.id || !period) break;
      const day = (s: number) => new Date(s * 1000).toISOString().slice(0, 10);
      const { error } = await admin.rpc("stripe_record_cycle", {
        p_subscription: sub,
        p_stripe_invoice: inv.id,
        p_payment_intent: null,
        p_period_start: day(period.start),
        p_period_end: day(period.end - 1),
      });
      if (error) return new Response(error.message, { status: 500 });
      break;
    }
  }
  return new Response("ok");
}
