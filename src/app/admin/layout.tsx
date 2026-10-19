import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/app-header";
import { KpiStrip } from "@/components/admin/kpi-strip";
import { initials, requireStaff } from "@/lib/auth/session";
import { tabsFor } from "@/lib/admin/tabs";
import { loadInbox } from "@/lib/admin/data";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await requireStaff();
  const t = await getTranslations();
  const tabs = tabsFor(session.staffRole);
  const unread = tabs.some((tab) => tab.href === "/admin/inbox") ? (await loadInbox()).filter((th) => th.unread).length : 0;
  return (
    <div className="flex min-h-screen flex-col wide:h-screen">
      <AppHeader
        variant="admin"
        address={{ wide: "RIDEFF://ADMIN", narrow: "RIDEFF://ADMIN" }}
        tabs={tabs.map((tab) => ({
          href: tab.href,
          label: tab.href === "/admin/inbox" && unread ? t("inbox.tab", { count: unread }) : t(tab.key),
          exact: "exact" in tab,
          also: tab.href === "/admin" ? ["/admin/kunden"] : undefined,
        }))}
        user={{ name: session.profile.fullName, email: session.profile.email, initials: initials(session.profile.fullName, session.profile.email) }}
      />
      <main className="flex min-h-0 flex-1 flex-col gap-[14px] px-4 py-[22px] wide:px-7">
        <KpiStrip />
        {children}
      </main>
    </div>
  );
}
