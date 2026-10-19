import "server-only";
import { createTranslator } from "next-intl";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isLocale, pick, type L10n, type Locale } from "@/i18n/config";
import { loadMessages } from "@/i18n/request";
import { formatMoney, formatTime, formatWeekdayDate } from "@/lib/format";
import { fillTemplate } from "./fill";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "./send";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://portal.rideff.com";

type Row = {
  id: string;
  kind: string;
  params: Record<string, unknown>;
  link: string | null;
  profiles: { email: string; full_name: string; locale: string; email_prefs: Record<string, boolean> } | null;
};

const pad = (n: unknown) => String(n).padStart(2, "0");
const l10n = (v: unknown, locale: Locale) => (v && typeof v === "object" ? pick(v as L10n, locale) : String(v ?? ""));

/**
 * Renders one notification as an email in the recipient's language (German where a text is missing).
 * "Freigabe anfragen" and "Testlauf-Einladung" use the owner's templates; everything else the email.* texts.
 */
async function render(admin: SupabaseClient, n: Row, locale: Locale): Promise<{ subject: string; text: string } | null> {
  // keys are built at runtime (email.invoiceNew / email.invoiceDue, phaseName.n), so the translator is untyped here
  const t = createTranslator({ locale, messages: await loadMessages(locale) }) as unknown as (key: string, values?: Record<string, string>) => string;
  const p = n.params;
  const name = (n.profiles?.full_name ?? "").split(/\s+/)[0];
  const url = SITE + (n.link ?? "/");
  const day = (iso: unknown) => formatWeekdayDate(String(iso), locale);
  const money = (c: unknown) => formatMoney(Number(c ?? 0), locale, { cents: true });
  const wrap = (subject: string, body: string) => ({
    subject,
    text: [t("email.greeting", { name }), body, t("email.toPortal", { url }), t("email.signoff")].join("\n\n"),
  });

  async function template(key: string, vars: Record<string, string>) {
    const { data } = await admin.from("templates").select("locale, subject, body").eq("key", key).in("locale", [locale, "de"]);
    const tpl = data?.find((r) => r.locale === locale) ?? data?.find((r) => r.locale === "de");
    return tpl ? { subject: tpl.subject, text: `${fillTemplate(tpl.body, vars)}\n\n${url}` } : null;
  }

  switch (n.kind) {
    case "approval_new": {
      if (p.offer) {
        // to the team: a lead approved the quote
        const { data: org } = await admin.from("organizations").select("name").eq("id", String(p.org_id)).maybeSingle();
        const vars = { org: org?.name ?? "", nr: String(p.offer), invoice: String(p.invoice ?? "") };
        return wrap(t("email.offerAccepted.subject", vars), t("email.offerAccepted.body", vars));
      }
      const element = l10n(p.title, locale);
      const { data: item } = await admin.from("items").select("projects(go_live)").eq("id", String(p.item_id)).maybeSingle();
      const goLive = (item?.projects as unknown as { go_live: string | null } | null)?.go_live;
      if (p.deadline && goLive) {
        const fromTemplate = await template("approval_request", { Vorname: name, Element: element, Frist: day(p.deadline), Golive: day(goLive) });
        if (fromTemplate) return fromTemplate;
      }
      const body = [t("email.approvalNew.body", { element }), p.deadline ? t("email.approvalNew.deadline", { date: day(p.deadline) }) : ""].filter(Boolean).join("\n\n");
      return wrap(t("email.approvalNew.subject", { element }), body);
    }
    case "chat_reply": {
      const vars = { element: l10n(p.title, locale), author: String(p.author ?? ""), excerpt: String(p.excerpt ?? ""), org: String(p.org ?? "") };
      return p.to === "team"
        ? wrap(t("email.chatTeam.subject", vars), t("email.chatTeam.body", vars))
        : wrap(t("email.chatReply.subject", vars), t("email.chatReply.body", vars));
    }
    case "invoice_new":
    case "invoice_due": {
      const vars = { nr: String(p.nr), amount: money(p.amount_cents), due: p.due ? day(p.due) : "–", item: l10n(p.item, locale) };
      const k = n.kind === "invoice_new" ? "invoiceNew" : "invoiceDue";
      return wrap(t(`email.${k}.subject`, vars), t(`email.${k}.body`, vars));
    }
    case "test_run_invite":
    case "test_run_reminder": {
      const at = String(p.starts_at);
      const system = l10n(p.title, locale);
      if (n.kind === "test_run_invite") {
        return template("test_run_invite", { Vorname: name, System: system, Datum: day(at), Uhrzeit: formatTime(at, locale) });
      }
      const vars = { system, time: formatTime(at, locale) };
      return wrap(t("email.testRunReminder.subject", vars), t("email.testRunReminder.body", vars));
    }
    case "phase_change": {
      const vars = { project: String(p.project), num: pad(p.phase), phase: t(`phaseName.${Number(p.phase)}`) };
      return wrap(t("email.phaseChange.subject", vars), t("email.phaseChange.body", vars));
    }
    case "weekly_summary": {
      const vars = {
        project: String(p.project), num: pad(p.phase), phase: t(`phaseName.${Number(p.phase)}`), pct: String(p.pct),
        approvals: String(p.approvals), invoices: String(p.invoices), files: String(p.files),
      };
      return wrap(t("email.weekly.subject"), t("email.weekly.body", vars));
    }
    default:
      return null;
  }
}

/**
 * Emails every notification of the last two days that has not been emailed yet.
 * Without RESEND_API_KEY nothing is sent and the rows stay pending (sent once Resend is set up).
 * Rows the recipient opted out of (profiles.email_prefs[kind] = false) are marked handled without a mail.
 */
export async function dispatchNotificationEmails(admin: SupabaseClient): Promise<{ sent: number; skipped: number; pending: number }> {
  const { data } = await admin
    .from("notifications")
    .select("id, kind, params, link, profiles:user_id(email, full_name, locale, email_prefs)")
    .is("emailed_at", null)
    .gte("created_at", new Date(Date.now() - 2 * 86_400_000).toISOString())
    .order("created_at")
    .limit(100);
  let sent = 0;
  let skipped = 0;
  let pending = 0;
  for (const n of (data ?? []) as unknown as Row[]) {
    // claim the row first, so a cron run and an action running at the same time never send twice
    const now = new Date().toISOString();
    const { data: claimed } = await admin.from("notifications").update({ emailed_at: now }).eq("id", n.id).is("emailed_at", null).select("id");
    if (!claimed?.length) continue;
    const to = n.profiles?.email;
    const optedOut = n.profiles?.email_prefs?.[n.kind] === false;
    const locale: Locale = isLocale(n.profiles?.locale) ? n.profiles!.locale as Locale : "de";
    const mail = to && !optedOut ? await render(admin, n, locale) : null;
    if (!mail) {
      skipped++;
      continue;
    }
    const r = await sendEmail({ to: to!, subject: mail.subject, text: mail.text });
    if (r.sent) {
      sent++;
    } else {
      pending++;
      await admin.from("notifications").update({ emailed_at: null }).eq("id", n.id);
    }
  }
  return { sent, skipped, pending };
}

/** After an action that notifies someone: send right away instead of waiting for the daily cron. */
export function dispatchSoon() {
  if (!process.env.SUPABASE_SECRET_KEY || !process.env.RESEND_API_KEY) return;
  after(() => dispatchNotificationEmails(createAdminClient()).then(() => undefined, (e) => console.warn("dispatch:", e)));
}
