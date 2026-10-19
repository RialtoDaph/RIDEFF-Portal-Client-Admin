import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { formatMoney } from "@/lib/format";
import { OFFER_GROUPS, isOfferGroup } from "@/lib/offer/catalog";
import type { Offer } from "@/lib/client/data";

/** The quote on warm paper (left column of Angebot). */
export async function OfferDocument({ offer, orgName }: { offer: Offer; orgName: string }) {
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const row = "flex justify-between gap-3 border-t border-paper-line py-[11px] text-[15px]";
  return (
    <article className="flex min-w-0 flex-col gap-[22px] rounded-card border border-paper-line bg-paper p-6 text-paper-ink wide:p-8">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[18px] font-bold tracking-[0.02em]">RIDEFF</span>
        <span className="font-mono text-[11px] tracking-[0.1em] text-paper-muted">{t("offer.docLabel", { nr: offer.number })}</span>
      </div>
      <h2 className="m-0 text-[34px] leading-none font-bold tracking-[-0.04em]">
        {t("offer.headline", { package: offer.packageName, org: orgName })}
      </h2>
      <div className="flex flex-col">
        <div className="flex justify-between pb-2 font-mono text-[10px] tracking-[0.12em] text-paper-muted">
          <span>{t("offer.service")}</span>
          <span>{t("offer.amount")}</span>
        </div>
        {offer.groups.filter(isOfferGroup).map((g) => (
          <section key={g} className="flex flex-col gap-[10px] border-t border-paper-line py-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="m-0 text-[17px] font-semibold tracking-[-0.01em]">{t(`offer.group.${g}.title`)}</h3>
              <span className="font-mono text-[12px] text-paper-muted">{t("common.included")}</span>
            </div>
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,210px),1fr))] gap-x-[18px] gap-y-[6px] p-0">
              {Array.from({ length: OFFER_GROUPS[g] }, (_, i) => (
                <li key={i} className="flex gap-2 text-[14px] leading-[1.4] text-paper-muted">
                  <span aria-hidden className="flex-none text-brand">✓</span>
                  {t(`offer.group.${g}.${i + 1}`)}
                </li>
              ))}
            </ul>
          </section>
        ))}
        <div className={row}>
          <span>{t("offer.setupOnce")}</span>
          <span className="font-mono text-[13px]">{formatMoney(offer.setupCents, locale)}</span>
        </div>
        <div className={row}>
          <span>{t("offer.monthlyRow", { package: offer.packageName })}</span>
          <span className="font-mono text-[13px]">{formatMoney(offer.monthlyCents, locale)}</span>
        </div>
        <div className={row}>
          <span>{t("offer.term")}</span>
          <span className="font-mono text-[13px]">{t("time.months", { count: offer.termMonths })}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-[6px]">
        {(["eu", "built", "portal"] as const).map((c) => (
          <span key={c} className="rounded-pill border border-paper-line px-[10px] py-[6px] font-mono text-[10px] tracking-[0.1em] whitespace-nowrap text-paper-muted">
            {t(`offer.chip.${c}`)}
          </span>
        ))}
      </div>
      <span className="font-mono text-[10px] tracking-[0.1em] text-paper-muted">{t("money.netNote")}</span>
    </article>
  );
}
