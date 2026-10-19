import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { formatMoney } from "@/lib/format";
import { loadKpis, type Kpis } from "@/lib/admin/data";

const label = "font-mono text-[10px] tracking-[0.12em] text-muted";
const cell = "flex flex-col gap-1 border-line px-5 py-4";

/** MRR with 12-month bars, Kunden, Freigaben, Offen, Leads. Shown above every admin tab. */
export async function KpiStrip() {
  return <KpiStripView k={await loadKpis()} />;
}

export async function KpiStripView({ k }: { k: Kpis }) {
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const max = Math.max(...k.mrrBars, 1);
  const pct = k.mrrTrendPct === null ? null : new Intl.NumberFormat(locale === "en" ? "en-GB" : "de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(k.mrrTrendPct) + " %";

  return (
    <section aria-label="KPI" className="grid grid-cols-2 rounded-card border border-card-line bg-card wide:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))]">
      <div className="col-span-2 flex items-end gap-4 border-r border-b border-line px-5 py-4 wide:col-span-1 wide:border-b-0">
        <div className="flex flex-col gap-1">
          <span className={label}>{t("kpi.mrr")}</span>
          <span className="text-[30px] font-bold tracking-[-0.03em]">{formatMoney(k.mrrCents, locale)}</span>
          {pct && <span className="font-mono text-[11px] text-success-ink">{t("kpi.mrrTrend", { pct })}</span>}
        </div>
        <div aria-hidden className="flex h-[52px] flex-1 items-end gap-[3px]">
          {k.mrrBars.map((v, i) => (
            <span
              key={i}
              className={`flex-1 rounded-[2px] ${i === 11 ? "bg-brand" : i === 10 ? "bg-strong-line" : "bg-card-line"}`}
              style={{ height: `${Math.max(4, (v / max) * 100)}%` }}
            />
          ))}
        </div>
      </div>
      <div className={`${cell} border-r`}>
        <span className={label}>{t("kpi.clients")}</span>
        <span className="text-[26px] font-bold">{k.clients}</span>
        <span className="font-mono text-[11px] text-muted">{t("kpi.inBuild", { count: k.inBuild })}</span>
      </div>
      <div className={`${cell} wide:border-r`}>
        <span className={label}>{t("kpi.approvals")}</span>
        <span className="text-[26px] font-bold text-accent">{k.approvals}</span>
        <span className="font-mono text-[11px] text-muted">{t("kpi.maxDays", { count: k.approvalsMaxDays })}</span>
      </div>
      <div className={`${cell} border-t border-r wide:border-t-0`}>
        <span className={label}>{t("kpi.open")}</span>
        <span className="text-[26px] font-bold text-danger">{k.openCents === null ? "–" : formatMoney(k.openCents, locale)}</span>
        {k.overdueCount > 0 && (
          <span className="font-mono text-[11px] text-danger">{k.allOverdueReminded ? t("kpi.reminded") : t("kpi.overdue", { count: k.overdueCount })}</span>
        )}
      </div>
      <div className={`${cell} border-t wide:border-t-0`}>
        <span className={label}>{t("kpi.leads")}</span>
        <span className="text-[26px] font-bold">{k.leadsThisWeek}</span>
        <span className="font-mono text-[11px] text-muted">{t("kpi.thisWeek")}</span>
      </div>
    </section>
  );
}
