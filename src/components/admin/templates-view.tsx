"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

export type TemplateRow = { key: string; kind: "angebot" | "freigabe" | "erinnerung" | "start"; name: string; body: string };
const KIND_CLASS = { angebot: "text-accent", freigabe: "text-accent-soft", erinnerung: "text-danger", start: "text-success-ink" } as const;

/** Vorlagen: list on the left, body with {Variablen} and "Kopieren" on the right. */
export function TemplatesView({ templates }: { templates: TemplateRow[] }) {
  const t = useTranslations();
  const [sel, setSel] = useState(0);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const cur = templates[sel];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cur.body);
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="grid min-h-0 grid-cols-1 overflow-hidden rounded-card border border-card-line bg-card wide:grid-cols-[220px_minmax(0,1fr)]">
      <div role="tablist" aria-orientation="vertical" className="flex flex-col overflow-auto border-line wide:border-r">
        {templates.map((tp, i) => {
          const on = i === sel;
          return (
            <button
              key={tp.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => {
                setSel(i);
                setCopied(false);
              }}
              className={`flex cursor-pointer flex-col gap-1 border-0 border-b border-solid border-line px-[18px] py-[14px] text-left text-ink hover:bg-hover ${on ? "bg-hover shadow-[inset_2px_0_0_var(--color-brand)]" : "bg-transparent"}`}
            >
              <span className={`font-mono text-[10px] tracking-[0.12em] ${KIND_CLASS[tp.kind]}`}>{t(`templateKind.${tp.kind}`)}</span>
              <span className="text-[14px] font-semibold">{tp.name}</span>
            </button>
          );
        })}
      </div>
      {cur && (
        <div role="tabpanel" className="flex min-h-0 flex-col gap-3 overflow-auto px-[22px] py-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="m-0 text-[20px] font-bold tracking-[-0.02em]">{cur.name}</h2>
            <button
              type="button"
              onClick={copy}
              aria-live="polite"
              className={`touch-target cursor-pointer rounded-pill border-none px-[14px] py-2 font-mono text-[11px] whitespace-nowrap text-white ${copied ? "bg-copied" : "bg-brand"}`}
            >
              {copied ? t("common.copied") : t("common.copy")}
            </button>
          </div>
          <div className="rounded-inner border border-line bg-inner p-4 text-[14px] leading-[1.6] whitespace-pre-wrap text-ink-soft">{cur.body}</div>
          <span className="font-mono text-[10px] tracking-[0.1em] text-label">{t("templates.vars")}</span>
        </div>
      )}
    </div>
  );
}
