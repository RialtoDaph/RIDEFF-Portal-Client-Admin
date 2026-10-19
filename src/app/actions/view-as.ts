"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireStaff, VIEW_AS_COOKIE } from "@/lib/auth/session";

// "Als Kunde ansehen": Support, Builder and the owner; every view is logged in access_log.

export async function startViewAs(orgId: string) {
  const session = await requireStaff("support", "builder");
  if (!z.uuid().safeParse(orgId).success) return;
  const supabase = await createClient();
  const { data: log, error } = await supabase.from("access_log").insert({ staff_id: session.userId, org_id: orgId }).select("id").single();
  if (error || !log) {
    console.warn("startViewAs:", error?.code, error?.message);
    return;
  }
  (await cookies()).set(VIEW_AS_COOKIE, `${orgId}.${log.id}`, { path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 60 * 2 });
  redirect("/");
}

export async function endViewAs() {
  await requireStaff("support", "builder");
  const jar = await cookies();
  const [orgId, logId] = (jar.get(VIEW_AS_COOKIE)?.value ?? "").split(".");
  jar.delete(VIEW_AS_COOKIE);
  if (z.uuid().safeParse(logId).success) {
    const supabase = await createClient();
    await supabase.from("access_log").update({ ended_at: new Date().toISOString() }).eq("id", logId).is("ended_at", null);
  }
  redirect(z.uuid().safeParse(orgId).success ? `/admin/kunden/${orgId}` : "/admin");
}

/** Records each client page opened during the view (shown in the owner's access log). */
export async function logViewPage(path: string) {
  await requireStaff("support", "builder");
  const [, logId] = ((await cookies()).get(VIEW_AS_COOKIE)?.value ?? "").split(".");
  if (!z.uuid().safeParse(logId).success || !/^\/[\w\-/]*$/.test(path) || path.length > 100) return;
  const supabase = await createClient();
  const { data } = await supabase.from("access_log").select("pages").eq("id", logId).maybeSingle();
  if (!data || data.pages.at(-1) === path || data.pages.length >= 50) return;
  await supabase.from("access_log").update({ pages: [...data.pages, path] }).eq("id", logId);
}
