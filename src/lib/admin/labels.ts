import type { Tone } from "./data";

/** Phase column: "03·62" while building, LIVE, LEAD. */
export function phaseLabel(c: { status: "lead" | "client"; phase: number | null; pct: number }): { text: string; className: string } {
  if (c.status === "lead") return { text: "LEAD", className: "text-muted" };
  if (c.phase === null) return { text: "–", className: "text-muted" };
  if (c.phase >= 5) return { text: "LIVE", className: "text-success-ink" };
  return { text: `${String(c.phase).padStart(2, "0")}·${c.pct}`, className: c.phase >= 3 ? "text-accent" : "text-muted" };
}

export const TONE_CLASS: Record<Tone, string> = {
  default: "text-ink-soft",
  approval: "text-accent-soft",
  overdue: "text-danger",
};
