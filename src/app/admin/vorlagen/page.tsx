import { getLocale } from "next-intl/server";
import { requireStaff } from "@/lib/auth/session";
import { WithQueue } from "@/components/admin/queue-column";
import { createClient } from "@/lib/supabase/server";
import { TemplatesView, type TemplateRow } from "@/components/admin/templates-view";

// Templates in the staff member's language, German where a translation is missing.
export default async function TemplatesPage() {
  const session = await requireStaff("support");
  const locale = await getLocale();
  const supabase = await createClient();
  const { data } = await supabase.from("templates").select("key, kind, locale, name, body, sort").order("sort");
  const byKey = new Map<string, TemplateRow & { locale: string }>();
  for (const r of data ?? []) {
    const have = byKey.get(r.key);
    if (!have || (r.locale === locale && have.locale !== locale)) byKey.set(r.key, r);
  }
  return (
    <WithQueue role={session.staffRole}>
      <TemplatesView templates={[...byKey.values()].map(({ key, kind, name, body }) => ({ key, kind, name, body }))} />
    </WithQueue>
  );
}
