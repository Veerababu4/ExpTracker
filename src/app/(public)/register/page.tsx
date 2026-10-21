import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create account · Family Expenses" };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">Create your account</h1>
      <p className="mb-6 text-sm text-zinc-600">After this you can start a family or join one with a family code.</p>
      <RegisterForm />
    </>
  );
}
