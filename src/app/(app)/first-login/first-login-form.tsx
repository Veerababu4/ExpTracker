"use client";

import { useActionState } from "react";
import { firstLoginAction } from "@/actions/auth";
import { FormMessage, PasswordField, SubmitButton } from "@/components/form";
import { SecurityQuestionFields } from "@/components/security-question-fields";

export function FirstLoginForm({ needsQuestions }: { needsQuestions: boolean }) {
  const [state, action] = useActionState(firstLoginAction, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <PasswordField
        label="New password"
        name="newPassword"
        autoComplete="new-password"
        errors={errors.newPassword}
        hint="At least 8 characters, with a letter and a digit."
      />
      <PasswordField label="Confirm new password" name="confirmPassword" autoComplete="new-password" errors={errors.confirmPassword} />
      {needsQuestions && <SecurityQuestionFields state={state} />}
      <SubmitButton pendingText="Saving…">Save and continue</SubmitButton>
    </form>
  );
}
