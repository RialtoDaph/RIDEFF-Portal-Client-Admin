"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { isTyping, useKeydown } from "@/lib/hotkeys";
import { remindInvoice, sendOffer, snoozeCard } from "@/app/admin/actions";

export type QueueView = {
  key: string;
  title: string;
  kind: "info" | "offer" | "invoice";
  snoozed: boolean;
  /** info cards: the CTA link ("KUNDE ANLEGEN →") */
  href?: string;
  /** action target id */
  target?: string;
};

/**
 * "KI · HEUTE ENTSCHEIDEN": cards computed from the data (rules, not AI yet).
 * The action button runs the action, S (or "S SPÄTER") brings the top card back tomorrow.
 */
export function DecisionQueue({ cards, intro }: { cards: QueueView[]; intro: { id: string; name: string; when: string }[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [later, setLater] = useState<Record<string, boolean>>({});
  const [pending, start] = useTransition();

  const state = (c: QueueView) => (done[c.key] ? "done" : (later[c.key] ?? c.snoozed) ? "later" : "open");
  const actionable = cards.filter((c) => c.kind !== "info");
  const openCount = actionable.filter((c) => state(c) === "open").length;
  const hotKey = actionable.find((c) => c.kind === "offer" && state(c) === "open")?.key;

  const act = (c: QueueView) =>
    start(async () => {
      const r = c.kind === "offer" ? await sendOffer(c.target!) : await remindInvoice(c.target!);
      if (r.ok) setDone((d) => ({ ...d, [c.key]: true }));
      router.refresh();
    });
  const snooze = (c: QueueView, on: boolean) =>
    start(async () => {
      setLater((l) => ({ ...l, [c.key]: on }));
      await snoozeCard(c.key, on);
    });

  useKeydown((e) => {
    if (e.key.toLowerCase() !== "s" || isTyping(e) || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    const top = actionable.find((c) => state(c) === "open");
    if (top) snooze(top, true);
  });

  return (
    <div className="flex min-h-0 flex-col gap-[10px]">
      <h2 aria-live="polite" className="m-0 p-[2px] font-mono text-[11px] font-normal tracking-[0.12em] text-accent">
        {t("queue.header", { count: openCount })}
      </h2>
      {cards.map((c) => {
        const s = state(c);
        const hot = c.key === hotKey;
        const tone = c.kind === "info" ? "border-success-line bg-success text-ink" : hot ? "border-brand bg-brand text-white" : "border-card-line bg-card text-ink";
        return (
          <div key={c.key} className={`flex flex-col gap-[10px] rounded-menu border px-[18px] py-4 transition-opacity ${tone} ${s === "open" ? "" : "opacity-70"}`}>
            <span className="text-[15px] leading-[1.35] font-semibold">{c.title}</span>
            {c.kind !== "info" && s === "open" && (
              <div className="flex flex-wrap gap-[6px] font-mono text-[11px]">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act(c)}
                  className={`touch-target cursor-pointer rounded-pill border-none px-3 py-[9px] whitespace-nowrap ${hot ? "bg-white text-on-light" : "bg-brand text-white"}`}
                >
                  {c.kind === "offer" ? t("queue.reviewSend") : t("queue.sendReminder")}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => snooze(c, true)}
                  className={`touch-target cursor-pointer rounded-pill border bg-transparent px-3 py-[9px] whitespace-nowrap ${hot ? "border-[rgba(255,255,255,0.6)] text-white" : "border-strong-line text-ink"}`}
                >
                  {t("queue.later")}
                </button>
              </div>
            )}
            {s !== "open" && (
              <div className="flex justify-between font-mono text-[11px] text-muted">
                <span>{s === "later" ? t("queue.backTomorrow") : c.kind === "offer" ? t("queue.offerSent") : t("queue.reminderSent")}</span>
                {s === "later" && (
                  <button type="button" onClick={() => snooze(c, false)} className="touch-target cursor-pointer border-none bg-transparent p-0 text-muted">
                    {t("common.undo")}
                  </button>
                )}
              </div>
            )}
            {c.href && (
              <Link href={c.href} className="self-start rounded-pill bg-ink px-3 py-[9px] font-mono text-[11px] text-on-light hover:text-on-light">
                {t("queue.addClient")}
              </Link>
            )}
          </div>
        );
      })}
      {intro.length > 0 && (
        <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-menu border border-card-line bg-card px-[18px] py-4">
          <span className="text-[15px] font-semibold">{t("queue.introCalls")}</span>
          {intro.map((l) => (
            <div key={l.id} className="flex justify-between text-[13px] text-ink-soft">
              <span>{l.name}</span>
              <span className="font-mono text-[11px] text-muted">{l.when}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
