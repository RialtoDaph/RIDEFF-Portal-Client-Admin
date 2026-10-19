import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession, homeFor } from "@/lib/auth/session";
import { LoginShell } from "./login-shell";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await getSession();
  const home = session && homeFor(session);
  if (home) redirect(home);
  const t = await getTranslations("auth");
  return (
    <LoginShell
      heading={
        <div className="flex flex-col gap-[10px]">
          <h1 className="m-0 text-[40px] leading-none font-bold tracking-[-0.045em]">{t("title")}</h1>
          <p className="m-0 text-[15px] leading-[1.5] text-muted">{t("lead")}</p>
        </div>
      }
    >
      <LoginForm />
    </LoginShell>
  );
}
