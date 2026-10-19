import { getTranslations } from "next-intl/server";
import { BrandMark } from "@/components/brand-mark";
import { LangSwitch } from "@/components/lang-switch";

/** Centered login column: brand, optional heading, card, footer. */
export async function LoginShell({ heading, children }: { heading?: React.ReactNode; children: React.ReactNode }) {
  const t = await getTranslations();
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-6">
      <div className="flex w-full max-w-[400px] flex-col gap-6">
        <div className="flex items-center gap-[10px]">
          <BrandMark size={26} />
          <span className="text-[17px] font-bold tracking-[0.02em]">RIDEFF</span>
          <span className="font-mono text-[11px] tracking-[0.1em] text-accent">{t("common.portal")}</span>
        </div>
        {heading}
        <div className="flex flex-col gap-3 rounded-card border border-card-line bg-card p-5">{children}</div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-mono text-[10px] tracking-[0.12em] text-label">{t("auth.footer")}</span>
          <LangSwitch />
        </div>
      </div>
    </main>
  );
}
