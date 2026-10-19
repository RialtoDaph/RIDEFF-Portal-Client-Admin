import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/auth/session";
import { LoginShell } from "../../login-shell";
import { RecoveryForm } from "./recovery-form";

export default async function RecoverPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.staffRole) redirect("/");
  if (session.aal === "aal2") redirect("/admin");
  const t = await getTranslations("recovery");
  return (
    <LoginShell heading={<h1 className="m-0 text-[24px] font-bold tracking-[-0.03em]">{t("useTitle")}</h1>}>
      <RecoveryForm />
    </LoginShell>
  );
}
