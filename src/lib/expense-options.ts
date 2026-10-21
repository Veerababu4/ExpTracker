// Fixed choices for expenses (DESIGN E1, C1).

export const PAYMENT_MODES = {
  CASH: "Cash",
  UPI: "UPI",
  CARD: "Card",
  NET_BANKING: "Net banking",
  OTHER: "Other",
} as const;

export type PaymentMode = keyof typeof PAYMENT_MODES;

export const PAYMENT_MODE_CODES = Object.keys(PAYMENT_MODES) as [PaymentMode, ...PaymentMode[]];

/** Copied into every new family; the head can add, rename and hide categories afterwards. */
export const DEFAULT_CATEGORIES = [
  "Groceries",
  "Vegetables & fruits",
  "Milk & dairy",
  "Subscriptions",
  "Health & medicines",
  "Online shopping",
  "Utilities (power, water, gas)",
  "Mobile & internet",
  "Rent / EMI",
  "Fuel & transport",
  "Education",
  "Dining out",
  "Household & repairs",
  "Personal care",
  "Gifts & festivals",
  "Travel",
  "Other",
] as const;

export const UNCATEGORISED = "Uncategorised";
export const MAX_NOTE_LENGTH = 200;
