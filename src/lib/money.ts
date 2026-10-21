// Money is always whole paise in code and in the database (₹2,500.50 → 250050), so there are no rounding errors
// (DESIGN §4.3). Only INR is supported.

export const CURRENCY = "INR";
export const MIN_AMOUNT_PAISE = 100; // ₹1.00
export const MAX_AMOUNT_PAISE = 100_000_000; // ₹10,00,000.00

/**
 * What the user typed → paise, or null if it isn't a valid amount.
 * Accepts "2500", "2,500", "2500.5", "₹ 2,500.50". Rejects more than 2 decimals, signs and letters.
 */
export function parseRupees(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, "");
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) return null;
  const rupees = Number(match[1]);
  const paise = Number((match[2] ?? "").padEnd(2, "0"));
  const total = rupees * 100 + paise;
  return Number.isSafeInteger(total) ? total : null;
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });

/** 250050 → "₹2,500.50"; 12500000 → "₹1,25,000.00" (Indian grouping). */
export function formatRupees(paise: number): string {
  return inr.format(paise / 100);
}

/** 250050 → "2500.50" — for putting an amount back into an input box. */
export function paiseToInput(paise: number): string {
  return (paise / 100).toFixed(2);
}
