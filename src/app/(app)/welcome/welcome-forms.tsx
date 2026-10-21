"use client";

import { useActionState } from "react";
import { createFamilyAction, joinFamilyAction } from "@/actions/family";
import { FormMessage, SubmitButton, TextField } from "@/components/form";

export function CreateFamilyForm() {
  const [state, action] = useActionState(createFamilyAction, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <TextField
        label="Family name"
        name="name"
        placeholder="e.g. Kumar family"
        defaultValue={state.values?.name}
        errors={state.fieldErrors?.name}
      />
      <SubmitButton pendingText="Creating…">Create family</SubmitButton>
    </form>
  );
}

export function JoinFamilyForm() {
  const [state, action] = useActionState(joinFamilyAction, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <TextField
        label="Family code"
        name="code"
        placeholder="ABCD-2345"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 font-mono text-base tracking-widest uppercase shadow-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/30 aria-[invalid=true]:border-red-500"
        defaultValue={state.ok ? "" : state.values?.code}
        errors={state.fieldErrors?.code}
      />
      <SubmitButton pendingText="Sending…">Ask to join</SubmitButton>
    </form>
  );
}
