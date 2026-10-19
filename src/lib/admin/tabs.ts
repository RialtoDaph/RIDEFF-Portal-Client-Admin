import type { StaffRole } from "@/lib/auth/session";

/** Admin tabs and who may open them (owner sees everything). */
export const ADMIN_TABS = [
  { href: "/admin", key: "nav.clients", roles: ["support", "builder"], exact: true },
  { href: "/admin/inbox", key: "nav.inbox", roles: ["support", "builder"] },
  { href: "/admin/pipeline", key: "nav.pipeline", roles: ["support"] },
  { href: "/admin/rechnungen", key: "nav.invoices", roles: ["finanzen"] },
  { href: "/admin/vorlagen", key: "nav.templates", roles: ["support"] },
  { href: "/admin/team", key: "nav.team", roles: [] },
] as const satisfies readonly { href: string; key: string; roles: readonly StaffRole[]; exact?: boolean }[];

export function tabsFor(role: StaffRole) {
  return ADMIN_TABS.filter((t) => role === "owner" || (t.roles as readonly StaffRole[]).includes(role));
}
