"use client";

/* eslint-disable @next/next/no-img-element -- preview images come from signed Storage URLs */
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { pick, type Locale } from "@/i18n/config";
import { formatDayMonth, formatWeekdayDate } from "@/lib/format";
import { isTyping, useKeydown } from "@/lib/hotkeys";
import type { ApprovalItem } from "@/lib/client/data";
import { approveItem, requestChange, undoDecision } from "@/app/(client)/actions";

const pill = "cursor-pointer rounded-pill font-mono text-[12px] px-[14px] py-[10px] whitespace-nowrap disabled:cursor-wait";

/**
 * The approval card on Projekt and its preview modal.
 * Keys: ↵ opens the preview, E the change request; in the preview ↵ approves, E asks for a change;
 * Esc closes the innermost layer; ⌘↵ sends the change. Only an Inhaber can decide.
 */
export function Approval({ item, canDecide, goLive }: { item: ApprovalItem; canDecide: boolean; goLive: string | null }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "edit">("idle");
  const [preview, setPreview] = useState(false);
  const [device, setDevice] = useState<"desk" | "mob">("desk");
  const [text, setText] = useState("");
  const [pending, start] = useTransition();

  const title = pick(item.title, locale);
  const isOpen = item.status === "open";
  const deadline = item.deadline ? formatWeekdayDate(item.deadline, locale).toLocaleUpperCase(locale) : null;
  const deadlineLine = deadline
    ? goLive
      ? t("project.approval.deadline", { deadline, golive: formatDayMonth(goLive, locale) })
      : t("project.approval.deadline", { deadline, golive: "" }).replace(/ · [^·]*$/, "")
    : null;

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });
  const approve = () => {
    if (!canDecide || !isOpen || pending) return;
    setPreview(false);
    run(() => approveItem(item.id));
  };
  const sendChange = () => {
    if (!canDecide || !text.trim() || pending) return;
    run(async () => {
      const r = await requestChange(item.id, text);
      if (r.ok) {
        setText("");
        setMode("idle");
      }
    });
  };

  useKeydown((e) => {
    if (e.defaultPrevented || !isOpen) return;
    if (e.key === "Escape") {
      if (preview) setPreview(false);
      else if (mode === "edit") setMode("idle");
      else return;
      e.preventDefault();
      return;
    }
    if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (e.key === "Enter") {
      e.preventDefault();
      if (preview) approve();
      else if (mode === "idle") setPreview(true);
    } else if (k === "e" && canDecide) {
      e.preventDefault();
      setPreview(false);
      setMode("edit");
    }
  });

  // ── decided: green card ──────────────────────────────────────────────
  if (!isOpen) {
    const approved = item.status === "approved";
    const next = item.afterApproval ? pick(item.afterApproval, locale).toLocaleUpperCase(locale) : null;
    const sub = approved
      ? goLive && next
        ? t("project.approved.sub", { golive: formatDayMonth(goLive, locale), next })
        : null
      : item.revisionDue && item.draftNo
        ? t("project.changeSent.sub", { n: item.draftNo + 1, date: formatWeekdayDate(item.revisionDue, locale).toLocaleUpperCase(locale) })
        : null;
    const canUndo = canDecide && item.undoable;
    return (
      <div aria-live="polite" className="flex flex-wrap items-center gap-x-4 gap-y-[14px] rounded-card border border-success-line bg-success px-[22px] py-[18px]">
        <span aria-hidden className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-pill bg-success-dot text-[13px] text-white">✓</span>
        <div className="flex min-w-[200px] flex-1 flex-col gap-[3px]">
          <span className="text-[16px] font-semibold">
            {approved ? t("project.approved.title", { title }) : t("project.changeSent.title")}
          </span>
          {sub && <span className="font-mono text-[11px] tracking-[0.06em] text-success-ink">{sub}</span>}
        </div>
        {canUndo && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => undoDecision(item.id))}
            className="touch-target cursor-pointer rounded-pill border border-success-line bg-transparent px-3 py-[9px] font-mono text-[11px] text-success-ink"
          >
            {t("common.undo")}
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <div aria-live="polite">
        {mode === "edit" ? (
          <ChangeForm
            label={t("project.change.title", { title: title.toLocaleUpperCase(locale) })}
            text={text}
            setText={setText}
            onCancel={() => setMode("idle")}
            onSend={sendChange}
            pending={pending}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-[14px] rounded-card border border-approval-line bg-approval px-[22px] py-[18px]">
            <span className="flex-none rounded-[4px] bg-brand px-[7px] py-[3px] font-mono text-[10px] font-medium tracking-[0.1em] text-white">
              {t("common.ai")}
            </span>
            <div className="flex min-w-[220px] flex-1 flex-col gap-[3px]">
              <span className="text-[16px] font-semibold">{t("project.approval.waiting", { title })}</span>
              {deadlineLine && <span className="font-mono text-[11px] tracking-[0.06em] text-accent-soft">{deadlineLine}</span>}
            </div>
            <div className="flex flex-none gap-[6px]">
              <button type="button" onClick={() => setPreview(true)} className={`${pill} touch-target border-none bg-brand text-white hover:bg-brand-hover`}>
                {t("project.approval.view")}
              </button>
              {canDecide && (
                <button
                  type="button"
                  onClick={() => setMode("edit")}
                  className={`${pill} touch-target border border-approval-strong bg-transparent text-accent-soft hover:border-accent`}
                >
                  {t("project.approval.change")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {preview && (
        <PreviewModal
          item={item}
          title={title}
          deadlineLine={deadlineLine}
          device={device}
          setDevice={setDevice}
          canDecide={canDecide}
          pending={pending}
          onClose={() => setPreview(false)}
          onApprove={approve}
          onChange={() => {
            setPreview(false);
            setMode("edit");
          }}
        />
      )}
    </>
  );
}

function ChangeForm(props: {
  label: string;
  text: string;
  setText: (v: string) => void;
  onCancel: () => void;
  onSend: () => void;
  pending: boolean;
}) {
  const t = useTranslations();
  const ready = !!props.text.trim();
  return (
    <div className="flex flex-col gap-3 rounded-card border border-brand bg-approval px-[22px] py-[18px]">
      <label htmlFor="change-text" className="font-mono text-[11px] tracking-[0.1em] text-accent">
        {props.label}
      </label>
      <textarea
        id="change-text"
        autoFocus
        value={props.text}
        maxLength={5000}
        onChange={(e) => props.setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            props.onSend();
          }
        }}
        placeholder={t("project.change.placeholder")}
        className="min-h-[72px] w-full resize-none rounded-field border border-approval-strong bg-approval-field p-3 text-[14px] leading-[1.5] text-ink placeholder:text-label"
      />
      <div className="flex flex-wrap justify-end gap-[6px]">
        <button type="button" onClick={props.onCancel} className={`${pill} touch-target border border-approval-strong bg-transparent text-accent-soft`}>
          {t("project.change.cancel")}
        </button>
        <button
          type="button"
          onClick={props.onSend}
          disabled={!ready || props.pending}
          className={`${pill} touch-target border-none text-white ${ready ? "bg-brand" : "cursor-not-allowed bg-approval-strong"}`}
        >
          {t("project.change.send")}
        </button>
      </div>
    </div>
  );
}

function PreviewModal(props: {
  item: ApprovalItem;
  title: string;
  deadlineLine: string | null;
  device: "desk" | "mob";
  setDevice: (d: "desk" | "mob") => void;
  canDecide: boolean;
  pending: boolean;
  onClose: () => void;
  onApprove: () => void;
  onChange: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const { item, device } = props;
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // focus moves into the dialog and back to where it came from
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => before?.focus();
  }, []);
  // keep Tab inside the dialog
  const trap = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const nodes = dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])");
    if (!nodes?.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  const label = props.title.replace(/,\s*/g, " · ").toLocaleUpperCase(locale);
  const src = device === "desk" ? item.previewDesktop : item.previewMobile;

  return (
    <div
      onClick={props.onClose}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(0,0,0,0.72)] p-0 wide:p-8"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-question"
        onKeyDown={trap}
        onClick={(e) => e.stopPropagation()}
        className="grid h-full max-h-full w-full max-w-[1180px] grid-cols-1 overflow-auto rounded-none border border-field-line bg-card wide:h-auto wide:grid-cols-[minmax(0,1fr)_320px] wide:rounded-[18px]"
      >
        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-[18px] py-[14px]">
            <span className="font-mono text-[11px] tracking-[0.12em] text-accent">{label}</span>
            <div role="group" className="ml-auto flex gap-[2px] rounded-pill border border-field-line bg-inner p-[3px] font-mono text-[11px] tracking-[0.08em]">
              {(["desk", "mob"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={device === d}
                  onClick={() => props.setDevice(d)}
                  className={`touch-target cursor-pointer rounded-pill border-none px-3 py-[7px] ${device === d ? "bg-ink text-on-light" : "bg-transparent text-muted"}`}
                >
                  {t(d === "desk" ? "preview.desktop" : "preview.mobile")}
                </button>
              ))}
            </div>
            <button
              ref={closeRef}
              type="button"
              aria-label={t("common.close")}
              onClick={props.onClose}
              className="touch-target h-[34px] w-[34px] cursor-pointer rounded-pill border border-field-line bg-transparent text-[16px] text-ink"
            >
              ×
            </button>
          </div>
          <div
            className="flex min-h-[300px] flex-1 items-center justify-center p-6"
            style={{
              backgroundColor: "var(--color-page)",
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.035) 1px,transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          >
            {device === "desk" ? (
              <Frame src={src} alt={props.title} className="aspect-[16/10] w-full rounded-[10px]" />
            ) : (
              <Frame src={src} alt={props.title} className="h-[560px] w-[280px] max-w-full rounded-[28px]" />
            )}
          </div>
        </div>
        <div className="flex flex-col gap-4 border-line p-[22px] wide:border-l">
          <h2 id="preview-question" className="m-0 text-[22px] leading-[1.2] font-bold tracking-[-0.02em]">
            {item.question ? pick(item.question, locale) : props.title}
          </h2>
          {item.whatsNew.length > 0 && (
            <div className="flex flex-col">
              <span className="pb-[6px] font-mono text-[10px] tracking-[0.12em] text-muted">
                {t("preview.newIn", { n: item.draftNo ?? 1 })}
              </span>
              <ul className="m-0 list-none p-0">
                {item.whatsNew.map((w, i) => (
                  <li key={i} className="flex gap-[10px] border-t border-line py-[9px] text-[14px]">
                    <span aria-hidden className="text-brand">+</span>
                    {pick(w, locale)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {props.deadlineLine && <span className="font-mono text-[11px] tracking-[0.06em] text-accent-soft">{props.deadlineLine}</span>}
          <div className="mt-auto flex flex-col gap-2">
            {props.canDecide && (
              <>
                <button
                  type="button"
                  disabled={props.pending}
                  onClick={props.onApprove}
                  className="cursor-pointer rounded-pill border-none bg-brand p-[13px] font-mono text-[12px] text-white hover:bg-brand-hover"
                >
                  {t("preview.approve")}
                </button>
                <button
                  type="button"
                  onClick={props.onChange}
                  className="cursor-pointer rounded-pill border border-strong-line bg-transparent p-[13px] font-mono text-[12px] text-ink"
                >
                  {t("preview.requestChange")}
                </button>
              </>
            )}
            <span className="text-center font-mono text-[10px] tracking-[0.08em] text-label">{t("common.escClose")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Frame({ src, alt, className }: { src: string | null; alt: string; className: string }) {
  return src ? (
    <img src={src} alt={alt} className={`block object-cover object-top ${className}`} />
  ) : (
    // no preview uploaded yet: an empty frame in the place of the screenshot
    <div className={`block border border-line bg-card ${className}`} />
  );
}
