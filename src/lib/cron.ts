import "server-only";

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Without a secret the jobs stay closed. */
export function isCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET;
  return !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
}
