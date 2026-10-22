import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { buttonClass } from "@/components/button-class";
import { Card } from "@/components/card";
import { inputClass } from "@/components/form";
import { formatMonth } from "@/lib/format";
import { budgetMonths } from "@/lib/rules/budget";
import { addMonths, isIsoMonth, monthOf, todayInIndia } from "@/lib/rules/dates";
import { requireFamily } from "@/server/auth/family";
import { monthBudget } from "@/server/services/budgets";
import { listCategories } from "@/server/services/categories";
import { BudgetForm, type BudgetBox } from "./budget-form";

export const metadata: Metadata = { title: "Budget · Family Expenses" };

// Monthly budgets (DESIGN §3.6 B1): the head sets a family total and optional per-category budgets for any
// month from 2 back to 12 ahead. Everyone sees how spending compares on the monthly view.
export default async function BudgetPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, family } = await requireFamily();
  const today = todayInIndia();
  const current = monthOf(today);
  const { first, last } = budgetMonths(today);
  const asked = (await searchParams).month;
  const month = typeof asked === "string" && isIsoMonth(asked) && asked >= first && asked <= last ? asked : current;

  const back = (
    <Link href="/family" className="text-sm font-medium text-teal-700 hover:underline">
      ← Back to family
    </Link>
  );

  if (family.role !== "HEAD") {
    return (
      <section className="flex flex-col gap-4">
        {back}
        <h1 className="text-2xl font-semibold">Budget</h1>
        <p className="text-sm text-zinc-600">
          Only the family head sets budgets. See how this month&apos;s spending compares on the{" "}
          <Link href="/month" className="font-medium text-teal-700 hover:underline">
            month page
          </Link>
          .
        </p>
      </section>
    );
  }

  const previousMonth = addMonths(month, -1);
  const [budget, previous, categories] = await Promise.all([
    monthBudget(user.id, family.familyId, month),
    monthBudget(user.id, family.familyId, previousMonth),
    listCategories(user.id, family.familyId, true),
  ]);
  const saved = new Map(budget.byCategory.map((c) => [c.categoryId, c.paise]));
  // A box per visible category, plus hidden ones that still have a budget this month (so it can be cleared).
  const boxes: BudgetBox[] = categories
    .filter((c) => !c.hidden || saved.has(c.id))
    .map((c) => ({ categoryId: c.id, name: c.hidden ? `${c.name} (hidden)` : c.name, paise: saved.get(c.id) ?? null }));
  const hasPrevious = previous.totalPaise !== null || previous.byCategory.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {back}
      <div>
        <h1 className="text-2xl font-semibold">Budget</h1>
        <p className="text-sm text-zinc-600">
          Set how much the family plans to spend in a month (in ₹), in total and per category. Leave a box empty for no
          budget. Spending can go over — the month page turns amber at 80% and red above 100%.
        </p>
      </div>

      <nav aria-label="Budget months" className="flex flex-wrap items-center gap-2">
        {month > first && (
          <Link href={`/family/budget?month=${previousMonth}`} className={buttonClass("plain")}>
            ← {formatMonth(previousMonth)}
          </Link>
        )}
        {month < last && (
          <Link href={`/family/budget?month=${addMonths(month, 1)}`} className={buttonClass("plain")}>
            {formatMonth(addMonths(month, 1))} →
          </Link>
        )}
        <Form action="/family/budget" className="ml-auto flex items-center gap-2">
          <label htmlFor="budget-month" className="sr-only">
            Go to month
          </label>
          <input
            id="budget-month"
            type="month"
            name="month"
            min={first}
            max={last}
            defaultValue={month}
            className={`${inputClass} w-auto py-1.5 text-sm`}
          />
          <button type="submit" className={buttonClass("plain")}>
            Go
          </button>
        </Form>
      </nav>

      <Card
        title={`Budget for ${formatMonth(month)}`}
        id="budget"
        note={
          month <= current ? (
            <Link href={`/month/${month}`} className="font-medium text-teal-700 hover:underline">
              See {formatMonth(month)}&apos;s spending →
            </Link>
          ) : (
            "A future month"
          )
        }
      >
        {/* key: a fresh form (and fresh boxes) for each month. */}
        <BudgetForm
          key={month}
          familyId={family.familyId}
          month={month}
          monthName={formatMonth(month)}
          totalPaise={budget.totalPaise}
          boxes={boxes}
          previous={
            hasPrevious
              ? {
                  monthName: formatMonth(previousMonth),
                  totalPaise: previous.totalPaise,
                  byCategory: Object.fromEntries(previous.byCategory.map((c) => [c.categoryId, c.paise])),
                }
              : null
          }
        />
      </Card>
    </div>
  );
}
