import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { daysUntil } from "@/lib/format";
import type { ProjectSummary } from "@/lib/client/data";

const pad = (n: number) => String(n).padStart(2, "0");

/** STATUS: percentage, phase line and the 5-phase bar. */
export async function StatusCard({ project }: { project: ProjectSummary }) {
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const { phase, progressPct: pct } = project;
  const live = phase >= 5;
  const days = project.goLive ? daysUntil(project.goLive) : null;
  const phaseLine =
    days !== null && days > 0
      ? t("project.phaseLine", { num: pad(phase), phase: t(`phaseName.${phase}`), days })
      : t("project.phaseLineShort", { num: pad(phase), phase: t(`phaseName.${phase}`) });

  return (
    <section aria-labelledby="status-label" className="flex flex-col gap-4 rounded-card border border-card-line bg-card p-[22px]">
      <div className="flex justify-between font-mono text-[11px] tracking-[0.12em] text-muted">
        <span id="status-label">{t("project.status")}</span>
        <span className="text-accent">{t("project.inProgress")}</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-[6px]">
        <span className="text-[56px] leading-[0.9] font-bold tracking-[-0.06em] wide:text-[72px]">
          {pct}
          <span className="text-[32px] text-muted">%</span>
        </span>
        <span className="text-[15px] text-muted">{phaseLine}</span>
      </div>
      <ol className="m-0 flex list-none gap-[3px] p-0 font-mono text-[11px]" aria-label={phaseLine} lang={locale}>
        {[1, 2, 3, 4, 5].map((n) => {
          const done = live || n < phase;
          const current = !live && n === phase;
          const radius = n === 1 ? "rounded-[6px_2px_2px_6px]" : n === 5 ? "rounded-[2px_6px_6px_2px]" : "rounded-[2px]";
          return (
            <li
              key={n}
              aria-current={current ? "step" : undefined}
              className={`overflow-hidden px-[9px] py-[7px] whitespace-nowrap ${radius} ${
                current ? "flex-[2.4] text-white" : done ? "flex-1 bg-chip text-success-ink" : "flex-1 bg-sunken text-label"
              }`}
              style={current ? { background: `linear-gradient(90deg,var(--color-brand) ${pct}%,var(--color-progress-track) ${pct}%)` } : undefined}
            >
              {pad(n)}
              {done ? " ✓" : ""}
              {current ? ` ${t(`phase.${n}`)}` : ""}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
