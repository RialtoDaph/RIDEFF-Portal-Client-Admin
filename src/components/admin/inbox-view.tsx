"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { pick, type L10n, type Locale } from "@/i18n/config";
import { chatTime } from "@/lib/format";
import { isTyping, useKeydown } from "@/lib/hotkeys";
import { browserClient } from "@/lib/supabase/browser";
import { markThreadRead, replyToThread } from "@/app/admin/actions";

export type InboxItem = {
  id: string;
  org: string;
  element: L10n;
  kind: string;
  kindLabel: string;
  kindClass: string;
  snippet: string;
  unread: boolean;
  answered: boolean;
};
export type InboxMessage = { id: string; body: string; at: string; fromTeam: boolean; author: string };
export type InboxContext = { orgId: string; name: string; meta: string; phase: string; mrr: string; step: string; stepClass: string; contact: string };

/** Inbox: threads · conversation · context. J/K move between threads, S skips to the next open one, ↵ sends. */
export function InboxView({ items, current, messages, context }: { items: InboxItem[]; current: string | null; messages: InboxMessage[]; context: InboxContext | null }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const idx = Math.max(0, items.findIndex((i) => i.id === current));
  const cur = items[idx];
  const go = (i: number) => items[i] && router.push(`/admin/inbox?t=${items[i].id}`);

  // opening a thread marks the client's messages as read
  useEffect(() => {
    if (cur?.unread) markThreadRead(cur.id).then(() => router.refresh());
  }, [cur?.id, cur?.unread, router]);

  // new messages anywhere: reload (RLS limits what arrives)
  useEffect(() => {
    const channel = browserClient()
      .channel("inbox")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => router.refresh())
      .subscribe();
    return () => {
      browserClient().removeChannel(channel);
    };
  }, [router]);

  useKeydown((e) => {
    if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    const k = e.key.toLowerCase();
    if (k === "j") go(Math.min(items.length - 1, idx + 1));
    else if (k === "k") go(Math.max(0, idx - 1));
    else if (k === "s") {
      for (let n = 1; n <= items.length; n++) {
        const j = (idx + n) % items.length;
        if (!items[j].answered) return go(j);
      }
    }
  });

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cur || !draft.trim() || pending) return;
    start(async () => {
      const r = await replyToThread(cur.id, draft);
      if (r.ok) setDraft("");
      router.refresh();
    });
  };
  const open = items.filter((i) => !i.answered).length;
  const labels = { now: t("time.now"), yesterday: t("time.yesterday") };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[14px]">
      <div className="flex flex-none flex-col gap-[6px]">
        <h1 className="m-0 text-[28px] font-bold tracking-[-0.03em]">{t("inbox.title")}</h1>
        <span aria-live="polite" className="font-mono text-[11px] tracking-[0.1em] whitespace-nowrap text-muted">
          {t("inbox.open", { count: open })} · {t("inbox.perItem")}
        </span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-[14px] wide:grid-cols-[300px_minmax(0,1fr)_250px]">
        <nav aria-label={t("inbox.title")} className="flex min-h-0 flex-col overflow-auto rounded-card border border-card-line bg-card">
          {items.map((it, i) => {
            const on = i === idx;
            return (
              <Link
                key={it.id}
                href={`/admin/inbox?t=${it.id}`}
                aria-current={on ? "true" : undefined}
                className={`flex flex-col gap-[5px] border-b border-line px-[18px] py-[14px] text-ink hover:bg-hover hover:text-ink ${on ? "bg-hover shadow-[inset_2px_0_0_var(--color-brand)]" : ""}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-semibold">{it.org}</span>
                  <span className="font-mono text-[11px] text-success-ink">{it.answered ? "✓" : ""}</span>
                  <span className={`h-2 w-2 rounded-pill ${it.unread ? "bg-brand" : "bg-transparent"}`} />
                </span>
                <span className={`font-mono text-[10px] tracking-[0.1em] ${it.kindClass}`}>
                  {it.kindLabel} · {pick(it.element, locale)}
                </span>
                <span className="truncate text-[13px] text-muted">{it.snippet}</span>
              </Link>
            );
          })}
        </nav>
        <section className="flex min-h-[420px] min-w-0 flex-col rounded-card border border-card-line bg-card wide:min-h-0">
          {cur && (
            <>
              <div className="flex flex-col gap-1 border-b border-line px-5 py-4">
                <span className="font-mono text-[10px] tracking-[0.12em] text-muted">{t("inbox.element")}</span>
                <h2 className="m-0 text-[18px] font-bold tracking-[-0.02em]">{pick(cur.element, locale)}</h2>
                <span className={`font-mono text-[11px] tracking-[0.06em] ${cur.kindClass}`}>
                  {cur.org}
                  {context?.contact ? ` · ${context.contact}` : ""}
                </span>
              </div>
              <ol aria-live="polite" className="m-0 flex min-h-[200px] flex-1 list-none flex-col gap-2 overflow-auto px-5 py-[18px] [&>li:first-child]:mt-auto">
                {messages.map((m) => (
                  <li
                    key={m.id}
                    className={`flex max-w-[84%] flex-col gap-[2px] rounded-inner border px-3 py-[10px] text-[14px] leading-[1.45] ${
                      m.fromTeam ? "self-end border-ink bg-ink text-on-light" : "self-start border-field-line bg-chip text-ink"
                    }`}
                  >
                    <span className={`font-mono text-[10px] tracking-[0.08em] ${m.fromTeam ? "text-on-light-muted" : "text-muted"}`}>
                      {m.author.split(" ")[0].toLocaleUpperCase(locale)} · {chatTime(m.at, locale, labels)}
                    </span>
                    <span className="break-words whitespace-pre-wrap">{m.body}</span>
                  </li>
                ))}
              </ol>
              <form onSubmit={send} className="border-t border-line px-4 py-3">
                <div className="flex items-center gap-2 rounded-pill border border-field-line bg-inner py-[6px] pr-[6px] pl-4 focus-within:border-brand">
                  <span aria-hidden className="font-mono text-brand">›</span>
                  <input
                    value={draft}
                    maxLength={5000}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={t("inbox.placeholder")}
                    aria-label={t("inbox.placeholder")}
                    className="min-w-0 flex-1 border-none bg-transparent text-[14px] text-ink outline-none placeholder:text-label focus-visible:outline-none"
                  />
                  <button type="submit" disabled={pending} className="touch-target cursor-pointer rounded-pill border-none bg-brand px-3 py-[10px] font-mono text-[11px] text-white">
                    {t("common.send")}
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
        {context && (
          <aside className="flex flex-col gap-[14px] self-start rounded-card border border-card-line bg-card p-5">
            <span className="font-mono text-[10px] tracking-[0.12em] text-muted">{t("inbox.context")}</span>
            <div className="flex flex-col gap-1">
              <span className="text-[20px] font-bold tracking-[-0.02em]">{context.name}</span>
              <span className="font-mono text-[11px] tracking-[0.08em] text-muted">{context.meta}</span>
            </div>
            <div className="flex flex-col gap-[2px]">
              <span className="font-mono text-[10px] tracking-[0.12em] text-muted">{t("clients.colPhase")}</span>
              <span className="font-mono text-[13px]">{context.phase}</span>
            </div>
            <div className="flex flex-col gap-[2px]">
              <span className="font-mono text-[10px] tracking-[0.12em] text-muted">{t("kpi.mrr")}</span>
              <span className="text-[18px] font-bold">{context.mrr}</span>
            </div>
            <div className="flex flex-col gap-[2px]">
              <span className="font-mono text-[10px] tracking-[0.12em] text-muted">{t("clients.colNext")}</span>
              <span className={`text-[14px] font-semibold ${context.stepClass}`}>{context.step}</span>
            </div>
            <Link
              href={`/admin/kunden/${context.orgId}`}
              className="self-start rounded-pill border border-strong-line px-[14px] py-[9px] font-mono text-[11px] whitespace-nowrap text-ink hover:text-ink"
            >
              {t("inbox.openClient")}
            </Link>
          </aside>
        )}
      </div>
    </div>
  );
}
