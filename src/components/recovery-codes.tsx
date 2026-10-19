"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { generateRecoveryCodes } from "@/app/actions/recovery";

/**
 * Shows a fresh set of recovery codes. `auto`: generate on first render (after 2FA setup);
 * otherwise a button generates them (Einstellungen). `onDone` adds the "saved" checkbox and WEITER.
 */
export function RecoveryCodes({ auto, email, onDoneHref }: { auto: boolean; email: string; onDoneHref?: string }) {
  const t = useTranslations();
  const [codes, setCodes] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const once = useRef(false);

  const generate = () =>
    start(async () => {
      const c = await generateRecoveryCodes();
      setFailed(!c);
      setCodes(c);
      setSaved(false);
    });

  useEffect(() => {
    // guarded: a second call would replace the codes the user is looking at
    if (!auto || once.current) return;
    once.current = true;
    generate();
  });

  const text = codes ? `${t("recovery.fileTitle", { email })}\n\n${codes.join("\n")}\n` : "";
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "rideff-wiederherstellungscodes.txt" });
    a.click();
    URL.revokeObjectURL(url);
  };
  const pill = "touch-target cursor-pointer rounded-pill border border-strong-line bg-transparent px-3 py-2 font-mono text-[11px] tracking-[0.08em] text-ink hover:bg-hover";

  return (
    <div className="flex flex-col gap-3">
      <span className="font-mono text-[10px] tracking-[0.12em] text-muted">{t("recovery.title")}</span>
      <p className="m-0 text-[14px] leading-[1.5] text-muted">{t("recovery.hint")}</p>
      {codes && (
        <>
          <ul aria-label={t("recovery.title")} className="m-0 grid list-none grid-cols-2 gap-2 rounded-inner border border-line bg-inner p-3 font-mono text-[14px] tracking-[0.08em] select-all">
            {codes.map((c) => <li key={c}>{c}</li>)}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(text).then(() => setCopied(true))}
              className={pill}
            >
              {copied ? t("common.copied") : t("common.copy")}
            </button>
            <button type="button" onClick={download} className={pill}>{t("recovery.download")}</button>
          </div>
        </>
      )}
      {!auto && (
        <button type="button" disabled={pending} onClick={generate} className={`${pill} self-start`}>{t("settings.newCodes")}</button>
      )}
      {failed && <span role="alert" className="font-mono text-[11px] text-danger">{t("recovery.failed")}</span>}
      {onDoneHref && codes && (
        <>
          <button type="button" role="checkbox" aria-checked={saved} onClick={() => setSaved((v) => !v)} className="flex cursor-pointer items-center gap-3 border-none bg-transparent py-[6px] text-left text-[14px] text-ink">
            <span className={`flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[6px] border text-[13px] text-white ${saved ? "border-brand bg-brand" : "border-strong-line bg-transparent"}`}>
              {saved ? "✓" : ""}
            </span>
            {t("recovery.saved")}
          </button>
          <a
            href={saved ? onDoneHref : undefined}
            aria-disabled={!saved}
            className={`rounded-pill p-[13px] text-center font-mono text-[12px] tracking-[0.04em] text-white ${saved ? "bg-brand hover:bg-brand-hover hover:text-white" : "pointer-events-none bg-approval-line"}`}
          >
            {t("recovery.continue")}
          </a>
        </>
      )}
    </div>
  );
}
