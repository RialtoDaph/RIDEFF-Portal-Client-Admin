"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/auth/session";
import { fillTemplate, sendEmail } from "@/lib/email/send";
import { formatMoney } from "@/lib/format";

// Every action checks the staff role here (with 2FA); the database checks it again.

const uuid = z.uuid();
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://portal.rideff.com";
const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] ?? "";

async function template(key: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("templates").select("subject, body").eq("key", key).eq("locale", "de").maybeSingle();
  return data;
}

export async function sendOffer(offerId: string): Promise<{ ok: boolean }> {
  await requireStaff("support");
  if (!uuid.safeParse(offerId).success) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("send_offer", { p_offer: offerId });
  if (error) console.warn("sendOffer:", error.code, error.message);
  revalidatePath("/admin", "layout");
  return { ok: !error };
}

/** "ERINNERUNG SENDEN": records the reminder and mails the template "Zahlungserinnerung". */
export async function remindInvoice(invoiceId: string): Promise<{ ok: boolean; sent: boolean }> {
  await requireStaff("finanzen");
  if (!uuid.safeParse(invoiceId).success) return { ok: false, sent: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("remind_invoice", { p_invoice: invoiceId });
  if (error) {
    console.warn("remindInvoice:", error.code, error.message);
    return { ok: false, sent: false };
  }
  const { data: iv } = await supabase
    .from("invoices")
    .select("number, gross_cents, due_on, organizations(contact_name, contact_email)")
    .eq("id", invoiceId)
    .single();
  const org = iv?.organizations as unknown as { contact_name: string | null; contact_email: string | null } | null;
  const tpl = await template("payment_reminder");
  let sent = false;
  if (iv && org?.contact_email && tpl) {
    const days = iv.due_on ? Math.max(0, Math.floor((Date.now() - Date.parse(iv.due_on + "T00:00:00Z")) / 86_400_000)) : 0;
    const vars = { Vorname: firstName(org.contact_name), Nr: iv.number, Betrag: formatMoney(iv.gross_cents, "de", { cents: true }), Tage: String(days) };
    sent = (await sendEmail({ to: org.contact_email, subject: tpl.subject, text: fillTemplate(tpl.body, vars) })).sent;
  }
  revalidatePath("/admin", "layout");
  return { ok: true, sent };
}

/** "S SPÄTER": the card comes back tomorrow. */
export async function snoozeCard(key: string, snooze: boolean) {
  const session = await requireStaff();
  if (!/^[a-z]+:[0-9a-f-]{36}$/.test(key)) return;
  const supabase = await createClient();
  if (snooze) {
    await supabase.from("queue_snoozes").upsert({ staff_id: session.userId, key, until: new Date(Date.now() + 86_400_000).toISOString() });
  } else {
    await supabase.from("queue_snoozes").delete().eq("staff_id", session.userId).eq("key", key);
  }
  revalidatePath("/admin", "layout");
}

export async function replyToThread(threadId: string, text: string): Promise<{ ok: boolean }> {
  const session = await requireStaff("support", "builder");
  const body = text.trim();
  if (!uuid.safeParse(threadId).success || !body || body.length > 5000) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.from("messages").insert({ thread_id: threadId, author_id: session.userId, body });
  if (error) console.warn("replyToThread:", error.code, error.message);
  await supabase.rpc("mark_thread_read", { p_thread: threadId });
  revalidatePath("/admin", "layout");
  return { ok: !error };
}

export async function markThreadRead(threadId: string) {
  await requireStaff("support", "builder");
  if (!uuid.safeParse(threadId).success) return;
  const supabase = await createClient();
  await supabase.rpc("mark_thread_read", { p_thread: threadId });
  revalidatePath("/admin", "layout");
}

// ── Neuer Kunde ────────────────────────────────────────────────────────
const newClient = z.object({
  company: z.string().trim().min(1).max(120),
  contact: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  city: z.string().trim().max(80),
  packageKey: z.enum(["core", "growth", "whole_system"]),
  sendWelcome: z.boolean(),
  orgId: uuid.nullable(),
});

export type CreateClientResult = { ok: true; orgId: string; sent: boolean } | { ok: false };

/**
 * "ANLEGEN & EINLADEN →": creates (or reuses) the login for the contact, creates the client
 * (or converts the lead), makes the contact Inhaber and sends "Willkommen im Portal".
 */
export async function createClientAction(input: z.input<typeof newClient>): Promise<CreateClientResult> {
  await requireStaff("support");
  const parsed = newClient.safeParse(input);
  if (!parsed.success) return { ok: false };
  const f = parsed.data;

  // the login is created with the service key; the client itself through RLS + create_client_org()
  const admin = createAdminClient();
  const { data: existing } = await admin.from("profiles").select("id").eq("email", f.email).maybeSingle();
  let userId = existing?.id as string | undefined;
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({ email: f.email, email_confirm: true, user_metadata: { full_name: f.contact } });
    if (error || !data.user) {
      console.error("createClient user:", error?.message);
      return { ok: false };
    }
    userId = data.user.id;
  }

  const supabase = await createClient();
  const tpl = f.sendWelcome ? await template("welcome") : null;
  const { data: orgId, error } = await supabase.rpc("create_client_org", {
    p_user: userId,
    p_company: f.company,
    p_contact: f.contact,
    p_email: f.email,
    p_city: f.city,
    p_package: f.packageKey,
    p_org: f.orgId,
    p_invited: !!tpl && !!process.env.RESEND_API_KEY,
  });
  if (error || !orgId) {
    console.error("createClient:", error?.code, error?.message);
    return { ok: false };
  }
  // only after the client exists: the welcome mail with the login link
  let sent = false;
  if (tpl) {
    const text = `${fillTemplate(tpl.body, { Vorname: firstName(f.contact) })}\n\n${SITE}/login`;
    sent = (await sendEmail({ to: f.email, subject: tpl.subject, text })).sent;
  }
  revalidatePath("/admin", "layout");
  return { ok: true, orgId: orgId as string, sent };
}

// ── Rechnungen ─────────────────────────────────────────────────────────
const newInvoice = z.object({
  orgId: uuid,
  kind: z.enum(["once", "subscription"]),
  description: z.string().trim().min(1).max(200),
  netCents: z.number().int().positive().max(100_000_000),
  allowStripe: z.boolean(),
  allowBank: z.boolean(),
});

/** "ERSTELLEN & SENDEN": the invoice appears in the client's Rechnungen right away. */
export async function createInvoiceAction(input: z.input<typeof newInvoice>): Promise<{ ok: true; number: string } | { ok: false }> {
  await requireStaff("finanzen");
  const parsed = newInvoice.safeParse(input);
  if (!parsed.success) return { ok: false };
  const f = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invoice", {
    p_org: f.orgId,
    p_kind: f.kind,
    p_description: f.description,
    p_net_cents: f.netCents,
    p_allow_stripe: f.allowStripe,
    p_allow_bank: f.allowBank,
  });
  if (error || !data) {
    console.warn("createInvoice:", error?.code, error?.message);
    return { ok: false };
  }
  revalidatePath("/admin", "layout");
  return { ok: true, number: data as string };
}

/** "ALS BEZAHLT ✓" once the transfer has arrived. */
export async function confirmTransfer(invoiceId: string): Promise<{ ok: boolean }> {
  await requireStaff("finanzen");
  if (!uuid.safeParse(invoiceId).success) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_transfer", { p_invoice: invoiceId });
  if (error) console.warn("confirmTransfer:", error.code, error.message);
  revalidatePath("/admin", "layout");
  return { ok: !error };
}
