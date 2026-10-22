import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BudgetStatusLine } from "@/components/budget-status";
import { buttonClass } from "@/components/button-class";
import { Card } from "@/components/card";
import { ExpenseList } from "@/components/expense-list";
import { inputClass } from "@/components/form";
import { PAYMENT_MODES, UNCATEGORISED } from "@/lib/expense-options";
import { formatMonth } from "@/lib/format";
import { formatRupees } from "@/lib/money";
import { budgetStatus, categoryBudgetsOverTotal, isBudgetMonth } from "@/lib/rules/budget";
import { addMonths, EARLIEST_DATE, isIsoMonth, monthOf, monthRange, todayInIndia } from "@/lib/rules/dates";
import { NO_CATEGORY } from "@/lib/validation/search";
import { requireFamily } from "@/server/auth/family";
import { monthBudget } from "@/server/services/budgets";
import { exportHref, monthSummary, type Group } from "@/server/services/reports";

export const metadata: Metadata = { title: "Month · Family Expenses" };

const FIRST_MONTH = monthOf(EARLIEST_DATE);

// Monthly view (DESIGN §3.5 S4): any month up to the current one — total, totals by category, member and
// payment mode (each links to the matching search), and every expense. With a budget (M6, §3.6 B2): how much of
// the family total and of each category budget is used — amber from 80%, red above 100%.
export default async function MonthPage({ params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  const { user, family } = await requireFamily();
  const today = todayInIndia();
  const current = monthOf(today);
  if (!isIsoMonth(month) || month < FIRST_MONTH || month > current) notFound();

  const [s, budget] = await Promise.all([
    monthSummary(user.id, family.familyId, month),
    monthBudget(user.id, family.familyId, month),
  ]);
  const { from, to: monthEnd } = monthRange(month);
  const to = monthEnd > today ? today : monthEnd; // search can't look past today
  const searchFor = (filter: Record<string, string>) => `/search?${new URLSearchParams({ from, to, ...filter })}`;
  const previous = addMonths(month, -1);
  const next = addMonths(month, 1);

  const canSetBudget = family.role === "HEAD" && isBudgetMonth(month, today);
  const categoryBudget = new Map(budget.byCategory.map((c) => [c.categoryId, c.paise]));
  // Categories with a budget but no spending yet are listed too (at ₹0), after the ones with spending.
  const spent = new Set(s.byCategory.map((g) => g.key));
  const categoryGroups: Group<string | null>[] = [
    ...s.byCategory,
    ...budget.byCategory.filter((c) => !spent.has(c.categoryId)).map((c) => ({ key: c.categoryId, name: c.name, paise: 0, count: 0 })),
  ];
  const overTotal = categoryBudgetsOverTotal(budget.totalPaise, budget.byCategory.map((c) => c.paise));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{formatMonth(month)}</h1>
          <p className="text-sm text-zinc-600">{family.familyName}</p>
        </div>
        <nav aria-label="Months" className="flex flex-wrap items-center gap-2">
          {previous >= FIRST_MONTH && (
            <Link href={`/month/${previous}`} className={buttonClass("plain")}>
              ← {formatMonth(previous)}
            </Link>
          )}
          {month < current && (
            <Link href={`/month/${next}`} className={buttonClass("plain")}>
              {formatMonth(next)} →
            </Link>
          )}
          {month !== current && (
            <Link href={`/month/${current}`} className="px-1 text-sm font-medium text-teal-700 hover:underline">
              This month
            </Link>
          )}
          <Form action="/month" className="ml-auto flex items-center gap-2">
            <label htmlFor="go-month" className="sr-only">
              Go to month
            </label>
            <input
              id="go-month"
              type="month"
              name="month"
              min={FIRST_MONTH}
              max={current}
              defaultValue={month}
              className={`${inputClass} w-auto py-1.5 text-sm`}
            />
            <button type="submit" className={buttonClass("plain")}>
              Go
            </button>
          </Form>
        </nav>
      </div>

      <section aria-label="Month total" className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm text-zinc-600">Spent in {formatMonth(month)}</p>
        <p data-testid="month-total" className="text-3xl font-semibold tabular-nums">
          {formatRupees(s.totalPaise)}
        </p>
        <p className="text-sm text-zinc-600">
          {s.count} {s.count === 1 ? "expense" : "expenses"}
        </p>
        {budget.totalPaise !== null && (
          <div className="mt-4">
            <BudgetStatusLine status={budgetStatus(s.totalPaise, budget.totalPaise)} budgetPaise={budget.totalPaise} testId="month-budget" thick />
          </div>
        )}
        {canSetBudget && (
          <Link href={`/family/budget?month=${month}`} className="mt-3 inline-block text-sm font-medium text-teal-700 hover:underline">
            {budget.totalPaise !== null || budget.byCategory.length > 0 ? "Change the budget →" : `Set a budget for ${formatMonth(month)} →`}
          </Link>
        )}
      </section>

      {categoryGroups.length > 0 && (
        <Card
          title="By category"
          id="by-category"
          note={
            overTotal !== null && budget.totalPaise !== null
              ? `Category budgets add up to ${formatRupees(overTotal)}, more than the family budget of ${formatRupees(budget.totalPaise)}.`
              : undefined
          }
        >
          <Totals
            groups={categoryGroups}
            total={s.totalPaise}
            label={(g) => g.name ?? UNCATEGORISED}
            href={(g) => searchFor({ category: g.key ?? NO_CATEGORY })}
            budget={(g) => (g.key ? (categoryBudget.get(g.key) ?? null) : null)}
          />
        </Card>
      )}

      {s.count > 0 && (
        <div className="grid items-start gap-6 md:grid-cols-2">
          <Card title="By member" id="by-member">
            <Totals
              groups={s.byMember}
              total={s.totalPaise}
              label={(g) => (g.former ? `${g.name} (former member)` : (g.name ?? ""))}
              href={(g) => searchFor({ member: g.key })}
            />
          </Card>
          <Card title="By payment mode" id="by-mode">
            <Totals
              groups={s.byMode}
              total={s.totalPaise}
              label={(g) => (g.key ? PAYMENT_MODES[g.key] : "Not specified")}
              href={(g) => (g.key ? searchFor({ mode: g.key }) : null)}
            />
          </Card>
        </div>
      )}

      <Card
        title="All expenses"
        id="list"
        note={
          s.count > 0 ? (
            <a href={exportHref(family.familyId, { from, to })} download className="font-medium text-teal-700 hover:underline">
              Download CSV (Excel)
            </a>
          ) : undefined
        }
      >
        <ExpenseList expenses={s.expenses} showDate showOwner empty={`No expenses in ${formatMonth(month)}.`} />
      </Card>
    </div>
  );
}

/** One breakdown: name, amount, share of the month and count, biggest first; budget status when there is one. */
function Totals<G extends Group<unknown>>({
  groups,
  total,
  label,
  href,
  budget,
}: {
  groups: G[];
  total: number;
  label: (g: G) => string;
  /** Link to the matching search, or null when there's no filter for it. */
  href: (g: G) => string | null;
  /** This row's budget, or null for none. */
  budget?: (g: G) => number | null;
}) {
  // A list of flex rows, not a table: the name takes the free space (a table squeezed it to one letter on phones).
  return (
    <ul className="divide-y divide-zinc-100 text-sm">
      {groups.map((g) => {
        const name = label(g);
        const link = href(g);
        const limit = budget?.(g) ?? null;
        return (
          <li key={String(g.key)} className="flex flex-col gap-1.5 py-2">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {link ? (
                    <Link href={link} className="text-zinc-900 hover:text-teal-700 hover:underline">
                      {name}
                    </Link>
                  ) : (
                    name
                  )}
                </p>
                <p className="text-xs text-zinc-500">
                  {g.count} {g.count === 1 ? "expense" : "expenses"}
                </p>
              </div>
              <span className="font-semibold whitespace-nowrap tabular-nums">{formatRupees(g.paise)}</span>
              <span className="w-10 shrink-0 text-right text-zinc-500 tabular-nums" title="Share of the month">
                {share(g.paise, total)}
              </span>
            </div>
            {limit !== null && <BudgetStatusLine status={budgetStatus(g.paise, limit)} budgetPaise={limit} />}
          </li>
        );
      })}
    </ul>
  );
}

function share(part: number, total: number): string {
  if (total === 0) return "—";
  const pct = (part / total) * 100;
  return pct > 0 && pct < 1 ? "<1%" : `${Math.round(pct)}%`;
}
