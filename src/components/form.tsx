"use client";

import { useId, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/lib/form-state";

// Small building blocks shared by every form. Errors are linked to their inputs (aria-describedby)
// so screen readers announce them.

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base text-zinc-900 shadow-sm outline-none " +
  "focus:border-teal-600 focus:ring-2 focus:ring-teal-600/30 aria-[invalid=true]:border-red-500";

type FieldProps = {
  label: string;
  name: string;
  errors?: string[];
  hint?: ReactNode;
  optional?: boolean;
};

function FieldShell({
  id,
  label,
  errors,
  hint,
  optional,
  children,
}: Omit<FieldProps, "name"> & { id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-zinc-800">
        {label}
        {optional && <span className="ml-1 font-normal text-zinc-500">(optional)</span>}
      </label>
      {children}
      {hint && !errors?.length && (
        <p id={`${id}-hint`} className="text-xs text-zinc-500">
          {hint}
        </p>
      )}
      {errors?.length ? (
        <p id={`${id}-error`} className="text-sm text-red-600">
          {errors[0]}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, errors?: string[], hint?: ReactNode) {
  if (errors?.length) return `${id}-error`;
  return hint ? `${id}-hint` : undefined;
}

export function TextField({
  label,
  name,
  errors,
  hint,
  optional,
  ...input
}: FieldProps & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name">) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} errors={errors} hint={hint} optional={optional}>
      <input
        id={id}
        name={name}
        className={inputClass}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={describedBy(id, errors, hint)}
        {...input}
      />
    </FieldShell>
  );
}

/** Password input with a Show/Hide button (handy on phones). */
export function PasswordField({
  label,
  name,
  errors,
  hint,
  autoComplete = "current-password",
}: FieldProps & { autoComplete?: string }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <FieldShell id={id} label={label} errors={errors} hint={hint}>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          className={`${inputClass} pr-16`}
          aria-invalid={errors?.length ? true : undefined}
          aria-describedby={describedBy(id, errors, hint)}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 px-3 text-sm font-medium text-teal-700 hover:text-teal-900"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </FieldShell>
  );
}

export function SelectField({
  label,
  name,
  errors,
  hint,
  optional,
  options,
  placeholder,
  ...select
}: FieldProps & {
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "name">) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} errors={errors} hint={hint} optional={optional}>
      <select
        id={id}
        name={name}
        className={inputClass}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={describedBy(id, errors, hint)}
        {...select}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function SubmitButton({ children, pendingText }: { children: ReactNode; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-base font-semibold text-white shadow-sm hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-60"
    >
      {pending ? (pendingText ?? "Please wait…") : children}
    </button>
  );
}

/** Whole-form message: red for errors, green for success. Announced to screen readers. */
export function FormMessage({ state }: { state?: FormState }) {
  return (
    <div aria-live="polite">
      {state?.message && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            state.ok ? "bg-teal-50 text-teal-900" : "bg-red-50 text-red-800"
          }`}
        >
          {state.message}
        </p>
      )}
    </div>
  );
}
