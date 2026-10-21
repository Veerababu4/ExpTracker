"use client";

import { useActionState, useState } from "react";
import { attachReceiptAction, removeReceiptAction } from "@/actions/expenses";
import { buttonClass } from "@/components/button-class";
import { FormMessage } from "@/components/form";
import { ReceiptPicker, type PickedReceipt } from "@/components/receipt-picker";
import type { FormState } from "@/lib/form-state";

/** Add, replace or remove the receipt of an expense (shown only to people who may change the expense). */
export function ReceiptForms({
  familyId,
  expenseId,
  hasReceipt,
  uploads,
}: {
  familyId: string;
  expenseId: string;
  hasReceipt: boolean;
  uploads: "on" | "off" | "full";
}) {
  const [picked, setPicked] = useState<PickedReceipt | null>(null);
  const [saved, attach, saving] = useActionState(async (prev: FormState, formData: FormData) => {
    if (picked) formData.set("receipt", picked.file);
    const result = await attachReceiptAction(prev, formData);
    if (result.ok) setPicked(null);
    return result;
  }, {});
  const [removed, remove, removing] = useActionState(removeReceiptAction, {});
  const [asking, setAsking] = useState(false);
  const ids = (
    <>
      <input type="hidden" name="familyId" value={familyId} />
      <input type="hidden" name="expenseId" value={expenseId} />
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      {uploads === "on" ? (
        <form action={attach} className="flex flex-col gap-3">
          <FormMessage state={saved} />
          {ids}
          <ReceiptPicker
            value={picked}
            onChange={setPicked}
            errors={saved.fieldErrors?.receipt}
            label={hasReceipt ? "Replace receipt" : "Add a receipt"}
            optional={false}
          />
          {picked && (
            <button type="submit" disabled={saving} className={`${buttonClass("primary", "md")} w-fit`}>
              {saving ? "Saving…" : "Save receipt"}
            </button>
          )}
        </form>
      ) : (
        <p className="text-sm text-zinc-500">
          {uploads === "off"
            ? "Receipts are turned off at the moment, so new ones can't be added."
            : "Receipt storage is full, so new receipts can't be added."}
        </p>
      )}

      {hasReceipt && (
        <form action={remove} className="flex flex-col gap-2">
          <FormMessage state={removed} />
          {ids}
          {asking ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-zinc-100 p-2">
              <span className="text-sm">Remove this receipt?</span>
              <button type="submit" disabled={removing} className={buttonClass("danger")}>
                {removing ? "Removing…" : "Yes, remove"}
              </button>
              <button type="button" className={buttonClass("plain")} onClick={() => setAsking(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" className={`${buttonClass("plain")} w-fit`} onClick={() => setAsking(true)}>
              Remove receipt
            </button>
          )}
        </form>
      )}
      {!hasReceipt && removed.ok && <FormMessage state={removed} />}
    </div>
  );
}
