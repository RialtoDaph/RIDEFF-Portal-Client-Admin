import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { tabsFor } from "@/lib/admin/tabs";

// Kunden. Content arrives in step 5.
export default async function AdminHome() {
  const session = await requireStaff();
  const first = tabsFor(session.staffRole)[0];
  if (first.href !== "/admin") redirect(first.href);
  return <main className="flex-1" />;
}
