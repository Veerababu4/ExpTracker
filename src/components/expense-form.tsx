"use client";

import { useRouter } from "next/navigation";
import { useActionState, useId, useState } from "react";
import { saveExpenseAction } from "@/actions/expenses";
import { FormMessage, inputClass, SelectField, SubmitButton, TextField } from "@/components/form";
import type { FormState } from "@/lib/form-state";
import { MAX_NOTE_LENGTH, PAYMENT_MODE_CODES, PAYMENT_MODES } from "@/lib/expense-options";
import { formatRupees, parseRupees } from "@/lib/money";
import { alertLevel, type AlertLimits } from "@/lib/rules/alerts";

export type ExpenseFormValues = {
  expenseDate: string;
  amount: string;
  categoryId: string;
  paymentMode: string;
  note: string;
};

/** Add form (no expenseId) or edit form. */
export function ExpenseForm({
  familyId,
  expenseId,
  initial,
  categories,
  limits,
  window,
  followDate = false,
}: {
  familyId: string;
  expenseId?: string;
  initial: ExpenseFormValues;
  categories: { id: string; name: string }[];
  /** Limits of the person the expense belongs to. */
  limits: AlertLimits;
  /** Dates this person may use (DESIGN §4.1). */
  window: { from: string; to: string };
  /** Add page: changing the date shows that day's entries below the form. */
  followDate?: boolean;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(initial.amount);
  const [state, action] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await saveExpenseAction(prev, formData);
    if (result.ok && !expenseId) setAmount(""); // a fresh form for the next expense
    return result;
  }, {});
  const errors = state.fieldErrors ?? {};
  const v = { ...initial, ...(state.values ?? {}) };
  const amountId = useId();

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="familyId" value={familyId} />
      {expenseId && <input type="hidden" name="expenseId" value={expenseId} />}
      <FormMessage state={state} />

      <TextField
        label="Date"
        name="expenseDate"
        type="date"
        min={window.from}
        max={window.to}
        defaultValue={v.expenseDate}
        errors={errors.expenseDate}
        onChange={(e) => {
          if (followDate && e.target.value) router.replace(`/?date=${e.target.value}`, { scroll: false });
        }}
      />

      <div className="flex flex-col gap-1.5">
        <div className="flex items-end gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor={amountId} className="text-sm font-medium text-zinc-800">
              Amount
            </label>
            <div className="relative">
              <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-500">
                ₹
              </span>
              <input
                id={amountId}
                name="amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={`${inputClass} pl-7 text-lg font-semibold`}
                aria-invalid={errors.amount?.length ? true : undefined}
                aria-describedby={`${amountId}-alert ${errors.amount?.length ? `${amountId}-error` : ""}`}
              />
            </div>
          </div>
          <div className="flex w-20 flex-col gap-1.5">
            <label htmlFor={`${amountId}-cur`} className="text-sm font-medium text-zinc-800">
              Currency
            </label>
            <input
              id={`${amountId}-cur`}
              value="INR"
              readOnly
              tabIndex={-1}
              className="w-full rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-2.5 text-base text-zinc-600"
            />
          </div>
        </div>
        {errors.amount?.length ? (
          <p id={`${amountId}-error`} className="text-sm text-red-600">
            {errors.amount[0]}
          </p>
        ) : null}
        <AmountAlert id={`${amountId}-alert`} amount={amount} limits={limits} />
      </div>

      <SelectField
        label="Category"
        name="categoryId"
        optional
        placeholder="Uncategorised"
        options={categories.map((c) => ({ value: c.id, label: c.name }))}
        defaultValue={v.categoryId}
        errors={errors.categoryId}
      />
      <SelectField
        label="Payment mode"
        name="paymentMode"
        optional
        placeholder="Not specified"
        options={PAYMENT_MODE_CODES.map((code) => ({ value: code, label: PAYMENT_MODES[code] }))}
        defaultValue={v.paymentMode}
        errors={errors.paymentMode}
      />
      <TextField
        label="Note"
        name="note"
        optional
        maxLength={MAX_NOTE_LENGTH}
        placeholder="e.g. DMart monthly groceries"
        defaultValue={v.note}
        errors={errors.note}
      />
      <SubmitButton pendingText="Saving…">{expenseId ? "Save changes" : "Save expense"}</SubmitButton>
    </form>
  );
}

/**
 * Live warning under the amount (DESIGN §4.2): red text above the high-value limit; red, bold and blinking
 * above the very-high limit. Only a warning — saving is never blocked.
 */
export function AmountAlert({ id, amount, limits }: { id: string; amount: string; limits: AlertLimits }) {
  const paise = parseRupees(amount);
  const level = paise === null ? "none" : alertLevel(paise, limits);
  return (
    <div id={id} aria-live="polite" data-alert-level={level}>
      {level === "high" && <p className="text-sm font-medium text-red-600">⚠ This is a high-value expense.</p>}
      {level === "very_high" && paise !== null && (
        // key: restart the blinking if the amount changes after it stopped.
        <p key={paise} className="alert-blink text-base font-bold text-red-700">
          ⚠ Very high expense — {formatRupees(paise)}. Please double-check before saving.
        </p>
      )}
    </div>
  );
}
