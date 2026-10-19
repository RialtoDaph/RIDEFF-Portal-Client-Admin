"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";
import { formatDayMonth, formatMoney, formatTime } from "@/lib/format";
import { isTyping, useKeydown } from "@/lib/hotkeys";
import type { Offer } from "@/lib/client/data";
import { acceptOffer } from "@/app/(client)/angebot/actions";
import { useReadOnly } from "./view-as";

/** "Passt das Angebot so?": summary, AGB checkbox, approval. ↵ approves once the box is ticked. */
export function OfferPanel({ offer, canAccept: mayAccept }: { offer: Offer; canAccept: boolean }) {
  const readOnly = useReadOnly();
  const canAccept = mayAccept && !readOnly;
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [agb, setAgb] = useState(false);
  const [pending, start] = useTransition();
  const open = offer.status === "sent";
  const ready = open && canAccept && agb && !pending;

  const accept = () => {
    if (!ready) return;
    start(async () => {
      await acceptOffer(offer.id, true);
      router.refresh();
    });
  };

  useKeydown((e) => {
    if (e.key !== "Enter" || isTyping(e) || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    if (ready) {
      e.preventDefault();
      accept();
    }
  });

  const rows: [string, string][] = [
    [t("offer.panel.package"), offer.packageName],
    [t("offer.panel.setup"), formatMoney(offer.setupCents, locale)],
    [t("offer.panel.monthly"), formatMoney(offer.monthlyCents, locale)],
    [t("offer.panel.term"), t("time.months", { count: offer.termMonths })],
    [t("offer.panel.hosting"), t("common.included")],
  ];
  const at = offer.acceptedAt ? `${formatDayMonth(offer.acceptedAt, locale)} · ${formatTime(offer.acceptedAt, locale)}` : "";

  return (
    <aside className="flex flex-col gap-4 rounded-card border border-card-line bg-card p-[22px]">
      <h2 className="m-0 text-[22px] leading-[1.2] font-bold tracking-[-0.02em]">{t("offer.panel.title")}</h2>
      <dl className="m-0 flex flex-col">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-t border-line py-[10px]">
            <dt className="font-mono text-[10px] tracking-[0.12em] text-muted">{k}</dt>
            <dd className="m-0 font-mono text-[13px]">{v}</dd>
          </div>
        ))}
      </dl>
      <div aria-live="polite">
        {open ? (
          canAccept && (
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={agb}
                  aria-labelledby="agb-text"
                  onClick={() => setAgb((v) => !v)}
                  className="-my-[11px] -ml-[11px] flex h-11 w-11 flex-none cursor-pointer items-center justify-center border-none bg-transparent p-0"
                >
                  <span
                    className={`flex h-[22px] w-[22px] items-center justify-center rounded-[6px] border text-[13px] text-white ${
                      agb ? "border-brand bg-brand" : "border-approval-strong bg-transparent"
                    }`}
                  >
                    {agb ? "✓" : ""}
                  </span>
                </button>
                <span id="agb-text" className="text-[14px] leading-[1.45]">
                  {t.rich("offer.agb", {
                    agb: (chunks) => (
                      <a href="https://rideff.com/agb" target="_blank" rel="noopener">
                        {chunks}
                      </a>
                    ),
                  })}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <button
                  type="button"
                  onClick={accept}
                  aria-disabled={!ready}
                  className={`rounded-pill border-none px-5 py-[13px] font-mono text-[12px] text-white ${
                    ready ? "cursor-pointer bg-brand hover:bg-brand-hover" : pending ? "cursor-wait bg-brand" : "cursor-not-allowed bg-approval-line"
                  }`}
                >
                  {t("offer.approve")}
                </button>
                <span className="min-w-[180px] flex-1 font-mono text-[10px] leading-[1.5] tracking-[0.08em] text-accent-soft">{t("offer.legal")}</span>
              </div>
            </div>
          )
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-[14px] rounded-card border border-success-line bg-success px-[22px] py-[18px]">
            <span aria-hidden className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-pill bg-success-dot text-[13px] text-white">✓</span>
            <div className="flex min-w-[200px] flex-1 flex-col gap-[3px]">
              <span className="text-[16px] font-semibold">{t("offer.done.title")}</span>
              <span className="font-mono text-[11px] tracking-[0.06em] text-success-ink">{t("offer.done.sub", { at })}</span>
            </div>
            <Link
              href="/rechnungen"
              className="rounded-pill border border-success-line px-3 py-[9px] font-mono text-[11px] whitespace-nowrap text-success-ink hover:text-success-ink"
            >
              {t("offer.done.toInvoices")}
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}
