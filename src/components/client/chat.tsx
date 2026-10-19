"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";
import { chatTime } from "@/lib/format";
import { browserClient } from "@/lib/supabase/browser";
import type { ChatMessage } from "@/lib/client/data";
import { refreshThread, sendMessage } from "@/app/(client)/actions";
import { useReadOnly } from "./view-as";

/** "FRAGEN SIE RIALTO": the thread of the open item (or the project's general thread), live. */
export function Chat({ threadId, initial, me }: { threadId: string; initial: ChatMessage[]; me: string }) {
  const readOnly = useReadOnly();
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const [messages, setMessages] = useState(initial);
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const list = useRef<HTMLOListElement>(null);

  // new messages arrive through Realtime (RLS applies); reloading also marks them read
  useEffect(() => {
    let live = true;
    const reload = () => refreshThread(threadId).then((m) => live && m.length && setMessages(m));
    reload();
    const channel = browserClient()
      .channel(`thread:${threadId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `thread_id=eq.${threadId}` }, reload)
      .subscribe();
    return () => {
      live = false;
      browserClient().removeChannel(channel);
    };
  }, [threadId]);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages]);

  const send = () => {
    const body = draft.trim();
    if (!body || pending || readOnly) return;
    start(async () => {
      const r = await sendMessage(threadId, body);
      if (!r.ok) return;
      setDraft("");
      const m = await refreshThread(threadId);
      if (m.length) setMessages(m);
    });
  };

  const labels = { now: t("time.now"), yesterday: t("time.yesterday") };
  return (
    <section aria-labelledby="chat-label" className="flex min-h-[260px] flex-1 flex-col gap-[10px] rounded-card border border-card-line bg-card px-[22px] py-5">
      <h2 id="chat-label" className="m-0 font-mono text-[11px] font-normal tracking-[0.12em] text-muted">
        {t("chat.title")}
      </h2>
      <ol ref={list} aria-live="polite" className="m-0 flex min-h-0 flex-1 list-none flex-col gap-2 overflow-auto p-0 [&>li:first-child]:mt-auto">
        {messages.map((m) => {
          const mine = m.authorId === me;
          const who = mine ? t("chat.you") : (m.authorName.split(" ")[0] || "").toLocaleUpperCase(locale);
          return (
            <li
              key={m.id}
              className={`flex max-w-[88%] flex-col gap-[2px] rounded-inner border px-3 py-[10px] text-[13px] leading-[1.45] ${
                mine ? "self-end border-ink bg-ink text-on-light" : "self-start border-field-line bg-chip text-ink"
              }`}
            >
              <span className={`font-mono text-[10px] tracking-[0.08em] ${mine ? "text-on-light-muted" : "text-muted"}`}>
                {who} · {chatTime(m.createdAt, locale, labels)}
              </span>
              <span className="whitespace-pre-wrap break-words">{m.body}</span>
            </li>
          );
        })}
      </ol>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex items-center gap-2 rounded-pill border border-field-line bg-inner py-[6px] pr-[6px] pl-4 focus-within:border-brand"
      >
        <span aria-hidden className="font-mono text-brand">›</span>
        <input
          value={draft}
          maxLength={5000}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("chat.placeholder")}
          aria-label={t("chat.placeholder")}
          className="min-w-0 flex-1 border-none bg-transparent text-[14px] text-ink outline-none placeholder:text-label focus-visible:outline-none"
        />
        <button type="submit" disabled={pending || readOnly} className="touch-target cursor-pointer rounded-pill border-none bg-brand px-3 py-[10px] font-mono text-[11px] text-white">
          {t("common.send")}
        </button>
      </form>
    </section>
  );
}
