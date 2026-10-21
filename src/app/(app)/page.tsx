import Link from "next/link";
import { requireUser } from "@/server/auth/session";

// Home after login. Placeholder until M2 (families) and M3 (add expense, which becomes the home page).
export default async function Home() {
  const user = await requireUser();
  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold">Hello, {user.displayName}</h1>
      <p className="text-zinc-600">
        You&apos;re logged in. Creating and joining families comes next (milestone M2), then adding expenses (M3).
      </p>
      <p>
        <Link href="/account" className="font-medium text-teal-700 hover:underline">
          Go to my account →
        </Link>
      </p>
    </section>
  );
}
