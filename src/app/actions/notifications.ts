"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// RLS: a user can only mark their own notifications (and only read_at).

export async function markNotificationRead(id: string) {
  if (!z.uuid().safeParse(id).success) return;
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null);
  revalidatePath("/", "layout");
}

export async function markAllNotificationsRead() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return;
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", data.claims.sub).is("read_at", null);
  revalidatePath("/", "layout");
}
