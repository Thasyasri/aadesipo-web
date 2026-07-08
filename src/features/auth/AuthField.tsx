import type { InputHTMLAttributes } from "react";

/** A labelled text input matching the app's form styling (see NewGameSetup).
 *  Shared by the login, reset, and profile-edit forms. */
export function Field({
  label,
  ...props
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-caption font-semibold text-text-secondary">{label}</span>
      <input
        className="rounded-md border border-bg-raised bg-bg-base px-3 py-2.5 text-body text-text-primary outline-none transition-colors focus:border-brand-primary"
        {...props}
      />
    </label>
  );
}
