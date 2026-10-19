import { z } from "zod";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { NewClientForm, type Prefill } from "@/components/admin/new-client-form";

const FROM = (process.env.EMAIL_FROM ?? "hallo@rideff.com").replace(/^.*<(.+)>$/, "$1");

export default async function NewClientPage({ searchParams }: PageProps<"/admin/kunden/neu">) {
  await requireStaff("support");
  const { org } = await searchParams;
  const supabase = await createClient();
  const [packages, template, lead] = await Promise.all([
    supabase.from("packages").select("key, name, monthly_net_cents").order("sort"),
    supabase.from("templates").select("subject, body").eq("key", "welcome").eq("locale", "de").maybeSingle(),
    typeof org === "string" && z.uuid().safeParse(org).success
      ? supabase.from("organizations").select("id, name, contact_name, contact_email, city, package").eq("id", org).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  // "KUNDE ANLEGEN →" from the queue converts the lead and keeps its data
  const l = lead.data as { id: string; name: string; contact_name: string | null; contact_email: string | null; city: string | null; package: Prefill["packageKey"] | null } | null;
  const prefill: Prefill = l
    ? { company: l.name, contact: l.contact_name ?? "", email: l.contact_email ?? "", city: l.city ?? "", packageKey: l.package ?? "growth", orgId: l.id }
    : { company: "", contact: "", email: "", city: "", packageKey: "growth", orgId: null };
  return (
    <NewClientForm
      packages={(packages.data ?? []).map((p) => ({ key: p.key, name: p.name, monthlyCents: p.monthly_net_cents }))}
      prefill={prefill}
      template={template.data}
      from={FROM}
    />
  );
}
