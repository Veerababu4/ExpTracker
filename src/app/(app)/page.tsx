import type { Metadata } from "next";
import { Card } from "@/components/card";
import { ExpenseForm } from "@/components/expense-form";
import { ExpenseList } from "@/components/expense-list";
import { formatIsoDate, formatIsoDay } from "@/lib/format";
import { editWindow, isInWindow, isIsoDate, todayInIndia } from "@/lib/rules/dates";
import { requireFamily } from "@/server/auth/family";
import { limitsFor } from "@/server/services/alert-limits";
import { listCategories } from "@/server/services/categories";
import { entriesForDay } from "@/server/services/expenses";

export const metadata: Metadata = { title: "Add expense · Family Expenses" };

// Home page: add an expense (DESIGN E1–E8), with the person's entries for the chosen date underneath.
export default async function AddExpensePage({ searchParams }: { searchParams: Promise<{ date?: string; deleted?: string }> }) {
  const { user, family } = await requireFamily();
  const params = await searchParams;
  const today = todayInIndia();
  const window = editWindow(family.role, today);
  const date = params.date && isIsoDate(params.date) && isInWindow(params.date, window) ? params.date : today;

  const [categories, limits, entries] = await Promise.all([
    listCategories(user.id, family.familyId),
    limitsFor(user.id, family.familyId),
    entriesForDay(user.id, family.familyId, date),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Add expense</h1>
        <p className="text-sm text-zinc-600">
          {family.familyName} · you can use dates from {formatIsoDate(window.from)} to today
        </p>
      </div>
      {params.deleted && (
        <p role="status" className="rounded-lg bg-zinc-100 px-4 py-2.5 text-sm text-zinc-800">
          Expense deleted.
        </p>
      )}
      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <ExpenseForm
            familyId={family.familyId}
            initial={{ expenseDate: date, amount: "", categoryId: "", paymentMode: "", note: "" }}
            categories={categories}
            limits={limits}
            window={window}
            followDate
          />
        </div>
        <Card title={date === today ? "Your expenses today" : `Your expenses on ${formatIsoDay(date)}`} id="day">
          <ExpenseList expenses={entries} empty="Nothing added for this date yet." />
        </Card>
      </div>
    </div>
  );
}
