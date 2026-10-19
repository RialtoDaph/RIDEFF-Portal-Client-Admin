import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { L10n } from "@/i18n/config";
import type { Membership } from "@/lib/auth/session";

export const PROJECT_COOKIE = "rideff_project";
/** Same window as undo_item_decision() in the database. */
const UNDO_WINDOW_MS = 15 * 60 * 1000;

export type ProjectSummary = { id: string; name: string; phase: number; progressPct: number; goLive: string | null };

/** The org's projects and the one picked in the header (cookie), else the first. */
export const getProjects = cache(async (orgId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("id, name, phase, progress_pct, go_live")
    .eq("org_id", orgId)
    .order("created_at");
  const projects: ProjectSummary[] = (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    phase: p.phase,
    progressPct: p.progress_pct,
    goLive: p.go_live,
  }));
  const picked = (await cookies()).get(PROJECT_COOKIE)?.value;
  const current = projects.find((p) => p.id === picked) ?? projects[0] ?? null;
  return { projects, current };
});

export type ChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  fromTeam: boolean;
};

export type ApprovalItem = {
  id: string;
  title: L10n;
  status: "open" | "approved" | "changes_requested";
  deadline: string | null;
  draftNo: number | null;
  question: L10n | null;
  whatsNew: L10n[];
  revisionDue: string | null;
  afterApproval: L10n | null;
  decidedAt: string | null;
  /** the viewer made the decision less than 15 minutes ago (RÜCKGÄNGIG) */
  undoable: boolean;
  previewDesktop: string | null;
  previewMobile: string | null;
};

export type LogEntry = { id: string; at: string; tag: string; event: string | null; params: Record<string, unknown>; text: L10n | null };

export type ProjectPageData = {
  project: ProjectSummary;
  approval: ApprovalItem | null;
  log: LogEntry[];
  meeting: { startsAt: string; title: L10n } | null;
  pkg: { name: string; monthlyCents: number } | null;
  latestMonthly: { serviceFrom: string | null; issuedOn: string; status: string } | null;
  thread: { id: string; messages: ChatMessage[] } | null;
};

const ITEM_FIELDS =
  "id, title, status, deadline, draft_no, question, whats_new, revision_due, after_approval, decided_at, decided_by, preview_desktop_path, preview_mobile_path";

/** Names for message authors; anyone who is not a member of the org is the team. */
async function authorInfo(orgId: string, authorIds: string[]) {
  const supabase = await createClient();
  const [members, profiles] = await Promise.all([
    supabase.from("org_members").select("user_id").eq("org_id", orgId),
    authorIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", authorIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);
  const memberIds = new Set((members.data ?? []).map((m) => m.user_id));
  const names = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name]));
  return { memberIds, names };
}

export async function loadThreadMessages(threadId: string, orgId: string): Promise<ChatMessage[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select("id, body, created_at, author_id")
    .eq("thread_id", threadId)
    .order("created_at")
    .limit(200);
  const rows = data ?? [];
  const { memberIds, names } = await authorInfo(orgId, [...new Set(rows.map((m) => m.author_id))]);
  return rows.map((m) => ({
    id: m.id,
    body: m.body,
    createdAt: m.created_at,
    authorId: m.author_id,
    authorName: names.get(m.author_id) ?? "",
    fromTeam: !memberIds.has(m.author_id),
  }));
}

export async function loadProjectPage(project: ProjectSummary, membership: Membership, userId: string): Promise<ProjectPageData> {
  const supabase = await createClient();
  const orgId = membership.org.id;
  const [openItem, lastDecided, log, meeting, org, monthly] = await Promise.all([
    supabase.from("items").select(ITEM_FIELDS).eq("project_id", project.id).eq("kind", "approval").eq("status", "open")
      .order("created_at").limit(1).maybeSingle(),
    supabase.from("items").select(ITEM_FIELDS).eq("project_id", project.id).eq("kind", "approval").neq("status", "open")
      .gte("decided_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
      .order("decided_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("activity_log").select("id, created_at, tag, event, params, text").eq("project_id", project.id)
      .order("created_at", { ascending: false }).limit(50),
    supabase.from("meetings").select("starts_at, title").eq("project_id", project.id).gte("starts_at", new Date().toISOString())
      .order("starts_at").limit(1).maybeSingle(),
    supabase.from("organizations").select("packages(name, monthly_net_cents)").eq("id", orgId).maybeSingle(),
    supabase.from("invoices").select("service_from, issued_on, status").eq("org_id", orgId).eq("kind", "subscription")
      .order("issued_on", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const raw = openItem.data ?? lastDecided.data;
  let approval: ApprovalItem | null = null;
  if (raw) {
    const paths = [raw.preview_desktop_path, raw.preview_mobile_path].filter(Boolean) as string[];
    const signed = paths.length
      ? (await supabase.storage.from("previews").createSignedUrls(paths, 60 * 30)).data ?? []
      : [];
    const url = (p: string | null) => (p ? signed.find((s) => s.path === p)?.signedUrl ?? null : null);
    approval = {
      id: raw.id,
      title: raw.title,
      status: raw.status,
      deadline: raw.deadline,
      draftNo: raw.draft_no,
      question: raw.question,
      whatsNew: (raw.whats_new ?? []) as L10n[],
      revisionDue: raw.revision_due,
      afterApproval: raw.after_approval,
      decidedAt: raw.decided_at,
      undoable: raw.decided_by === userId && !!raw.decided_at && Date.now() - Date.parse(raw.decided_at) < UNDO_WINDOW_MS,
      previewDesktop: url(raw.preview_desktop_path),
      previewMobile: url(raw.preview_mobile_path),
    };
  }

  // Chat: the open item's thread, otherwise the project's general thread.
  const threadQuery = supabase.from("threads").select("id").eq("project_id", project.id);
  const { data: thread } = await (openItem.data
    ? threadQuery.eq("item_id", openItem.data.id)
    : threadQuery.is("item_id", null)
  ).maybeSingle();

  const pkg = (org.data?.packages ?? null) as unknown as { name: string; monthly_net_cents: number } | null;
  return {
    project,
    approval,
    log: (log.data ?? []).map((l) => ({ id: l.id, at: l.created_at, tag: l.tag, event: l.event, params: l.params ?? {}, text: l.text })),
    meeting: meeting.data ? { startsAt: meeting.data.starts_at, title: meeting.data.title } : null,
    pkg: pkg ? { name: pkg.name, monthlyCents: pkg.monthly_net_cents } : null,
    latestMonthly: monthly.data
      ? { serviceFrom: monthly.data.service_from, issuedOn: monthly.data.issued_on, status: monthly.data.status }
      : null,
    thread: thread ? { id: thread.id, messages: await loadThreadMessages(thread.id, orgId) } : null,
  };
}

export type FileRow = { id: string; name: string; ext: string; sizeBytes: number; createdAt: string; uploadedBy: string | null; uploaderName: string; fromTeam: boolean };

export async function loadFiles(projectId: string, orgId: string): Promise<FileRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("files")
    .select("id, name, ext, size_bytes, created_at, uploaded_by")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  const rows = data ?? [];
  const { memberIds, names } = await authorInfo(orgId, [...new Set(rows.map((f) => f.uploaded_by).filter(Boolean) as string[])]);
  return rows.map((f) => ({
    id: f.id,
    name: f.name,
    ext: f.ext,
    sizeBytes: f.size_bytes,
    createdAt: f.created_at,
    uploadedBy: f.uploaded_by,
    uploaderName: f.uploaded_by ? names.get(f.uploaded_by) ?? "" : "",
    fromTeam: !!f.uploaded_by && !memberIds.has(f.uploaded_by),
  }));
}

export type InvoiceRow = {
  id: string;
  number: string;
  description: L10n;
  issuedOn: string;
  status: "open" | "announced" | "paid" | "overdue";
  netCents: number;
  grossCents: number;
  kind: "once" | "subscription";
  allowStripe: boolean;
  allowBank: boolean;
};

export async function loadInvoices(orgId: string): Promise<InvoiceRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoices")
    .select("id, number, description, issued_on, status, net_cents, gross_cents, kind, allow_stripe, allow_bank")
    .eq("org_id", orgId)
    .order("issued_on", { ascending: false })
    .order("number", { ascending: false });
  return (data ?? []).map((i) => ({
    id: i.id,
    number: i.number,
    description: i.description,
    issuedOn: i.issued_on,
    status: i.status,
    netCents: i.net_cents,
    grossCents: i.gross_cents,
    kind: i.kind,
    allowStripe: i.allow_stripe,
    allowBank: i.allow_bank,
  }));
}

export type Offer = {
  id: string;
  number: string;
  packageName: string;
  setupCents: number;
  monthlyCents: number;
  termMonths: number;
  groups: string[];
  status: "sent" | "accepted";
  acceptedAt: string | null;
};

/** The lead's current quote (sent or accepted). Drafts are invisible to clients (RLS). */
export async function loadOffer(orgId: string): Promise<Offer | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("offers")
    .select("id, number, setup_net_cents, monthly_net_cents, term_months, included_groups, status, accepted_at, packages(name)")
    .eq("org_id", orgId)
    .in("status", ["sent", "accepted"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    number: data.number,
    packageName: (data.packages as unknown as { name: string } | null)?.name ?? "",
    setupCents: data.setup_net_cents,
    monthlyCents: data.monthly_net_cents,
    termMonths: data.term_months,
    groups: data.included_groups ?? [],
    status: data.status,
    acceptedAt: data.accepted_at,
  };
}
