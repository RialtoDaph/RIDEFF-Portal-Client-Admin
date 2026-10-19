"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";
import { formatMoney } from "@/lib/format";
import { fillTemplate } from "@/lib/email/fill";
import { createClientAction } from "@/app/admin/actions";

type Pkg = { key: "core" | "growth" | "whole_system"; name: string; monthlyCents: number };
export type Prefill = { company: string; contact: string; email: string; city: string; packageKey: Pkg["key"]; orgId: string | null };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const field = "w-full rounded-field border border-field-line bg-inner px-[14px] py-3 text-[15px] text-ink placeholder:text-label";
const label = "font-mono text-[10px] tracking-[0.12em] text-muted";

/** Neuer Kunde: form, package, welcome toggle and the live preview of "Willkommen im Portal". */
export function NewClientForm({ packages, prefill, template, from }: { packages: Pkg[]; prefill: Prefill; template: { subject: string; body: string } | null; from: string }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [f, setF] = useState(prefill);
  const [send, setSend] = useState(true);
  const [done, setDone] = useState<{ orgId: string; company: string; email: string; sent: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  const valid = !!(f.company.trim() && f.contact.trim() && EMAIL.test(f.email.trim()));
  const set = (k: keyof Prefill) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const first = f.contact.trim().split(/\s+/)[0];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || pending) return;
    setFailed(false);
    start(async () => {
      const r = await createClientAction({ ...f, sendWelcome: send });
      if (r.ok) setDone({ orgId: r.orgId, company: f.company.trim(), email: f.email.trim(), sent: r.sent });
      else setFailed(true);
    });
  };

  const fields: [keyof Prefill, string, string, string][] = [
    ["company", t("newClient.company"), "Café Linde", "text"],
    ["contact", t("newClient.contact"), "Lena Hoffmann", "text"],
    ["email", t("newClient.email"), "lena@cafe-linde.de", "email"],
    ["city", t("newClient.city"), "Leipzig", "text"],
  ];

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 content-start gap-[14px] overflow-auto wide:grid-cols-2">
      {done ? (
        <div aria-live="polite" className="flex flex-col gap-[14px] rounded-card border border-success-line bg-success p-[22px]">
          <span aria-hidden className="flex h-[30px] w-[30px] items-center justify-center rounded-pill bg-success-dot text-[15px] text-white">✓</span>
          <span className="text-[24px] font-bold tracking-[-0.03em]">{t("newClient.done.title", { org: done.company })}</span>
          <span className="font-mono text-[11px] leading-[1.5] tracking-[0.06em] text-success-ink">
            {done.sent ? t("newClient.done.sent", { email: done.email.toLocaleUpperCase(locale) }) : t("newClient.done.notSent")}
          </span>
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/kunden/${done.orgId}`} className="rounded-pill bg-ink px-[14px] py-[10px] font-mono text-[11px] text-on-light hover:text-on-light">
              {t("newClient.done.open")}
            </Link>
            <button
              type="button"
              onClick={() => {
                setDone(null);
                setF({ company: "", contact: "", email: "", city: "", packageKey: "growth", orgId: null });
                router.replace("/admin/kunden/neu");
              }}
              className="cursor-pointer rounded-pill border border-success-line bg-transparent px-[14px] py-[10px] font-mono text-[11px] text-success-ink"
            >
              {t("newClient.done.more")}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-card border border-card-line bg-card p-[22px]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h1 className="m-0 text-[24px] font-bold tracking-[-0.03em]">{t("newClient.title")}</h1>
              <span className={label}>{t("newClient.sub")}</span>
            </div>
            <Link href="/admin" className="font-mono text-[11px] tracking-[0.08em] text-muted hover:text-ink">
              {t("common.back")}
            </Link>
          </div>
          {fields.map(([k, l, ph, type]) => (
            <div key={k} className="flex flex-col gap-[6px]">
              <label htmlFor={`nc-${k}`} className={label}>{l}</label>
              <input id={`nc-${k}`} type={type} value={f[k] ?? ""} onChange={set(k)} placeholder={ph} className={field} autoComplete="off" />
            </div>
          ))}
          <div role="radiogroup" aria-labelledby="nc-pkg" className="flex flex-col gap-[6px]">
            <span id="nc-pkg" className={label}>{t("newClient.package")}</span>
            <div className="grid grid-cols-3 gap-2">
              {packages.map((p) => {
                const on = f.packageKey === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setF((s) => ({ ...s, packageKey: p.key }))}
                    className={`flex cursor-pointer flex-col gap-1 rounded-inner border p-3 text-left text-ink ${on ? "border-brand bg-approval" : "border-field-line bg-inner"}`}
                  >
                    <span className="text-[14px] font-semibold">{p.name}</span>
                    <span className="font-mono text-[11px] text-muted">{t("money.perMonth", { amount: formatMoney(p.monthlyCents, locale) })}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <span className="font-mono text-[10px] leading-[1.5] tracking-[0.08em] text-label">{t("newClient.roleNote")}</span>
          <button type="button" role="checkbox" aria-checked={send} onClick={() => setSend((v) => !v)} className="flex cursor-pointer items-center gap-3 border-none bg-transparent py-[6px] text-left text-[14px] text-ink">
            <span className={`flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[6px] border text-[13px] text-white ${send ? "border-brand bg-brand" : "border-strong-line bg-transparent"}`}>
              {send ? "✓" : ""}
            </span>
            {t("newClient.sendWelcome")}
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              aria-disabled={!valid || pending}
              className={`rounded-pill border-none px-5 py-[13px] font-mono text-[12px] text-white ${valid ? "cursor-pointer bg-brand hover:bg-brand-hover" : "cursor-not-allowed bg-approval-line"}`}
            >
              {t("newClient.submit")}
            </button>
          </div>
          {failed && <span role="alert" className="font-mono text-[11px] tracking-[0.06em] text-danger">{t("newClient.failed")}</span>}
        </form>
      )}
      <div className="flex min-w-0 flex-col gap-[14px] rounded-card bg-ink p-[22px] text-on-light">
        <span className="font-mono text-[11px] tracking-[0.12em] text-on-light-muted">{t("newClient.preview")}</span>
        <div className="flex flex-col gap-[2px] border-b border-mail-line pb-3 font-mono text-[11px] break-all text-on-light-muted">
          <span>{t("newClient.from", { email: from })}</span>
          <span>{t("newClient.to", { email: f.email.trim() || t("auth.emailPlaceholder") })}</span>
          <span>{t("newClient.subject", { subject: template?.subject ?? "" })}</span>
        </div>
        <div className="text-[14px] leading-[1.6] whitespace-pre-wrap">{template ? fillTemplate(template.body, first ? { Vorname: first } : {}) : ""}</div>
      </div>
    </div>
  );
}
