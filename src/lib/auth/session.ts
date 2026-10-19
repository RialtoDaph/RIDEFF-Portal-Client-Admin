import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isLocale, type Locale } from "@/i18n/config";

export type StaffRole = "owner" | "support" | "finanzen" | "builder";
export type MemberRole = "inhaber" | "mitarbeiter";

export type Membership = {
  role: MemberRole;
  org: { id: string; name: string; slug: string; status: "lead" | "client" };
};

export type Session = {
  userId: string;
  aal: "aal1" | "aal2";
  profile: { fullName: string; email: string; locale: Locale };
  staffRole: StaffRole | null;
  memberships: Membership[];
};

/**
 * The signed-in user with roles read from the database (never from the URL or email).
 * Cached per request. RLS still applies to every query made with the user's client.
 */
export const getSession = cache(async (): Promise<Session | null> => loadSession(await createClient()));

/** Same as getSession, for a client that was just signed in during this request. */
export async function loadSession(supabase: SupabaseClient): Promise<Session | null> {
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const userId = data.claims.sub;

  const [profile, staff, members] = await Promise.all([
    supabase.from("profiles").select("full_name, email, locale").eq("id", userId).maybeSingle(),
    supabase.from("staff").select("role").eq("user_id", userId).maybeSingle(),
    supabase
      .from("org_members")
      .select("role, organizations(id, name, slug, status)")
      .eq("user_id", userId),
  ]);

  const p = profile.data;
  return {
    userId,
    aal: data.claims.aal === "aal2" ? "aal2" : "aal1",
    profile: {
      fullName: p?.full_name ?? "",
      email: p?.email ?? String(data.claims.email ?? ""),
      locale: isLocale(p?.locale) ? p.locale : "de",
    },
    staffRole: (staff.data?.role as StaffRole | undefined) ?? null,
    memberships: ((members.data ?? []) as unknown as { role: MemberRole; organizations: Membership["org"] | null }[])
      .filter((m) => m.organizations)
      .map((m) => ({ role: m.role, org: m.organizations! })),
  };
}

/** Where a signed-in user belongs. Staff go through 2FA first. */
export function homeFor(session: Session): string | null {
  if (session.staffRole) return session.aal === "aal2" ? "/admin" : "/login/2fa";
  if (session.memberships.length) return "/";
  return null;
}

/** Client area: a member of at least one organisation. */
export async function requireClient(): Promise<Session & { membership: Membership }> {
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = session.memberships[0];
  if (!membership) redirect(homeFor(session) ?? "/login");
  return { ...session, membership };
}

/**
 * Admin area: a staff role with a TOTP-verified session. Owner passes every check.
 * Call this in every /admin layout, page and server action.
 */
export async function requireStaff(...roles: StaffRole[]): Promise<Session & { staffRole: StaffRole }> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.staffRole) redirect(homeFor(session) ?? "/login");
  if (session.aal !== "aal2") redirect("/login/2fa");
  if (roles.length && session.staffRole !== "owner" && !roles.includes(session.staffRole)) notFound();
  return session as Session & { staffRole: StaffRole };
}

export function initials(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter((w) => /^\p{L}/u.test(w) && !w.endsWith("."));
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}
