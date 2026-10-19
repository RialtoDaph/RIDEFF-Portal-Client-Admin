// Shared bits of the login and 2FA forms, styled as in the prototype.
export const fieldLabel = "font-mono text-[10px] tracking-[0.12em] text-muted";
export const fieldInput =
  "w-full rounded-field border border-field-line bg-inner px-[14px] py-[13px] text-[15px] text-ink placeholder:text-label";
export const codeInput = `${fieldInput} font-mono !text-[22px] tracking-[0.4em]`;
export const primaryButton =
  "cursor-pointer rounded-pill border-none bg-brand p-[13px] font-mono text-[12px] tracking-[0.04em] text-white hover:bg-brand-hover disabled:cursor-wait disabled:opacity-80";

export function FormError({ message }: { message: string | null }) {
  // always rendered so screen readers announce changes
  return (
    <span role="status" aria-live="polite" className={`font-mono text-[11px] tracking-[0.06em] text-danger ${message ? "" : "sr-only"}`}>
      {message}
    </span>
  );
}
