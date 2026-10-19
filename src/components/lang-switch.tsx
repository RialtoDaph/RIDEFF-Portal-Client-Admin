"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { locales } from "@/i18n/config";
import { setLocale } from "@/app/actions/locale";

/** DE · EN · ID pill switch (login footer and profile menu). */
export function LangSwitch() {
  const current = useLocale();
  const t = useTranslations("profile");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div role="group" aria-label={t("language")} className="flex gap-[2px] rounded-pill border border-field-line bg-inner p-[3px]">
      {locales.map((l) => {
        const on = l === current;
        return (
          <button
            key={l}
            type="button"
            lang={l}
            aria-pressed={on}
            disabled={pending}
            onClick={() => start(async () => {
              await setLocale(l);
              router.refresh();
            })}
            className={`touch-target cursor-pointer rounded-pill border-none px-[9px] py-[5px] font-mono text-[11px] tracking-[0.06em] ${
              on ? "bg-ink text-on-light" : "bg-transparent text-muted hover:text-ink"
            }`}
          >
            {l.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
