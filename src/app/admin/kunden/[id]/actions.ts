"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth/session";
import { dispatchSoon } from "@/lib/email/notifications";
import { MAX_FILE_BYTES, MAX_PREVIEW_BYTES, PREVIEW_TYPES } from "@/lib/client/limits";

// Project editing on the client detail page. Support and Builder (and the owner);
// approvals and previews are the Builder's. The database checks every role again.

const uuid = z.uuid();
const text = (max: number) => z.string().trim().max(max);
const l10n = (max: number) => z.object({ de: text(max).min(1), en: text(max).optional(), id: text(max).optional() });
const optionalL10n = (max: number) => z.object({ de: text(max), en: text(max).optional(), id: text(max).optional() });
const day = z.iso.date();

/** Drops empty translations, so EN/ID fall back to German. */
function clean(v: { de: string; en?: string; id?: string }) {
  return { de: v.de, ...(v.en ? { en: v.en } : {}), ...(v.id ? { id: v.id } : {}) };
}

function done(orgId: string) {
  dispatchSoon();
  revalidatePath(`/admin/kunden/${orgId}`);
  revalidatePath("/admin", "layout");
}

/** The project's org, read through RLS: proves the staff member can see it. */
async function projectOrg(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select("org_id").eq("id", projectId).maybeSingle();
  return data?.org_id as string | undefined;
}

// ── phase, % and go-live ─────────────────────────────────────────────
const progressInput = z.object({ projectId: uuid, phase: z.number().int().min(1).max(5), pct: z.number().int().min(0).max(100), goLive: day.nullable() });

export async function saveProgress(input: z.input<typeof progressInput>): Promise<{ ok: boolean }> {
  await requireStaff("support", "builder");
  const parsed = progressInput.safeParse(input);
  if (!parsed.success) return { ok: false };
  const { projectId, phase, pct, goLive } = parsed.data;
  const org = await projectOrg(projectId);
  if (!org) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_project_progress", { p_project: projectId, p_phase: phase, p_pct: pct, p_go_live: goLive });
  if (error) {
    console.warn("saveProgress:", error.code, error.message);
    return { ok: false };
  }
  done(org);
  return { ok: true };
}

// ── new project ──────────────────────────────────────────────────────
export async function createProject(orgId: string, name: string): Promise<{ ok: true; projectId: string } | { ok: false }> {
  await requireStaff("support", "builder");
  const parsed = z.object({ orgId: uuid, name: text(120).min(1) }).safeParse({ orgId, name });
  if (!parsed.success) return { ok: false };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_project", { p_org: parsed.data.orgId, p_name: parsed.data.name });
  if (error || !data) {
    console.warn("createProject:", error?.code, error?.message);
    return { ok: false };
  }
  done(parsed.data.orgId);
  return { ok: true, projectId: data as string };
}

// ── approval with previews ───────────────────────────────────────────
const previewInput = z.object({
  projectId: uuid,
  itemId: uuid,
  which: z.enum(["desktop", "mobile"]),
  type: z.enum(PREVIEW_TYPES),
  size: z.number().int().min(1).max(MAX_PREVIEW_BYTES),
});

/** A signed upload URL for one preview image; the browser sends the file straight to Storage. */
export async function startPreviewUpload(input: z.input<typeof previewInput>) {
  await requireStaff("builder");
  const parsed = previewInput.safeParse(input);
  if (!parsed.success) return null;
  const { projectId, itemId, which, type } = parsed.data;
  const org = await projectOrg(projectId);
  if (!org) return null;
  const path = `${org}/${projectId}/${itemId}-${which}.${type.split("/")[1].replace("jpeg", "jpg")}`;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("previews").createSignedUploadUrl(path);
  if (error || !data) {
    console.warn("startPreviewUpload:", error?.message);
    return null;
  }
  return { path: data.path, token: data.token };
}

const approvalInput = z.object({
  projectId: uuid,
  itemId: uuid,
  title: l10n(120),
  question: optionalL10n(200),
  whatsNew: z.object({ de: text(2000), en: text(2000).optional(), id: text(2000).optional() }),
  draftNo: z.number().int().min(1).max(99).nullable(),
  deadline: day.nullable(),
  afterApproval: optionalL10n(120),
  previewDesktop: z.string().min(1).nullable(),
  previewMobile: z.string().min(1).nullable(),
});

/** Creates the approval once the previews are uploaded, so the client never sees it half-done. */
export async function createApproval(input: z.input<typeof approvalInput>): Promise<{ ok: boolean }> {
  const session = await requireStaff("builder");
  const parsed = approvalInput.safeParse(input);
  if (!parsed.success) return { ok: false };
  const f = parsed.data;
  const org = await projectOrg(f.projectId);
  if (!org) return { ok: false };
  const prefix = `${org}/${f.projectId}/${f.itemId}-`;
  if ([f.previewDesktop, f.previewMobile].some((p) => p && !p.startsWith(prefix))) return { ok: false };

  // "Was ist neu": one point per line; EN/ID lines pair up with the German ones by position
  const lines = (s?: string) => (s ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const [de, en, id] = [lines(f.whatsNew.de), lines(f.whatsNew.en), lines(f.whatsNew.id)];
  const whatsNew = de.map((d, i) => clean({ de: d, en: en[i], id: id[i] }));

  const supabase = await createClient();
  const { error } = await supabase.from("items").insert({
    id: f.itemId,
    project_id: f.projectId,
    kind: "approval",
    title: clean(f.title),
    question: f.question.de ? clean(f.question) : null,
    whats_new: whatsNew,
    draft_no: f.draftNo,
    deadline: f.deadline,
    after_approval: f.afterApproval.de ? clean(f.afterApproval) : null,
    preview_desktop_path: f.previewDesktop,
    preview_mobile_path: f.previewMobile,
    created_by: session.userId,
  });
  if (error) {
    console.warn("createApproval:", error.code, error.message);
    return { ok: false };
  }
  // the item's own chat thread (change requests and questions about it)
  await supabase.from("threads").insert({ project_id: f.projectId, item_id: f.itemId });
  done(org);
  return { ok: true };
}

// ── files for the client ─────────────────────────────────────────────
const uploadInput = z.object({ projectId: uuid, fileName: z.string().min(1).max(255), size: z.number().int().min(0).max(MAX_FILE_BYTES) });

export async function startStaffUpload(input: z.input<typeof uploadInput>) {
  await requireStaff("support", "builder");
  const parsed = uploadInput.safeParse(input);
  if (!parsed.success) return null;
  const { projectId, fileName } = parsed.data;
  const org = await projectOrg(projectId);
  if (!org) return null;
  const safe = fileName.normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(-120) || "datei";
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("files").createSignedUploadUrl(`${org}/${projectId}/${crypto.randomUUID()}-${safe}`);
  if (error || !data) {
    console.warn("startStaffUpload:", error?.message);
    return null;
  }
  return { path: data.path, token: data.token };
}

export async function finishStaffUpload(input: { projectId: string; path: string; fileName: string; size: number; mime: string }) {
  const session = await requireStaff("support", "builder");
  const parsed = uploadInput.extend({ path: z.string().min(1), mime: z.string().max(200) }).safeParse(input);
  if (!parsed.success) return { ok: false };
  const { projectId, path, fileName, size, mime } = parsed.data;
  const org = await projectOrg(projectId);
  if (!org || !path.startsWith(`${org}/${projectId}/`)) return { ok: false };
  const dot = fileName.lastIndexOf(".");
  const supabase = await createClient();
  const { error } = await supabase.from("files").insert({
    project_id: projectId,
    storage_path: path,
    name: dot > 0 ? fileName.slice(0, dot) : fileName,
    ext: dot > 0 ? fileName.slice(dot + 1).toUpperCase().slice(0, 4) : "",
    size_bytes: size,
    mime: mime || null,
    uploaded_by: session.userId,
  });
  if (error) {
    console.warn("finishStaffUpload:", error.code, error.message);
    return { ok: false };
  }
  revalidatePath(`/admin/kunden/${org}`);
  return { ok: true };
}

// ── test run ─────────────────────────────────────────────────────────
/** "2026-10-23" + "10:30" in Berlin → ISO instant (handles summer and winter time). */
function berlinToIso(date: string, time: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(guess)
      .map((x) => [x.type, Number(x.value)]),
  );
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - guess;
  return new Date(guess - offset).toISOString();
}

const testRunInput = z.object({
  projectId: uuid,
  title: l10n(160),
  subject: l10n(80),
  date: day,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  joinUrl: z.union([z.url({ protocol: /^https$/ }), z.literal("")]),
});

export async function createTestRun(input: z.input<typeof testRunInput>): Promise<{ ok: boolean }> {
  await requireStaff("support", "builder");
  const parsed = testRunInput.safeParse(input);
  if (!parsed.success) return { ok: false };
  const f = parsed.data;
  const startsAt = berlinToIso(f.date, f.time);
  if (Date.parse(startsAt) <= Date.now()) return { ok: false };
  const org = await projectOrg(f.projectId);
  if (!org) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.from("meetings").insert({
    project_id: f.projectId,
    kind: "test_run",
    starts_at: startsAt,
    title: clean(f.title),
    subject: clean(f.subject),
    join_url: f.joinUrl || null,
  });
  if (error) {
    console.warn("createTestRun:", error.code, error.message);
    return { ok: false };
  }
  done(org);
  return { ok: true };
}
