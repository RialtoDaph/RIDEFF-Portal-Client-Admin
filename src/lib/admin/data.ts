import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { L10n } from "@/i18n/config";
import type { StaffRole } from "@/lib/auth/session";

// Everything here runs as the signed-in staff member: RLS decides what each role sees
// (e.g. Support and Builder get no invoices, so their OFFEN numbers stay empty).

const DAY = 86_400_000;
const today = () => new Date().toISOString().slice(0, 10);
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / DAY));

export type Tone = "default" | "approval" | "overdue";

export type ClientRow = {
  id: string;
  name: string;
  status: "lead" | "client";
  packageName: string | null;
  city: string | null;
  since: string | null;
  liveSince: string | null;
  createdAt: string;
  contactName: string | null;
  contactEmail: string | null;
  nextStep: L10n | null;
  tone: Tone;
  needsAction: boolean;
  mrrCents: number;
  phase: number | null;
  pct: number;
};

type OrgRow = {
  id: string; name: string; status: "lead" | "client"; city: string | null; since: string | null; live_since: string | null;
  contact_name: string | null; contact_email: string | null; next_step: L10n | null; needs_action: boolean; created_at: string;
  packages: { name: string; monthly_net_cents: number } | null;
  projects: { phase: number; progress_pct: number; created_at: string }[];
};

/** Open approvals per org (oldest first) and overdue invoices, shared by table, KPIs and queue. */
const loadSignals = cache(async () => {
  const supabase = await createClient();
  const [items, invoices] = await Promise.all([
    supabase.from("items").select("id, created_at, projects(org_id)").eq("status", "open").eq("kind", "approval").order("created_at"),
    supabase.from("invoices").select("id, number, org_id, status, net_cents, due_on, issued_on, service_from, reminded_at").in("status", ["open", "overdue", "announced"]),
  ]);
  const approvals = new Map<string, string>(); // org → oldest open approval
  for (const i of items.data ?? []) {
    const org = (i.projects as unknown as { org_id: string } | null)?.org_id;
    if (org && !approvals.has(org)) approvals.set(org, i.created_at);
  }
  const all = (invoices.data ?? []) as {
    id: string; number: string; org_id: string; status: "open" | "overdue" | "announced"; net_cents: number;
    due_on: string | null; issued_on: string; service_from: string | null; reminded_at: string | null;
  }[];
  const isOverdue = (i: (typeof all)[number]) => i.status === "overdue" || (i.status === "open" && !!i.due_on && i.due_on < today());
  return { approvals, approvalCount: (items.data ?? []).length, invoices: all, overdue: all.filter(isOverdue), invoicesVisible: !invoices.error };
});

export const loadClients = cache(async (): Promise<ClientRow[]> => {
  const supabase = await createClient();
  const [{ data }, signals, inbox] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, status, city, since, live_since, contact_name, contact_email, next_step, needs_action, created_at, packages(name, monthly_net_cents), projects(phase, progress_pct, created_at)")
      .order("created_at"),
    loadSignals(),
    loadInbox(),
  ]);
  const unread = new Set(inbox.filter((t) => t.unread).map((t) => t.orgId));
  return ((data ?? []) as unknown as OrgRow[]).map((o) => {
    const project = [...o.projects].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    const overdue = signals.overdue.some((i) => i.org_id === o.id);
    const approval = signals.approvals.has(o.id);
    return {
      id: o.id,
      name: o.name,
      status: o.status,
      packageName: o.packages?.name ?? null,
      city: o.city,
      since: o.since,
      liveSince: o.live_since,
      createdAt: o.created_at,
      contactName: o.contact_name,
      contactEmail: o.contact_email,
      nextStep: o.next_step,
      tone: overdue ? "overdue" : approval ? "approval" : "default",
      needsAction: o.needs_action || overdue || approval || unread.has(o.id),
      mrrCents: o.status === "client" ? o.packages?.monthly_net_cents ?? 0 : 0,
      phase: o.status === "client" && project ? project.phase : null,
      pct: project?.progress_pct ?? 0,
    };
  });
});

export type Kpis = {
  mrrCents: number;
  mrrBars: number[]; // 12 months, oldest first, MRR in cents at each month end
  mrrTrendPct: number | null;
  clients: number;
  inBuild: number;
  approvals: number;
  approvalsMaxDays: number;
  openCents: number | null; // null: this role cannot see invoices
  overdueCount: number;
  allOverdueReminded: boolean;
  leadsThisWeek: number;
};

export async function loadKpis(): Promise<Kpis> {
  const supabase = await createClient();
  const [clients, signals, leads] = await Promise.all([
    loadClients(),
    loadSignals(),
    supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 7 * DAY).toISOString()),
  ]);
  const active = clients.filter((c) => c.status === "client");
  const now = new Date();
  const bars = Array.from({ length: 12 }, (_, i) => {
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + i + 1, 0)).toISOString().slice(0, 10);
    return active.filter((c) => (c.since ?? c.createdAt.slice(0, 10)) <= end).reduce((s, c) => s + c.mrrCents, 0);
  });
  const first = bars[0];
  const oldest = [...signals.approvals.values()][0];
  return {
    mrrCents: bars[11],
    mrrBars: bars,
    mrrTrendPct: first > 0 ? ((bars[11] - first) / first) * 100 : null,
    clients: active.length,
    inBuild: active.filter((c) => c.phase !== null && c.phase < 5).length,
    approvals: signals.approvalCount,
    approvalsMaxDays: oldest ? daysSince(oldest) : 0,
    openCents: signals.invoicesVisible ? signals.invoices.filter((i) => i.status !== "announced").reduce((s, i) => s + i.net_cents, 0) : null,
    overdueCount: signals.overdue.length,
    allOverdueReminded: signals.overdue.length > 0 && signals.overdue.every((i) => !!i.reminded_at),
    leadsThisWeek: leads.count ?? 0,
  };
}

// ── decision queue ──────────────────────────────────────────────────
export type QueueCard =
  | { key: string; type: "offerAccepted"; org: string; orgId: string }
  | { key: string; type: "changeRequested"; org: string; text: string }
  | { key: string; type: "offerDraft"; org: string; offerId: string; days: number; snoozed: boolean }
  | { key: string; type: "invoiceOverdue"; org: string; invoiceId: string; month: string; days: number; snoozed: boolean };

export async function loadQueue(role: StaffRole): Promise<QueueCard[]> {
  const supabase = await createClient();
  const sees = (r: StaffRole) => role === "owner" || role === r;
  const [offers, decisions, snoozes, signals, clients] = await Promise.all([
    supabase.from("offers").select("id, status, created_at, accepted_at, org_id, organizations(name, status)").in("status", ["draft", "accepted"]),
    supabase.from("item_decisions").select("id, comment, created_at, items(status, projects(organizations(name)))")
      .eq("decision", "changes_requested").gte("created_at", new Date(Date.now() - 3 * DAY).toISOString()).order("created_at", { ascending: false }),
    supabase.from("queue_snoozes").select("key, until").gt("until", new Date().toISOString()),
    loadSignals(),
    loadClients(),
  ]);
  const snoozed = new Set((snoozes.data ?? []).map((s) => s.key));
  const name = (id: string) => clients.find((c) => c.id === id)?.name ?? "";
  const cards: QueueCard[] = [];

  for (const o of offers.data ?? []) {
    const org = o.organizations as unknown as { name: string; status: string } | null;
    if (o.status === "accepted" && org?.status === "lead") cards.push({ key: `accepted:${o.id}`, type: "offerAccepted", org: org.name, orgId: o.org_id });
  }
  for (const d of decisions.data ?? []) {
    const it = d.items as unknown as { status: string; projects: { organizations: { name: string } } } | null;
    if (it?.status === "changes_requested" && d.comment) cards.push({ key: `change:${d.id}`, type: "changeRequested", org: it.projects.organizations.name, text: d.comment });
  }
  if (sees("support")) {
    for (const o of offers.data ?? []) {
      if (o.status !== "draft") continue;
      const key = `offer:${o.id}`;
      cards.push({ key, type: "offerDraft", org: name(o.org_id), offerId: o.id, days: daysSince(o.created_at), snoozed: snoozed.has(key) });
    }
  }
  if (sees("finanzen")) {
    for (const i of signals.overdue) {
      if (i.reminded_at && daysSince(i.reminded_at) < 7) continue;
      const key = `invoice:${i.id}`;
      cards.push({
        key, type: "invoiceOverdue", org: name(i.org_id), invoiceId: i.id,
        month: i.service_from ?? i.issued_on, days: i.due_on ? daysSince(i.due_on + "T00:00:00Z") : 0, snoozed: snoozed.has(key),
      });
    }
  }
  return cards;
}

export async function loadIntroCalls() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select("id, name, next_at")
    .eq("stage", "intro_call")
    .gte("next_at", new Date().toISOString())
    .order("next_at")
    .limit(5);
  return (data ?? []).map((l) => ({ id: l.id, name: l.name, at: l.next_at as string }));
}

// ── inbox ───────────────────────────────────────────────────────────
export type InboxThread = {
  id: string;
  orgId: string;
  org: string;
  contact: string;
  element: L10n;
  kind: "approval" | "test_run" | "question" | "invoice" | "update" | "message";
  lastBody: string;
  lastAt: string;
  unread: boolean;
  answered: boolean;
};

/** One thread per item (plus the project's general chat), newest activity first. */
export const loadInbox = cache(async (): Promise<InboxThread[]> => {
  const supabase = await createClient();
  const [threads, messages, members] = await Promise.all([
    supabase.from("threads").select("id, items(title, kind), projects(name, org_id, organizations(name, contact_name))"),
    supabase.from("messages").select("thread_id, author_id, body, created_at, read_at").order("created_at", { ascending: false }).limit(2000),
    supabase.from("org_members").select("org_id, user_id"),
  ]);
  const clientIds = new Set((members.data ?? []).map((m) => m.user_id));
  const last = new Map<string, { author_id: string; body: string; created_at: string; read_at: string | null }>();
  for (const m of messages.data ?? []) if (!last.has(m.thread_id)) last.set(m.thread_id, m);
  const out: InboxThread[] = [];
  for (const t of threads.data ?? []) {
    const m = last.get(t.id);
    if (!m) continue;
    const item = t.items as unknown as { title: L10n; kind: InboxThread["kind"] } | null;
    const p = t.projects as unknown as { name: string; org_id: string; organizations: { name: string; contact_name: string | null } };
    const fromClient = clientIds.has(m.author_id);
    out.push({
      id: t.id,
      orgId: p.org_id,
      org: p.organizations.name,
      contact: p.organizations.contact_name ?? "",
      element: item?.title ?? { de: p.name },
      kind: item?.kind ?? "message",
      lastBody: m.body,
      lastAt: m.created_at,
      unread: fromClient && !m.read_at,
      answered: !fromClient,
    });
  }
  return out.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
});
