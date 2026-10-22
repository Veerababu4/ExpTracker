import { describe, expect, it } from "vitest";
import { compactRupees, dailyTotals, isDayTick, niceScale, percentOf } from "./charts";

describe("niceScale", () => {
  it("rounds the top up to a clean step of 1, 2, 2.5 or 5 × 10ⁿ rupees", () => {
    expect(niceScale(23_500_00)).toEqual({ maxPaise: 30_000_00, ticks: [0, 10_000_00, 20_000_00, 30_000_00] });
    expect(niceScale(12_000_00)).toEqual({ maxPaise: 15_000_00, ticks: [0, 5_000_00, 10_000_00, 15_000_00] });
    expect(niceScale(28_720_00)).toEqual({ maxPaise: 30_000_00, ticks: [0, 10_000_00, 20_000_00, 30_000_00] });
    expect(niceScale(950_00).ticks).toEqual([0, 250_00, 500_00, 750_00, 1_000_00]);
    expect(niceScale(1_70_000_00).maxPaise).toBe(2_00_000_00);
  });

  it("keeps an exact top when the biggest value is already round", () => {
    expect(niceScale(20_000_00)).toEqual({ maxPaise: 20_000_00, ticks: [0, 5_000_00, 10_000_00, 15_000_00, 20_000_00] });
  });

  it("never uses steps below ₹1, and an empty chart still has an axis", () => {
    expect(niceScale(1_00)).toEqual({ maxPaise: 1_00, ticks: [0, 1_00] });
    expect(niceScale(3_00)).toEqual({ maxPaise: 3_00, ticks: [0, 1_00, 2_00, 3_00] });
    expect(niceScale(0)).toEqual({ maxPaise: 100_00, ticks: [0, 50_00, 100_00] });
  });

  it("percentOf places a value on the scale, clamped to 0–100", () => {
    const scale = niceScale(20_000_00);
    expect(percentOf(5_000_00, scale)).toBe(25);
    expect(percentOf(30_000_00, scale)).toBe(100);
    expect(percentOf(0, scale)).toBe(0);
  });
});

describe("compactRupees", () => {
  it("uses K, L (lakh) and Cr (crore) with at most one decimal", () => {
    expect(compactRupees(0)).toBe("0");
    expect(compactRupees(500_00)).toBe("₹500");
    expect(compactRupees(999_50)).toBe("₹999.5");
    expect(compactRupees(2_500_00)).toBe("₹2.5K");
    expect(compactRupees(23_500_00)).toBe("₹23.5K");
    expect(compactRupees(20_000_00)).toBe("₹20K");
    expect(compactRupees(1_50_000_00)).toBe("₹1.5L");
    expect(compactRupees(2_00_00_000_00)).toBe("₹2Cr");
  });
});

describe("dailyTotals", () => {
  it("has every day of the month with totals and counts, ignoring other months", () => {
    const days = dailyTotals(
      [
        { expenseDate: "2024-02-01", amountPaise: 100_00 },
        { expenseDate: "2024-02-01", amountPaise: 50_00 },
        { expenseDate: "2024-02-29", amountPaise: 70_00 },
        { expenseDate: "2024-03-01", amountPaise: 999_00 },
      ],
      "2024-02",
    );
    expect(days).toHaveLength(29); // leap year
    expect(days[0]).toEqual({ date: "2024-02-01", day: 1, paise: 150_00, count: 2 });
    expect(days[1]).toEqual({ date: "2024-02-02", day: 2, paise: 0, count: 0 });
    expect(days[28]).toEqual({ date: "2024-02-29", day: 29, paise: 70_00, count: 1 });
  });
});

describe("isDayTick", () => {
  it("labels 1, every 5th day and the last day, skipping a 5th too close to the end", () => {
    const ticks = (n: number) => Array.from({ length: n }, (_, i) => i + 1).filter((d) => isDayTick(d, n));
    expect(ticks(31)).toEqual([1, 5, 10, 15, 20, 25, 31]);
    expect(ticks(30)).toEqual([1, 5, 10, 15, 20, 25, 30]);
    expect(ticks(28)).toEqual([1, 5, 10, 15, 20, 25, 28]);
    expect(ticks(27)).toEqual([1, 5, 10, 15, 20, 27]); // 25 would crowd 27 (not a real month, but the rule holds)
  });
});
