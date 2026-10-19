"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";
import { chatTime } from "@/lib/format";
import { isTyping, useKeydown } from "@/lib/hotkeys";
import { browserClient } from "@/lib/supabase/browser";
import { markAllNotificationsRead, markNotificationRead } from "@/app/actions/notifications";

export type BellData = {
  userId: string;
  unread: number;
  items: { id: string; tag: string; text: string; href: string; at: string; read: boolean }[];
};

/** Bell with the unread count; N opens it. New rows arrive via Realtime and refresh the list. */
export function NotificationBell({ data }: { data: BellData }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    const supabase = browserClient();
    const channel = supabase
      .channel(`notifications:${data.userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${data.userId}` }, () => router.refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [data.userId, router]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      setOpen(false);
      button.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  useKeydown((e) => {
    if ((e.key === "n" || e.key === "N") && !isTyping(e) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      setOpen((o) => !o);
    }
  });

  const go = (item: BellData["items"][number]) =>
    start(async () => {
      setOpen(false);
      if (!item.read) await markNotificationRead(item.id);
      router.push(item.href);
    });

  const count = data.unread > 9 ? "9+" : String(data.unread);
  const labels = { now: t("time.now"), yesterday: t("time.yesterday") };

  return (
    <div ref={wrap} className="relative">
      <button
        ref={button}
        type="button"
        aria-label={data.unread ? `${t("notif.label")} · ${t("notif.unread", { count: data.unread })}` : t("notif.label")}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="touch-target relative flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-pill border border-field-line bg-transparent text-muted hover:border-brand hover:text-ink"
      >
        <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {data.unread > 0 && (
          <span aria-hidden className="absolute -top-[5px] -right-[5px] min-w-[18px] rounded-pill bg-brand px-[5px] py-[1px] text-center font-mono text-[10px] leading-[16px] tracking-normal text-white">
            {count}
          </span>
        )}
      </button>
      <span aria-live="polite" className="sr-only">{data.unread ? t("notif.unread", { count: data.unread }) : ""}</span>
      {open && (
        <div
          id={panelId}
          className="fixed inset-x-4 top-[64px] z-90 flex max-h-[70vh] flex-col rounded-menu border border-field-line bg-card tracking-normal shadow-menu wide:absolute wide:inset-x-auto wide:top-[44px] wide:right-0 wide:w-[360px]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <span className="font-mono text-[10px] tracking-[0.12em] text-muted">{t("notif.title")}</span>
            {data.unread > 0 && (
              <button
                type="button"
                onClick={() => start(async () => { await markAllNotificationsRead(); router.refresh(); })}
                className="touch-target cursor-pointer border-none bg-transparent font-mono text-[10px] tracking-[0.08em] text-brand hover:text-brand-hover"
              >
                {t("notif.markAll")}
              </button>
            )}
          </div>
          {data.items.length === 0 ? (
            <p className="m-0 px-4 py-6 text-[14px] text-muted">{t("notif.empty")}</p>
          ) : (
            <ul className="m-0 list-none overflow-auto p-0">
              {data.items.map((n) => (
                <li key={n.id} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    onClick={() => go(n)}
                    className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 border-none bg-transparent px-4 py-3 text-left hover:bg-hover"
                  >
                    <span className="font-mono text-[10px] tracking-[0.1em] text-label">{n.tag}</span>
                    <span className="flex items-center gap-2 font-mono text-[10px] text-label">
                      {chatTime(n.at, locale, labels)}
                      {!n.read && <span aria-label={t("notif.unread", { count: 1 })} className="h-[7px] w-[7px] rounded-pill bg-brand" />}
                    </span>
                    <span className={`col-span-2 text-[14px] leading-[1.4] ${n.read ? "text-muted" : "text-ink"}`}>{n.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
