import Link from "next/link";
import { requireFamily } from "@/server/auth/family";

// Home after login. Users without a family are sent to /welcome. From M3 this becomes the add-expense page.
export default async function Home() {
  const { user, family } = await requireFamily();
  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold">Hello, {user.displayName}</h1>
      <p className="text-zinc-600">
        You&apos;re in <strong className="text-zinc-800">{family.familyName}</strong> as{" "}
        {family.role === "HEAD" ? "the family head" : "a member"}. Adding expenses arrives in the next milestone (M3).
      </p>
      <p className="flex flex-wrap gap-x-4 gap-y-1">
        <Link href="/family" className="font-medium text-teal-700 hover:underline">
          Family &amp; members →
        </Link>
        <Link href="/welcome" className="font-medium text-teal-700 hover:underline">
          Create or join another family →
        </Link>
      </p>
    </section>
  );
}
