// Calendar-date rules (DESIGN §4.1). Expense dates are plain "YYYY-MM-DD" strings, never JS Date objects,
// so a browser or server in another time zone can't shift them by a day. "Today" is always India time.

export type IsoDate = string; // "2026-10-21"
export type Role = "HEAD" | "MEMBER";
export type DateWindow = { from: IsoDate; to: IsoDate };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const indiaDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date in India (Asia/Kolkata), e.g. "2026-10-21". */
export function todayInIndia(now: Date = new Date()): IsoDate {
  return indiaDate.format(now); // en-CA formats as YYYY-MM-DD
}

/** True for a real calendar date in YYYY-MM-DD form ("2026-02-30" is false). */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = toUtc(value);
  return !Number.isNaN(d.getTime()) && fromUtc(d) === value;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** First day of the month that is `months` away from `date`'s month (0 = same month). */
export function firstOfMonth(date: IsoDate, months = 0): IsoDate {
  const d = toUtc(date);
  return fromUtc(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1)));
}

/** Number of days from `from` to `to` (to − from). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

/**
 * Dates a person may add, edit or delete expenses for.
 * Member: last 7 days (today and the 6 before) OR the current month — whichever reaches further back.
 * Head: the current month and the two months before it.
 */
export function editWindow(role: Role, today: IsoDate): DateWindow {
  if (role === "HEAD") return { from: firstOfMonth(today, -2), to: today };
  const weekStart = addDays(today, -6);
  const monthStart = firstOfMonth(today);
  return { from: weekStart < monthStart ? weekStart : monthStart, to: today };
}

export function isInWindow(date: IsoDate, window: DateWindow): boolean {
  return date >= window.from && date <= window.to; // ISO strings compare correctly as text
}

function toUtc(date: IsoDate): Date {
  return new Date(`${date}T00:00:00Z`);
}

function fromUtc(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}
