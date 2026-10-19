import { getLocale, getTranslations } from "next-intl/server";
import { pick, type Locale } from "@/i18n/config";
import { requireClient } from "@/lib/auth/session";
import { loadInvoices } from "@/lib/client/data";
import { formatDayMonth, formatMoney } from "@/lib/format";

const cols = "grid grid-cols-[110px_minmax(0,2fr)_100px_130px_90px_96px_64px] gap-3 px-5";
const STATUS_COLOR = { open: "text-muted", paid: "text-success-ink", announced: "text-accent", overdue: "text-danger" } as const;

export default async function InvoicesPage() {
  const session = await requireClient();
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const invoices = await loadInvoices(session.membership.org.id);
  const open = invoices.filter((i) => i.status === "open" || i.status === "overdue").length;
  // Only the Inhaber pays. The pay modal arrives in step 4.
  const canPay = session.membership.role === "inhaber";

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-auto px-4 py-[22px] wide:px-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="m-0 text-[28px] font-bold tracking-[-0.03em]">{t("invoices.title")}</h1>
        <span className={`font-mono text-[11px] tracking-[0.1em] ${open ? "text-accent" : "text-success-ink"}`}>
          {open ? t("invoices.nOpen", { count: open }) : t("invoices.allPaid")}
        </span>
      </div>
      <div className="overflow-x-auto rounded-card border border-card-line bg-card">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className={`${cols} border-b border-line py-3 font-mono text-[10px] tracking-[0.1em] text-label`}>
              <th className="p-0 text-left font-normal">{t("invoices.nr")}</th>
              <th className="p-0 text-left font-normal">{t("invoices.item")}</th>
              <th className="p-0 text-left font-normal">{t("invoices.date")}</th>
              <th className="p-0 text-left font-normal">{t("invoices.status")}</th>
              <th className="p-0 text-right font-normal">{t("invoices.amount")}</th>
              <th className="p-0" />
              <th className="p-0" />
            </tr>
          </thead>
          <tbody>
            {invoices.map((iv) => (
              <tr key={iv.id} className={`${cols} items-baseline border-b border-line py-[13px] text-[14px]`}>
                <td className="p-0 font-mono text-[12px] text-muted">{iv.number}</td>
                <td className="p-0">{pick(iv.description, locale)}</td>
                <td className="p-0 font-mono text-[12px] text-muted">{formatDayMonth(iv.issuedOn, locale)}</td>
                <td className={`p-0 font-mono text-[11px] ${STATUS_COLOR[iv.status]}`}>{t(`invoiceStatus.${iv.status}`)}</td>
                <td className="p-0 text-right font-mono text-[13px]">{formatMoney(iv.netCents, locale)}</td>
                <td className="justify-self-end p-0">
                  {canPay && (iv.status === "open" || iv.status === "overdue") && (
                    <button type="button" className="touch-target cursor-pointer rounded-pill border-none bg-brand px-[10px] py-[6px] font-mono text-[11px] whitespace-nowrap text-white hover:bg-brand-hover">
                      {t("invoices.pay")}
                    </button>
                  )}
                </td>
                <td className="justify-self-end p-0">
                  {iv.hasPdf && (
                    <a
                      href={`/rechnungen/${iv.number}/pdf`}
                      className="touch-target rounded-pill border border-strong-line px-[9px] py-[6px] font-mono text-[11px] whitespace-nowrap text-ink hover:border-brand hover:text-ink"
                    >
                      {t("invoices.pdf")}
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
