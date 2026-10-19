"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireClient } from "@/lib/auth/session";
import { loadThreadMessages, PROJECT_COOKIE, type ChatMessage } from "@/lib/client/data";
import { MAX_FILE_BYTES } from "@/lib/client/limits";
import { dispatchSoon } from "@/lib/email/notifications";

// Every action re-checks the session; the database checks the role again
// (decide_item and undo_item_decision accept only an Inhaber, RLS covers the rest).

const uuid = z.uuid();
export type ActionResult = { ok: true } | { ok: false };

async function rpc(fn: string, args: Record<string, unknown>): Promise<ActionResult> {
  await requireClient();
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) {
    console.warn(`${fn}:`, error.code, error.message);
    return { ok: false };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function approveItem(itemId: string) {
  if (!uuid.safeParse(itemId).success) return { ok: false } as const;
  return rpc("decide_item", { p_item: itemId, p_decision: "approved" });
}

export async function requestChange(itemId: string, text: string) {
  const body = text.trim();
  if (!uuid.safeParse(itemId).success || !body || body.length > 5000) return { ok: false } as const;
  return rpc("decide_item", { p_item: itemId, p_decision: "changes_requested", p_comment: body });
}

export async function undoDecision(itemId: string) {
  if (!uuid.safeParse(itemId).success) return { ok: false } as const;
  return rpc("undo_item_decision", { p_item: itemId });
}

export async function sendMessage(threadId: string, text: string): Promise<{ ok: boolean }> {
  const session = await requireClient();
  const body = text.trim();
  if (!uuid.safeParse(threadId).success || !body || body.length > 5000) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.from("messages").insert({ thread_id: threadId, author_id: session.userId, body });
  if (error) console.warn("sendMessage:", error.code, error.message);
  else dispatchSoon();
  return { ok: !error };
}

/** Reloads a thread (after a Realtime event) and marks the team's messages as read. */
export async function refreshThread(threadId: string): Promise<ChatMessage[]> {
  const session = await requireClient({ read: true });
  if (!uuid.safeParse(threadId).success) return [];
  const supabase = await createClient();
  // staff viewing as the client leave the read status alone
  if (!session.viewAs) await supabase.rpc("mark_thread_read", { p_thread: threadId });
  return loadThreadMessages(threadId, session.membership.org.id);
}

export async function selectProject(projectId: string) {
  const session = await requireClient({ read: true });
  if (!uuid.safeParse(projectId).success) return;
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select("id").eq("id", projectId).eq("org_id", session.membership.org.id).maybeSingle();
  if (!data) return;
  (await cookies()).set(PROJECT_COOKIE, projectId, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
  revalidatePath("/", "layout");
}

// ── files ──────────────────────────────────────────────────────────────
const uploadInput = z.object({
  projectId: uuid,
  fileName: z.string().min(1).max(255),
  size: z.number().int().min(0).max(MAX_FILE_BYTES),
});

/** Step 1 of an upload: a signed URL so the browser sends the file straight to Storage. */
export async function startUpload(input: z.infer<typeof uploadInput>) {
  const session = await requireClient();
  const parsed = uploadInput.safeParse(input);
  if (!parsed.success) return null;
  const { projectId, fileName } = parsed.data;
  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("org_id").eq("id", projectId).maybeSingle();
  if (!project || project.org_id !== session.membership.org.id) return null;
  const safe = fileName.normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(-120) || "datei";
  const path = `${project.org_id}/${projectId}/${crypto.randomUUID()}-${safe}`;
  const { data, error } = await supabase.storage.from("files").createSignedUploadUrl(path);
  if (error || !data) {
    console.warn("startUpload:", error?.message);
    return null;
  }
  return { path: data.path, token: data.token };
}

/** Step 2: register the uploaded object. The database trigger writes the LOG line. */
export async function finishUpload(input: { projectId: string; path: string; fileName: string; size: number; mime: string }) {
  const session = await requireClient();
  const parsed = uploadInput.extend({ path: z.string().min(1), mime: z.string().max(200) }).safeParse(input);
  if (!parsed.success) return { ok: false };
  const { projectId, path, fileName, size, mime } = parsed.data;
  if (!path.startsWith(`${session.membership.org.id}/${projectId}/`)) return { ok: false };
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
    console.warn("finishUpload:", error.code, error.message);
    return { ok: false };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function downloadUrl(fileId: string): Promise<string | null> {
  await requireClient({ read: true });
  if (!uuid.safeParse(fileId).success) return null;
  const supabase = await createClient();
  const { data: file } = await supabase.from("files").select("storage_path, name, ext").eq("id", fileId).maybeSingle();
  if (!file) return null;
  const download = file.ext ? `${file.name}.${file.ext.toLowerCase()}` : file.name;
  const { data } = await supabase.storage.from("files").createSignedUrl(file.storage_path, 60, { download });
  return data?.signedUrl ?? null;
}
