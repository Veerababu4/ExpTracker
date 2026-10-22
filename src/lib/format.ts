// Display formats (India time, Indian English).

const dateFormat = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

/** 21 Oct 2026 */
export function formatDate(value: Date): string {
  return dateFormat.format(value);
}

const isoDateFormat = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
const isoDayFormat = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });

/** "2026-10-21" → "21 Oct 2026" (calendar dates have no time zone, so format them as UTC). */
export function formatIsoDate(date: string): string {
  return isoDateFormat.format(new Date(`${date}T00:00:00Z`));
}

const monthFormat = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", month: "long", year: "numeric" });

/** "2026-10" → "October 2026" */
export function formatMonth(month: string): string {
  return monthFormat.format(new Date(`${month}-01T00:00:00Z`));
}

/** "2026-10-21" → "Wed, 21 Oct" */
export function formatIsoDay(date: string): string {
  return isoDayFormat.format(new Date(`${date}T00:00:00Z`));
}

const dateTimeFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** 21 Oct 2026, 4:05 pm */
export function formatDateTime(value: Date): string {
  return dateTimeFormat.format(value);
}
