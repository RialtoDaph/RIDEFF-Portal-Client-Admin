"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/auth/session";
import { sendEmail } from "@/lib/email/send";

// Team screen: owner only. The owner never changes or removes themselves.

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://portal.rideff.com";
const role = z.enum(["owner", "support", "finanzen", "builder"]);
const invite = z.object({ email: z.email().transform((v) => v.trim().toLowerCase()), name: z.string().trim().min(1).max(120), role });

export async function inviteStaff(input: z.input<typeof invite>): Promise<{ ok: boolean; sent: boolean }> {
  await requireStaff("owner");
  const parsed = invite.safeParse(input);
  if (!parsed.success) return { ok: false, sent: false };
  const f = parsed.data;
  const admin = createAdminClient();
  const { data: existing } = await admin.from("profiles").select("id").eq("email", f.email).maybeSingle();
  let userId = existing?.id as string | undefined;
  if (userId) {
    // a client login does not become a team login
    const { count } = await admin.from("org_members").select("user_id", { count: "exact", head: true }).eq("user_id", userId);
    if (count) return { ok: false, sent: false };
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email: f.email, email_confirm: true, user_metadata: { full_name: f.name } });
    if (error || !data.user) {
      console.error("inviteStaff user:", error?.message);
      return { ok: false, sent: false };
    }
    userId = data.user.id;
  }
  const supabase = await createClient();
  const { error } = await supabase.from("staff").insert({ user_id: userId, role: f.role });
  if (error) {
    console.warn("inviteStaff:", error.code, error.message);
    return { ok: false, sent: false };
  }
  const t = await getTranslations("email");
  const text = [
    t("greeting", { name: f.name.split(/\s+/)[0] }),
    t("staffInvite.body", { role: f.role.toUpperCase() }),
    t("toPortal", { url: `${SITE}/login` }),
    t("signoff"),
  ].join("\n\n");
  const sent = (await sendEmail({ to: f.email, subject: t("staffInvite.subject"), text })).sent;
  revalidatePath("/admin/team");
  return { ok: true, sent };
}

async function others(userId: string) {
  const session = await requireStaff("owner");
  return z.uuid().safeParse(userId).success && userId !== session.userId;
}

export async function setStaffRole(userId: string, next: string): Promise<{ ok: boolean }> {
  if (!(await others(userId)) || !role.safeParse(next).success) return { ok: false };
  const supabase = await createClient();
  const { data } = await supabase.from("staff").update({ role: next }).eq("user_id", userId).select("user_id");
  revalidatePath("/admin/team");
  return { ok: !!data?.length };
}

/** Removes the authenticator and the recovery codes; the next login sets 2FA up again. */
export async function resetStaff2fa(userId: string): Promise<{ ok: boolean }> {
  if (!(await others(userId))) return { ok: false };
  const admin = createAdminClient();
  const { data: staff } = await admin.from("staff").select("user_id").eq("user_id", userId).maybeSingle();
  if (!staff) return { ok: false };
  const { data } = await admin.auth.admin.mfa.listFactors({ userId });
  for (const f of data?.factors ?? []) await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId });
  await admin.from("staff").update({ totp_enabled: false }).eq("user_id", userId);
  await admin.from("staff_recovery_codes").update({ used_at: new Date().toISOString() }).eq("user_id", userId).is("used_at", null);
  revalidatePath("/admin/team");
  return { ok: true };
}

export async function removeStaff(userId: string): Promise<{ ok: boolean }> {
  if (!(await others(userId))) return { ok: false };
  const supabase = await createClient();
  const { data } = await supabase.from("staff").delete().eq("user_id", userId).select("user_id");
  revalidatePath("/admin/team");
  return { ok: !!data?.length };
}
