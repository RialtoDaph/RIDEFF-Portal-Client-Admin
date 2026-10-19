import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/app-header";
import { KpiStrip } from "@/components/admin/kpi-strip";
import { Palette, type PaletteItem } from "@/components/palette";
import { initials, requireStaff } from "@/lib/auth/session";
import { tabsFor } from "@/lib/admin/tabs";
import { loadClients, loadInbox } from "@/lib/admin/data";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await requireStaff();
  const t = await getTranslations();
  const tabs = tabsFor(session.staffRole);
  const unread = tabs.some((tab) => tab.href === "/admin/inbox") ? (await loadInbox()).filter((th) => th.unread).length : 0;
  const has = (href: string) => tabs.some((tab) => tab.href === href);
  const admin = t("palette.kindAdmin");
  const palette: PaletteItem[] = [
    ...(has("/admin") ? [{ label: t("palette.clients"), kind: admin, href: "/admin" }, { label: t("palette.openApprovals"), kind: admin, href: "/admin?f=1" }] : []),
    ...(has("/admin/inbox") ? [{ label: t("inbox.title"), kind: admin, href: "/admin/inbox" }] : []),
    ...(has("/admin/pipeline") ? [{ label: t("palette.pipeline"), kind: admin, href: "/admin/pipeline" }] : []),
    ...(has("/admin/rechnungen") ? [{ label: t("palette.whoNotPaid"), kind: admin, href: "/admin/rechnungen" }] : []),
    ...(has("/admin/vorlagen") ? [{ label: t("palette.templates"), kind: admin, href: "/admin/vorlagen" }] : []),
    ...(has("/admin") ? (await loadClients()).map((c) => ({ label: t("palette.orgDetails", { org: c.name }), kind: t("palette.kindOpenClient"), href: `/admin/kunden/${c.id}` })) : []),
  ];
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
      <Palette items={palette} />
    </div>
  );
}
