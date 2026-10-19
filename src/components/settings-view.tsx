"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LangSwitch } from "./lang-switch";
import { inviteMember, removeMember, setEmailPref, setMemberRole, updateProfile } from "@/app/actions/settings";
import type { PrefGroup } from "@/lib/settings/prefs";

export type TeamMember = { userId: string; name: string; email: string; role: "inhaber" | "mitarbeiter"; me: boolean };

const card = "flex flex-col gap-4 rounded-card border border-card-line bg-card p-[22px]";
const label = "font-mono text-[10px] tracking-[0.12em] text-muted";
const box = "min-w-0 rounded-field border border-field-line bg-inner px-[14px] py-[11px] text-[15px] text-ink placeholder:text-label";
const field = `w-full ${box}`;
const pill = "touch-target cursor-pointer rounded-pill px-[14px] py-[9px] font-mono text-[11px] tracking-[0.08em]";
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Einstellungen: profile, email preferences, the client team (Inhaber) and extra cards (staff: sign-in). */
export function SettingsView(props: {
  name: string;
  email: string;
  groups: { key: PrefGroup; label: string; on: boolean }[];
  team?: TeamMember[];
  children?: React.ReactNode;
}) {
  const t = useTranslations();
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-auto">
      <h1 className="m-0 text-[28px] font-bold tracking-[-0.03em]">{t("settings.title")}</h1>
      <div className="grid grid-cols-1 content-start gap-[14px] wide:grid-cols-2">
        <Profile name={props.name} email={props.email} />
        <Prefs groups={props.groups} />
        {props.team && <Team members={props.team} />}
        {props.children}
      </div>
    </div>
  );
}

function Profile({ name: initial, email }: { name: string; email: string }) {
  const t = useTranslations();
  const router = useRouter();
  const uid = useId();
  const [name, setName] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = name.trim() !== initial && !!name.trim();

  return (
    <section aria-labelledby={`${uid}-h`} className={card}>
      <h2 id={`${uid}-h`} className={`${label} m-0 font-normal`}>{t("settings.profile")}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!dirty || pending) return;
          start(async () => {
            const r = await updateProfile(name);
            setMsg({ ok: r.ok, text: t(r.ok ? "settings.saved" : "settings.failed") });
            if (r.ok) router.refresh();
          });
        }}
        className="flex flex-col gap-[6px]"
      >
        <label htmlFor={`${uid}-n`} className={label}>{t("settings.name")}</label>
        <div className="flex gap-2">
          <input id={`${uid}-n`} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" className={field} />
          <button type="submit" disabled={!dirty || pending} className={`${pill} flex-none border-none bg-brand text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-approval-line`}>
            {t("settings.save")}
          </button>
        </div>
      </form>
      <div className="flex flex-col gap-[6px]">
        <span className={label}>{t("settings.email")}</span>
        <span className="text-[15px] break-all">{email}</span>
        <span className="font-mono text-[10px] tracking-[0.08em] text-label">{t("settings.emailNote")}</span>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <span className={label}>{t("profile.language")}</span>
        <LangSwitch />
      </div>
      <span role="status" aria-live="polite" className={`font-mono text-[11px] ${msg?.ok ? "text-success-ink" : "text-danger"} ${msg ? "" : "sr-only"}`}>{msg?.text}</span>
    </section>
  );
}

function Prefs({ groups }: { groups: { key: PrefGroup; label: string; on: boolean }[] }) {
  const t = useTranslations();
  const uid = useId();
  const [state, setState] = useState(() => Object.fromEntries(groups.map((g) => [g.key, g.on])) as Record<PrefGroup, boolean>);
  const [failed, setFailed] = useState(false);
  const [, start] = useTransition();

  const toggle = (key: PrefGroup) => {
    const next = !state[key];
    setState((s) => ({ ...s, [key]: next }));
    start(async () => {
      const r = await setEmailPref(key, next);
      setFailed(!r.ok);
      if (!r.ok) setState((s) => ({ ...s, [key]: !next }));
    });
  };

  return (
    <section aria-labelledby={`${uid}-h`} className={card}>
      <h2 id={`${uid}-h`} className={`${label} m-0 font-normal`}>{t("settings.notifications")}</h2>
      <p className="m-0 text-[14px] leading-[1.5] text-muted">{t("settings.notifHint")}</p>
      <ul className="m-0 flex list-none flex-col p-0">
        {groups.map((g) => (
          <li key={g.key} className="border-t border-line first:border-t-0">
            <button
              type="button"
              role="switch"
              aria-checked={state[g.key]}
              onClick={() => toggle(g.key)}
              className="touch-target flex w-full cursor-pointer items-center justify-between gap-3 border-none bg-transparent py-3 text-left text-[15px] text-ink"
            >
              {g.label}
              <span aria-hidden className={`flex h-[22px] w-[38px] flex-none items-center rounded-pill p-[3px] transition-colors ${state[g.key] ? "justify-end bg-brand" : "justify-start bg-sunken"}`}>
                <span className="h-[16px] w-[16px] rounded-pill bg-white" />
              </span>
            </button>
          </li>
        ))}
      </ul>
      {failed && <span role="alert" className="font-mono text-[11px] text-danger">{t("settings.failed")}</span>}
    </section>
  );
}

function Team({ members }: { members: TeamMember[] }) {
  const t = useTranslations();
  const router = useRouter();
  const uid = useId();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [f, setF] = useState({ name: "", email: "", role: "mitarbeiter" as TeamMember["role"] });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const valid = !!f.name.trim() && EMAIL.test(f.email.trim());

  const run = (fn: () => Promise<{ ok: boolean }>, ok?: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (ok ? { ok: true, text: ok } : null) : { ok: false, text: t("settings.failed") });
      setConfirm(null);
      router.refresh();
    });

  const roleSelect = (m: TeamMember) => (
    <select
      aria-label={t("settings.roleOf", { name: m.name })}
      value={m.role}
      disabled={pending}
      onChange={(e) => run(() => setMemberRole(m.userId, e.target.value))}
      className={`${box} py-2 font-mono text-[11px] tracking-[0.08em]`}
    >
      <option value="inhaber">{t("settings.role.inhaber")}</option>
      <option value="mitarbeiter">{t("settings.role.mitarbeiter")}</option>
    </select>
  );

  return (
    <section aria-labelledby={`${uid}-h`} className={`${card} wide:col-span-2`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${uid}-h`} className={`${label} m-0 font-normal`}>{t("settings.team")}</h2>
        <button type="button" aria-expanded={inviting} onClick={() => setInviting((v) => !v)} className={`${pill} border border-strong-line bg-transparent text-ink hover:bg-hover`}>
          + {t("settings.invite")}
        </button>
      </div>
      <p className="m-0 text-[14px] leading-[1.5] text-muted">{t("settings.teamHint")}</p>
      {inviting && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid || pending) return;
            start(async () => {
              const r = await inviteMember(f);
              if (!r.ok) return setMsg({ ok: false, text: t("settings.failed") });
              setMsg({ ok: true, text: r.sent ? t("settings.invited", { email: f.email.trim().toUpperCase() }) : t("settings.invitedNoMail") });
              setF({ name: "", email: "", role: "mitarbeiter" });
              setInviting(false);
              router.refresh();
            });
          }}
          noValidate
          className="grid grid-cols-1 items-end gap-3 rounded-inner border border-line bg-inner p-4 wide:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]"
        >
          <div className="flex flex-col gap-[6px]">
            <label htmlFor={`${uid}-n`} className={label}>{t("settings.name")}</label>
            <input id={`${uid}-n`} value={f.name} onChange={(e) => setF((s) => ({ ...s, name: e.target.value }))} maxLength={120} placeholder="Mia Hoffmann" className={field} autoFocus />
          </div>
          <div className="flex flex-col gap-[6px]">
            <label htmlFor={`${uid}-e`} className={label}>{t("settings.email")}</label>
            <input id={`${uid}-e`} type="email" value={f.email} onChange={(e) => setF((s) => ({ ...s, email: e.target.value }))} placeholder="mia@cafe-linde.de" className={field} />
          </div>
          <select
            aria-label={t("settings.roleOf", { name: f.name || "…" })}
            value={f.role}
            onChange={(e) => setF((s) => ({ ...s, role: e.target.value as TeamMember["role"] }))}
            className={`${box} font-mono text-[11px] tracking-[0.08em]`}
          >
            <option value="mitarbeiter">{t("settings.role.mitarbeiter")}</option>
            <option value="inhaber">{t("settings.role.inhaber")}</option>
          </select>
          <button type="submit" disabled={pending} aria-disabled={!valid} className={`${pill} border-none text-white ${valid ? "bg-brand hover:bg-brand-hover" : "cursor-not-allowed bg-approval-line"}`}>
            {t("settings.inviteSubmit")}
          </button>
        </form>
      )}
      <ul className="m-0 flex list-none flex-col p-0">
        {members.map((m) => (
          <li key={m.userId} className="flex flex-wrap items-center gap-3 border-t border-line py-3 first:border-t-0">
            <div className="flex min-w-[180px] flex-1 flex-col gap-[2px]">
              <span className="text-[15px] font-semibold">{m.name || m.email}</span>
              <span className="text-[13px] break-all text-muted">{m.email}</span>
            </div>
            {m.me ? (
              <span className="font-mono text-[11px] tracking-[0.08em] text-muted">{t(`settings.role.${m.role}`)} · {t("settings.you")}</span>
            ) : (
              <>
                {roleSelect(m)}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => (confirm === m.userId ? run(() => removeMember(m.userId)) : setConfirm(m.userId))}
                  className={`${pill} border border-transparent bg-transparent text-danger hover:border-danger`}
                >
                  {confirm === m.userId ? t("settings.confirmRemove") : t("settings.remove")}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <span role="status" aria-live="polite" className={`font-mono text-[11px] ${msg?.ok ? "text-success-ink" : "text-danger"} ${msg ? "" : "sr-only"}`}>{msg?.text}</span>
    </section>
  );
}
