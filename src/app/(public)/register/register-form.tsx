"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registerAction } from "@/actions/auth";
import { FormMessage, PasswordField, SubmitButton, TextField } from "@/components/form";
import { SecurityQuestionFields } from "@/components/security-question-fields";

export function RegisterForm() {
  const [state, action] = useActionState(registerAction, {});
  const errors = state.fieldErrors ?? {};
  const v = state.values ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <TextField
        label="Username"
        name="username"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        defaultValue={v.username}
        errors={errors.username}
        hint="4–30 characters: letters, digits, dot or underscore. You'll log in with this."
      />
      <TextField label="Your name" name="displayName" autoComplete="name" defaultValue={v.displayName} errors={errors.displayName} />
      <PasswordField
        label="Password"
        name="newPassword"
        autoComplete="new-password"
        errors={errors.newPassword}
        hint="At least 8 characters, with a letter and a digit."
      />
      <PasswordField label="Confirm password" name="confirmPassword" autoComplete="new-password" errors={errors.confirmPassword} />
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
      <SecurityQuestionFields state={state} />
      <SubmitButton pendingText="Creating account…">Create account</SubmitButton>
      <p className="pt-2 text-center text-sm text-zinc-600">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-teal-700 hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
