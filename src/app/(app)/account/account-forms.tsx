"use client";

import { useActionState } from "react";
import { changePasswordAction, changeQuestionsAction, updateProfileAction } from "@/actions/auth";
import { FormMessage, PasswordField, SubmitButton, TextField } from "@/components/form";
import { SecurityQuestionFields } from "@/components/security-question-fields";

export function ProfileForm({ profile }: { profile: { displayName: string; mobile: string; email: string } }) {
  const [state, action] = useActionState(updateProfileAction, { values: profile });
  const errors = state.fieldErrors ?? {};
  const v = state.values ?? profile;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <TextField label="Your name" name="displayName" autoComplete="name" defaultValue={v.displayName} errors={errors.displayName} />
      <TextField
        label="Mobile number"
        name="mobile"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        optional
        defaultValue={v.mobile}
        errors={errors.mobile}
      />
      <TextField label="Email" name="email" type="email" autoComplete="email" optional defaultValue={v.email} errors={errors.email} />
      <SubmitButton pendingText="Saving…">Save profile</SubmitButton>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePasswordAction, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <PasswordField label="Current password" name="currentPassword" errors={errors.currentPassword} />
      <PasswordField
        label="New password"
        name="newPassword"
        autoComplete="new-password"
        errors={errors.newPassword}
        hint="At least 8 characters, with a letter and a digit."
      />
      <PasswordField label="Confirm new password" name="confirmPassword" autoComplete="new-password" errors={errors.confirmPassword} />
      <SubmitButton pendingText="Changing…">Change password</SubmitButton>
    </form>
  );
}

export function ChangeQuestionsForm() {
  const [state, action] = useActionState(changeQuestionsAction, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <SecurityQuestionFields state={state} legend="New questions" />
      <PasswordField label="Current password" name="currentPassword" errors={state.fieldErrors?.currentPassword} />
      <SubmitButton pendingText="Saving…">Update questions</SubmitButton>
    </form>
  );
}
