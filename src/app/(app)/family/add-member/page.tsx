import type { Metadata } from "next";
import Link from "next/link";
import { requireFamily } from "@/server/auth/family";
import { AddMemberForm } from "./add-member-form";

export const metadata: Metadata = { title: "Create a member login · Family Expenses" };

export default async function AddMemberPage() {
  const { family } = await requireFamily();
  const back = (
    <Link href="/family" className="text-sm font-medium text-teal-700 hover:underline">
      ← Back to family
    </Link>
  );
  if (family.role !== "HEAD") {
    return (
      <section className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">Create a member login</h1>
        <p className="text-zinc-600">Only the family head can create logins for family members.</p>
        {back}
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-4">
      {back}
      <div>
        <h1 className="text-2xl font-semibold">Create a member login</h1>
        <p className="text-sm text-zinc-600">
          For family members who don&apos;t want to sign up themselves — for example parents or children. They join{" "}
          <strong>{family.familyName}</strong> straight away and set their own password and security questions at first
          login.
        </p>
      </div>
      <div className="max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <AddMemberForm familyId={family.familyId} />
      </div>
    </section>
  );
}
