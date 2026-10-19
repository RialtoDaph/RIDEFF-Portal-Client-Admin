"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { LOCALE_COOKIE } from "@/i18n/config";
import { createClient } from "@/lib/supabase/server";
import { homeFor, loadSession } from "@/lib/auth/session";

export type LoginResult = { ok: true } | { ok: false; error: "errEmail" | "errCode" | "errCodeWrong" | "errRateLimit" };

const email = z.string().trim().toLowerCase().pipe(z.email());
const code = z.string().regex(/^\d{6}$/);

/** Step 1: send the one-time code. Only invited users get one (no sign-ups). */
export async function sendCode(rawEmail: string): Promise<LoginResult> {
  const parsed = email.safeParse(rawEmail);
  if (!parsed.success) return { ok: false, error: "errEmail" };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { shouldCreateUser: false },
  });
  if (error?.status === 429) return { ok: false, error: "errRateLimit" };
  // Unknown addresses get the same answer, so the form does not reveal who is a client.
  if (error) console.warn("sendCode:", error.code ?? error.message);
  return { ok: true };
}

/** Step 2: verify the code, then route by the role stored in the database. */
export async function verifyCode(rawEmail: string, rawCode: string): Promise<LoginResult> {
  if (!code.safeParse(rawCode).success) return { ok: false, error: "errCode" };
  const parsed = email.safeParse(rawEmail);
  if (!parsed.success) return { ok: false, error: "errEmail" };
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email: parsed.data, token: rawCode, type: "email" });
  if (error) return { ok: false, error: error.status === 429 ? "errRateLimit" : "errCodeWrong" };

  const session = await loadSession(supabase);
  const home = session && homeFor(session);
  if (!session || !home) {
    // A valid account without an organisation or staff role has nothing to see.
    await supabase.auth.signOut();
    return { ok: false, error: "errCodeWrong" };
  }
  (await cookies()).set(LOCALE_COOKIE, session.profile.locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  redirect(home);
}
