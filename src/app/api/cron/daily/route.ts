import { isCronRequest } from "@/lib/cron";
import { dispatchNotificationEmails } from "@/lib/email/notifications";
import { createAdminClient } from "@/lib/supabase/admin";

// Once a day, early morning: overdue status, due-date notices, test-run reminders;
// on Mondays also the weekly summary. Then sends whatever is pending.
export async function GET(request: Request) {
  if (!isCronRequest(request)) return new Response("unauthorized", { status: 401 });
  const admin = createAdminClient();
  const daily = await admin.rpc("run_daily_notifications");
  if (daily.error) return Response.json({ error: daily.error.message }, { status: 500 });
  const monday = new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "Europe/Berlin" }).format(new Date()) === "Mon";
  const weekly = monday ? await admin.rpc("run_weekly_summary") : null;
  if (weekly?.error) return Response.json({ error: weekly.error.message }, { status: 500 });
  return Response.json({ daily: daily.data, weekly: weekly?.data ?? null, emails: await dispatchNotificationEmails(admin) });
}
