// Search form rules (DESIGN §3.5 S1, S2). The filters travel in the address (/search?from=…&to=…), so
// they're checked here on every page load, not in a Server Action.
import * as z from "zod";
import { PAYMENT_MODE_CODES, type PaymentMode } from "@/lib/expense-options";
import { EARLIEST_DATE, isIsoDate, MAX_RANGE_DAYS, rangeDays, type IsoDate } from "@/lib/rules/dates";
import { formatIsoDate } from "@/lib/format";

/** Category filter value for expenses without a category. */
export const NO_CATEGORY = "none";

export type SearchFilters = {
  from: IsoDate;
  to: IsoDate;
  memberId?: string;
  /** A category id, or NO_CATEGORY for "Uncategorised". */
  category?: string;
  mode?: PaymentMode;
};

const blankToUndefined = (v: string) => (v.trim() === "" ? undefined : v.trim());

const dateField = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v !== "", { error: `Choose the ${label} date.` })
    .refine((v) => v === "" || isIsoDate(v), { error: "Choose a valid date." });

/** `today` is a parameter so tests can pick the date. */
export function searchSchema(today: IsoDate) {
  return z
    .object({
      from: dateField("From"),
      to: dateField("To"),
      member: z
        .string()
        .transform(blankToUndefined)
        .pipe(z.uuid({ error: "Choose a member from the list." }).optional()),
      category: z
        .string()
        .transform(blankToUndefined)
        .pipe(
          z
            .union([z.literal(NO_CATEGORY), z.uuid({ error: "Choose a category from the list." })], {
              error: "Choose a category from the list.",
            })
            .optional(),
        ),
      mode: z
        .string()
        .transform(blankToUndefined)
        .pipe(z.enum(PAYMENT_MODE_CODES, { error: "Choose a payment mode from the list." }).optional()),
    })
    .superRefine(
      (v, ctx) => {
        const fromOk = isIsoDate(v.from);
        const toOk = isIsoDate(v.to);
        if (fromOk && v.from < EARLIEST_DATE) {
          ctx.addIssue({ code: "custom", path: ["from"], message: `Dates start from ${formatIsoDate(EARLIEST_DATE)}.` });
        }
        if (toOk && v.to > today) {
          ctx.addIssue({ code: "custom", path: ["to"], message: "To can't be after today." });
        }
        if (fromOk && toOk && v.from > v.to) {
          ctx.addIssue({ code: "custom", path: ["to"], message: "To must be on or after From." });
        } else if (fromOk && toOk && rangeDays(v) > MAX_RANGE_DAYS) {
          ctx.addIssue({ code: "custom", path: ["to"], message: "Search at most one year (366 days) at a time." });
        }
      },
      { when: () => true },
    )
    .transform(
      (v): SearchFilters => ({ from: v.from, to: v.to, memberId: v.member, category: v.category, mode: v.mode }),
    );
}

/** "?page=3" → 3; anything odd → 1. */
export function pageNumber(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 100_000 ? n : 1;
}
