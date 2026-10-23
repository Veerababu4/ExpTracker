"use client";

import { useActionState, useId, useState } from "react";
import { saveBudgetAction } from "@/actions/budgets";
import { buttonClass } from "@/components/button-class";
import { FormMessage, inputClass } from "@/components/form";
import { formatRupees, paiseToInput, parseRupees } from "@/lib/money";
import { categoryBudgetsOverTotal } from "@/lib/rules/budget";
import { categoryField, TOTAL_FIELD } from "@/lib/validation/budget";

export type BudgetBox = { categoryId: string; name: string; paise: number | null };

/** Whole rupees without ".00" read better in these boxes; null → empty box. */
const show = (paise: number | null) => (paise === null ? "" : paiseToInput(paise).replace(/\.00$/, ""));

/** One budget line: the name on the left, a small ₹ box on the right, the problem (if any) underneath. */
function AmountRow({
  label,
  hint,
  name,
  value,
  onChange,
  errors,
}: {
  label: string;
  hint?: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  errors?: string[];
}) {
  const id = useId();
  const error = errors?.[0];
  return (
    <div className="flex flex-col gap-1 border-b border-zinc-100 py-2">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className={`text-sm text-zinc-800 ${hint ? "font-semibold" : ""}`}>
            {label}
          </label>
          {hint && (
            <p id={`${id}-hint`} className="text-xs text-zinc-500">
              {hint}
            </p>
          )}
        </div>
        <div className="relative w-36 shrink-0">
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-500">
            ₹
          </span>
          <input
            id={id}
            name={name}
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={onChange}
            className={`${inputClass} py-1.5 pl-7 text-right tabular-nums`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          />
        </div>
      </div>
      {error && (
        <p id={`${id}-error`} className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export function BudgetForm({
  familyId,
  month,
  monthName,
  totalPaise,
  boxes,
  previous,
  personal = false,
}: {
  /** My expenses (M8): the wording speaks of "your" total, not the family's. */
  personal?: boolean;
  familyId: string;
  month: string;
  monthName: string;
  totalPaise: number | null;
  /** One box per category shown on the page, in order. */
  boxes: BudgetBox[];
  /** Last month's budget for "Fill in from …", or null when it had none. */
  previous: { monthName: string; totalPaise: number | null; byCategory: Record<string, number> } | null;
}) {
  const [state, action, pending] = useActionState(saveBudgetAction, {});
  // Controlled boxes: kept across saves (React resets uncontrolled ones) and filled by "Fill in from …".
  const [values, setValues] = useState<Record<string, string>>(() => ({
    [TOTAL_FIELD]: show(totalPaise),
    ...Object.fromEntries(boxes.map((b) => [categoryField(b.categoryId), show(b.paise)])),
  }));
  const [filledFrom, setFilledFrom] = useState<string | null>(null);
  const errors = state.fieldErrors ?? {};

  const change = (name: string) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [name]: e.target.value }));

  function fillFromPrevious() {
    if (!previous) return;
    setValues({
      [TOTAL_FIELD]: show(previous.totalPaise),
      ...Object.fromEntries(boxes.map((b) => [categoryField(b.categoryId), show(previous.byCategory[b.categoryId] ?? null)])),
    });
    setFilledFrom(previous.monthName);
  }

  // B2: a note (not an error) while the category budgets add up to more than the family total.
  const typedTotal = parseRupees(values[TOTAL_FIELD] ?? "");
  const typedCategories = boxes.flatMap((b) => {
    const paise = parseRupees(values[categoryField(b.categoryId)] ?? "");
    return paise === null ? [] : [paise];
  });
  const overTotal = categoryBudgetsOverTotal(typedTotal, typedCategories);

  return (
    <form
      action={action}
      onSubmit={() => setFilledFrom(null)}
      className="flex flex-col gap-5"
      noValidate
      aria-label={`Budget for ${monthName}`}
    >
      <input type="hidden" name="familyId" value={familyId} />
      <input type="hidden" name="month" value={month} />
      <FormMessage state={state} />

      <AmountRow
        label={personal ? "Monthly total" : "Family total"}
        hint={personal ? "Everything you spend in the month" : "Everything the family spends in the month"}
        name={TOTAL_FIELD}
        value={values[TOTAL_FIELD] ?? ""}
        onChange={change(TOTAL_FIELD)}
        errors={errors[TOTAL_FIELD]}
      />

      <fieldset>
        <legend className="mb-1 text-sm font-semibold text-zinc-800">By category</legend>
        {/* Name and a small box on one line: 20 categories stay short enough to reach "Save" on a phone. */}
        <div className="grid sm:grid-cols-2 sm:gap-x-8">
          {boxes.map((b) => {
            const name = categoryField(b.categoryId);
            return (
              <AmountRow
                key={b.categoryId}
                label={b.name}
                name={name}
                value={values[name] ?? ""}
                onChange={change(name)}
                errors={errors[name]}
              />
            );
          })}
        </div>
      </fieldset>

      <div aria-live="polite" className="flex flex-col gap-2">
        {overTotal !== null && typedTotal !== null && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Note: the category budgets add up to {formatRupees(overTotal)}, more than the {personal ? "monthly" : "family"} total of{" "}
            {formatRupees(typedTotal)}. That&apos;s allowed.
          </p>
        )}
        {filledFrom && (
          <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900">
            Filled in from {filledFrom} — not saved yet. Check the amounts, then press Save budget.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? "Saving…" : "Save budget"}
        </button>
        {previous && (
          <button type="button" onClick={fillFromPrevious} disabled={pending} className={buttonClass("plain")}>
            Fill in from {previous.monthName}
          </button>
        )}
      </div>
    </form>
  );
}
