"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LangSwitch } from "./lang-switch";
import { signOut } from "@/app/actions/auth";

export type MenuUser = { name: string; email: string; initials: string };

export function ProfileMenu({ user, settingsHref }: { user: MenuUser; settingsHref: string }) {
  const t = useTranslations("profile");
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // the menu is the innermost layer while it is open
      e.stopImmediatePropagation();
      setOpen(false);
      button.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <button
        ref={button}
        type="button"
        aria-label={t("label")}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="touch-target h-[34px] w-[34px] cursor-pointer rounded-pill border border-field-line bg-raised font-sans text-[12px] font-semibold tracking-normal text-ink hover:border-brand"
      >
        {user.initials}
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute top-[44px] right-0 z-90 flex w-[270px] flex-col gap-3 rounded-menu border border-field-line bg-card p-4 tracking-normal shadow-menu"
        >
          <div className="flex flex-col gap-[2px]">
            <span className="font-sans text-[15px] font-semibold text-ink">{user.name}</span>
            <span className="font-sans text-[13px] break-all text-muted">{user.email}</span>
          </div>
          <div className="flex items-center justify-between border-t border-line pt-3">
            <span className="text-[10px] tracking-[0.12em] text-muted">{t("language")}</span>
            <LangSwitch />
          </div>
          <Link href={settingsHref} onClick={() => setOpen(false)} className="border-t border-line pt-3 font-sans text-[14px] text-ink hover:text-brand">
            {t("settings")}
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="w-full cursor-pointer border-0 border-t border-solid border-line bg-transparent pt-3 text-left font-sans text-[14px] text-danger"
            >
              {t("signOut")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
