import { requireStaff } from "@/lib/auth/session";
import { RecoveryCodes } from "@/components/recovery-codes";
import { LoginShell } from "../../login-shell";

// Right after the first 2FA setup: ten recovery codes, shown once.
export default async function RecoveryCodesPage() {
  const session = await requireStaff();
  return (
    <LoginShell>
      <RecoveryCodes auto email={session.profile.email} onDoneHref="/admin" />
    </LoginShell>
  );
}
