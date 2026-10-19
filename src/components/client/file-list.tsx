"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";
import { formatDayMonth, formatSize } from "@/lib/format";
import { MAX_FILE_BYTES } from "@/lib/client/limits";
import { browserClient } from "@/lib/supabase/browser";
import type { FileRow } from "@/lib/client/data";
import { downloadUrl, finishUpload, startUpload } from "@/app/(client)/actions";

const cols = "grid grid-cols-[minmax(0,2fr)_100px_120px_90px] gap-3 px-5";

export function FileList({ files, projectId, me }: { files: FileRow[]; projectId: string; me: string }) {
  const t = useTranslations("files");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const upload = (list: FileList | null) => {
    const picked = [...(list ?? [])];
    if (!picked.length) return;
    setError(null);
    if (picked.some((f) => f.size > MAX_FILE_BYTES)) {
      setError(t("tooLarge"));
      return;
    }
    start(async () => {
      for (const file of picked) {
        const target = await startUpload({ projectId, fileName: file.name, size: file.size });
        const sent =
          target && !(await browserClient().storage.from("files").uploadToSignedUrl(target.path, target.token, file, { contentType: file.type || undefined })).error;
        const saved = sent && target && (await finishUpload({ projectId, path: target.path, fileName: file.name, size: file.size, mime: file.type })).ok;
        if (!saved) {
          setError(t("uploadFailed"));
          break;
        }
      }
      if (input.current) input.current.value = "";
      router.refresh();
    });
  };

  const open = async (id: string) => {
    const url = await downloadUrl(id);
    if (url) window.location.assign(url);
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-auto px-4 py-[22px] wide:px-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="m-0 text-[28px] font-bold tracking-[-0.03em]">{t("title")}</h1>
        <div className="flex flex-wrap items-center gap-[14px]">
          <span aria-live="polite" className="font-mono text-[11px] tracking-[0.1em] text-muted">
            {t("count", { count: files.length })}
          </span>
          <label
            className={`touch-target cursor-pointer rounded-pill bg-brand px-[14px] py-[9px] font-mono text-[11px] tracking-[0.08em] text-white focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand ${pending ? "cursor-wait opacity-80" : ""}`}
          >
            {t("upload")}
            <input ref={input} type="file" multiple disabled={pending} onChange={(e) => upload(e.target.files)} className="sr-only" />
          </label>
        </div>
      </div>
      <span role="status" aria-live="polite" className={`font-mono text-[11px] tracking-[0.06em] text-danger ${error ? "" : "sr-only"}`}>
        {error}
      </span>
      <div className="overflow-x-auto rounded-card border border-card-line bg-card">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr className={`${cols} border-b border-line py-3 font-mono text-[10px] tracking-[0.1em] text-label`}>
              <th className="p-0 text-left font-normal">{t("name")}</th>
              <th className="p-0 text-left font-normal">{t("from")}</th>
              <th className="p-0 text-left font-normal">{t("date")}</th>
              <th className="p-0 text-right font-normal">{t("size")}</th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.id} className={`${cols} items-baseline border-b border-line py-[13px] text-[14px]`}>
                <td className="flex min-w-0 items-baseline gap-[10px] p-0">
                  <span className="w-9 flex-none font-mono text-[10px] text-accent">{f.ext}</span>
                  <button type="button" onClick={() => open(f.id)} className="min-w-0 cursor-pointer truncate border-none bg-transparent p-0 text-left text-ink hover:text-accent">
                    {f.name}
                  </button>
                </td>
                <td className="truncate p-0 text-muted">{f.uploadedBy === me ? t("you") : f.uploaderName.split(" ")[0]}</td>
                <td className="p-0 font-mono text-[12px] text-muted">{formatDayMonth(f.createdAt, locale)}</td>
                <td className="p-0 text-right font-mono text-[12px] text-muted">{formatSize(f.sizeBytes, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
