import { redirect } from "next/navigation";
import { requireClient } from "@/lib/auth/session";

// Projekt. Content arrives in step 2.
export default async function ProjectPage() {
  const session = await requireClient();
  if (session.membership.org.status === "lead") redirect("/angebot");
  return <main className="flex-1" />;
}
