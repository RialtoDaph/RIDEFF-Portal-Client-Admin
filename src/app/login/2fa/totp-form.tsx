"use client";

/* eslint-disable @next/next/no-img-element -- the QR code is an inline SVG data URL */
import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { startEnrollment, verifyTotp, type Enrollment } from "./actions";
import { codeInput, fieldLabel, FormError, primaryButton } from "../fields";

export function TotpForm({ factorId }: { factorId: string | null }) {
  const t = useTranslations("auth");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const activeFactor = factorId ?? enrollment?.factorId ?? null;

  useEffect(() => {
    if (factorId) return;
    let live = true;
    startEnrollment().then((e) => live && setEnrollment(e));
    return () => { live = false; };
  }, [factorId]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError(t("errCode"));
    if (!activeFactor) return;
    start(async () => {
      const r = await verifyTotp(activeFactor, code);
      if (r) setError(t(r.error));
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      {!factorId && enrollment && (
        <div className="flex flex-col items-start gap-3">
          <img src={enrollment.qr} alt="" width={180} height={180} className="rounded-inner bg-white p-2" />
          <code className="font-mono text-[12px] tracking-[0.06em] break-all text-muted select-all">{enrollment.secret}</code>
        </div>
      )}
      <label htmlFor="totp-code" className={fieldLabel}>{t("mfa.challengeLabel")}</label>
      <input
        id="totp-code"
        autoFocus
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(null); }}
        placeholder="••••••"
        className={codeInput}
      />
      <button type="submit" disabled={pending || !activeFactor} className={primaryButton}>{t("signIn")}</button>
      <FormError message={error} />
    </form>
  );
}
