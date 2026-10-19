/** Email preference groups; each switches one or more notification kinds (profiles.email_prefs[kind] = false). */
export const PREF_GROUPS = {
  approvals: ["approval_new"],
  messages: ["chat_reply"],
  invoices: ["invoice_new", "invoice_due"],
  testRuns: ["test_run_invite", "test_run_reminder"],
  phase: ["phase_change"],
  weekly: ["weekly_summary"],
} as const;
export type PrefGroup = keyof typeof PREF_GROUPS;

export const CLIENT_GROUPS: PrefGroup[] = ["approvals", "messages", "invoices", "testRuns", "phase", "weekly"];
// staff get quote approvals and client messages
export const STAFF_GROUPS: PrefGroup[] = ["approvals", "messages"];

export function groupOn(prefs: Record<string, boolean> | null | undefined, group: PrefGroup) {
  return PREF_GROUPS[group].every((k) => prefs?.[k] !== false);
}
