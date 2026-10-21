import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SECURITY_QUESTIONS } from "@/lib/security-questions";
import { requireUser } from "@/server/auth/session";
import { getProfile, recoveryQuestions } from "@/server/services/accounts";
import { ChangePasswordForm, ChangeQuestionsForm, ProfileForm } from "./account-forms";

export const metadata: Metadata = { title: "My account · Family Expenses" };

const joined = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

export default async function AccountPage() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  if (!profile) redirect("/login");
  const [q1, q2] = await recoveryQuestions(user.username);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">My account</h1>
        <p className="text-sm text-zinc-600">
          Username <strong className="text-zinc-800">{profile.username}</strong> · member since{" "}
          {joined.format(profile.createdAt)}
        </p>
      </div>

      <Card title="Profile">
        <ProfileForm profile={{ displayName: profile.displayName, mobile: profile.mobile ?? "", email: profile.email ?? "" }} />
      </Card>

      <Card title="Change password" note="Signs you out on your other phones and computers.">
        <ChangePasswordForm />
      </Card>

      <Card title="Security questions" note={`Current: “${SECURITY_QUESTIONS[q1]}” and “${SECURITY_QUESTIONS[q2]}”`}>
        <ChangeQuestionsForm />
      </Card>
    </div>
  );
}

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {note && <p className="mt-0.5 text-sm text-zinc-500">{note}</p>}
      <div className="mt-4 max-w-md">{children}</div>
    </section>
  );
}
