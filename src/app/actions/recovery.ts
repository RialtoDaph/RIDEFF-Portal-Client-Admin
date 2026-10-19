"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession, requireStaff } from "@/lib/auth/session";
import { hashRecoveryCode, makeRecoveryCodes } from "@/lib/auth/recovery";

/** A fresh set of ten codes (after 2FA setup, or from Einstellungen). Earlier codes stop working. */
export async function generateRecoveryCodes(): Promise<string[] | null> {
  await requireStaff();
  const codes = makeRecoveryCodes();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_recovery_codes", { p_hashes: codes.map(hashRecoveryCode) });
  if (error) {
    console.error("set_recovery_codes:", error.code, error.message);
    return null;
  }
  return codes;
}

/**
 * Signing in without the authenticator app: a valid code removes the TOTP factor,
 * then /login/2fa asks for a new setup. The code is used up either way.
 */
export async function redeemRecoveryCode(code: string): Promise<{ ok: false }> {
  const session = await getSession();
  if (!session?.staffRole) redirect("/login");
  if (session.aal === "aal2") redirect("/admin");
  if (!/^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/.test(code.trim())) return { ok: false };
  const supabase = await createClient();
  const { data: ok } = await supabase.rpc("consume_recovery_code", { p_hash: hashRecoveryCode(code) });
  if (!ok) return { ok: false };
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.mfa.listFactors({ userId: session.userId });
  for (const f of data?.factors ?? []) await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: session.userId });
  redirect("/login/2fa");
}
