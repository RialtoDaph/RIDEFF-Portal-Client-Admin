"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession, staffVerified } from "@/lib/auth/session";

export type Enrollment = { factorId: string; qr: string; secret: string };
export type TotpResult = { ok: false; error: "errCode" | "errCodeWrong" | "errRateLimit" };

async function requireStaffAal1() {
  const session = await getSession();
  if (!session?.staffRole) redirect("/login");
  if (staffVerified(session)) redirect("/admin");
  return session;
}

/** Creates a fresh TOTP factor (dropping unfinished ones) and returns its QR code. */
export async function startEnrollment(): Promise<Enrollment | null> {
  await requireStaffAal1();
  const supabase = await createClient();
  const { data: list } = await supabase.auth.mfa.listFactors();
  const verified = list?.totp?.some((f) => f.status === "verified");
  if (verified) return null;
  for (const f of list?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", issuer: "RIDEFF Portal", friendlyName: "RIDEFF Portal" });
  if (error || !data) {
    console.error("mfa.enroll:", error?.code ?? error?.message);
    return null;
  }
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** Verifies a TOTP code: upgrades the session to aal2 and opens /admin. */
export async function verifyTotp(factorId: string, code: string): Promise<TotpResult> {
  await requireStaffAal1();
  if (!/^\d{6}$/.test(code)) return { ok: false, error: "errCode" };
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { ok: false, error: error.status === 429 ? "errRateLimit" : "errCodeWrong" };
  await supabase.rpc("mark_totp_enabled");
  // first setup (or after a recovery): show a fresh set of recovery codes
  const { data: left } = await supabase.rpc("recovery_codes_left");
  redirect(left ? "/admin" : "/login/2fa/codes");
}
