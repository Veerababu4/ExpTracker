import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { RecoveryForm } from "./recovery-form";

export const metadata: Metadata = { title: "Forgot password · Family Expenses" };

export default async function ForgotPasswordPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">Forgot password</h1>
      <p className="mb-6 text-sm text-zinc-600">
        Answer your two security questions to set a new password. If you can&apos;t, your family head can reset it
        for you.
      </p>
      <RecoveryForm />
    </>
  );
}
