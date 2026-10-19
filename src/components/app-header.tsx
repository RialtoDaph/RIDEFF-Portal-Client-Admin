"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { BrandMark } from "./brand-mark";
import { ProfileMenu, type MenuUser } from "./profile-menu";
import { ProjectPicker } from "./client/project-picker";

export type HeaderTab = { href: string; label: string; exact?: boolean };

type Props = {
  address: { wide: string; narrow: string };
  tabs: HeaderTab[];
  variant: "client" | "admin";
  user: MenuUser;
  /** client area only, when the org has more than one project */
  projects?: { list: { id: string; name: string }[]; current: string };
};

/** Top bar shared by the client area and /admin: address, tabs, search, profile. */
export function AppHeader({ address, tabs, variant, user, projects }: Props) {
  const pathname = usePathname();
  const t = useTranslations();
  const isActive = (tab: HeaderTab) =>
    tab.exact ? pathname === tab.href : pathname === tab.href || pathname.startsWith(tab.href + "/");

  const openPalette = () => window.dispatchEvent(new CustomEvent("rideff:palette"));

  return (
    <header className="flex flex-wrap items-center gap-x-5 gap-y-4 border-b border-line px-4 py-[14px] font-mono text-[12px] tracking-[0.06em] wide:px-7">
      <BrandMark />
      <span className="font-medium text-brand">
        <span className="wide:hidden">{address.narrow}</span>
        <span className="hidden wide:inline">{address.wide}</span>
      </span>
      {projects && projects.list.length > 1 && <ProjectPicker projects={projects.list} current={projects.current} />}
      <nav className="flex gap-[18px]">
        {tabs.map((tab) => {
          const on = isActive(tab);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={on ? "page" : undefined}
              className={`touch-target border-b py-1 ${
                on ? "border-brand text-white hover:text-white" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {variant === "client" ? (
        <button
          type="button"
          onClick={openPalette}
          className="ml-auto hidden cursor-pointer rounded-[8px] border border-field-line bg-transparent px-[10px] py-[6px] whitespace-nowrap text-muted hover:border-strong-line hover:text-ink wide:flex"
        >
          {t("nav.search")}
        </button>
      ) : (
        <button
          type="button"
          onClick={openPalette}
          className="ml-auto hidden w-[300px] cursor-pointer items-center gap-2 rounded-pill border border-field-line bg-sunken px-3 py-[7px] text-left hover:border-strong-line wide:flex"
        >
          <span className="rounded-[4px] bg-brand px-[6px] py-[2px] text-[10px] text-white">{t("common.ai")}</span>
          <span className="flex-1 font-sans text-[13px] tracking-normal text-muted">{t("nav.aiSearch")}</span>
          <span className="text-[10px] text-label">⌘K</span>
        </button>
      )}
      <ProfileMenu user={user} />
    </header>
  );
}
