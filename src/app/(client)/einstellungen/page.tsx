import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireClient } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CLIENT_GROUPS, groupOn } from "@/lib/settings/prefs";
import { SettingsView, type TeamMember } from "@/components/settings-view";

export default async function ClientSettings() {
  const session = await requireClient();
  if (session.viewAs) redirect("/admin/einstellungen");
  const t = await getTranslations();
  const supabase = await createClient();
  const inhaber = session.membership.role === "inhaber";
  const [{ data: profile }, members] = await Promise.all([
    supabase.from("profiles").select("email_prefs").eq("id", session.userId).maybeSingle(),
    inhaber
      ? supabase.from("org_members").select("user_id, role, created_at, profiles(full_name, email)").eq("org_id", session.membership.org.id).order("created_at")
      : Promise.resolve({ data: null }),
  ]);
  const prefs = profile?.email_prefs as Record<string, boolean> | null;
  // invoice mails go to the Inhaber only
  const groups = CLIENT_GROUPS.filter((g) => g !== "invoices" || inhaber).map((g) => ({ key: g, label: t(`settings.pref.${g}`), on: groupOn(prefs, g) }));
  const team = members.data?.map((m) => {
    const p = m.profiles as unknown as { full_name: string | null; email: string } | null;
    return { userId: m.user_id, name: p?.full_name ?? "", email: p?.email ?? "", role: m.role, me: m.user_id === session.userId } as TeamMember;
  });

  return (
    <main className="flex min-h-0 flex-1 flex-col px-4 py-[22px] wide:px-7">
      <SettingsView name={session.profile.fullName} email={session.profile.email} groups={groups} team={team} />
    </main>
  );
}
