"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { selectProject } from "@/app/(client)/actions";

/** Shown in the header when the organisation has more than one project. */
export function ProjectPicker({ projects, current }: { projects: { id: string; name: string }[]; current: string }) {
  const t = useTranslations("nav");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <select
      aria-label={t("project")}
      value={current}
      disabled={pending}
      onChange={(e) => {
        const id = e.target.value;
        start(async () => {
          await selectProject(id);
          router.refresh();
        });
      }}
      className="cursor-pointer rounded-[8px] border border-field-line bg-transparent px-2 py-1 font-mono text-[12px] tracking-[0.06em] text-ink uppercase"
    >
      {projects.map((p) => (
        <option key={p.id} value={p.id} className="bg-card">
          {p.name}
        </option>
      ))}
    </select>
  );
}
