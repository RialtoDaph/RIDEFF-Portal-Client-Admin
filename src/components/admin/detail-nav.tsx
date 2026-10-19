"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { isTyping, useKeydown } from "@/lib/hotkeys";

/** Back (Esc) and previous/next client (K/J) on the detail view. */
export function DetailNav({ prev, next }: { prev: string | null; next: string | null }) {
  const t = useTranslations("detail");
  const router = useRouter();
  const go = (id: string | null) => id && router.push(`/admin/kunden/${id}`);
  useKeydown((e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Escape") {
      e.preventDefault();
      router.push("/admin");
      return;
    }
    if (isTyping(e)) return;
    const k = e.key.toLowerCase();
    if (k === "j") go(next);
    else if (k === "k") go(prev);
  });
  const small = "touch-target cursor-pointer rounded-[6px] border border-field-line bg-transparent px-[9px] py-[5px] font-mono text-[11px] text-muted disabled:opacity-40";
  return (
    <div className="flex items-center justify-between gap-3">
      <button type="button" onClick={() => router.push("/admin")} className="touch-target cursor-pointer border-none bg-transparent p-0 font-mono text-[11px] tracking-[0.08em] text-muted hover:text-ink">
        {t("back")}
      </button>
      <div className="flex gap-[6px]">
        <button type="button" disabled={!prev} onClick={() => go(prev)} className={small}>{t("prev")}</button>
        <button type="button" disabled={!next} onClick={() => go(next)} className={small}>{t("next")}</button>
      </div>
    </div>
  );
}
