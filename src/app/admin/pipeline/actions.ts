"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth/session";
import { LEAD_STAGES } from "@/lib/admin/leads";

// Pipeline: Support and the owner. RLS on leads checks the role again.

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);

const newLead = z.object({
  name: z.string().trim().min(1).max(120),
  contactName: opt(120),
  email: z.union([z.email(), z.literal("")]).optional().transform((v) => (v ? v.toLowerCase() : null)),
  phone: opt(40),
  source: opt(80),
  notes: opt(2000),
  introCall: z.iso.datetime({ offset: true }).nullable(),
  potentialEuro: z.number().int().min(0).max(100_000).nullable(),
});

export async function addLead(input: z.input<typeof newLead>): Promise<{ ok: boolean }> {
  await requireStaff("support");
  const parsed = newLead.safeParse(input);
  if (!parsed.success) return { ok: false };
  const f = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("leads").insert({
    name: f.name,
    contact_name: f.contactName,
    email: f.email,
    phone: f.phone,
    source: f.source,
    notes: f.notes,
    next_at: f.introCall,
    potential_monthly_cents: f.potentialEuro === null ? null : f.potentialEuro * 100,
  });
  if (error) {
    console.warn("addLead:", error.code, error.message);
    return { ok: false };
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}

const move = z.object({ leadId: z.uuid(), stage: z.enum(LEAD_STAGES), lostReason: opt(300) });

export async function moveLead(input: z.input<typeof move>): Promise<{ ok: boolean }> {
  await requireStaff("support");
  const parsed = move.safeParse(input);
  if (!parsed.success) return { ok: false };
  const { leadId, stage, lostReason } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .update({ stage, lost_reason: stage === "lost" ? lostReason : null, stage_changed_at: new Date().toISOString() })
    .eq("id", leadId)
    .select("id");
  if (error || !data?.length) {
    console.warn("moveLead:", error?.code, error?.message);
    return { ok: false };
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}
