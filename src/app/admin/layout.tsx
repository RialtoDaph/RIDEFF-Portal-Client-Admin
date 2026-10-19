import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/app-header";
import { initials, requireStaff } from "@/lib/auth/session";
import { tabsFor } from "@/lib/admin/tabs";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await requireStaff();
  const t = await getTranslations();
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader
        variant="admin"
        address={{ wide: "RIDEFF://ADMIN", narrow: "RIDEFF://ADMIN" }}
        tabs={tabsFor(session.staffRole).map((tab) => ({ href: tab.href, label: t(tab.key), exact: "exact" in tab }))}
        user={{ name: session.profile.fullName, email: session.profile.email, initials: initials(session.profile.fullName, session.profile.email) }}
      />
      {children}
    </div>
  );
}
