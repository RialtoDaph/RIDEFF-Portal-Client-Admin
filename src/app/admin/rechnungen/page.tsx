import { requireStaff } from "@/lib/auth/session";

// Content arrives in a later step.
export default async function Page() {
  await requireStaff("finanzen");
  return <main className="flex-1" />;
}
