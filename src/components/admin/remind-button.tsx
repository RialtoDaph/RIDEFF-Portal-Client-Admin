"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { remindInvoice } from "@/app/admin/actions";

export function RemindButton({ invoiceId, className }: { invoiceId: string; className: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending || done}
      aria-live="polite"
      onClick={() =>
        start(async () => {
          const r = await remindInvoice(invoiceId);
          if (r.ok) setDone(true);
          router.refresh();
        })
      }
      className={className}
    >
      {done ? t("queue.reminderSent") : t("detail.sendReminder")}
    </button>
  );
}
