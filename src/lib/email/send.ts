import "server-only";

const FROM = process.env.EMAIL_FROM ?? "RIDEFF <hallo@rideff.com>";

/**
 * Sends a plain-text email through Resend. Until RESEND_API_KEY is set (and rideff.com is
 * verified in Resend) nothing is sent and `sent: false` comes back, so the UI can say so.
 */
export async function sendEmail(mail: { to: string; subject: string; text: string }): Promise<{ sent: boolean }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [mail.to], subject: mail.subject, text: mail.text }),
  });
  if (!res.ok) console.error("sendEmail:", res.status, await res.text().catch(() => ""));
  return { sent: res.ok };
}

export { fillTemplate } from "./fill";
