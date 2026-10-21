// Display formats (India time, Indian English).

const dateFormat = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

/** 21 Oct 2026 */
export function formatDate(value: Date): string {
  return dateFormat.format(value);
}
