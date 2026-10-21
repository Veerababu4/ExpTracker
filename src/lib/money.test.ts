import { describe, expect, it } from "vitest";
import * as z from "zod";
import { alertLevel, DEFAULT_LIMITS, effectiveLimits, limitsProblem } from "@/lib/rules/alerts";
import { alertLimitsSchema, expenseSchema } from "@/lib/validation/expense";
import { formatRupees, paiseToInput, parseRupees } from "./money";

describe("parseRupees", () => {
  it.each([
    ["2500", 250000],
    ["2,500", 250000],
    ["2,500.5", 250050],
    ["₹ 1,25,000.75", 12500075],
    ["0.99", 99],
    ["10.", 1000],
  ])("%s → %d paise", (input, paise) => {
    expect(parseRupees(input)).toBe(paise);
  });

  it.each(["", "abc", "-50", "12.345", "1e5", "12.3.4", "+5"])("rejects %j", (input) => {
    expect(parseRupees(input)).toBeNull();
  });
});

describe("formatRupees", () => {
  it("uses Indian grouping and two decimals", () => {
    expect(formatRupees(250050)).toBe("₹2,500.50");
    expect(formatRupees(12500000)).toBe("₹1,25,000.00");
    expect(paiseToInput(250050)).toBe("2500.50");
  });
});

describe("alert levels", () => {
  it("triggers only strictly above each limit", () => {
    expect(alertLevel(200000, DEFAULT_LIMITS)).toBe("none"); // exactly ₹2,000
    expect(alertLevel(200001, DEFAULT_LIMITS)).toBe("high");
    expect(alertLevel(2000000, DEFAULT_LIMITS)).toBe("high"); // exactly ₹20,000
    expect(alertLevel(2000001, DEFAULT_LIMITS)).toBe("very_high");
  });

  it("uses a member's own limits, with defaults for blanks", () => {
    const kid = effectiveLimits({ highAlertPaise: 50000, veryHighAlertPaise: 500000 });
    expect(alertLevel(60000, kid)).toBe("high");
    expect(effectiveLimits({ highAlertPaise: null, veryHighAlertPaise: null })).toEqual(DEFAULT_LIMITS);
  });

  it("validates limit pairs", () => {
    expect(limitsProblem({ highPaise: 500000, veryHighPaise: 500000 })).toMatch(/more than/);
    expect(limitsProblem({ highPaise: 50, veryHighPaise: 500000 })).toMatch(/at least/);
    expect(limitsProblem({ highPaise: 100, veryHighPaise: 100_000_001 })).toMatch(/at most/);
    expect(limitsProblem({ highPaise: 100, veryHighPaise: 200 })).toBeNull();
  });
});

describe("expenseSchema", () => {
  const base = { expenseDate: "2026-10-21", amount: "2,500", categoryId: "", paymentMode: "", note: "  DMart   monthly " };

  it("cleans a valid expense", () => {
    expect(expenseSchema.parse(base)).toEqual({ expenseDate: "2026-10-21", amount: 250000, note: "DMart monthly" });
  });

  it("explains bad fields", () => {
    const r = expenseSchema.safeParse({ ...base, expenseDate: "2026-02-30", amount: "0.50", paymentMode: "GOLD", note: "x".repeat(201) });
    const errors = z.flattenError(r.error!).fieldErrors;
    expect(errors.expenseDate).toEqual(["Choose a valid date."]);
    expect(errors.amount).toEqual(["Amount must be at least ₹1."]);
    expect(errors.paymentMode).toBeDefined();
    expect(errors.note).toEqual(["Note can be at most 200 characters."]);
    expect(z.flattenError(expenseSchema.safeParse({ ...base, amount: "20,00,000" }).error!).fieldErrors.amount).toEqual([
      "Amount can be at most ₹10,00,000.",
    ]);
  });

  it("alert limits must be in order", () => {
    const r = alertLimitsSchema.safeParse({ high: "5000", veryHigh: "4000" });
    expect(z.flattenError(r.error!).fieldErrors.veryHigh?.[0]).toMatch(/more than/);
    expect(alertLimitsSchema.parse({ high: "500", veryHigh: "5,000" })).toEqual({ high: 50000, veryHigh: 500000 });
  });
});
