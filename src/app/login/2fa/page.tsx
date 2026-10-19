import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";
import { LoginShell } from "../login-shell";
import { TotpForm } from "./totp-form";

// Staff must pass TOTP before anything in /admin. Interim screen built only from
// existing copy; the designed 2FA setup (with recovery codes) is step 8.
export default async function TwoFactorPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.staffRole) redirect("/");
  if (session.aal === "aal2") redirect("/admin");

  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const factor = data?.totp?.find((f) => f.status === "verified");
  const t = await getTranslations("profile");

  return (
    <LoginShell>
      <TotpForm factorId={factor?.id ?? null} />
      <form action={signOut} className="border-t border-line pt-3">
        <button type="submit" className="touch-target cursor-pointer border-none bg-transparent p-0 text-[13px] text-accent hover:text-brand">
          {t("signOut")}
        </button>
      </form>
    </LoginShell>
  );
}
