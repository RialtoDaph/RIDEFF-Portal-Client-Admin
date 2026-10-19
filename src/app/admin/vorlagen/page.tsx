import { requireStaff } from "@/lib/auth/session";

// Content arrives in a later step.
export default async function Page() {
  await requireStaff("support");
  return null;
}
