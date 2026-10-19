"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireClient } from "@/lib/auth/session";
import { loadOffer } from "@/lib/client/data";
import { buildOfferPdf } from "@/lib/offer/pdf";
import { dispatchSoon } from "@/lib/email/notifications";

/** The request's client IP. On Vercel the first x-forwarded-for entry is the visitor. */
async function clientIp(): Promise<string> {
  const h = await headers();
  const candidate = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim();
  return z.union([z.ipv4(), z.ipv6()]).safeParse(candidate).success ? candidate : "127.0.0.1";
}

/**
 * "↵ JA, FREIGEBEN": approval forms the contract. Records time, IP, user, user agent,
 * AGB version and a PDF snapshot with its SHA-256, then creates the setup invoice
 * and notifies the team (database function accept_offer, callable only from here).
 */
export async function acceptOffer(offerId: string, agbAccepted: boolean): Promise<{ ok: true; at: string } | { ok: false }> {
  const session = await requireClient();
  if (session.membership.role !== "inhaber" || agbAccepted !== true || !z.uuid().safeParse(offerId).success) return { ok: false };

  const org = session.membership.org;
  const offer = await loadOffer(org.id); // through RLS: proves the user can see this offer
  if (!offer || offer.id !== offerId || offer.status !== "sent") return { ok: false };

  const supabase = await createClient();
  const { data: agb } = await supabase
    .from("agb_versions")
    .select("version")
    .lte("valid_from", new Date().toISOString().slice(0, 10))
    .order("valid_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!agb) return { ok: false };

  const at = new Date().toISOString();
  const ip = await clientIp();
  const userAgent = (await headers()).get("user-agent") ?? "";
  const pdf = await buildOfferPdf({
    number: offer.number,
    orgName: org.name,
    packageName: offer.packageName,
    setupCents: offer.setupCents,
    monthlyCents: offer.monthlyCents,
    termMonths: offer.termMonths,
    groups: offer.groups,
    acceptance: { at, by: session.profile.fullName, email: session.profile.email, ip, agbVersion: agb.version },
  });
  const hash = createHash("sha256").update(pdf).digest("hex");
  const pdfPath = `${org.id}/${offer.id}/${hash}.pdf`;

  const admin = createAdminClient();
  const upload = await admin.storage.from("offers").upload(pdfPath, pdf, { contentType: "application/pdf", upsert: false });
  if (upload.error) {
    console.error("acceptOffer upload:", upload.error.message);
    return { ok: false };
  }
  const { error } = await admin.rpc("accept_offer", {
    p_offer: offer.id,
    p_user: session.userId,
    p_ip: ip,
    p_user_agent: userAgent,
    p_agb_version: agb.version,
    p_pdf_path: pdfPath,
    p_pdf_hash: hash,
  });
  if (error) {
    console.error("acceptOffer:", error.code, error.message);
    return { ok: false };
  }
  dispatchSoon();
  revalidatePath("/", "layout");
  return { ok: true, at };
}
