"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { pick, type L10n, type Locale } from "@/i18n/config";
import { formatMoney } from "@/lib/format";
import { useKeydown } from "@/lib/hotkeys";
import type { Bank } from "@/lib/billing/settings";
import { announceTransfer, startCheckout } from "@/app/(client)/rechnungen/actions";

export type PayableInvoice = {
  id: string;
  number: string;
  description: L10n;
  kind: "once" | "subscription";
  netCents: number;
  grossCents: number;
  status: "open" | "announced" | "paid" | "overdue";
  allowStripe: boolean;
  allowBank: boolean;
};

type Phase = "choose" | "redirect" | "paid" | "announced";

/** BEZAHLEN: Stripe (card, SEPA, Klarna) or bank transfer. Paid status comes from the Stripe webhook. */
export function PayModal(props: { invoice: PayableInvoice; bank: Bank; stripeReady: boolean; returning: boolean; onClose: () => void }) {
  const { invoice, bank } = props;
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const methods = [...(invoice.allowStripe && props.stripeReady ? ["stripe" as const] : []), ...(invoice.allowBank ? ["bank" as const] : [])];
  const [method, setMethod] = useState(methods[0]);
  const [chosen, setPhase] = useState<Phase>("choose");
  // the webhook may book the payment while the modal is open
  const phase: Phase = invoice.status === "paid" ? "paid" : chosen;
  const [pending, start] = useTransition();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => before?.focus();
  }, []);

  // back from Stripe: wait for the webhook (up to ~30 s), then show "Bezahlt"
  useEffect(() => {
    if (!props.returning || invoice.status === "paid") return;
    let n = 0;
    const timer = setInterval(() => {
      n += 1;
      router.refresh();
      if (n >= 15) clearInterval(timer);
    }, 2000);
    return () => clearInterval(timer);
  }, [props.returning, invoice.status, router]);

  useKeydown((e) => {
    if (e.key === "Escape" && !e.defaultPrevented) {
      e.preventDefault();
      props.onClose();
    }
  });

  const pay = () =>
    start(async () => {
      if (method === "stripe") {
        setPhase("redirect");
        const r = await startCheckout(invoice.id);
        if ("url" in r) window.location.assign(r.url);
        else setPhase("choose");
      } else if (method === "bank") {
        const r = await announceTransfer(invoice.id);
        if (r.ok) setPhase("announced");
        router.refresh();
      }
    });

  return (
    <div onClick={props.onClose} className="fixed inset-0 z-[130] flex items-center justify-center bg-[rgba(0,0,0,0.72)] p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pay-amount"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-[460px] flex-col gap-4 overflow-auto rounded-[18px] border border-field-line bg-card p-[22px]"
      >
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] tracking-[0.12em] text-accent">{t("pay.invoice", { nr: invoice.number })}</span>
          <button
            ref={closeRef}
            type="button"
            aria-label={t("common.close")}
            onClick={props.onClose}
            className="touch-target h-[34px] w-[34px] cursor-pointer rounded-pill border border-field-line bg-transparent text-[16px] text-ink"
          >
            ×
          </button>
        </div>
        <div className="flex flex-col gap-[6px]">
          <span id="pay-amount" className="text-[44px] leading-none font-bold tracking-[-0.05em]">
            {formatMoney(invoice.grossCents, locale, { cents: true })}
          </span>
          <span className="font-mono text-[11px] tracking-[0.06em] text-muted">
            {t("pay.netVat", { net: formatMoney(invoice.netCents, locale, { cents: true }) })}
            {invoice.kind === "subscription" ? t("pay.monthlySuffix") : ""}
          </span>
          <span className="text-[14px] text-ink-soft">{pick(invoice.description, locale)}</span>
        </div>

        <div aria-live="polite" className="flex flex-col gap-4">
          {phase === "choose" && methods.length > 0 && (
            <>
              <div role="radiogroup" className="flex flex-col gap-[10px]">
                {methods.map((m) => {
                  const on = method === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setMethod(m)}
                      className={`flex cursor-pointer items-center gap-3 rounded-inner border p-[14px] text-left text-ink ${on ? "border-brand bg-approval" : "border-field-line bg-inner"}`}
                    >
                      <span className={`h-[18px] w-[18px] flex-none rounded-pill border-2 ${on ? "border-brand bg-brand" : "border-field-line bg-transparent"}`} />
                      <span className="flex flex-col gap-[3px]">
                        <span className="text-[15px] font-semibold">{t(m === "stripe" ? "pay.stripe" : "pay.bank")}</span>
                        <span className="font-mono text-[10px] tracking-[0.08em] text-muted">{t(m === "stripe" ? "pay.stripeSub" : "pay.bankSub")}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {method === "bank" && (
                <dl className="m-0 flex flex-col gap-2 rounded-inner border border-line bg-inner p-[14px] font-mono text-[12px]">
                  {[
                    [t("pay.recipient"), bank.recipient],
                    [t("pay.iban"), bank.iban],
                    [t("pay.reference"), invoice.number],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3">
                      <dt className="text-label">{k}</dt>
                      <dd className="m-0 text-right break-all select-all">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={pay}
                className="cursor-pointer rounded-pill border-none bg-brand px-5 py-[14px] font-mono text-[12px] text-white hover:bg-brand-hover disabled:cursor-wait"
              >
                {t(method === "stripe" ? "pay.toStripe" : "pay.transferred")}
              </button>
            </>
          )}
          {phase === "redirect" && <span className="py-[14px] font-mono text-[12px] tracking-[0.08em] text-accent">{t("pay.redirecting")}</span>}
          {phase === "paid" && (
            <div className="flex flex-col gap-1 rounded-inner border border-success-line bg-success p-4">
              <span className="text-[16px] font-semibold">{t("pay.paid.title")}</span>
              <span className="font-mono text-[11px] tracking-[0.06em] text-success-ink">{t("pay.paid.sub")}</span>
            </div>
          )}
          {phase === "announced" && (
            <div className="flex flex-col gap-1 rounded-inner border border-approval-line bg-approval p-4">
              <span className="text-[16px] font-semibold">{t("pay.bankDone.title")}</span>
              <span className="font-mono text-[11px] tracking-[0.06em] text-accent-soft">{t("pay.bankDone.sub")}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
