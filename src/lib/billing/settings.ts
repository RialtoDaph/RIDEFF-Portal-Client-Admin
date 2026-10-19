import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Seller = { name: string; street: string; city: string; country: string; taxId: string; email: string };
export type Bank = { recipient: string; iban: string; bic: string; bank: string };

/** Seller and bank details (placeholders like "[IBAN]" until the owner provides them). */
export async function billingSettings(): Promise<{ seller: Seller; bank: Bank }> {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("key, value").in("key", ["seller", "bank"]);
  const get = (k: string) => (data ?? []).find((r) => r.key === k)?.value ?? {};
  return { seller: get("seller") as Seller, bank: get("bank") as Bank };
}
