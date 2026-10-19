"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { StaffRole } from "@/lib/auth/session";
import { inviteStaff, removeStaff, resetStaff2fa, setStaffRole } from "@/app/admin/team/actions";

export type StaffRow = { userId: string; name: string; email: string; role: StaffRole; totp: boolean; lastLogin: string; me: boolean };

const ROLES: StaffRole[] = ["owner", "support", "finanzen", "builder"];
const label = "font-mono text-[10px] tracking-[0.12em] text-muted";
const box = "min-w-0 rounded-field border border-field-line bg-inner px-[14px] py-[11px] text-[15px] text-ink placeholder:text-label";
const field = `w-full ${box}`;
const pill = "touch-target cursor-pointer rounded-pill px-[14px] py-[9px] font-mono text-[11px] tracking-[0.08em]";
const cols = "grid grid-cols-[minmax(0,1.6fr)_150px_50px_minmax(0,1fr)_44px] items-center gap-3 px-5";
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Team: staff with role, 2FA and last login; invite, change role, reset 2FA, remove. */
export function TeamView({ rows }: { rows: StaffRow[] }) {
  const t = useTranslations();
  const router = useRouter();
  const uid = useId();
  const [menu, setMenu] = useState<{ id: string; top: number; right: number } | null>(null);
  const [inviting, setInviting] = useState(false);
  const [f, setF] = useState({ name: "", email: "", role: "support" as StaffRole });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const valid = !!f.name.trim() && EMAIL.test(f.email.trim());

  const run = (fn: () => Promise<{ ok: boolean }>, ok?: string) =>
    start(async () => {
      setMenu(null);
      const r = await fn();
      setMsg(r.ok ? (ok ? { ok: true, text: ok } : null) : { ok: false, text: t("settings.failed") });
      router.refresh();
    });

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-[10px] tracking-[0.1em] text-label">{t("team.inviteHint")}</span>
        <button type="button" aria-expanded={inviting} onClick={() => setInviting((v) => !v)} className={`${pill} border-none bg-brand text-white hover:bg-brand-hover`}>
          {t("team.invite")}
        </button>
      </div>
      {inviting && (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid || pending) return;
            start(async () => {
              const r = await inviteStaff(f);
              if (!r.ok) return setMsg({ ok: false, text: t("settings.failed") });
              setMsg({ ok: true, text: r.sent ? t("team.invited", { email: f.email.trim().toUpperCase() }) : t("settings.invitedNoMail") });
              setF({ name: "", email: "", role: "support" });
              setInviting(false);
              router.refresh();
            });
          }}
          className="grid grid-cols-1 items-end gap-3 rounded-card border border-card-line bg-card p-4 wide:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]"
        >
          <div className="flex flex-col gap-[6px]">
            <label htmlFor={`${uid}-n`} className={label}>{t("settings.name")}</label>
            <input id={`${uid}-n`} value={f.name} onChange={(e) => setF((s) => ({ ...s, name: e.target.value }))} maxLength={120} className={field} autoFocus />
          </div>
          <div className="flex flex-col gap-[6px]">
            <label htmlFor={`${uid}-e`} className={label}>{t("settings.email")}</label>
            <input id={`${uid}-e`} type="email" value={f.email} onChange={(e) => setF((s) => ({ ...s, email: e.target.value }))} className={field} />
          </div>
          <select aria-label={t("team.colRole")} value={f.role} onChange={(e) => setF((s) => ({ ...s, role: e.target.value as StaffRole }))} className={`${box} font-mono text-[11px] tracking-[0.08em]`}>
            {ROLES.map((r) => <option key={r} value={r}>{t(`team.role.${r}`)}</option>)}
          </select>
          <button type="submit" disabled={pending} aria-disabled={!valid} className={`${pill} border-none text-white ${valid ? "bg-brand hover:bg-brand-hover" : "cursor-not-allowed bg-approval-line"}`}>
            {t("settings.inviteSubmit")}
          </button>
        </form>
      )}
      <span role="status" aria-live="polite" className={`font-mono text-[11px] ${msg?.ok ? "text-success-ink" : "text-danger"} ${msg ? "" : "sr-only"}`}>{msg?.text}</span>
      <div className="relative min-h-0 overflow-auto rounded-card border border-card-line bg-card">
        <table className="w-full min-w-[620px] border-collapse">
          <thead>
            <tr className={`${cols} border-b border-line py-3 font-mono text-[10px] tracking-[0.1em] text-label`}>
              <th className="p-0 text-left font-normal">{t("team.colName")}</th>
              <th className="p-0 text-left font-normal">{t("team.colRole")}</th>
              <th className="p-0 text-left font-normal">{t("team.col2fa")}</th>
              <th className="p-0 text-left font-normal">{t("team.colLogin")}</th>
              <th className="p-0"><span className="sr-only">⋯</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userId} className={`${cols} border-b border-line py-[9px] text-[14px] last:border-b-0`}>
                <td className="flex min-w-0 flex-col gap-[2px] p-0">
                  <span className="truncate font-semibold">{r.name || r.email}</span>
                  <span className="truncate text-[13px] text-muted">{r.email}</span>
                </td>
                <td className="p-0">
                  {r.me ? (
                    <span className="font-mono text-[11px] tracking-[0.08em]">{t(`team.role.${r.role}`)} · {t("settings.you")}</span>
                  ) : (
                    <select
                      aria-label={t("settings.roleOf", { name: r.name || r.email })}
                      value={r.role}
                      disabled={pending}
                      onChange={(e) => run(() => setStaffRole(r.userId, e.target.value))}
                      className={`${box} py-2 font-mono text-[11px] tracking-[0.08em]`}
                    >
                      {ROLES.map((x) => <option key={x} value={x}>{t(`team.role.${x}`)}</option>)}
                    </select>
                  )}
                </td>
                <td className={`p-0 font-mono text-[12px] ${r.totp ? "text-success-ink" : "text-label"}`}>{r.totp ? "✓" : "–"}</td>
                <td className="p-0 font-mono text-[11px] text-muted">{r.lastLogin}</td>
                <td className="p-0 text-right">
                  {!r.me && (
                    <button
                      type="button"
                      aria-label={t("team.actions", { name: r.name || r.email })}
                      aria-haspopup="menu"
                      aria-expanded={menu?.id === r.userId}
                      onClick={(e) => {
                        const b = e.currentTarget.getBoundingClientRect();
                        setMenu((m) => (m?.id === r.userId ? null : { id: r.userId, top: b.bottom + 4, right: window.innerWidth - b.right }));
                      }}
                      className="touch-target cursor-pointer rounded-pill border-none bg-transparent px-2 py-1 text-[16px] text-muted hover:bg-hover hover:text-ink"
                    >
                      ⋯
                    </button>
                  )}
                  {menu?.id === r.userId && (
                    <RowMenu
                      at={menu}
                      onClose={() => setMenu(null)}
                      onReset={() => run(() => resetStaff2fa(r.userId), t("team.resetDone"))}
                      onRemove={() => run(() => removeStaff(r.userId))}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RowMenu({ at, onClose, onReset, onRemove }: { at: { top: number; right: number }; onClose: () => void; onReset: () => void; onRemove: () => void }) {
  const t = useTranslations("team");
  const ref = useRef<HTMLDivElement>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    const away = (e: MouseEvent) => {
      if (!ref.current?.parentElement?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", away);
    window.addEventListener("keydown", key);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);
  const item = "touch-target flex w-full cursor-pointer items-center rounded-[8px] border-none bg-transparent px-3 py-2 text-left text-[14px] text-ink hover:bg-hover";
  return (
    <div ref={ref} role="menu" style={{ top: at.top, right: Math.max(8, at.right) }} className="fixed z-[60] flex w-[230px] flex-col gap-1 rounded-menu border border-field-line bg-card p-2 text-left shadow-menu">
      <button type="button" role="menuitem" onClick={onReset} className={item}>{t("reset2fa")}</button>
      <button type="button" role="menuitem" onClick={() => (confirm ? onRemove() : setConfirm(true))} className={`${item} text-danger`}>
        {confirm ? t("confirmRemove") : t("remove")}
      </button>
    </div>
  );
}
