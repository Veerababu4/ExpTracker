// Chart maths for the monthly view (DESIGN §3.6 B3): axis scales, short ₹ labels and daily totals. Pure, so it
// is unit-tested; the charts themselves are drawn by server components (no chart library).
import { addDays, monthRange, rangeDays, type IsoDate, type IsoMonth } from "./rules/dates";

export type Scale = {
  /** Top of the axis, in paise (a round number at or above the biggest value). */
  maxPaise: number;
  /** Evenly spaced tick values from 0 to maxPaise, in paise. */
  ticks: number[];
};

/**
 * A round axis for values up to `maxPaise`: steps of 1, 2, 2.5 or 5 × 10ⁿ rupees (never less than ₹1), about
 * `target` steps high. An empty chart still gets an axis (0 – ₹100).
 */
export function niceScale(maxPaise: number, target = 4): Scale {
  const maxRupees = Math.max(maxPaise, 0) / 100;
  if (maxRupees === 0) return { maxPaise: 100_00, ticks: [0, 50_00, 100_00] };
  const rough = maxRupees / target;
  const power = Math.max(1, 10 ** Math.floor(Math.log10(rough)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? 10 * power;
  const steps = Math.ceil(maxRupees / step - 1e-9);
  const ticks = Array.from({ length: steps + 1 }, (_, i) => Math.round(i * step * 100));
  return { maxPaise: ticks[ticks.length - 1], ticks };
}

/** Position of a value on a scale, 0–100 (%). */
export function percentOf(paise: number, scale: Scale): number {
  return Math.min(100, Math.max(0, (paise / scale.maxPaise) * 100));
}

/** One decimal at most, without a trailing ".0": 2.5 → "2.5", 20 → "20". */
function short(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** Axis and cap labels in Indian short form: 0, ₹500, ₹2.5K, ₹23.5K, ₹1.2L (lakh), ₹1Cr (crore). */
export function compactRupees(paise: number): string {
  const rupees = paise / 100;
  if (rupees === 0) return "0";
  if (rupees < 1_000) return `₹${short(rupees)}`;
  if (rupees < 1_00_000) return `₹${short(rupees / 1_000)}K`;
  if (rupees < 1_00_00_000) return `₹${short(rupees / 1_00_000)}L`;
  return `₹${short(rupees / 1_00_00_000)}Cr`;
}

export type DayTotal = { date: IsoDate; day: number; paise: number; count: number };

/** Every day of the month (1st to last) with that day's total and number of expenses (0 when none). */
export function dailyTotals(expenses: { expenseDate: IsoDate; amountPaise: number }[], month: IsoMonth): DayTotal[] {
  const range = monthRange(month);
  const days: DayTotal[] = Array.from({ length: rangeDays(range) }, (_, i) => ({
    date: addDays(range.from, i),
    day: i + 1,
    paise: 0,
    count: 0,
  }));
  for (const e of expenses) {
    const day = days[Number(e.expenseDate.slice(8, 10)) - 1];
    if (day && day.date === e.expenseDate) {
      day.paise += e.amountPaise;
      day.count += 1;
    }
  }
  return days;
}

/** Days that get a number under the daily chart: 1, 5, 10, 15, 20, 25 and the last day. */
export function isDayTick(day: number, daysInMonth: number): boolean {
  return day === 1 || day === daysInMonth || (day % 5 === 0 && daysInMonth - day >= 3);
}
