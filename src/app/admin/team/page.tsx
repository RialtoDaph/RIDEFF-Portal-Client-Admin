import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { requireStaff, type StaffRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatLogTime } from "@/lib/format";
import { TeamView, type StaffRow } from "@/components/admin/team-view";

const label = "font-mono text-[10px] tracking-[0.1em] text-label";
const cols = "grid grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)_70px_minmax(0,1.4fr)] items-baseline gap-3 px-5";

// Owner only: staff and their roles, plus the "view as client" access log.
export default async function TeamPage({ searchParams }: PageProps<"/admin/team">) {
  const session = await requireStaff("owner");
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const { tab, org } = await searchParams;
  const access = tab === "zugriffe";
  const supabase = await createClient();

  const tabLink = (on: boolean) =>
    `touch-target border-b py-1 font-mono text-[12px] tracking-[0.06em] ${on ? "border-brand text-white hover:text-white" : "border-transparent text-muted hover:text-ink"}`;
  const header = (
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <h1 className="m-0 text-[28px] font-bold tracking-[-0.03em]">{t("team.title")}</h1>
      <nav className="flex gap-[18px]">
        <Link href="/admin/team" aria-current={!access ? "page" : undefined} className={tabLink(!access)}>{t("team.tabMembers")}</Link>
        <Link href="/admin/team?tab=zugriffe" aria-current={access ? "page" : undefined} className={tabLink(access)}>{t("team.tabAccess")}</Link>
      </nav>
    </div>
  );

  if (!access) {
    const { data } = await supabase.from("staff").select("user_id, role, totp_enabled, created_at, profiles:user_id(full_name, email)").order("created_at");
    // last sign-in lives in auth.users: read with the service role, owner only (checked above)
    const { data: users } = await createAdminClient().auth.admin.listUsers({ perPage: 1000 });
    const lastLogin = new Map((users?.users ?? []).map((u) => [u.id, u.last_sign_in_at ?? null]));
    const rows: StaffRow[] = (data ?? []).map((s) => {
      const p = s.profiles as unknown as { full_name: string | null; email: string } | null;
      const at = lastLogin.get(s.user_id);
      return {
        userId: s.user_id, name: p?.full_name ?? "", email: p?.email ?? "", role: s.role as StaffRole, totp: s.totp_enabled,
        lastLogin: at ? formatLogTime(at, locale) : t("team.never"), me: s.user_id === session.userId,
      };
    });
    return (
      <section className="flex min-h-0 flex-1 flex-col gap-[14px]">
        {header}
        <TeamView rows={rows} />
      </section>
    );
  }

  const orgFilter = typeof org === "string" && /^[0-9a-f-]{36}$/.test(org) ? org : null;
  let q = supabase.from("access_log").select("id, staff_id, org_id, started_at, ended_at, pages, organizations(name)").order("started_at", { ascending: false }).limit(200);
  if (orgFilter) q = q.eq("org_id", orgFilter);
  const [{ data: logs }, { data: staff }, { data: orgs }] = await Promise.all([
    q,
    supabase.from("staff").select("user_id, profiles:user_id(full_name, email)"),
    supabase.from("organizations").select("id, name").order("name"),
  ]);
  const who = new Map((staff ?? []).map((s) => {
    const p = s.profiles as unknown as { full_name: string | null; email: string } | null;
    return [s.user_id, p?.full_name || p?.email || ""];
  }));

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-[14px]">
      {header}
      <form className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="tab" value="zugriffe" />
        <label htmlFor="access-org" className="sr-only">{t("team.access.client")}</label>
        <select id="access-org" name="org" defaultValue={orgFilter ?? ""} className="rounded-field border border-field-line bg-inner px-3 py-2 text-[14px] text-ink">
          <option value="">{t("team.access.allClients")}</option>
          {(orgs ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <button type="submit" className="touch-target cursor-pointer rounded-pill border border-strong-line bg-transparent px-3 py-2 font-mono text-[11px] text-ink hover:bg-hover">↵</button>
      </form>
      <div className="relative min-h-0 overflow-auto rounded-card border border-card-line bg-card">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className={`${cols} border-b border-line py-3 ${label}`}>
              <th className="p-0 text-left font-normal">{t("team.access.time")}</th>
              <th className="p-0 text-left font-normal">{t("team.access.staff")}</th>
              <th className="p-0 text-left font-normal">{t("team.access.client")}</th>
              <th className="p-0 text-left font-normal">{t("team.access.duration")}</th>
              <th className="p-0 text-left font-normal">{t("team.access.pages")}</th>
            </tr>
          </thead>
          <tbody>
            {(logs ?? []).length === 0 && (
              <tr><td className="px-5 py-6 text-[14px] text-muted">{t("team.access.empty")}</td></tr>
            )}
            {(logs ?? []).map((l) => {
              const mins = l.ended_at ? Math.max(1, Math.round((Date.parse(l.ended_at) - Date.parse(l.started_at)) / 60_000)) : null;
              return (
                <tr key={l.id} className={`${cols} border-b border-line py-[11px] text-[14px] last:border-b-0`}>
                  <td className="p-0 font-mono text-[11px] text-label">{formatLogTime(l.started_at, locale)}</td>
                  <td className="truncate p-0">{who.get(l.staff_id) ?? ""}</td>
                  <td className="truncate p-0 font-semibold">{(l.organizations as unknown as { name: string } | null)?.name ?? ""}</td>
                  <td className="p-0 font-mono text-[11px] text-muted">{mins === null ? t("team.access.running") : t("team.access.minutes", { count: mins })}</td>
                  <td className="p-0 font-mono text-[11px] break-all text-muted">{(l.pages as string[]).join(" · ") || "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
