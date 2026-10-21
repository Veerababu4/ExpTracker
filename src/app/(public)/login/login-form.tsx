"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction } from "@/actions/auth";
import { FormMessage, PasswordField, SubmitButton, TextField } from "@/components/form";

export function LoginForm() {
  const [state, action] = useActionState(loginAction, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <TextField
        label="Username"
        name="username"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        defaultValue={state.values?.username}
        errors={errors.username}
      />
      <PasswordField label="Password" name="password" errors={errors.password} />
      <SubmitButton pendingText="Logging in…">Log in</SubmitButton>
      <div className="flex flex-col items-center gap-2 pt-2 text-sm sm:flex-row sm:justify-between">
        <Link href="/forgot-password" className="font-medium text-teal-700 hover:underline">
          Forgot password?
        </Link>
        <span className="text-zinc-600">
          New here?{" "}
          <Link href="/register" className="font-medium text-teal-700 hover:underline">
            Create an account
          </Link>
        </span>
      </div>
    </form>
  );
}
