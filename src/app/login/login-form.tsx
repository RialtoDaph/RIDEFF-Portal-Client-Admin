"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { sendCode, signInWithPassword, verifyCode, type LoginResult } from "./actions";
import { codeInput, fieldInput, fieldLabel, FormError, primaryButton } from "./fields";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function LoginForm({ initialError = null }: { initialError?: string | null }) {
  const t = useTranslations("auth");
  const [step, setStep] = useState<1 | 2 | "password">(1);
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [pending, start] = useTransition();

  const fail = (r: LoginResult) => {
    if (!r.ok) setError(t(r.error));
  };

  const submitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL.test(email.trim())) return setError(t("errEmail"));
    start(async () => {
      const r = await sendCode(email);
      if (!r.ok) return fail(r);
      setError(null);
      setCode("");
      setStep(2);
    });
  };

  const submitCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError(t("errCode"));
    start(async () => {
      // on success the action redirects
      const r = await verifyCode(email, code);
      if (r) fail(r);
    });
  };

  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL.test(email.trim())) return setError(t("errEmail"));
    if (!password) return setError(t("errPassword"));
    start(async () => {
      // on success the action redirects
      const r = await signInWithPassword(email, password);
      if (r) fail(r);
    });
  };

  const switchLink = "touch-target cursor-pointer self-start border-none bg-transparent p-0 text-[13px] text-accent hover:text-brand";

  return (
    <>
      {step === "password" ? (
        <form onSubmit={submitPassword} className="flex flex-col gap-3" noValidate>
          <label htmlFor="login-email" className={fieldLabel}>{t("email")}</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(null); }}
            placeholder={t("emailPlaceholder")}
            className={fieldInput}
          />
          <label htmlFor="login-password" className={fieldLabel}>{t("password")}</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            className={fieldInput}
          />
          <button type="submit" disabled={pending} className={primaryButton}>{t("signIn")}</button>
          <button type="button" onClick={() => { setStep(1); setError(null); }} className={switchLink}>{t("withCode")}</button>
        </form>
      ) : step === 1 ? (
        <form onSubmit={submitEmail} className="flex flex-col gap-3" noValidate>
          <label htmlFor="login-email" className={fieldLabel}>{t("email")}</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(null); }}
            placeholder={t("emailPlaceholder")}
            className={fieldInput}
          />
          <button type="submit" disabled={pending} className={primaryButton}>{t("sendCode")}</button>
          <button type="button" onClick={() => { setStep("password"); setError(null); }} className={switchLink}>{t("withPassword")}</button>
        </form>
      ) : (
        <form onSubmit={submitCode} className="flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-[3px]">
            <span className={fieldLabel}>{t("codeSentTo")}</span>
            <span className="text-[15px] font-semibold break-all">{email.trim()}</span>
          </div>
          <label htmlFor="login-code" className={`${fieldLabel} pt-1`}>{t("code")}</label>
          <input
            id="login-code"
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(null); }}
            placeholder="••••••"
            className={codeInput}
          />
          <button type="submit" disabled={pending} className={primaryButton}>{t("signIn")}</button>
          <div className="flex flex-wrap justify-between gap-[10px]">
            <button
              type="button"
              onClick={() => { setStep(1); setError(null); }}
              className="touch-target cursor-pointer border-none bg-transparent p-0 text-[13px] text-accent hover:text-brand"
            >
              {t("otherEmail")}
            </button>
          </div>
        </form>
      )}
      <FormError message={error} />
    </>
  );
}
