"use client";

import { useActionState, useState } from "react";
import { createMemberLoginAction } from "@/actions/family";
import { buttonClass } from "@/components/button-class";
import { FormMessage, SubmitButton, TextField } from "@/components/form";
import { IncludeExpensesCheckbox } from "@/components/include-expenses";
import { suggestTempPassword } from "@/lib/temp-password";

export function AddMemberForm({ familyId, month }: { familyId: string; month: string }) {
  const [state, action] = useActionState(createMemberLoginAction, {});
  const [password, setPassword] = useState("");
  const errors = state.fieldErrors ?? {};
  // After a success the form starts empty for the next person.
  const v = state.ok ? {} : (state.values ?? {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="familyId" value={familyId} />
      <FormMessage state={state} />
      <TextField
        label="Username"
        name="username"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        defaultValue={v.username}
        errors={errors.username}
        hint="4–30 characters: letters, digits, dot or underscore. They'll log in with this."
      />
      <TextField label="Their name" name="displayName" autoComplete="off" defaultValue={v.displayName} errors={errors.displayName} />
      <div className="flex flex-col gap-2">
        <TextField
          label="Temporary password"
          name="tempPassword"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          errors={errors.tempPassword}
          hint="At least 8 characters with a letter and a digit. Share it with them; they'll change it at first login."
        />
        <div>
          <button type="button" className={buttonClass("plain")} onClick={() => setPassword(suggestTempPassword())}>
            Suggest one
          </button>
        </div>
      </div>
      <TextField
        label="Mobile number"
        name="mobile"
        type="tel"
        inputMode="tel"
        autoComplete="off"
        optional
        defaultValue={v.mobile}
        errors={errors.mobile}
      />
      <TextField label="Email" name="email" type="email" autoComplete="off" optional defaultValue={v.email} errors={errors.email} />
      <IncludeExpensesCheckbox month={month} whose="their" />
      <SubmitButton pendingText="Creating…">Create login</SubmitButton>
    </form>
  );
}
