"use client";

import { createContext, useContext, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { endViewAs, logViewPage } from "@/app/actions/view-as";

const ReadOnly = createContext(false);

/** True while staff view the client area: buttons that change something are disabled. */
export function useReadOnly() {
  return useContext(ReadOnly);
}

export function ReadOnlyProvider({ value, children }: { value: boolean; children: React.ReactNode }) {
  return <ReadOnly.Provider value={value}>{children}</ReadOnly.Provider>;
}

/** Sticky banner on top of the client header while viewing as a client. */
export function ViewAsBanner({ org }: { org: string }) {
  const t = useTranslations("viewAs");
  const pathname = usePathname();
  useEffect(() => {
    logViewPage(pathname).catch(() => undefined);
  }, [pathname]);
  return (
    <div role="status" className="sticky top-0 z-[95] flex flex-wrap items-center justify-between gap-2 bg-accent px-4 py-2 font-mono text-[11px] tracking-[0.08em] text-on-light wide:px-7">
      <span>{t("banner", { org: org.toLocaleUpperCase() })}</span>
      <form action={endViewAs}>
        <button type="submit" className="touch-target cursor-pointer rounded-pill border border-on-light bg-transparent px-3 py-1 font-mono text-[11px] text-on-light">
          {t("end")}
        </button>
      </form>
    </div>
  );
}
