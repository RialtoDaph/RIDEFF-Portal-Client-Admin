"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession, requireClient, requireStaff, staffVerified } from "@/lib/auth/session";
import { fillTemplate, sendEmail } from "@/lib/email/send";
import { PREF_GROUPS, type PrefGroup } from "@/lib/settings/prefs";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://portal.rideff.com";

// ── profile & email preferences (own row; RLS and column grants) ─────
export async function updateProfile(fullName: string): Promise<{ ok: boolean }> {
  const session = await getSession();
  const name = z.string().trim().min(1).max(120).safeParse(fullName);
  if (!session || !name.success) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: name.data }).eq("id", session.userId);
  revalidatePath("/", "layout");
  return { ok: !error };
}

export async function setEmailPref(group: PrefGroup, on: boolean): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session || !(group in PREF_GROUPS) || typeof on !== "boolean") return { ok: false };
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("email_prefs").eq("id", session.userId).maybeSingle();
  const prefs: Record<string, boolean> = { ...((data?.email_prefs as Record<string, boolean> | null) ?? {}) };
  for (const kind of PREF_GROUPS[group]) {
    if (on) delete prefs[kind];
    else prefs[kind] = false;
  }
  const { error } = await supabase.from("profiles").update({ email_prefs: prefs }).eq("id", session.userId);
  return { ok: !error };
}

/** Password for signing in without the email code (min. 10 characters). */
export async function setPassword(password: string): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session || typeof password !== "string" || password.length < 10 || password.length > 200) return { ok: false };
  if (session.staffRole && !staffVerified(session)) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) console.warn("setPassword:", error.code ?? error.message);
  return { ok: !error };
}

/** Owner: make TOTP 2FA required or optional for the whole team. */
export async function setStaff2fa(required: boolean): Promise<{ ok: boolean }> {
  await requireStaff("owner");
  if (typeof required !== "boolean") return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.from("settings").upsert({ key: "require_staff_2fa", value: required });
  revalidatePath("/", "layout");
  return { ok: !error };
}

// ── client team (Inhaber only; RLS: never yourself) ──────────────────
const role = z.enum(["inhaber", "mitarbeiter"]);

async function requireInhaber() {
  const session = await requireClient();
  return session.membership.role === "inhaber" && !session.viewAs ? session : null;
}

const invite = z.object({ email: z.email().transform((v) => v.trim().toLowerCase()), name: z.string().trim().min(1).max(120), role });

export async function inviteMember(input: z.input<typeof invite>): Promise<{ ok: boolean; sent: boolean }> {
  const session = await requireInhaber();
  const parsed = invite.safeParse(input);
  if (!session || !parsed.success) return { ok: false, sent: false };
  const f = parsed.data;
  const org = session.membership.org;

  // the auth user is created with the service role, only after the Inhaber check above
  const admin = createAdminClient();
  const { data: existing } = await admin.from("profiles").select("id").eq("email", f.email).maybeSingle();
  let userId = existing?.id as string | undefined;
  if (userId) {
    const { data: staff } = await admin.from("staff").select("user_id").eq("user_id", userId).maybeSingle();
    if (staff) return { ok: false, sent: false };
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email: f.email, email_confirm: true, user_metadata: { full_name: f.name } });
    if (error || !data.user) {
      console.error("inviteMember user:", error?.message);
      return { ok: false, sent: false };
    }
    userId = data.user.id;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("org_members").insert({ org_id: org.id, user_id: userId, role: f.role });
  if (error) {
    console.warn("inviteMember:", error.code, error.message);
    return { ok: false, sent: false };
  }
  const { data: tpl } = await admin.from("templates").select("subject, body").eq("key", "welcome").eq("locale", session.profile.locale).maybeSingle();
  const welcome = tpl ?? (await admin.from("templates").select("subject, body").eq("key", "welcome").eq("locale", "de").maybeSingle()).data;
  let sent = false;
  if (welcome) {
    const text = `${fillTemplate(welcome.body, { Vorname: f.name.split(/\s+/)[0] })}\n\n${SITE}/login`;
    sent = (await sendEmail({ to: f.email, subject: welcome.subject, text })).sent;
  }
  revalidatePath("/einstellungen");
  return { ok: true, sent };
}

export async function setMemberRole(userId: string, next: string): Promise<{ ok: boolean }> {
  const session = await requireInhaber();
  if (!session || !z.uuid().safeParse(userId).success || !role.safeParse(next).success) return { ok: false };
  const supabase = await createClient();
  const { data } = await supabase.from("org_members").update({ role: next }).eq("org_id", session.membership.org.id).eq("user_id", userId).select("user_id");
  revalidatePath("/einstellungen");
  return { ok: !!data?.length };
}

export async function removeMember(userId: string): Promise<{ ok: boolean }> {
  const session = await requireInhaber();
  if (!session || !z.uuid().safeParse(userId).success) return { ok: false };
  const supabase = await createClient();
  const { data } = await supabase.from("org_members").delete().eq("org_id", session.membership.org.id).eq("user_id", userId).select("user_id");
  revalidatePath("/einstellungen");
  return { ok: !!data?.length };
}
