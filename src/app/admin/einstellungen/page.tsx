import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { groupOn, STAFF_GROUPS } from "@/lib/settings/prefs";
import { SettingsView } from "@/components/settings-view";
import { RecoveryCodes } from "@/components/recovery-codes";

export default async function StaffSettings() {
  const session = await requireStaff();
  const t = await getTranslations();
  const supabase = await createClient();
  const [{ data: profile }, { data: left }] = await Promise.all([
    supabase.from("profiles").select("email_prefs").eq("id", session.userId).maybeSingle(),
    supabase.rpc("recovery_codes_left"),
  ]);
  const prefs = profile?.email_prefs as Record<string, boolean> | null;
  // for the team, "approvals" are quotes a lead accepted
  const groups = STAFF_GROUPS.map((g) => ({ key: g, label: t(g === "approvals" ? "settings.pref.offers" : `settings.pref.${g}`), on: groupOn(prefs, g) }));

  return (
    <SettingsView name={session.profile.fullName} email={session.profile.email} groups={groups}>
      <section className="flex flex-col gap-4 rounded-card border border-card-line bg-card p-[22px]">
        <h2 className="m-0 font-mono text-[10px] font-normal tracking-[0.12em] text-muted">{t("settings.security")}</h2>
        <span className="text-[15px]">{t("settings.codesLeft", { count: Number(left ?? 0) })}</span>
        <RecoveryCodes auto={false} email={session.profile.email} />
      </section>
    </SettingsView>
  );
}
