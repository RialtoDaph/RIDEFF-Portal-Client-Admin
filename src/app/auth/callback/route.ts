import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { LOCALE_COOKIE } from "@/i18n/config";
import { createClient } from "@/lib/supabase/server";
import { homeFor, loadSession } from "@/lib/auth/session";

// Sign-in link from the email: ?code= (PKCE, default Supabase template) or ?token_hash=&type=.
// Same rules as the code form: only accounts with an organisation or a staff role get in.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const fail = () => NextResponse.redirect(new URL("/login?e=link", url));
  const supabase = await createClient();

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("no code") };
  if (error) return fail();

  const session = await loadSession(supabase);
  const home = session && homeFor(session);
  if (!session || !home) {
    await supabase.auth.signOut();
    return fail();
  }
  const response = NextResponse.redirect(new URL(home, url));
  response.cookies.set(LOCALE_COOKIE, session.profile.locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return response;
}
