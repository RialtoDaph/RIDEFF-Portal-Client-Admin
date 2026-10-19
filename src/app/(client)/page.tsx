import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pick, type Locale } from "@/i18n/config";
import { requireClient } from "@/lib/auth/session";
import { getProjects, loadProjectPage } from "@/lib/client/data";
import { logText, tagColor } from "@/lib/client/log";
import { formatLogTime, formatMoney, formatMonth, formatTime, formatWeekdayDate } from "@/lib/format";
import { StatusCard } from "@/components/client/status-card";
import { Approval } from "@/components/client/approval";
import { Chat } from "@/components/client/chat";

const card = "rounded-card border border-card-line bg-card";
const label = "m-0 font-mono text-[11px] font-normal tracking-[0.12em] text-muted";

export default async function ProjectPage() {
  const session = await requireClient();
  if (session.membership.org.status === "lead") redirect("/angebot");
  const { current } = await getProjects(session.membership.org.id);
  if (!current) return <main className="flex-1" />;

  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const data = await loadProjectPage(current, session.membership, session.userId);
  const canDecide = session.membership.role === "inhaber";
  const monthly = data.latestMonthly;

  return (
    <main className="grid min-h-0 flex-1 grid-cols-1 gap-[14px] px-4 py-[22px] wide:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] wide:grid-rows-[minmax(0,1fr)] wide:px-7">
      <div className="flex min-h-0 flex-col gap-[14px]">
        <StatusCard project={current} />
        {data.approval && <Approval key={data.approval.id + data.approval.status} item={data.approval} canDecide={canDecide} goLive={current.goLive} />}
        <section aria-labelledby="log-label" className={`${card} flex min-h-0 flex-1 flex-col overflow-auto px-[22px] py-[18px] text-[13px]`}>
          <h2 id="log-label" className={`${label} pb-2`}>{t("project.log")}</h2>
          <ol className="m-0 list-none p-0">
            {data.log.map((l) => (
              <li
                key={l.id}
                className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 border-t border-line py-[9px] wide:grid-cols-[84px_80px_minmax(0,1fr)]"
              >
                <time dateTime={l.at} className="font-mono text-[11px] text-label">{formatLogTime(l.at, locale)}</time>
                <span className={`font-mono text-[11px] ${tagColor(l.tag)}`}>{t(`tag.${l.tag}`)}</span>
                <span className="col-span-full text-[14px] wide:col-span-1">{logText(l, t, locale)}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <div className="flex min-h-0 flex-col gap-[14px]">
        {data.meeting && (
          <section aria-labelledby="meeting-label" className={`${card} flex flex-col gap-[10px] px-[22px] py-5`}>
            <h2 id="meeting-label" className={label}>{t("meeting.next")}</h2>
            <span className="text-[26px] font-bold tracking-[-0.03em]">
              {formatWeekdayDate(data.meeting.startsAt, locale)} · {formatTime(data.meeting.startsAt, locale)}
            </span>
            <span className="text-[14px] text-muted">{pick(data.meeting.title, locale)}</span>
            <span className="font-mono text-[11px] text-accent">{t("meeting.linkBefore")}</span>
          </section>
        )}
        {data.pkg && (
          <section aria-labelledby="package-label" className={`${card} flex flex-col gap-[10px] px-[22px] py-5`}>
            <h2 id="package-label" className={label}>{t("package.title")}</h2>
            <div className="flex items-baseline justify-between">
              <span className="text-[22px] font-bold">{data.pkg.name}</span>
              <span className="font-mono text-[14px]">{t("money.perMonth", { amount: formatMoney(data.pkg.monthlyCents, locale) })}</span>
            </div>
            {monthly && (
              <div className="flex justify-between border-t border-line pt-2 font-mono text-[12px] text-muted">
                <span>{formatMonth(monthly.serviceFrom ?? monthly.issuedOn, locale).toLocaleUpperCase(locale)}</span>
                <span className={monthly.status === "paid" ? "text-success-ink" : monthly.status === "overdue" ? "text-danger" : "text-muted"}>
                  {monthly.status === "paid" ? t("package.paid") : t(`invoiceStatus.${monthly.status}`)}
                </span>
              </div>
            )}
          </section>
        )}
        {data.thread && <Chat threadId={data.thread.id} initial={data.thread.messages} me={session.userId} />}
      </div>
    </main>
  );
}
