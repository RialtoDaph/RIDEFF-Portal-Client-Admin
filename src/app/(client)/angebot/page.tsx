import { getTranslations } from "next-intl/server";
import { requireClient } from "@/lib/auth/session";
import { loadOffer } from "@/lib/client/data";
import { OfferDocument } from "@/components/client/offer-document";
import { OfferPanel } from "@/components/client/offer-panel";

export default async function OfferPage() {
  const session = await requireClient();
  const t = await getTranslations("offer");
  const offer = await loadOffer(session.membership.org.id);
  return (
    <main className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-auto px-4 py-[22px] wide:px-7">
      <div className="flex flex-col gap-[6px]">
        <h1 className="m-0 text-[28px] font-bold tracking-[-0.03em]">{t("title")}</h1>
        {offer && (
          <span className="font-mono text-[11px] tracking-[0.1em] text-muted">
            {offer.number} · {offer.packageName.toLocaleUpperCase("de-DE")}
          </span>
        )}
      </div>
      {offer && (
        <div className="grid grid-cols-1 items-start gap-[14px] wide:grid-cols-[minmax(0,1fr)_340px]">
          <OfferDocument offer={offer} orgName={session.membership.org.name} />
          <OfferPanel offer={offer} canAccept={session.membership.role === "inhaber"} />
        </div>
      )}
    </main>
  );
}
