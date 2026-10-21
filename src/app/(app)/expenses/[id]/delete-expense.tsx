"use client";

import { useActionState, useState } from "react";
import { deleteExpenseAction } from "@/actions/expenses";
import { buttonClass } from "@/components/button-class";
import { FormMessage } from "@/components/form";

export function DeleteExpense({ familyId, expenseId }: { familyId: string; expenseId: string }) {
  const [state, action, pending] = useActionState(deleteExpenseAction, {});
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className={buttonClass("plain")} onClick={() => setAsking(true)}>
        Delete expense
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-2">
      <FormMessage state={state} />
      <input type="hidden" name="familyId" value={familyId} />
      <input type="hidden" name="expenseId" value={expenseId} />
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-zinc-100 p-2">
        <span className="text-sm">Delete this expense?</span>
        <button type="submit" disabled={pending} className={buttonClass("danger")}>
          {pending ? "Deleting…" : "Yes, delete"}
        </button>
        <button type="button" className={buttonClass("plain")} onClick={() => setAsking(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
