"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export type PaletteItem = { label: string; kind: string; href: string };

/**
 * ⌘K / Ctrl+K (also from the header search button): jump to any screen or client.
 * ↑↓ choose, ↵ go, Esc close. Without a match it shows the "KI fragen" line; the AI answer comes later.
 */
export function Palette({ items }: { items: PaletteItem[] }) {
  const t = useTranslations("palette");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const before = useRef<HTMLElement | null>(null);

  const show = (on: boolean) => {
    if (on) before.current = document.activeElement as HTMLElement | null;
    setOpen(on);
    setQ("");
    setSel(0);
    if (!on) before.current?.focus();
  };

  useEffect(() => {
    const toggle = () => show(!open);
    const onKey = (e: KeyboardEvent) => {
      // works while typing too, as in the design
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      } else if (open && e.key === "Escape") {
        // the palette is the innermost layer
        e.preventDefault();
        e.stopImmediatePropagation();
        show(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("rideff:palette", toggle);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("rideff:palette", toggle);
    };
  });

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  if (!open) return null;
  const needle = q.trim().toLowerCase();
  const list = items.filter((i) => !needle || i.label.toLowerCase().includes(needle) || i.kind.toLowerCase().includes(needle));
  const cur = Math.min(sel, Math.max(0, list.length - 1));
  const go = (i: PaletteItem) => {
    setOpen(false);
    router.push(i.href);
  };

  return (
    <div onClick={() => show(false)} className="fixed inset-0 z-[100] flex justify-center bg-[rgba(0,0,0,0.55)] px-4 pt-[14vh]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("placeholder")}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[560px] self-start overflow-hidden rounded-card border border-field-line bg-card shadow-palette"
      >
        <div className="flex items-center gap-[10px] border-b border-line px-[18px] py-[14px]">
          <span aria-hidden className="font-mono text-brand">›</span>
          <input
            ref={input}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={list[cur] ? `palette-${cur}` : undefined}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel(Math.min(list.length - 1, cur + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel(Math.max(0, cur - 1));
              } else if (e.key === "Enter" && list[cur]) {
                e.preventDefault();
                go(list[cur]);
              }
            }}
            placeholder={t("placeholder")}
            aria-label={t("placeholder")}
            className="min-w-0 flex-1 border-none bg-transparent text-[16px] text-ink outline-none placeholder:text-label focus-visible:outline-none"
          />
          <span className="font-mono text-[10px] text-label">ESC</span>
        </div>
        <div id="palette-list" role="listbox" className="flex max-h-[50vh] flex-col overflow-auto p-[6px]">
          {list.map((i, n) => (
            <button
              key={i.href + i.label}
              id={`palette-${n}`}
              type="button"
              role="option"
              aria-selected={n === cur}
              onMouseEnter={() => setSel(n)}
              onClick={() => go(i)}
              className={`flex cursor-pointer items-center justify-between rounded-field border-none px-3 py-[11px] text-left text-[14px] text-ink ${n === cur ? "bg-raised" : "bg-transparent"}`}
            >
              <span>{i.label}</span>
              <span className="font-mono text-[10px] tracking-[0.1em] text-muted">{i.kind}</span>
            </button>
          ))}
          {list.length === 0 && (
            <div aria-live="polite" className="flex items-baseline gap-[10px] px-3 py-[14px] text-[14px] text-muted">
              <span className="rounded-[4px] bg-brand px-[6px] py-[2px] font-mono text-[10px] text-white">KI</span>
              {t("ai", { q: q.trim() })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
