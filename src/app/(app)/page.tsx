import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/card";
import { ExpenseForm } from "@/components/expense-form";
import { ExpenseList } from "@/components/expense-list";
import { formatIsoDate, formatIsoDay, formatMonth } from "@/lib/format";
import { quoteForDay } from "@/lib/quotes";
import { editWindow, isInWindow, isIsoDate, monthOf, todayInIndia } from "@/lib/rules/dates";
import { requireFamily } from "@/server/auth/family";
import { getCurrentUser } from "@/server/auth/session";
import { limitsFor } from "@/server/services/alert-limits";
import { bookForMonth } from "@/server/services/books";
import { listCategories } from "@/server/services/categories";
import { entriesForDay } from "@/server/services/expenses";
import { uploadState } from "@/server/services/receipts";

export const metadata: Metadata = { title: "Add expense · Family Expenses" };

// Home page: add an expense (DESIGN E1–E8), with the person's entries for the chosen date underneath. Every expense
// is "mine": the date's month decides the book it goes to (M8, §3.8 P4) — the family I share with that month, else
// My expenses — and the categories and alert limits come from that book.
export default async function AddExpensePage({ searchParams }: { searchParams: Promise<{ date?: string; deleted?: string }> }) {
  // Visitors who aren't logged in get the home page (P10) rather than the login form.
  if (!(await getCurrentUser())) redirect("/home");
  const { user, books, family } = await requireFamily();
  const params = await searchParams;
  const today = todayInIndia();
  // My expenses gives everyone the head's window (P1); a family may narrow it for its months.
  const window = editWindow("HEAD", today);
  const date = params.date && isIsoDate(params.date) && isInWindow(params.date, window) ? params.date : today;
  const bookId = await bookForMonth(user.id, monthOf(date));
  const book = books.find((b) => b.familyId === bookId);

  const [categories, limits, entries, receipts] = await Promise.all([
    listCategories(user.id, bookId),
    limitsFor(user.id, bookId),
    entriesForDay(user.id, date),
    uploadState(),
  ]);
  const quote = quoteForDay(today);
  const shared = book?.kind === "FAMILY" ? book : null;

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
        <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <p data-testid="saves-to" className={`rounded-lg px-3 py-2 text-sm ${shared ? "bg-teal-50 text-teal-900" : "bg-zinc-100 text-zinc-800"}`}>
            {shared ? (
              <>
                Saves to <strong>{shared.familyName}</strong> — you share your {formatMonth(monthOf(date))} expenses with this family.
              </>
            ) : (
              <>
                Saves to <strong>My expenses</strong> — only you can see it.
              </>
            )}
          </p>
          {/* Not keyed by book: a date in another book's month keeps what was typed (the category list changes). */}
          <ExpenseForm
            familyId={bookId}
            initial={{ expenseDate: date, amount: "", categoryId: "", paymentMode: "", note: "" }}
            categories={categories}
            limits={limits}
            window={window}
            followDate
            receipts={receipts}
          />
        </div>
        <div className="flex flex-col gap-6">
          <Card title={date === today ? "Your expenses today" : `Your expenses on ${formatIsoDay(date)}`} id="day">
            <ExpenseList expenses={entries} showBook empty="Nothing added for this date yet." />
          </Card>
          <figure data-testid="daily-quote" className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
            <p className="text-xs font-semibold tracking-wide text-amber-800 uppercase">Thought for today</p>
            <blockquote className="mt-1.5 font-serif text-lg leading-snug text-zinc-900 italic">“{quote.text}”</blockquote>
            {quote.by && <figcaption className="mt-1.5 text-sm text-zinc-600">— {quote.by}</figcaption>}
          </figure>
        </div>
      </div>
    </div>
  );
}
