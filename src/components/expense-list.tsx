import Link from "next/link";
import { PAYMENT_MODES, UNCATEGORISED } from "@/lib/expense-options";
import { formatIsoDay } from "@/lib/format";
import { formatRupees } from "@/lib/money";
import { alertLevel } from "@/lib/rules/alerts";
import type { ExpenseView } from "@/server/services/expenses";

/** List of expenses with a total. Rows above the owner's very-high limit get a red "High" tag (DESIGN S3). */
export function ExpenseList({
  expenses,
  showDate = false,
  showOwner = false,
  showBook = false,
  empty = "No expenses.",
  total,
}: {
  expenses: ExpenseView[];
  showDate?: boolean;
  showOwner?: boolean;
  /** Name the book each one is in (My expenses or the family) — for lists that mix books (M8). */
  showBook?: boolean;
  empty?: string;
  /** Count and total of a whole result when the list shows only one page of it. */
  total?: { count: number; paise: number };
}) {
  if (expenses.length === 0) return <p className="text-sm text-zinc-500">{empty}</p>;
  const count = total?.count ?? expenses.length;
  const paise = total?.paise ?? expenses.reduce((sum, e) => sum + e.amountPaise, 0);
  return (
    <div>
      <ul className="divide-y divide-zinc-100">
        {expenses.map((e) => (
          <li key={e.id}>
            <Link
              href={`/expenses/${e.id}`}
              className="-mx-2 flex items-start justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-zinc-50"
            >
              <div className="min-w-0">
                <p className="font-medium text-zinc-900">
                  {e.categoryName ?? <span className="text-zinc-500">{UNCATEGORISED}</span>}
                  {alertLevel(e.amountPaise, e.ownerLimits) === "very_high" && (
                    <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 align-middle text-xs font-semibold text-red-800">
                      High
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-zinc-500">
                  {[
                    showDate && formatIsoDay(e.expenseDate),
                    showOwner && ownerLabel(e),
                    showBook && e.bookName,
                    e.paymentMode && PAYMENT_MODES[e.paymentMode],
                    e.receipt && "📎 Receipt",
                    e.note,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums">{formatRupees(e.amountPaise)}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-2 flex justify-between border-t border-zinc-200 pt-2 text-sm font-semibold">
        <span>
          Total ({count} {count === 1 ? "expense" : "expenses"})
        </span>
        <span className="tabular-nums">{formatRupees(paise)}</span>
      </p>
    </div>
  );
}

/** "Sita", or "Sita (former member)" once she has left or been removed (DESIGN F9). */
export function ownerLabel(e: Pick<ExpenseView, "ownerName" | "ownerFormer">): string {
  return e.ownerFormer ? `${e.ownerName} (former member)` : e.ownerName;
}
