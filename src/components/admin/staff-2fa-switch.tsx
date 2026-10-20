"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { setStaff2fa } from "@/app/actions/settings";

/** Owner only: 2FA required for the team, or optional for now. */
export function Staff2faSwitch({ required }: { required: boolean }) {
  const t = useTranslations("settings");
  const [on, setOn] = useState(required);
  const [failed, setFailed] = useState(false);
  const [, start] = useTransition();
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-4">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => {
          const next = !on;
          setOn(next);
          start(async () => {
            const r = await setStaff2fa(next);
            setFailed(!r.ok);
            if (!r.ok) setOn(!next);
          });
        }}
        className="touch-target flex w-full cursor-pointer items-center justify-between gap-3 border-none bg-transparent py-2 text-left text-[15px] text-ink"
      >
        {t("staff2fa")}
        <span aria-hidden className={`flex h-[22px] w-[38px] flex-none items-center rounded-pill p-[3px] ${on ? "justify-end bg-brand" : "justify-start bg-sunken"}`}>
          <span className="h-[16px] w-[16px] rounded-pill bg-white" />
        </span>
      </button>
      <span className="font-mono text-[10px] leading-[1.5] tracking-[0.08em] text-label">{t(on ? "staff2faOn" : "staff2faOff")}</span>
      {failed && <span role="alert" className="font-mono text-[11px] text-danger">{t("failed")}</span>}
    </div>
  );
}
