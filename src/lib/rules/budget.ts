// Monthly budgets (DESIGN §3.6 B1, B2). Spending may go over a budget — the colours only warn.
import { addMonths, monthOf, type IsoDate, type IsoMonth } from "./dates";

/** Biggest budget the head can type: ₹1,00,00,000 (one crore). */
export const MAX_BUDGET_PAISE = 1_000_000_000;

/** Months the head may set budgets for: from 2 months back to 12 months ahead of the current month. */
export function budgetMonths(today: IsoDate): { first: IsoMonth; last: IsoMonth } {
  const current = monthOf(today);
  return { first: addMonths(current, -2), last: addMonths(current, 12) };
}

export function isBudgetMonth(month: IsoMonth, today: IsoDate): boolean {
  const { first, last } = budgetMonths(today);
  return month >= first && month <= last; // "YYYY-MM" strings compare correctly as text
}

/** ok = below 80% · near = 80–100% (amber) · over = above 100% (red). */
export type BudgetLevel = "ok" | "near" | "over";

export type BudgetStatus = {
  level: BudgetLevel;
  /** Whole percent of the budget used, rounded down (can be above 100). */
  percent: number;
  /** What's left (0 once over). */
  leftPaise: number;
  /** How much over (0 until over). */
  overPaise: number;
};

/** Exactly 80% is amber, exactly 100% is still amber, one paisa more is red. Whole-paise maths, no rounding. */
export function budgetStatus(spentPaise: number, budgetPaise: number): BudgetStatus {
  const level: BudgetLevel = spentPaise > budgetPaise ? "over" : spentPaise * 100 >= budgetPaise * 80 ? "near" : "ok";
  return {
    level,
    percent: Math.floor((spentPaise * 100) / budgetPaise),
    leftPaise: Math.max(0, budgetPaise - spentPaise),
    overPaise: Math.max(0, spentPaise - budgetPaise),
  };
}

/** The sum of the category budgets when it's more than the family total (shown as a note, not an error), else null. */
export function categoryBudgetsOverTotal(totalPaise: number | null, categoryPaise: number[]): number | null {
  if (totalPaise === null) return null;
  const sum = categoryPaise.reduce((a, b) => a + b, 0);
  return sum > totalPaise ? sum : null;
}
