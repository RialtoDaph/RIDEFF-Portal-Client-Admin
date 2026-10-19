import { getLocale, getTranslations } from "next-intl/server";
import { pick, type L10n, type Locale } from "@/i18n/config";
import { requireStaff } from "@/lib/auth/session";
import { WithQueue } from "@/components/admin/queue-column";
import { PipelineTable, type PipelineRow } from "@/components/admin/pipeline-table";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, formatTime, formatWeekdayDate } from "@/lib/format";
import type { LeadStage } from "@/lib/admin/leads";

type Lead = {
  id: string; name: string; stage: LeadStage; next_step: L10n | null; next_at: string | null; lost_reason: string | null;
  potential_monthly_cents: number | null; org_id: string | null; organizations: { status: string } | null;
};

// Pipeline: leads with stage, next step and potential; add, move, mark lost. Lost leads sit at the bottom.
export default async function PipelinePage() {
  const session = await requireStaff("support");
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select("id, name, stage, next_step, next_at, lost_reason, potential_monthly_cents, org_id, organizations(status)")
    .order("created_at");
  const leads = (data ?? []) as unknown as Lead[];

  const toClient = (l: Lead) => l.stage === "accepted" && (!l.organizations || l.organizations.status === "lead");
  const next = (l: Lead) => {
    if (l.stage === "lost") return l.lost_reason ?? "";
    if (l.stage === "accepted") return toClient(l) ? t("leadNext.addClient") : "";
    if (l.stage === "offer_sent") return t("leadNext.awaitReply");
    if (l.next_at) return `${formatWeekdayDate(l.next_at, locale)} · ${formatTime(l.next_at, locale)}`;
    return pick(l.next_step, locale);
  };

  const rows: PipelineRow[] = [...leads.filter((l) => l.stage !== "lost"), ...leads.filter((l) => l.stage === "lost")].map((l) => ({
    id: l.id,
    name: l.name,
    stage: l.stage,
    next: next(l),
    potential: l.potential_monthly_cents ? formatMoney(l.potential_monthly_cents, locale) : "–",
    addClientHref: toClient(l) ? (l.org_id ? `/admin/kunden/neu?org=${l.org_id}` : `/admin/kunden/neu?lead=${l.id}`) : null,
  }));

  return (
    <WithQueue role={session.staffRole}>
      <PipelineTable rows={rows} />
    </WithQueue>
  );
}
