// Expense form rules (DESIGN E1–E3). The date window depends on the person's role, so it's checked in the
// service; here we check the shape of each field.
import * as z from "zod";
import { MAX_NOTE_LENGTH, PAYMENT_MODE_CODES } from "@/lib/expense-options";
import { MAX_AMOUNT_PAISE, MIN_AMOUNT_PAISE, parseRupees } from "@/lib/money";
import { limitsProblem } from "@/lib/rules/alerts";
import { isIsoDate } from "@/lib/rules/dates";

const blankToUndefined = (v: string) => (v.trim() === "" ? undefined : v.trim());

/** Rupees as typed → paise. */
export const amountField = (label = "Amount") =>
  z.string().transform((v, ctx) => {
    if (v.trim() === "") {
      ctx.addIssue({ code: "custom", message: `Enter the ${label.toLowerCase()}.` });
      return z.NEVER;
    }
    const paise = parseRupees(v);
    if (paise === null) {
      ctx.addIssue({ code: "custom", message: "Enter an amount like 2500 or 2,500.50 (at most 2 decimals)." });
      return z.NEVER;
    }
    if (paise < MIN_AMOUNT_PAISE) {
      ctx.addIssue({ code: "custom", message: `${label} must be at least ₹1.` });
      return z.NEVER;
    }
    if (paise > MAX_AMOUNT_PAISE) {
      ctx.addIssue({ code: "custom", message: `${label} can be at most ₹10,00,000.` });
      return z.NEVER;
    }
    return paise;
  });

export const expenseSchema = z.object({
  expenseDate: z.string().refine(isIsoDate, { error: "Choose a valid date." }),
  amount: amountField(),
  categoryId: z
    .string()
    .transform(blankToUndefined)
    .pipe(z.uuid({ error: "Choose a category from the list." }).optional()),
  paymentMode: z
    .string()
    .transform(blankToUndefined)
    .pipe(z.enum(PAYMENT_MODE_CODES, { error: "Choose a payment mode from the list." }).optional()),
  note: z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, " "))
    .pipe(z.string().max(MAX_NOTE_LENGTH, { error: `Note can be at most ${MAX_NOTE_LENGTH} characters.` }))
    .transform((v) => (v === "" ? undefined : v)),
});

export type ExpenseInput = z.output<typeof expenseSchema>;

export const categoryNameSchema = z.object({
  name: z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(2, { error: "Category name must be at least 2 characters." })
        .max(40, { error: "Category name can be at most 40 characters." }),
    ),
});

/** Head sets a member's alert limits (DESIGN §4.2). */
export const alertLimitsSchema = z
  .object({ high: amountField("High-value limit"), veryHigh: amountField("Very-high limit") })
  .superRefine(
    (v, ctx) => {
      if (typeof v.high !== "number" || typeof v.veryHigh !== "number") return;
      const problem = limitsProblem({ highPaise: v.high, veryHighPaise: v.veryHigh });
      if (problem) ctx.addIssue({ code: "custom", path: ["veryHigh"], message: problem });
    },
    { when: () => true },
  );
