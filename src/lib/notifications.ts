import "server-only";
import { getLocale, getTranslations } from "next-intl/server";
import { pick, type L10n, type Locale } from "@/i18n/config";
import { createClient } from "@/lib/supabase/server";
import { formatTime, formatWeekdayDate } from "@/lib/format";

export type NotificationItem = { id: string; tag: string; text: string; href: string; at: string; read: boolean };

const TAG: Record<string, string> = {
  approval_new: "approval",
  chat_reply: "message",
  invoice_new: "invoice",
  invoice_due: "invoice",
  test_run_invite: "testRun",
  test_run_reminder: "testRun",
  phase_change: "phase",
  weekly_summary: "weekly",
};

/** The bell: newest 20 notifications of the signed-in user (RLS: own rows only), one line each. */
export async function loadNotifications(): Promise<{ items: NotificationItem[]; unread: number }> {
  const supabase = await createClient();
  const [{ data }, { count }] = await Promise.all([
    supabase.from("notifications").select("id, kind, params, link, read_at, created_at").order("created_at", { ascending: false }).limit(20),
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);
  const rows = (data ?? []) as { id: string; kind: string; params: Record<string, unknown>; link: string | null; read_at: string | null; created_at: string }[];
  if (!rows.length) return { items: [], unread: 0 };

  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  // quote approvals carry only the org id; staff can read the names
  const orgIds = [...new Set(rows.filter((r) => r.params.offer).map((r) => String(r.params.org_id)))];
  const orgs = orgIds.length ? (await supabase.from("organizations").select("id, name").in("id", orgIds)).data ?? [] : [];
  const orgName = (id: unknown) => orgs.find((o) => o.id === id)?.name ?? "";
  const l = (v: unknown) => (v && typeof v === "object" ? pick(v as L10n, locale) : String(v ?? ""));
  const day = (v: unknown) => (v ? formatWeekdayDate(String(v), locale) : "–");

  const text = (r: (typeof rows)[number]) => {
    const p = r.params;
    switch (r.kind) {
      case "approval_new":
        return p.offer
          ? t("email.offerAccepted.subject", { org: orgName(p.org_id), nr: String(p.offer) })
          : t("email.approvalNew.subject", { element: l(p.title) });
      case "chat_reply":
        return p.to === "team"
          ? t("email.chatTeam.subject", { org: String(p.org ?? ""), element: l(p.title) })
          : t("email.chatReply.subject", { element: l(p.title) });
      case "invoice_new":
        return t("email.invoiceNew.subject", { nr: String(p.nr) });
      case "invoice_due":
        return t("email.invoiceDue.subject", { nr: String(p.nr), due: day(p.due) });
      case "test_run_invite":
        return t("notif.testRunInvite", { system: l(p.title), date: day(p.starts_at), time: formatTime(String(p.starts_at), locale) });
      case "test_run_reminder":
        return t("email.testRunReminder.subject", { system: l(p.title), time: formatTime(String(p.starts_at), locale) });
      case "phase_change":
        return t("email.phaseChange.subject", { project: String(p.project), num: String(p.phase).padStart(2, "0"), phase: t(`phaseName.${Number(p.phase) as 1}`) });
      default:
        return t("email.weekly.subject");
    }
  };

  return {
    unread: count ?? 0,
    items: rows.map((r) => ({
      id: r.id,
      tag: t(`notif.tag.${(r.params.offer ? "offer" : TAG[r.kind] ?? "weekly") as "approval"}`),
      text: text(r),
      href: r.link ?? "/",
      at: r.created_at,
      read: !!r.read_at,
    })),
  };
}
