"use client";

import { useActionState } from "react";
import { saveLimitsAction } from "@/actions/expenses";
import { buttonClass } from "@/components/button-class";
import { FormMessage, TextField } from "@/components/form";
import { paiseToInput } from "@/lib/money";

export function LimitsForm({
  familyId,
  memberId,
  memberName,
  highPaise,
  veryHighPaise,
  custom,
}: {
  familyId: string;
  memberId: string;
  memberName: string;
  highPaise: number;
  veryHighPaise: number;
  custom: boolean;
}) {
  const [state, action, pending] = useActionState(saveLimitsAction, {});
  const errors = state.fieldErrors ?? {};
  // Whole rupees without ".00" read better in these boxes.
  const show = (paise: number) => paiseToInput(paise).replace(/\.00$/, "");
  return (
    <form action={action} className="flex flex-col gap-3" noValidate aria-label={`Alert limits for ${memberName}`}>
      <input type="hidden" name="familyId" value={familyId} />
      <input type="hidden" name="memberId" value={memberId} />
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="High-value limit (₹)"
          name="high"
          inputMode="decimal"
          defaultValue={state.values?.high ?? show(highPaise)}
          errors={errors.high}
        />
        <TextField
          label="Very-high limit (₹)"
          name="veryHigh"
          inputMode="decimal"
          defaultValue={state.values?.veryHigh ?? show(veryHighPaise)}
          errors={errors.veryHigh}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="intent" value="save" disabled={pending} className={buttonClass("primary")}>
          {pending ? "Saving…" : "Save limits"}
        </button>
        {custom && (
          <button type="submit" name="intent" value="reset" disabled={pending} className={buttonClass("plain")}>
            Reset to default
          </button>
        )}
      </div>
    </form>
  );
}
