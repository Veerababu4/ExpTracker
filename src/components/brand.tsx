import Link from "next/link";

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight text-zinc-900">
      <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-teal-700 text-base font-bold text-white">
        ₹
      </span>
      Family Expenses
    </Link>
  );
}
