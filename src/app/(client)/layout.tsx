import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/app-header";
import { loadNotifications } from "@/lib/notifications";
import { Palette } from "@/components/palette";
import { initials, requireClient } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getProjects } from "@/lib/client/data";
import { ReadOnlyProvider, ViewAsBanner } from "@/components/client/view-as";

export default async function ClientLayout({ children }: LayoutProps<"/">) {
  const session = await requireClient();
  const t = await getTranslations("nav");
  const tp = await getTranslations("palette");
  const org = session.membership.org;

  // A lead sees only the quote, plus invoices once one exists.
  let tabs;
  if (org.status === "lead") {
    const supabase = await createClient();
    const { count } = await supabase.from("invoices").select("id", { count: "exact", head: true }).eq("org_id", org.id);
    tabs = [{ href: "/angebot", label: t("offer") }, ...(count ? [{ href: "/rechnungen", label: t("invoices") }] : [])];
  } else {
    tabs = [
      { href: "/", label: t("project"), exact: true },
      { href: "/dateien", label: t("files") },
      { href: "/rechnungen", label: t("invoices") },
    ];
  }

  const { projects, current } = await getProjects(org.id);
  const name = org.name.toLocaleUpperCase("de-DE");
  return (
    <div className="flex min-h-screen flex-col wide:h-screen">
      {session.viewAs && <ViewAsBanner org={org.name} />}
      <AppHeader
        variant="client"
        address={{ wide: `RIDEFF://${name.replace(/\s+/g, "-")}`, narrow: name }}
        tabs={tabs}
        projects={current ? { list: projects.map((p) => ({ id: p.id, name: p.name })), current: current.id } : undefined}
        user={{ name: session.profile.fullName, email: session.profile.email, initials: initials(session.profile.fullName, session.profile.email) }}
        bell={{ userId: session.userId, ...(await loadNotifications()) }}
        settingsHref={session.viewAs ? "/admin/einstellungen" : "/einstellungen"}
      />
      <ReadOnlyProvider value={!!session.viewAs}>{children}</ReadOnlyProvider>
      <Palette
        items={org.status === "client"
          ? [
              { label: tp("orgProject", { org: org.name }), kind: tp("kindClient"), href: "/" },
              { label: tp("orgFiles", { org: org.name }), kind: tp("kindClient"), href: "/dateien" },
              { label: tp("orgInvoices", { org: org.name }), kind: tp("kindClient"), href: "/rechnungen" },
            ]
          : tabs.map((tab) => ({ label: tab.label, kind: tp("kindClient"), href: tab.href }))}
      />
    </div>
  );
}
