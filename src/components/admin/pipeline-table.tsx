"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { isTyping, useKeydown } from "@/lib/hotkeys";
import { LEAD_STAGES, type LeadStage } from "@/lib/admin/leads";
import { addLead, moveLead } from "@/app/admin/pipeline/actions";

export type PipelineRow = {
  id: string;
  name: string;
  stage: LeadStage;
  next: string;
  potential: string;
  /** "Kunde anlegen →" target for an accepted lead that is not a client yet */
  addClientHref: string | null;
};

const FORWARD = LEAD_STAGES.filter((s) => s !== "lost");
const STAGE_CLASS: Record<LeadStage, string> = {
  intro_call: "text-muted",
  analysis_done: "text-accent",
  offer_sent: "text-success-ink",
  accepted: "text-success-ink",
  lost: "text-label",
};
const cols = "grid grid-cols-[minmax(0,1.4fr)_120px_minmax(0,1.4fr)_80px_44px] items-center gap-3 px-5";
const label = "font-mono text-[10px] tracking-[0.12em] text-muted";
const field = "w-full min-w-0 rounded-field border border-field-line bg-inner px-[14px] py-[11px] text-[15px] text-ink placeholder:text-label";

/** Pipeline: the leads table with "+ LEAD", a ⋯ menu per row and [ ] to move the focused lead. */
export function PipelineTable({ rows }: { rows: PipelineRow[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [menu, setMenu] = useState<{ id: string; top: number; right: number } | null>(null);
  const [adding, setAdding] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [, start] = useTransition();

  const move = (row: PipelineRow, stage: LeadStage, lostReason?: string) =>
    start(async () => {
      setMenu(null);
      const r = await moveLead({ leadId: row.id, stage, lostReason });
      setStatus(r.ok ? { ok: true, text: t("pipeline.moved", { name: row.name, stage: t(`leadStage.${stage}`) }) } : { ok: false, text: t("pipeline.failed") });
      if (r.ok) router.refresh();
    });

  useKeydown((e) => {
    if ((e.key !== "[" && e.key !== "]") || isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    const id = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-lead]")?.dataset.lead;
    const row = rows.find((r) => r.id === id);
    if (!row || row.stage === "lost") return;
    const i = FORWARD.indexOf(row.stage) + (e.key === "]" ? 1 : -1);
    if (i < 0 || i >= FORWARD.length) return;
    e.preventDefault();
    move(row, FORWARD[i]);
  });

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-[10px] tracking-[0.1em] text-label">{t("pipeline.keys")}</span>
        <button type="button" onClick={() => setAdding(true)} className="touch-target cursor-pointer rounded-pill border-none bg-brand px-[14px] py-[9px] font-mono text-[11px] tracking-[0.08em] text-white hover:bg-brand-hover">
          {t("pipeline.addLead")}
        </button>
      </div>
      <span role="status" aria-live="polite" className={`font-mono text-[11px] tracking-[0.06em] ${status?.ok ? "text-success-ink" : "text-danger"} ${status ? "" : "sr-only"}`}>
        {status?.text}
      </span>
      <div className="relative min-h-0 overflow-auto rounded-card border border-card-line bg-card">
        <table className="w-full min-w-[600px] border-collapse">
          <thead>
            <tr className={`${cols} border-b border-line py-3 font-mono text-[10px] tracking-[0.1em] text-label`}>
              <th className="p-0 text-left font-normal">{t("pipeline.lead")}</th>
              <th className="p-0 text-left font-normal">{t("pipeline.stage")}</th>
              <th className="p-0 text-left font-normal">{t("pipeline.next")}</th>
              <th className="p-0 text-right font-normal">{t("pipeline.potential")}</th>
              <th className="p-0"><span className="sr-only">⋯</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr
                key={l.id}
                data-lead={l.id}
                tabIndex={0}
                className={`${cols} border-b border-line py-[7px] text-[14px] outline-offset-[-2px] focus-visible:bg-hover ${l.stage === "lost" ? "opacity-60" : ""}`}
              >
                <td className="p-0 font-semibold">{l.name}</td>
                <td className={`p-0 font-mono text-[11px] ${STAGE_CLASS[l.stage]}`}>{t(`leadStage.${l.stage}`)}</td>
                <td className="p-0 text-muted">
                  {l.addClientHref ? (
                    <Link href={l.addClientHref} className="text-brand hover:text-brand-hover">{l.next} →</Link>
                  ) : (
                    l.next
                  )}
                </td>
                <td className="p-0 text-right font-mono text-[12px]">{l.potential}</td>
                <td className="p-0 text-right">
                  <button
                    type="button"
                    aria-label={t("pipeline.actions", { name: l.name })}
                    aria-haspopup="menu"
                    aria-expanded={menu?.id === l.id}
                    onClick={(e) => {
                      // fixed position: the table's scroll container would clip an absolute menu
                      const r = e.currentTarget.getBoundingClientRect();
                      setMenu((m) => (m?.id === l.id ? null : { id: l.id, top: r.bottom + 4, right: window.innerWidth - r.right }));
                    }}
                    className="touch-target cursor-pointer rounded-pill border-none bg-transparent px-2 py-1 text-[16px] text-muted hover:bg-hover hover:text-ink"
                  >
                    ⋯
                  </button>
                  {menu?.id === l.id && <MoveMenu row={l} at={menu} onMove={move} onClose={() => setMenu(null)} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {adding && (
        <AddLead
          onClose={() => setAdding(false)}
          onDone={(name) => {
            setAdding(false);
            setStatus({ ok: true, text: t("pipeline.moved", { name, stage: t("leadStage.intro_call") }) });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function MoveMenu({ row, at, onMove, onClose }: { row: PipelineRow; at: { top: number; right: number }; onMove: (row: PipelineRow, stage: LeadStage, reason?: string) => void; onClose: () => void }) {
  const t = useTranslations();
  const ref = useRef<HTMLDivElement>(null);
  const [lost, setLost] = useState(false);
  const [reason, setReason] = useState("");
  const uid = useId();

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    const away = (e: MouseEvent) => {
      if (!ref.current?.parentElement?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", away);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", away);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  useKeydown((e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  });

  const item = "touch-target flex w-full cursor-pointer items-center justify-between gap-3 rounded-[8px] border-none bg-transparent px-3 py-2 text-left font-mono text-[11px] tracking-[0.06em] text-ink hover:bg-hover";
  return (
    <div ref={ref} role="menu" style={{ top: at.top, right: Math.max(8, at.right) }} className="fixed z-[60] flex max-h-[70vh] w-[250px] overflow-auto flex-col gap-1 rounded-menu border border-field-line bg-card p-2 text-left shadow-menu">
      <span className={`${label} px-3 pt-1 pb-1`}>{t("pipeline.moveTo")}</span>
      {FORWARD.map((s) => (
        <button key={s} type="button" role="menuitemradio" aria-checked={row.stage === s} onClick={() => onMove(row, s)} className={item}>
          {t(`leadStage.${s}`)}
          {row.stage === s && <span aria-hidden className="text-brand">●</span>}
        </button>
      ))}
      <div className="my-1 border-t border-line" />
      {!lost ? (
        <button type="button" role="menuitem" onClick={() => setLost(true)} className={`${item} text-danger`}>
          {t("pipeline.markLost")}
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onMove(row, "lost", reason.trim());
          }}
          className="flex flex-col gap-2 px-1 pb-1"
        >
          <label htmlFor={`${uid}-r`} className={label}>{t("pipeline.lostReason")}</label>
          <input id={`${uid}-r`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus className={`${field} py-2 text-[14px]`} />
          <button type="submit" className="touch-target cursor-pointer rounded-pill border border-danger bg-transparent px-3 py-2 font-mono text-[11px] text-danger hover:bg-hover">
            {t("pipeline.confirmLost")}
          </button>
        </form>
      )}
    </div>
  );
}

function AddLead({ onClose, onDone }: { onClose: () => void; onDone: (name: string) => void }) {
  const t = useTranslations();
  const uid = useId();
  const [f, setF] = useState({ name: "", contactName: "", email: "", phone: "", source: "", introCall: "", potential: "", notes: "" });
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  const valid = !!f.name.trim();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  useKeydown((e) => {
    if (e.key === "Escape" && !e.defaultPrevented) {
      e.preventDefault();
      onClose();
    }
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || pending) return;
    setFailed(false);
    start(async () => {
      const r = await addLead({
        name: f.name,
        contactName: f.contactName,
        email: f.email.trim(),
        phone: f.phone,
        source: f.source,
        notes: f.notes,
        // datetime-local is the browser's local time
        introCall: f.introCall ? new Date(f.introCall).toISOString() : null,
        potentialEuro: f.potential ? Math.round(Number(f.potential)) : null,
      });
      if (r.ok) onDone(f.name.trim());
      else setFailed(true);
    });
  };

  const inputs: [keyof typeof f, string, string, string][] = [
    ["name", t("newClient.company"), "Bäckerei Sommer", "text"],
    ["contactName", t("newLead.contact"), "Lena Hoffmann", "text"],
    ["email", t("newLead.email"), "lena@cafe-linde.de", "email"],
    ["phone", t("newLead.phone"), "+49 …", "tel"],
    ["source", t("newLead.source"), "", "text"],
    ["introCall", t("newLead.introCall"), "", "datetime-local"],
    ["potential", t("newLead.potential"), "249", "number"],
  ];

  return (
    <div onClick={onClose} className="fixed inset-0 z-[130] flex items-center justify-center bg-[rgba(0,0,0,0.72)] p-4">
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        noValidate
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-h`}
        className="flex max-h-full w-full max-w-[560px] flex-col gap-4 overflow-auto rounded-card border border-card-line bg-card p-[22px]"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id={`${uid}-h`} className="m-0 text-[24px] font-bold tracking-[-0.03em]">{t("newLead.title")}</h2>
          <button type="button" onClick={onClose} className="touch-target cursor-pointer border-none bg-transparent font-mono text-[11px] tracking-[0.08em] text-muted hover:text-ink">
            {t("common.escClose")}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 wide:grid-cols-2">
          {inputs.map(([k, l, ph, type], i) => (
            <div key={k} className={`flex flex-col gap-[6px] ${i === 0 ? "wide:col-span-2" : ""}`}>
              <label htmlFor={`${uid}-${k}`} className={label}>{l}</label>
              <input
                id={`${uid}-${k}`}
                type={type}
                value={f[k]}
                onChange={set(k)}
                placeholder={ph}
                autoFocus={i === 0}
                aria-required={i === 0 || undefined}
                min={type === "number" ? 0 : undefined}
                autoComplete="off"
                className={`${field} ${type === "datetime-local" ? "[color-scheme:dark]" : ""}`}
              />
            </div>
          ))}
          <div className="flex flex-col gap-[6px] wide:col-span-2">
            <label htmlFor={`${uid}-notes`} className={label}>{t("newLead.notes")}</label>
            <textarea id={`${uid}-notes`} value={f.notes} onChange={set("notes")} rows={3} className={`${field} resize-y`} />
          </div>
        </div>
        <button
          type="submit"
          disabled={pending}
          aria-disabled={!valid}
          className={`touch-target self-start rounded-pill border-none px-5 py-[13px] font-mono text-[12px] text-white disabled:cursor-wait ${valid ? "cursor-pointer bg-brand hover:bg-brand-hover" : "cursor-not-allowed bg-approval-line"}`}
        >
          {t("newLead.submit")}
        </button>
        {failed && <span role="alert" className="font-mono text-[11px] tracking-[0.06em] text-danger">{t("pipeline.failed")}</span>}
      </form>
    </div>
  );
}
