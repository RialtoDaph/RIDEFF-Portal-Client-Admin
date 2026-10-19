import { requireClient } from "@/lib/auth/session";

// Content arrives in a later step.
export default async function Page() {
  await requireClient();
  return <main className="flex-1" />;
}
