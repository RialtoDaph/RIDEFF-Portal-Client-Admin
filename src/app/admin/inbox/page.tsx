import { getLocale, getTranslations } from "next-intl/server";
import { pick, type Locale } from "@/i18n/config";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadClients, loadInbox } from "@/lib/admin/data";
import { phaseLabel, TONE_CLASS } from "@/lib/admin/labels";
import { formatMoney } from "@/lib/format";
import { InboxView } from "@/components/admin/inbox-view";

const KIND: Record<string, { key: string; className: string }> = {
  approval: { key: "tag.freigabe", className: "text-accent-soft" },
  test_run: { key: "tag.testlauf", className: "text-success-ink" },
  question: { key: "tag.frage", className: "text-accent" },
  invoice: { key: "tag.rechnung", className: "text-danger" },
  update: { key: "tag.update", className: "text-muted" },
  message: { key: "inbox.message", className: "text-muted" },
};

export default async function InboxPage({ searchParams }: PageProps<"/admin/inbox">) {
  await requireStaff("support", "builder");
  const { t: picked } = await searchParams;
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const [threads, clients] = await Promise.all([loadInbox(), loadClients()]);
  const current = threads.find((th) => th.id === picked) ?? threads[0] ?? null;

  let messages: { id: string; body: string; at: string; fromTeam: boolean; author: string }[] = [];
  if (current) {
    const supabase = await createClient();
    const [msgs, members] = await Promise.all([
      supabase.from("messages").select("id, body, created_at, author_id").eq("thread_id", current.id).order("created_at").limit(200),
      supabase.from("org_members").select("user_id").eq("org_id", current.orgId),
    ]);
    const ids = [...new Set((msgs.data ?? []).map((m) => m.author_id))];
    const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
    const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
    const clientIds = new Set((members.data ?? []).map((m) => m.user_id));
    messages = (msgs.data ?? []).map((m) => ({ id: m.id, body: m.body, at: m.created_at, fromTeam: !clientIds.has(m.author_id), author: names.get(m.author_id) ?? "" }));
  }
  const c = current ? clients.find((x) => x.id === current.orgId) : undefined;

  return (
    <InboxView
      current={current?.id ?? null}
      items={threads.map((th) => ({
        id: th.id,
        org: th.org,
        element: th.element,
        kind: th.kind,
        kindLabel: t(KIND[th.kind].key),
        kindClass: KIND[th.kind].className,
        snippet: th.lastBody,
        unread: th.unread,
        answered: th.answered,
      }))}
      messages={messages}
      context={
        c && current
          ? {
              orgId: c.id,
              name: c.name,
              meta: [c.packageName, c.city].filter(Boolean).join(" · ").toLocaleUpperCase(locale),
              phase: phaseLabel(c).text,
              mrr: c.mrrCents ? t("inbox.perMonthUpper", { amount: formatMoney(c.mrrCents, locale) }) : "–",
              step: pick(c.nextStep, locale) || "–",
              stepClass: TONE_CLASS[c.tone],
              contact: current.contact,
            }
          : null
      }
    />
  );
}
