import { describe, expect, it } from "vitest";
import { budgetMonths, budgetStatus, categoryBudgetsOverTotal, isBudgetMonth } from "./budget";

describe("budgetMonths", () => {
  it("runs from 2 months back to 12 months ahead, across year ends", () => {
    expect(budgetMonths("2026-10-22")).toEqual({ first: "2026-08", last: "2027-10" });
    expect(budgetMonths("2026-01-01")).toEqual({ first: "2025-11", last: "2027-01" });
    expect(budgetMonths("2026-12-31")).toEqual({ first: "2026-10", last: "2027-12" });
  });

  it("isBudgetMonth includes both ends", () => {
    expect(isBudgetMonth("2026-08", "2026-10-22")).toBe(true);
    expect(isBudgetMonth("2027-10", "2026-10-22")).toBe(true);
    expect(isBudgetMonth("2026-07", "2026-10-22")).toBe(false);
    expect(isBudgetMonth("2027-11", "2026-10-22")).toBe(false);
  });
});

describe("budgetStatus", () => {
  const budget = 10_000_00; // ₹10,000

  it("is normal below 80%", () => {
    expect(budgetStatus(0, budget)).toEqual({ level: "ok", percent: 0, leftPaise: budget, overPaise: 0 });
    expect(budgetStatus(7_999_99, budget)).toMatchObject({ level: "ok", percent: 79, leftPaise: 2_000_01 });
  });

  it("is amber from exactly 80% up to and including 100%", () => {
    expect(budgetStatus(8_000_00, budget)).toMatchObject({ level: "near", percent: 80 });
    expect(budgetStatus(9_999_99, budget)).toMatchObject({ level: "near", percent: 99, leftPaise: 1 });
    expect(budgetStatus(budget, budget)).toEqual({ level: "near", percent: 100, leftPaise: 0, overPaise: 0 });
  });

  it("is red one paisa over, with how much over", () => {
    expect(budgetStatus(budget + 1, budget)).toEqual({ level: "over", percent: 100, leftPaise: 0, overPaise: 1 });
    expect(budgetStatus(25_000_00, budget)).toEqual({ level: "over", percent: 250, leftPaise: 0, overPaise: 15_000_00 });
  });
});

describe("categoryBudgetsOverTotal", () => {
  it("gives the sum only when the category budgets add up to more than the family total", () => {
    expect(categoryBudgetsOverTotal(30_000_00, [10_000_00, 15_000_00])).toBeNull();
    expect(categoryBudgetsOverTotal(30_000_00, [10_000_00, 20_000_00])).toBeNull(); // equal is fine
    expect(categoryBudgetsOverTotal(30_000_00, [10_000_00, 20_000_01])).toBe(30_000_01);
    expect(categoryBudgetsOverTotal(null, [10_000_00])).toBeNull(); // no family total → nothing to compare
    expect(categoryBudgetsOverTotal(5_000_00, [])).toBeNull();
  });
});
