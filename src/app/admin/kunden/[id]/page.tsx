import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pick, type Locale } from "@/i18n/config";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadClients } from "@/lib/admin/data";
import { TONE_CLASS } from "@/lib/admin/labels";
import { logText, tagColor } from "@/lib/client/log";
import { formatDayMonth, formatMoney, formatMonthYear } from "@/lib/format";
import { DetailNav } from "@/components/admin/detail-nav";
import { RemindButton } from "@/components/admin/remind-button";
import { ProjectEditor } from "@/components/admin/project-editor";
import { startViewAs } from "@/app/actions/view-as";

const label = "font-mono text-[10px] tracking-[0.12em] text-muted";
const inner = "flex flex-col gap-[6px] rounded-inner border border-line bg-inner p-4";

export default async function ClientDetail({ params }: PageProps<"/admin/kunden/[id]">) {
  const session = await requireStaff("support", "builder");
  const { id } = await params;
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const clients = await loadClients();
  const idx = clients.findIndex((c) => c.id === id);
  if (idx < 0) notFound();
  const c = clients[idx];

  const supabase = await createClient();
  const [log, overdue, projects] = await Promise.all([
    supabase.from("activity_log").select("id, created_at, tag, event, params, text").eq("org_id", id).order("created_at", { ascending: false }).limit(30),
    supabase.from("invoices").select("id").eq("org_id", id).in("status", ["open", "overdue"]).lt("due_on", new Date().toISOString().slice(0, 10)).order("due_on").limit(1).maybeSingle(),
    supabase.from("projects").select("id, name, phase, progress_pct, go_live").eq("org_id", id).order("created_at"),
  ]);
  const canRemind = !!overdue.data && (session.staffRole === "owner" || session.staffRole === "finanzen");

  const meta = [
    c.status === "lead" && !c.packageName ? "LEAD" : c.packageName,
    c.city,
    c.status === "lead"
      ? t("clients.requestFrom", { date: formatDayMonth(c.createdAt, locale) })
      : c.liveSince
        ? t("clients.liveSince", { month: formatMonthYear(c.liveSince, locale) })
        : c.since
          ? t("clients.since", { month: formatMonthYear(c.since, locale) })
          : null,
  ].filter(Boolean).join(" · ").toLocaleUpperCase(locale);

  const live = (c.phase ?? 0) >= 5;
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-auto rounded-card border border-card-line bg-card px-[22px] py-5">
      <DetailNav prev={clients[idx - 1]?.id ?? null} next={clients[idx + 1]?.id ?? null} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-[6px]">
          <h1 className="m-0 text-[32px] leading-none font-bold tracking-[-0.04em]">{c.name}</h1>
          <span className="font-mono text-[11px] tracking-[0.1em] text-muted">{meta}</span>
          <form action={startViewAs.bind(null, c.id)} className="pt-1">
            <button type="submit" className="touch-target cursor-pointer rounded-pill border border-strong-line bg-transparent px-3 py-[7px] font-mono text-[11px] tracking-[0.08em] text-ink hover:border-brand">
              {t("detail.viewAsClient")}
            </button>
          </form>
        </div>
        <div className="flex flex-col items-end gap-[2px]">
          <span className={label}>{t("kpi.mrr")}</span>
          <span className="text-[24px] font-bold">{c.mrrCents ? formatMoney(c.mrrCents, locale) : "–"}</span>
        </div>
      </div>
      <ol className="m-0 flex list-none gap-[3px] p-0 font-mono text-[11px]">
        {[1, 2, 3, 4, 5].map((n) => {
          const p = c.phase ?? 0;
          const done = live || n < p;
          const cur = !live && n === p;
          return (
            <li
              key={n}
              aria-current={cur ? "step" : undefined}
              className={`overflow-hidden rounded-[3px] px-[9px] py-[7px] whitespace-nowrap ${cur ? "flex-[2.4] text-white" : done ? "flex-1 bg-chip text-success-ink" : "flex-1 bg-sunken text-label"}`}
              style={cur ? { background: `linear-gradient(90deg,var(--color-brand) ${c.pct}%,var(--color-progress-track) ${c.pct}%)` } : undefined}
            >
              {String(n).padStart(2, "0")}
              {done ? " ✓" : ""}
              {cur ? ` ${t(`phase.${n}`)}` : ""}
            </li>
          );
        })}
      </ol>
      <div className="grid grid-cols-1 gap-3 wide:grid-cols-2">
        <div className={inner}>
          <span className={label}>{t("detail.contact")}</span>
          <span className="text-[15px] font-semibold">{c.contactName ?? "–"}</span>
          {c.contactEmail && <a href={`mailto:${c.contactEmail}`} className="text-[13px] break-all">{c.contactEmail}</a>}
        </div>
        <div className={`${inner} gap-2`}>
          <span className={label}>{t("clients.colNext")}</span>
          <span className={`text-[15px] font-semibold ${TONE_CLASS[c.tone]}`}>{pick(c.nextStep, locale) || "–"}</span>
          {canRemind && (
            <RemindButton
              invoiceId={overdue.data!.id}
              className="touch-target self-start cursor-pointer rounded-pill border-none bg-brand px-3 py-2 font-mono text-[11px] text-white disabled:opacity-70"
            />
          )}
        </div>
      </div>
      {c.status === "client" && (
        <ProjectEditor
          orgId={c.id}
          projects={(projects.data ?? []).map((p) => ({ id: p.id, name: p.name, phase: p.phase, pct: p.progress_pct, goLive: p.go_live }))}
          canApprove={session.staffRole === "owner" || session.staffRole === "builder"}
        />
      )}
      <div className="flex flex-col">
        <h2 className={`${label} m-0 pb-[6px] font-normal`}>{t("detail.activity")}</h2>
        <ol className="m-0 list-none p-0">
          {(log.data ?? []).map((l) => (
            <li key={l.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 border-t border-line py-[9px] wide:grid-cols-[84px_80px_minmax(0,1fr)]">
              <time dateTime={l.created_at} className="font-mono text-[11px] text-label">{formatDayMonth(l.created_at, locale)}</time>
              <span className={`font-mono text-[11px] ${tagColor(l.tag)}`}>{t(`tag.${l.tag}`)}</span>
              <span className={`col-span-full text-[14px] wide:col-span-1 ${l.params?.undone ? "text-label line-through" : ""}`}>{logText(l, t, locale)}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
