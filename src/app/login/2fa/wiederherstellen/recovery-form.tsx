"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { redeemRecoveryCode } from "@/app/actions/recovery";
import { fieldInput, fieldLabel, FormError, primaryButton } from "../../fields";

export function RecoveryForm() {
  const t = useTranslations();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await redeemRecoveryCode(code);
          if (r) setError(t("recovery.wrong"));
        });
      }}
      className="flex flex-col gap-3"
    >
      <p className="m-0 text-[14px] leading-[1.5] text-muted">{t("recovery.useHint")}</p>
      <label htmlFor="recovery-code" className={fieldLabel}>{t("recovery.code")}</label>
      <input
        id="recovery-code"
        autoFocus
        autoComplete="one-time-code"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={9}
        value={code}
        onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); }}
        placeholder="K7QX-M2PD"
        className={`${fieldInput} font-mono tracking-[0.2em]`}
      />
      <button type="submit" disabled={pending} className={primaryButton}>{t("recovery.submit")}</button>
      <FormError message={error} />
      <Link href="/login/2fa" className="font-mono text-[11px] tracking-[0.08em] text-muted hover:text-ink">{t("common.back")}</Link>
    </form>
  );
}
