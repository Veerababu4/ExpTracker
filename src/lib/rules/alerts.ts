// High-value expense alerts (DESIGN §4.2). Each member has two limits per family; null means "use the default".
import { MAX_AMOUNT_PAISE, MIN_AMOUNT_PAISE } from "@/lib/money";

export type AlertLimits = { highPaise: number; veryHighPaise: number };
export type AlertLevel = "none" | "high" | "very_high";

export const DEFAULT_LIMITS: AlertLimits = { highPaise: 200_000, veryHighPaise: 2_000_000 }; // ₹2,000 / ₹20,000

export function effectiveLimits(stored: { highAlertPaise: number | null; veryHighAlertPaise: number | null }): AlertLimits {
  return {
    highPaise: stored.highAlertPaise ?? DEFAULT_LIMITS.highPaise,
    veryHighPaise: stored.veryHighAlertPaise ?? DEFAULT_LIMITS.veryHighPaise,
  };
}

/** Strictly above a limit triggers it: exactly ₹2,000 shows nothing, ₹2,000.01 shows the red text. */
export function alertLevel(amountPaise: number, limits: AlertLimits): AlertLevel {
  if (amountPaise > limits.veryHighPaise) return "very_high";
  if (amountPaise > limits.highPaise) return "high";
  return "none";
}

/** Problems with a pair of limits, or null if they're fine. */
export function limitsProblem(limits: AlertLimits): string | null {
  if (limits.highPaise < MIN_AMOUNT_PAISE) return "The high-value limit must be at least ₹1.";
  if (limits.veryHighPaise > MAX_AMOUNT_PAISE) return "The very-high limit can be at most ₹10,00,000.";
  if (limits.highPaise >= limits.veryHighPaise) return "The very-high limit must be more than the high-value limit.";
  return null;
}
