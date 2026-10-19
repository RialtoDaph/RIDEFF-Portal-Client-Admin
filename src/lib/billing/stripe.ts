import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

/** Stripe is configured once the owner provides the keys (STRIPE_SECRET_KEY). */
export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  client ??= new Stripe(key);
  return client;
}

/**
 * Payment methods allowed in Checkout (a filter on what is activated in the Stripe dashboard).
 * Card, SEPA Direct Debit and Klarna by default;
 * Klarna only for one-time payments (it cannot be used for subscriptions).
 * Override with STRIPE_PAYMENT_METHODS=card,sepa_debit,klarna once the owner confirms what is activated.
 */
export function paymentMethods(kind: "once" | "subscription"): Stripe.Checkout.SessionCreateParams.AllowedPaymentMethodType[] {
  const list = (process.env.STRIPE_PAYMENT_METHODS ?? "card,sepa_debit,klarna")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as Stripe.Checkout.SessionCreateParams.AllowedPaymentMethodType[];
  return kind === "subscription" ? list.filter((m) => m !== "klarna") : list;
}
