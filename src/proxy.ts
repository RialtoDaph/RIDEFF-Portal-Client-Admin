import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Proxy only refreshes the session and sends signed-out visitors to /login.
// Roles are checked on the server in every layout, page and action (src/lib/auth).
export async function proxy(request: NextRequest) {
  const { response, claims } = await updateSession(request);
  const { pathname } = request.nextUrl;
  const isPublic =
    pathname === "/login" || pathname === "/auth/callback" || pathname.startsWith("/api/webhooks/") || pathname.startsWith("/api/cron/");
  // a sign-in link that landed on the Site URL (redirect URL not allowed in Supabase yet)
  if (!claims && pathname !== "/auth/callback" && (request.nextUrl.searchParams.has("code") || request.nextUrl.searchParams.has("token_hash"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    return NextResponse.redirect(url);
  }
  if (!claims && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.png|rideff-mark.png|rideff-logo.png|favicon.ico).*)"],
};
