"use client";

import Link from "next/link";
import { useActionState } from "react";
import { recoveryResetAction, recoveryStartAction, type RecoveryState } from "@/actions/auth";
import { FormMessage, PasswordField, SubmitButton, TextField } from "@/components/form";

export function RecoveryForm() {
  const [start, startAction] = useActionState(recoveryStartAction, {});

  if (!start.questions || !start.username) {
    return (
      <form action={startAction} className="flex flex-col gap-4" noValidate>
        <TextField
          label="Username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={start.values?.username}
          errors={start.fieldErrors?.username}
        />
        <SubmitButton>Continue</SubmitButton>
        <BackToLogin />
      </form>
    );
  }
  return <AnswersForm initial={start} />;
}

function AnswersForm({ initial }: { initial: RecoveryState }) {
  const [state, action] = useActionState(recoveryResetAction, initial);
  const errors = state.fieldErrors ?? {};
  const [question1, question2] = state.questions ?? ["", ""];
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <p className="rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-700">
        Username: <strong>{state.username}</strong>{" "}
        <a href="/forgot-password" className="ml-1 font-medium text-teal-700 hover:underline">
          Change
        </a>
      </p>
      <FormMessage state={state} />
      <input type="hidden" name="username" value={state.username} />
      <TextField label={question1} name="answer1" autoComplete="off" errors={errors.answer1} />
      <TextField label={question2} name="answer2" autoComplete="off" errors={errors.answer2} />
      <PasswordField
        label="New password"
        name="newPassword"
        autoComplete="new-password"
        errors={errors.newPassword}
        hint="At least 8 characters, with a letter and a digit."
      />
      <PasswordField label="Confirm new password" name="confirmPassword" autoComplete="new-password" errors={errors.confirmPassword} />
      <SubmitButton pendingText="Checking…">Set new password</SubmitButton>
      <BackToLogin />
    </form>
  );
}

function BackToLogin() {
  return (
    <p className="pt-2 text-center text-sm">
      <Link href="/login" className="font-medium text-teal-700 hover:underline">
        Back to log in
      </Link>
    </p>
  );
}
