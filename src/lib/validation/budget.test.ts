import { describe, expect, it } from "vitest";
import { categoryField, parseBudgetForm, TOTAL_FIELD } from "./budget";

const groceries = "6f1e2d3c-4b5a-4c6d-8e7f-0a1b2c3d4e5f";
const fuel = "0a1b2c3d-4e5f-4a6b-8c7d-6f1e2d3c4b5a";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  data.set("familyId", "ignored");
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

describe("parseBudgetForm", () => {
  it("reads the family total and each category box; blank = no budget", () => {
    const r = parseBudgetForm(form({ [TOTAL_FIELD]: "40,000", [categoryField(groceries)]: "12000.50", [categoryField(fuel)]: " " }));
    expect(r).toEqual({ ok: true, data: { totalPaise: 40_000_00, categories: { [groceries]: 12_000_50, [fuel]: null } } });
  });

  it("allows no family total and no categories at all", () => {
    expect(parseBudgetForm(form({ [TOTAL_FIELD]: "" }))).toEqual({ ok: true, data: { totalPaise: null, categories: {} } });
  });

  it("puts each problem under its own box", () => {
    const r = parseBudgetForm(form({ [TOTAL_FIELD]: "0.50", [categoryField(groceries)]: "12,000.555", [categoryField(fuel)]: "5000" }));
    expect(r).toEqual({
      ok: false,
      fieldErrors: {
        [TOTAL_FIELD]: ["Family budget must be at least ₹1."],
        [categoryField(groceries)]: ["Enter an amount like 2500 or 2,500.50 (at most 2 decimals)."],
      },
    });
  });

  it("allows up to ₹1 crore", () => {
    expect(parseBudgetForm(form({ [TOTAL_FIELD]: "1,00,00,000" }))).toMatchObject({ ok: true, data: { totalPaise: 1_000_000_000 } });
    expect(parseBudgetForm(form({ [TOTAL_FIELD]: "1,00,00,000.01" }))).toEqual({
      ok: false,
      fieldErrors: { [TOTAL_FIELD]: ["Family budget can be at most ₹1,00,00,000."] },
    });
  });

  it("refuses a tampered category field", () => {
    expect(() => parseBudgetForm(form({ [TOTAL_FIELD]: "", "cat_1 or 1=1": "5" }))).toThrow("Invalid request.");
  });
});
