"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";
import { formatMoney, vatCents } from "@/lib/format";
import { confirmTransfer, createInvoiceAction, remindInvoice } from "@/app/admin/actions";

export type AdminInvoice = {
  id: string;
  number: string;
  org: string;
  month: string;
  status: "open" | "announced" | "paid" | "overdue";
  reminded: boolean;
  netLabel: string;
};

const STATUS = {
  open: { key: "invoiceStatus.open", className: "text-muted" },
  announced: { key: "invoiceStatus.announced", className: "text-accent" },
  paid: { key: "invoiceStatus.paid", className: "text-success-ink" },
  overdue: { key: "invoiceStatus.overdue", className: "text-danger" },
} as const;
const cols = "grid grid-cols-[minmax(0,1.4fr)_70px_100px_minmax(0,1.2fr)_70px_64px] items-center gap-3 px-5";
const label = "font-mono text-[10px] tracking-[0.12em] text-muted";
const field = "w-full rounded-field border border-field-line bg-inner px-[14px] py-3 text-[15px] text-ink placeholder:text-label";

/** "1.990" / "1.990,50" (DE) or "1,990.50" (EN) → cents. */
function parseAmount(raw: string, locale: Locale): number {
  const s = locale === "en" ? raw.replace(/,/g, "") : raw.replace(/\./g, "").replace(",", ".");
  const n = Number.parseFloat(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

export function InvoicesAdmin({ invoices, clients }: { invoices: AdminInvoice[]; clients: { id: string; name: string }[] }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ok, setOk] = useState("");
  const [pending, start] = useTransition();
  const [f, setF] = useState({ orgId: clients[0]?.id ?? "", kind: "once" as "once" | "subscription", description: "", amount: "", stripe: true, bank: true });
  const net = parseAmount(f.amount, locale);
  const abo = f.kind === "subscription";
  const ready = !!f.orgId && !!f.description.trim() && net > 0 && (f.stripe || abo || f.bank);

  const create = () => {
    if (!ready || pending) return;
    start(async () => {
      const r = await createInvoiceAction({ orgId: f.orgId, kind: f.kind, description: f.description, netCents: net, allowStripe: f.stripe || abo, allowBank: f.bank && !abo });
      if (r.ok) {
        setOk(t("adminInvoices.sentTo", { nr: r.number, org: clients.find((c) => c.id === f.orgId)?.name ?? "" }));
        setOpen(false);
        setF((s) => ({ ...s, description: "", amount: "" }));
      }
      router.refresh();
    });
  };
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  const check = (on: boolean) =>
    `flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[6px] border text-[13px] text-white ${on ? "border-brand bg-brand" : "border-strong-line bg-transparent"}`;

  return (
    <div className="flex min-h-0 flex-col gap-[14px] overflow-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div aria-live="polite" className="flex flex-wrap items-baseline gap-[10px] font-mono text-[11px] tracking-[0.1em] text-muted">
          <span>{t("adminInvoices.count", { count: invoices.length })}</span>
          {ok && <span className="text-success-ink">· {ok}</span>}
        </div>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            setOpen((o) => !o);
            setOk("");
          }}
          className={`cursor-pointer rounded-pill border-none px-[14px] py-2 font-mono text-[11px] whitespace-nowrap text-white ${open ? "bg-strong-line" : "bg-brand"}`}
        >
          {open ? t("common.xClose") : t("adminInvoices.create")}
        </button>
      </div>

      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
          className="grid grid-cols-1 gap-[22px] rounded-card border border-card-line bg-card p-[22px] wide:grid-cols-2"
        >
          <div className="flex flex-col gap-[14px]">
            <div className="flex flex-col gap-[6px]">
              <label htmlFor="inv-client" className={label}>{t("adminInvoices.client")}</label>
              <select id="inv-client" value={f.orgId} onChange={(e) => setF((s) => ({ ...s, orgId: e.target.value }))} className={field}>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div role="radiogroup" className="flex gap-[2px] self-start rounded-pill border border-field-line bg-inner p-[3px] font-mono text-[11px]">
              {(["once", "subscription"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={f.kind === k}
                  onClick={() => setF((s) => ({ ...s, kind: k }))}
                  className={`touch-target cursor-pointer rounded-pill border-none px-3 py-[7px] whitespace-nowrap ${f.kind === k ? "bg-ink text-on-light" : "bg-transparent text-muted"}`}
                >
                  {t(k === "once" ? "adminInvoices.once" : "adminInvoices.monthly")}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-[6px]">
              <label htmlFor="inv-item" className={label}>{t("adminInvoices.item")}</label>
              <input id="inv-item" value={f.description} maxLength={200} onChange={(e) => setF((s) => ({ ...s, description: e.target.value }))} placeholder={t("adminInvoices.itemPlaceholder")} className={field} />
            </div>
            <div className="flex flex-col gap-[6px]">
              <label htmlFor="inv-amount" className={label}>{t("adminInvoices.amountNet")}</label>
              <input id="inv-amount" value={f.amount} inputMode="decimal" onChange={(e) => setF((s) => ({ ...s, amount: e.target.value }))} placeholder={formatMoney(199000, locale).slice(1)} className={field} />
            </div>
          </div>
          <div className="flex flex-col gap-[14px]">
            <dl aria-live="polite" className="m-0 flex flex-col">
              <div className="flex justify-between py-[9px] text-[14px] text-muted">
                <dt>{t("adminInvoices.net")}</dt>
                <dd className="m-0 font-mono">{formatMoney(net, locale, { cents: true })}</dd>
              </div>
              <div className="flex justify-between border-t border-line py-[9px] text-[14px] text-muted">
                <dt>{t("adminInvoices.vat")}</dt>
                <dd className="m-0 font-mono">{formatMoney(vatCents(net), locale, { cents: true })}</dd>
              </div>
              <div className="flex justify-between border-t border-line py-[11px] text-[18px] font-bold">
                <dt>{t("adminInvoices.total")}</dt>
                <dd className="m-0 font-mono">{formatMoney(net + vatCents(net), locale, { cents: true })}</dd>
              </div>
            </dl>
            <span className={label}>{t("adminInvoices.methods")}</span>
            <div className="flex flex-col">
              <button type="button" role="checkbox" aria-checked={f.stripe || abo} onClick={() => !abo && setF((s) => ({ ...s, stripe: !s.stripe }))} className="flex cursor-pointer items-center gap-3 border-none bg-transparent py-[6px] text-left text-[14px] text-ink">
                <span className={check(f.stripe || abo)}>{f.stripe || abo ? "✓" : ""}</span>
                {t("adminInvoices.methodStripe")}
              </button>
              <button
                type="button"
                role="checkbox"
                aria-checked={f.bank && !abo}
                aria-disabled={abo}
                onClick={() => !abo && setF((s) => ({ ...s, bank: !s.bank }))}
                className="flex cursor-pointer items-center gap-3 border-none bg-transparent py-[6px] text-left text-[14px] text-ink aria-disabled:cursor-not-allowed"
              >
                <span className={check(f.bank && !abo)}>{f.bank && !abo ? "✓" : ""}</span>
                {t("adminInvoices.methodBank")}
              </button>
            </div>
            {abo && <span className="font-mono text-[10px] leading-[1.5] tracking-[0.08em] text-accent">{t("adminInvoices.aboNote")}</span>}
            <div className="mt-auto flex flex-wrap gap-2">
              <button
                type="submit"
                aria-disabled={!ready || pending}
                className={`rounded-pill border-none px-5 py-[13px] font-mono text-[12px] text-white ${ready ? "cursor-pointer bg-brand" : "cursor-not-allowed bg-approval-line"}`}
              >
                {t("adminInvoices.createSend")}
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="overflow-auto rounded-card border border-card-line bg-card">
        <table className="w-full min-w-[600px] border-collapse">
          <thead>
            <tr className={`${cols} border-b border-line py-3 font-mono text-[10px] tracking-[0.1em] text-label`}>
              <th className="p-0 text-left font-normal">{t("adminInvoices.client")}</th>
              <th className="p-0 text-left font-normal">{t("adminInvoices.month")}</th>
              <th className="p-0 text-left font-normal">{t("invoices.status")}</th>
              <th className="p-0" />
              <th className="p-0 text-right font-normal">{t("invoices.amount")}</th>
              <th className="p-0" />
            </tr>
          </thead>
          <tbody>
            {invoices.map((iv) => {
              const reminded = iv.reminded && iv.status === "overdue";
              return (
                <tr key={iv.id} className={`${cols} border-b border-line py-3 text-[14px]`}>
                  <td className="p-0 font-semibold">{iv.org}</td>
                  <td className="p-0 font-mono text-[12px] text-muted">{iv.month}</td>
                  <td className={`p-0 font-mono text-[11px] ${reminded ? "text-accent" : STATUS[iv.status].className}`}>
                    {reminded ? t("invoiceStatus.reminded") : t(STATUS[iv.status].key)}
                  </td>
                  <td className="p-0">
                    {iv.status === "overdue" && !reminded && (
                      <button type="button" disabled={pending} onClick={() => run(() => remindInvoice(iv.id))} className="touch-target cursor-pointer rounded-pill border border-approval-strong bg-transparent px-[10px] py-[7px] font-mono text-[11px] whitespace-nowrap text-accent">
                        {t("adminInvoices.remind")}
                      </button>
                    )}
                    {iv.status === "announced" && (
                      <button type="button" disabled={pending} onClick={() => run(() => confirmTransfer(iv.id))} className="touch-target cursor-pointer rounded-pill border border-success-line bg-transparent px-[10px] py-[7px] font-mono text-[11px] whitespace-nowrap text-success-ink">
                        {t("adminInvoices.markPaid")}
                      </button>
                    )}
                  </td>
                  <td className="p-0 text-right font-mono text-[12px]">{iv.netLabel}</td>
                  <td className="justify-self-end p-0">
                    <a href={`/rechnungen/${iv.number}/pdf`} className="touch-target rounded-pill border border-strong-line px-[9px] py-[6px] font-mono text-[11px] whitespace-nowrap text-ink hover:border-brand hover:text-ink">
                      {t("invoices.pdf")}
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
