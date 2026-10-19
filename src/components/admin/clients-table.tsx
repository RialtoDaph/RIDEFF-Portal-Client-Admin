"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { isTyping, useKeydown } from "@/lib/hotkeys";

export type TableRow = {
  id: string;
  num: string;
  name: string;
  phase: { text: string; className: string };
  step: string;
  stepClass: string;
  mrr: string;
  needsAction: boolean;
};

const cols = "grid grid-cols-[24px_minmax(0,1.3fr)_76px_minmax(0,1.5fr)_56px_16px] gap-3 px-5";

/** Kunden table. J/K select, ↵ opens, F toggles "Nur mit Aktion". */
export function ClientsTable({ rows, initialFilter = false }: { rows: TableRow[]; initialFilter?: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const [filter, setFilter] = useState(initialFilter);
  const [sel, setSel] = useState(0);
  const shown = filter ? rows.filter((r) => r.needsAction) : rows;
  const current = Math.min(sel, Math.max(0, shown.length - 1));
  const open = (id: string) => router.push(`/admin/kunden/${id}`);

  useKeydown((e) => {
    if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    const k = e.key.toLowerCase();
    if (k === "j") setSel(Math.min(shown.length - 1, current + 1));
    else if (k === "k") setSel(Math.max(0, current - 1));
    else if (k === "f") {
      setFilter((f) => !f);
      setSel(0);
    } else if (e.key === "Enter" && shown[current]) {
      e.preventDefault();
      open(shown[current].id);
    } else return;
  });

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-card border border-card-line bg-card">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[580px] border-collapse">
          <thead>
            <tr className={`${cols} border-b border-line py-3 font-mono text-[10px] tracking-[0.1em] text-label`}>
              <th className="p-0 text-left font-normal">{t("clients.colNum")}</th>
              <th className="p-0 text-left font-normal">{t("clients.colClient")}</th>
              <th className="p-0 text-left font-normal">{t("clients.colPhase")}</th>
              <th className="p-0 text-left font-normal">{t("clients.colNext")}</th>
              <th className="p-0 text-right font-normal">{t("kpi.mrr")}</th>
              <th className="p-0" />
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => {
              const on = i === current;
              return (
                <tr
                  key={r.id}
                  onClick={() => open(r.id)}
                  aria-selected={on}
                  className={`${cols} cursor-pointer items-baseline border-b border-line py-3 text-[14px] hover:bg-hover ${on ? "bg-hover shadow-[inset_2px_0_0_var(--color-brand)]" : ""}`}
                >
                  <td className="p-0 font-mono text-[11px] text-label">{r.num}</td>
                  <td className="p-0 font-semibold">
                    <Link href={`/admin/kunden/${r.id}`} onClick={(e) => e.stopPropagation()} className="text-ink hover:text-ink">
                      {r.name}
                    </Link>
                  </td>
                  <td className={`p-0 font-mono text-[11px] ${r.phase.className}`}>{r.phase.text}</td>
                  <td className={`p-0 ${r.stepClass}`}>{r.step}</td>
                  <td className="p-0 text-right font-mono text-[12px]">{r.mrr}</td>
                  <td aria-hidden className="p-0 text-label">→</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 py-3 font-mono text-[11px] tracking-[0.08em] text-label">
        <span>
          {t("clients.hint")}{" "}
          <button
            type="button"
            aria-pressed={filter}
            onClick={() => {
              setFilter((f) => !f);
              setSel(0);
            }}
            className={`touch-target cursor-pointer border-none bg-transparent p-0 tracking-[inherit] ${filter ? "text-accent" : "text-label"}`}
          >
            {filter ? t("clients.filterAll") : t("clients.filterAction")}
          </button>
        </span>
        <span className="flex flex-none items-center gap-[14px] whitespace-nowrap">
          <span aria-live="polite" className={filter ? "text-accent" : "text-label"}>
            {shown.length} / {rows.length}
          </span>
          <Link
            href="/admin/kunden/neu"
            className="rounded-pill bg-brand px-3 py-[7px] font-mono text-[11px] tracking-[0.04em] whitespace-nowrap text-white hover:bg-brand-hover hover:text-white"
          >
            {t("clients.add")}
          </Link>
        </span>
      </div>
    </div>
  );
}
