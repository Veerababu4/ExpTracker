"use client";

import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass, type Tone } from "./button-class";

// Small interactive pieces used on the family pages.

function Pending({ children, tone }: { children: React.ReactNode; tone: Tone }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass(tone)}>
      {pending ? "Please wait…" : children}
    </button>
  );
}

/** A form with one button. Hidden fields carry ids; the Server Action re-checks everything. */
export function ActionButton({
  action,
  fields,
  tone = "plain",
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  tone?: Tone;
  children: React.ReactNode;
}) {
  return (
    <form action={action}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Pending tone={tone}>{children}</Pending>
    </form>
  );
}

/** Button that asks "Are you sure?" inline before running the action. */
export function ConfirmButton({
  action,
  fields,
  label,
  question,
  confirmLabel,
  tone = "danger",
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  label: string;
  question: string;
  confirmLabel: string;
  tone?: Tone;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className={buttonClass("plain")} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <div role="group" aria-label={question} className="flex flex-wrap items-center gap-2 rounded-lg bg-zinc-100 p-2">
      <span className="text-sm text-zinc-800">{question}</span>
      <ActionButton action={action} fields={fields} tone={tone}>
        {confirmLabel}
      </ActionButton>
      <button type="button" className={buttonClass("plain")} onClick={() => setAsking(false)}>
        Cancel
      </button>
    </div>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass("plain")}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard blocked (e.g. not HTTPS): the code is on screen to copy by hand.
        }
      }}
    >
      <span aria-live="polite">{copied ? "Copied ✓" : label}</span>
    </button>
  );
}

/** Dropdown in the header; choosing a family switches straight away. */
export function FamilySwitcher({
  action,
  families,
  current,
}: {
  action: (formData: FormData) => Promise<void>;
  families: { familyId: string; familyName: string }[];
  current: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <form action={action}>
      <label className="sr-only" htmlFor="family-switcher">
        Family
      </label>
      <select
        id="family-switcher"
        name="familyId"
        defaultValue={current}
        disabled={pending}
        onChange={(e) => {
          const data = new FormData();
          data.set("familyId", e.target.value);
          startTransition(() => action(data));
        }}
        className="max-w-40 rounded-lg border border-zinc-300 bg-white py-1.5 pr-7 pl-2 text-sm font-medium text-zinc-800"
      >
        {families.map((f) => (
          <option key={f.familyId} value={f.familyId}>
            {f.familyName}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className={buttonClass("plain")}>
          Switch
        </button>
      </noscript>
    </form>
  );
}
