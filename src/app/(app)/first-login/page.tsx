import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { hasSecurityQuestions } from "@/server/services/accounts";
import { FirstLoginForm } from "./first-login-form";

export const metadata: Metadata = { title: "Set your password · Family Expenses" };

export default async function FirstLoginPage() {
  const user = await requireUser({ allowTemporaryPassword: true });
  if (!user.mustChangePassword) redirect("/");
  const needsQuestions = !(await hasSecurityQuestions(user.id));
  return (
    <section className="mx-auto w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-8">
      <h1 className="mb-1 text-2xl font-semibold">Set your own password</h1>
      <p className="mb-6 text-sm text-zinc-600">
        You logged in with a temporary password from your family head. Choose your own password
        {needsQuestions ? " and security questions" : ""} to continue.
      </p>
      <FirstLoginForm needsQuestions={needsQuestions} />
    </section>
  );
}
