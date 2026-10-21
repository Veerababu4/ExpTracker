"use client";

import { useActionState, useState } from "react";
import { addCategoryAction, renameCategoryAction } from "@/actions/expenses";
import { buttonClass } from "@/components/button-class";
import { FormMessage, SubmitButton, TextField } from "@/components/form";

export function AddCategoryForm({ familyId }: { familyId: string }) {
  const [state, action] = useActionState(addCategoryAction, {});
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="familyId" value={familyId} />
      <FormMessage state={state} />
      <TextField
        label="Category name"
        name="name"
        placeholder="e.g. School fees"
        maxLength={40}
        defaultValue={state.ok ? "" : state.values?.name}
        errors={state.fieldErrors?.name}
      />
      <SubmitButton pendingText="Adding…">Add category</SubmitButton>
    </form>
  );
}

/** "Rename" button that opens a small inline form. */
export function RenameCategory({ familyId, categoryId, name }: { familyId: string; categoryId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(async (prev: Parameters<typeof renameCategoryAction>[0], formData: FormData) => {
    const result = await renameCategoryAction(prev, formData);
    if (result.ok) setOpen(false);
    return result;
  }, {});
  if (!open) {
    return (
      <button type="button" className={buttonClass("plain")} onClick={() => setOpen(true)} aria-label={`Rename ${name}`}>
        Rename
      </button>
    );
  }
  return (
    <form action={action} className="flex w-full flex-col gap-2 sm:w-80" noValidate>
      <input type="hidden" name="familyId" value={familyId} />
      <input type="hidden" name="categoryId" value={categoryId} />
      <FormMessage state={state.ok ? undefined : state} />
      <TextField label={`New name for “${name}”`} name="name" maxLength={40} defaultValue={state.values?.name ?? name} errors={state.fieldErrors?.name} />
      <div className="flex gap-2">
        <button type="submit" className={buttonClass("primary")}>
          Save
        </button>
        <button type="button" className={buttonClass("plain")} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
