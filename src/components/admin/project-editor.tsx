"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { browserClient } from "@/lib/supabase/browser";
import { MAX_FILE_BYTES, MAX_PREVIEW_BYTES, PREVIEW_TYPES } from "@/lib/client/limits";
import {
  createApproval,
  createProject,
  createTestRun,
  finishStaffUpload,
  saveProgress,
  startPreviewUpload,
  startStaffUpload,
} from "@/app/admin/kunden/[id]/actions";

export type EditableProject = { id: string; name: string; phase: number; pct: number; goLive: string | null };
type L = { de: string; en: string; id: string };
type Panel = "approval" | "files" | "testRun" | null;

const label = "font-mono text-[10px] tracking-[0.12em] text-muted";
const box = "min-w-0 rounded-field border border-field-line bg-inner px-[14px] py-[11px] text-[15px] text-ink placeholder:text-label";
const field = `w-full ${box}`;
const pill = "touch-target cursor-pointer rounded-pill px-[14px] py-[9px] font-mono text-[11px] tracking-[0.08em]";
const primary = `${pill} border-none bg-brand text-white hover:bg-brand-hover disabled:cursor-wait disabled:opacity-70`;
const ghost = `${pill} border border-strong-line bg-transparent text-ink hover:bg-hover`;
const emptyL: L = { de: "", en: "", id: "" };

/** "PROJEKT BEARBEITEN" on the client detail page. */
export function ProjectEditor({ orgId, projects, canApprove }: { orgId: string; projects: EditableProject[]; canApprove: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const [selected, setSelected] = useState(projects[0]?.id ?? "");
  const project = projects.find((p) => p.id === selected) ?? projects[0];
  const [panel, setPanel] = useState<Panel>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const uid = useId();

  const report = (ok: boolean, text: string) => setMsg({ ok, text });

  const addProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || pending) return;
    start(async () => {
      const r = await createProject(orgId, name);
      if (!r.ok) return report(false, t("projectEdit.failed"));
      setAdding(false);
      setName("");
      setSelected(r.projectId);
      router.refresh();
    });
  };

  const toggle = (p: Exclude<Panel, null>) => {
    setMsg(null);
    setPanel((cur) => (cur === p ? null : p));
  };

  return (
    <section aria-labelledby={`${uid}-h`} className="flex flex-col gap-4 rounded-inner border border-line bg-inner p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${uid}-h`} className={`${label} m-0 font-normal`}>{t("projectEdit.title")}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {projects.length > 1 && (
            <>
              <label htmlFor={`${uid}-p`} className="sr-only">{t("projectEdit.project")}</label>
              <select id={`${uid}-p`} value={project?.id} onChange={(e) => setSelected(e.target.value)} className={`${box} max-w-[260px] py-2 text-[14px]`}>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </>
          )}
          <button type="button" aria-expanded={adding} onClick={() => setAdding((v) => !v)} className={ghost}>
            {t("projectEdit.newProject")}
          </button>
        </div>
      </div>

      {adding && (
        <form onSubmit={addProject} className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-[200px] flex-1 flex-col gap-[6px]">
            <label htmlFor={`${uid}-n`} className={label}>{t("projectEdit.projectName")}</label>
            <input id={`${uid}-n`} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Online-Shop" className={field} autoFocus />
          </div>
          <button type="submit" disabled={pending} aria-disabled={!name.trim()} className={primary}>{t("projectEdit.create")}</button>
          <button type="button" onClick={() => setAdding(false)} className={ghost}>{t("projectEdit.cancel")}</button>
        </form>
      )}

      {project && <Progress key={project.id} project={project} onResult={report} />}

      {project && (
        <>
          <div className="flex flex-wrap gap-2">
            {canApprove && (
              <button type="button" aria-expanded={panel === "approval"} onClick={() => toggle("approval")} className={panel === "approval" ? primary : ghost}>
                {t("projectEdit.addApproval")}
              </button>
            )}
            <button type="button" aria-expanded={panel === "files"} onClick={() => toggle("files")} className={panel === "files" ? primary : ghost}>
              {t("projectEdit.addFiles")}
            </button>
            <button type="button" aria-expanded={panel === "testRun"} onClick={() => toggle("testRun")} className={panel === "testRun" ? primary : ghost}>
              {t("projectEdit.addTestRun")}
            </button>
          </div>
          {panel === "approval" && <ApprovalForm key={project.id} projectId={project.id} onDone={(ok, text) => { report(ok, text); if (ok) setPanel(null); }} />}
          {panel === "files" && <FilesForm key={project.id} projectId={project.id} onDone={report} />}
          {panel === "testRun" && <TestRunForm key={project.id} projectId={project.id} onDone={(ok, text) => { report(ok, text); if (ok) setPanel(null); }} />}
        </>
      )}

      <span role="status" aria-live="polite" className={`font-mono text-[11px] tracking-[0.06em] ${msg?.ok ? "text-success-ink" : "text-danger"} ${msg ? "" : "sr-only"}`}>
        {msg?.text}
      </span>
    </section>
  );
}

// ── phase, % and go-live ─────────────────────────────────────────────
function Progress({ project, onResult }: { project: EditableProject; onResult: (ok: boolean, text: string) => void }) {
  const t = useTranslations();
  const router = useRouter();
  const [phase, setPhase] = useState(project.phase);
  const [pct, setPct] = useState(project.pct);
  const [goLive, setGoLive] = useState(project.goLive ?? "");
  const [pending, start] = useTransition();
  const uid = useId();
  const dirty = phase !== project.phase || pct !== project.pct || goLive !== (project.goLive ?? "");

  const save = () =>
    start(async () => {
      const r = await saveProgress({ projectId: project.id, phase, pct, goLive: goLive || null });
      onResult(r.ok, t(r.ok ? "projectEdit.saved" : "projectEdit.failed"));
      if (r.ok) router.refresh();
    });

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-labelledby={`${uid}-ph`} className="flex flex-col gap-[6px]">
        <span id={`${uid}-ph`} className={label}>{t("projectEdit.phase")}</span>
        <div className="grid grid-cols-5 gap-[3px]">
          {[1, 2, 3, 4, 5].map((n) => {
            const on = n === phase;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPhase(n)}
                className={`touch-target flex min-w-0 cursor-pointer flex-col items-start gap-[2px] rounded-[3px] border-none px-[9px] py-[7px] text-left font-mono text-[11px] ${on ? "bg-brand text-white" : n < phase ? "bg-chip text-success-ink" : "bg-sunken text-label"}`}
              >
                <span>{String(n).padStart(2, "0")}</span>
                <span className="hidden truncate wide:block">{t(`phase.${n}`)}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-1 items-end gap-3 wide:grid-cols-[minmax(0,1fr)_180px_auto]">
        <div className="flex flex-col gap-[6px]">
          <label htmlFor={`${uid}-pct`} className={label}>{t("projectEdit.progress")}</label>
          <div className="flex items-center gap-3">
            <input type="range" min={0} max={100} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} aria-hidden tabIndex={-1} className="min-w-0 flex-1 accent-brand" />
            <input
              id={`${uid}-pct`}
              type="number"
              min={0}
              max={100}
              value={pct}
              onChange={(e) => setPct(Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))))}
              className={`${box} w-[84px] flex-none text-right`}
            />
          </div>
        </div>
        <div className="flex flex-col gap-[6px]">
          <label htmlFor={`${uid}-gl`} className={label}>{t("projectEdit.goLive")}</label>
          <input id={`${uid}-gl`} type="date" value={goLive} onChange={(e) => setGoLive(e.target.value)} className={`${field} [color-scheme:dark]`} />
        </div>
        <button type="button" onClick={save} disabled={pending || !dirty} className={`${primary} disabled:cursor-not-allowed disabled:bg-approval-line`}>
          {t("projectEdit.save")}
        </button>
      </div>
    </div>
  );
}

// ── shared bits ──────────────────────────────────────────────────────
function L10nInput({
  id, label: text, value, onChange, translations, placeholder, multiline, required,
}: {
  id: string; label: string; value: L; onChange: (v: L) => void; translations: boolean; placeholder?: string; multiline?: boolean; required?: boolean;
}) {
  const Tag = multiline ? "textarea" : "input";
  const one = (lang: keyof L) => (
    <Tag
      id={lang === "de" ? id : `${id}-${lang}`}
      aria-label={lang === "de" ? undefined : `${text} · ${lang.toUpperCase()}`}
      value={value[lang]}
      onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...value, [lang]: e.target.value })}
      placeholder={lang === "de" ? placeholder : lang.toUpperCase()}
      aria-required={lang === "de" && required ? true : undefined}
      rows={multiline ? 3 : undefined}
      className={`${field} ${multiline ? "resize-y" : ""}`}
    />
  );
  return (
    <div className="flex flex-col gap-[6px]">
      <label htmlFor={id} className={label}>{text}</label>
      {one("de")}
      {translations && (
        <div className="grid grid-cols-1 gap-2 wide:grid-cols-2">
          {one("en")}
          {one("id")}
        </div>
      )}
    </div>
  );
}

function Plain({ id, label: text, children }: { id: string; label: string; children: (id: string) => React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <label htmlFor={id} className={label}>{text}</label>
      {children(id)}
    </div>
  );
}

const trimL = (v: L) => ({ de: v.de.trim(), en: v.en.trim(), id: v.id.trim() });

// ── approval ─────────────────────────────────────────────────────────
function ApprovalForm({ projectId, onDone }: { projectId: string; onDone: (ok: boolean, text: string) => void }) {
  const t = useTranslations();
  const router = useRouter();
  const uid = useId();
  const [tr, setTr] = useState(false);
  const [title, setTitle] = useState(emptyL);
  const [question, setQuestion] = useState(emptyL);
  const [whatsNew, setWhatsNew] = useState(emptyL);
  const [after, setAfter] = useState(emptyL);
  const [draftNo, setDraftNo] = useState("");
  const [deadline, setDeadline] = useState("");
  const [desktop, setDesktop] = useState<File | null>(null);
  const [mobile, setMobile] = useState<File | null>(null);
  const [pending, start] = useTransition();
  const valid = !!title.de.trim() && !!desktop;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || pending) return;
    start(async () => {
      const itemId = crypto.randomUUID();
      const upload = async (file: File | null, which: "desktop" | "mobile") => {
        if (!file) return null;
        const target = await startPreviewUpload({ projectId, itemId, which, type: file.type as (typeof PREVIEW_TYPES)[number], size: file.size });
        if (!target) throw new Error("preview");
        const { error } = await browserClient().storage.from("previews").uploadToSignedUrl(target.path, target.token, file, { contentType: file.type });
        if (error) throw error;
        return target.path;
      };
      try {
        const [d, m] = [await upload(desktop, "desktop"), await upload(mobile, "mobile")];
        const r = await createApproval({
          projectId,
          itemId,
          title: trimL(title),
          question: trimL(question),
          whatsNew,
          afterApproval: trimL(after),
          draftNo: draftNo ? Number(draftNo) : null,
          deadline: deadline || null,
          previewDesktop: d,
          previewMobile: m,
        });
        if (!r.ok) throw new Error("create");
        onDone(true, t("projectEdit.approval.done"));
        router.refresh();
      } catch {
        onDone(false, t("projectEdit.failed"));
      }
    });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 border-t border-line pt-4">
      <button type="button" aria-pressed={tr} onClick={() => setTr((v) => !v)} className={`${ghost} self-end`}>{t("projectEdit.translations")}</button>
      <L10nInput id={`${uid}-t`} label={t("projectEdit.approval.title")} value={title} onChange={setTitle} translations={tr} placeholder="Startseite, Entwurf 2" required />
      <L10nInput id={`${uid}-q`} label={t("projectEdit.approval.question")} value={question} onChange={setQuestion} translations={tr} placeholder="Passt die Startseite so?" />
      <L10nInput id={`${uid}-w`} label={t("projectEdit.approval.whatsNew")} value={whatsNew} onChange={setWhatsNew} translations={tr} placeholder={"Kuchenfotos größer\nVorbestellung direkt oben"} multiline />
      <div className="grid grid-cols-1 gap-3 wide:grid-cols-2">
        <Plain id={`${uid}-n`} label={t("projectEdit.approval.draftNo")}>
          {(id) => <input id={id} type="number" min={1} max={99} value={draftNo} onChange={(e) => setDraftNo(e.target.value)} placeholder="2" className={field} />}
        </Plain>
        <Plain id={`${uid}-d`} label={t("projectEdit.approval.deadline")}>
          {(id) => <input id={id} type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={`${field} [color-scheme:dark]`} />}
        </Plain>
      </div>
      <L10nInput id={`${uid}-a`} label={t("projectEdit.approval.afterApproval")} value={after} onChange={setAfter} translations={tr} placeholder="Testlauf Do" />
      <div className="grid grid-cols-1 gap-3 wide:grid-cols-2">
        <ImagePick label={t("projectEdit.approval.previewDesktop")} file={desktop} onPick={setDesktop} />
        <ImagePick label={t("projectEdit.approval.previewMobile")} file={mobile} onPick={setMobile} />
      </div>
      <button type="submit" disabled={pending} aria-disabled={!valid} className={`${primary} self-start ${valid ? "" : "cursor-not-allowed bg-approval-line hover:bg-approval-line"}`}>
        {t("projectEdit.approval.submit")}
      </button>
    </form>
  );
}

function ImagePick({ label: text, file, onPick }: { label: string; file: File | null; onPick: (f: File | null) => void }) {
  const t = useTranslations();
  const [error, setError] = useState(false);
  const uid = useId();
  return (
    <div className="flex flex-col gap-[6px]">
      <span id={`${uid}-l`} className={label}>{text}</span>
      <label className={`${ghost} flex items-center justify-between gap-2 rounded-field focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand`}>
        <span className="truncate">{file ? file.name : t("projectEdit.approval.pickImage")}</span>
        <span aria-hidden className="text-muted">↑</span>
        <input
          type="file"
          accept={PREVIEW_TYPES.join(",")}
          aria-labelledby={`${uid}-l`}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            const ok = !f || ((PREVIEW_TYPES as readonly string[]).includes(f.type) && f.size <= MAX_PREVIEW_BYTES);
            setError(!ok);
            onPick(ok ? f : null);
          }}
          className="sr-only"
        />
      </label>
      {error && <span role="alert" className="font-mono text-[11px] text-danger">{t("files.tooLarge")}</span>}
    </div>
  );
}

// ── files ────────────────────────────────────────────────────────────
function FilesForm({ projectId, onDone }: { projectId: string; onDone: (ok: boolean, text: string) => void }) {
  const t = useTranslations();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();

  const upload = (list: FileList | null) => {
    const picked = [...(list ?? [])];
    if (!picked.length) return;
    if (picked.some((f) => f.size > MAX_FILE_BYTES)) return onDone(false, t("files.tooLarge"));
    start(async () => {
      let n = 0;
      for (const file of picked) {
        const target = await startStaffUpload({ projectId, fileName: file.name, size: file.size });
        const sent = target && !(await browserClient().storage.from("files").uploadToSignedUrl(target.path, target.token, file, { contentType: file.type || undefined })).error;
        const saved = sent && target && (await finishStaffUpload({ projectId, path: target.path, fileName: file.name, size: file.size, mime: file.type })).ok;
        if (!saved) break;
        n++;
      }
      if (input.current) input.current.value = "";
      onDone(n === picked.length, n === picked.length ? t("projectEdit.files.done", { count: n }) : t("files.uploadFailed"));
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-4">
      <span className="text-[14px] text-ink-soft">{t("projectEdit.files.hint")}</span>
      <label className={`${primary} self-start focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand ${pending ? "cursor-wait opacity-80" : ""}`}>
        {t("projectEdit.files.pick")}
        <input ref={input} type="file" multiple disabled={pending} onChange={(e) => upload(e.target.files)} className="sr-only" />
      </label>
    </div>
  );
}

// ── test run ─────────────────────────────────────────────────────────
function TestRunForm({ projectId, onDone }: { projectId: string; onDone: (ok: boolean, text: string) => void }) {
  const t = useTranslations();
  const router = useRouter();
  const uid = useId();
  const [tr, setTr] = useState(false);
  const [title, setTitle] = useState(emptyL);
  const [subject, setSubject] = useState(emptyL);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [link, setLink] = useState("");
  const [pending, start] = useTransition();
  const valid = !!(title.de.trim() && subject.de.trim() && date && time);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || pending) return;
    start(async () => {
      const r = await createTestRun({ projectId, title: trimL(title), subject: trimL(subject), date, time, joinUrl: link.trim() });
      onDone(r.ok, t(r.ok ? "projectEdit.testRun.done" : "projectEdit.failed"));
      if (r.ok) router.refresh();
    });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 border-t border-line pt-4">
      <button type="button" aria-pressed={tr} onClick={() => setTr((v) => !v)} className={`${ghost} self-end`}>{t("projectEdit.translations")}</button>
      <L10nInput id={`${uid}-s`} label={t("projectEdit.testRun.subject")} value={subject} onChange={setSubject} translations={tr} placeholder="Team-App" required />
      <L10nInput id={`${uid}-t`} label={t("projectEdit.testRun.title")} value={title} onChange={setTitle} translations={tr} placeholder="Testlauf Team-App mit Can und Mia · Video" required />
      <div className="grid grid-cols-1 gap-3 wide:grid-cols-3">
        <Plain id={`${uid}-d`} label={t("projectEdit.testRun.date")}>
          {(id) => <input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-required className={`${field} [color-scheme:dark]`} />}
        </Plain>
        <Plain id={`${uid}-h`} label={t("projectEdit.testRun.time")}>
          {(id) => <input id={id} type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-required className={`${field} [color-scheme:dark]`} />}
        </Plain>
        <Plain id={`${uid}-l`} label={t("projectEdit.testRun.link")}>
          {(id) => <input id={id} type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" className={field} />}
        </Plain>
      </div>
      <button type="submit" disabled={pending} aria-disabled={!valid} className={`${primary} self-start ${valid ? "" : "cursor-not-allowed bg-approval-line hover:bg-approval-line"}`}>
        {t("projectEdit.testRun.submit")}
      </button>
    </form>
  );
}
