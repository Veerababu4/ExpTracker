import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in · Family Expenses" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">Log in</h1>
      <p className="mb-6 text-sm text-zinc-600">Welcome back. Enter your username and password.</p>
      <LoginForm />
    </>
  );
}
