import { isCronRequest } from "@/lib/cron";
import { dispatchNotificationEmails } from "@/lib/email/notifications";
import { createAdminClient } from "@/lib/supabase/admin";

// Sends the emails for new notifications (approvals, chat, invoices, …). Safe to call often.
export async function GET(request: Request) {
  if (!isCronRequest(request)) return new Response("unauthorized", { status: 401 });
  return Response.json(await dispatchNotificationEmails(createAdminClient()));
}
