import { getLocale, getTranslations } from "next-intl/server";
import { pick, type L10n, type Locale } from "@/i18n/config";
import { requireStaff } from "@/lib/auth/session";
import { WithQueue } from "@/components/admin/queue-column";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, formatTime, formatWeekdayDate } from "@/lib/format";

const cols = "grid grid-cols-[minmax(0,1.4fr)_120px_minmax(0,1.4fr)_80px] gap-3 px-5";
const STAGE = {
  intro_call: { key: "leadStage.intro_call", className: "text-muted" },
  analysis_done: { key: "leadStage.analysis_done", className: "text-accent" },
  offer_sent: { key: "leadStage.offer_sent", className: "text-success-ink" },
  accepted: { key: "leadStage.accepted", className: "text-success-ink" },
} as const;

type Lead = {
  id: string; name: string; stage: keyof typeof STAGE; next_step: L10n | null; next_at: string | null;
  potential_monthly_cents: number | null; organizations: { status: string } | null;
};

// Pipeline: leads with stage, next step and potential. Adding and moving leads comes with step 8.
export default async function PipelinePage() {
  const session = await requireStaff("support");
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select("id, name, stage, next_step, next_at, potential_monthly_cents, organizations(status)")
    .order("created_at");
  const leads = (data ?? []) as unknown as Lead[];

  const next = (l: Lead) => {
    if (l.stage === "accepted") return l.organizations?.status === "lead" ? t("leadNext.addClient") : "";
    if (l.stage === "offer_sent") return t("leadNext.awaitReply");
    if (l.next_at) return `${formatWeekdayDate(l.next_at, locale)} · ${formatTime(l.next_at, locale)}`;
    return pick(l.next_step, locale);
  };

  return (
    <WithQueue role={session.staffRole}>
      <div className="min-h-0 overflow-auto rounded-card border border-card-line bg-card">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr className={`${cols} border-b border-line py-3 font-mono text-[10px] tracking-[0.1em] text-label`}>
              <th className="p-0 text-left font-normal">{t("pipeline.lead")}</th>
              <th className="p-0 text-left font-normal">{t("pipeline.stage")}</th>
              <th className="p-0 text-left font-normal">{t("pipeline.next")}</th>
              <th className="p-0 text-right font-normal">{t("pipeline.potential")}</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id} className={`${cols} items-baseline border-b border-line py-[13px] text-[14px]`}>
                <td className="p-0 font-semibold">{l.name}</td>
                <td className={`p-0 font-mono text-[11px] ${STAGE[l.stage].className}`}>{t(STAGE[l.stage].key)}</td>
                <td className="p-0 text-muted">{next(l)}</td>
                <td className="p-0 text-right font-mono text-[12px]">{l.potential_monthly_cents ? formatMoney(l.potential_monthly_cents, locale) : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </WithQueue>
  );
}
