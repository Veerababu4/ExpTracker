// Budget form rules (DESIGN §3.6 B1). The form has a "total" box and one "cat_<category id>" box per category;
// an empty box means "no budget". Which months are allowed depends on today, so the service checks that.
import * as z from "zod";
import { MAX_BUDGET_PAISE } from "@/lib/rules/budget";
import { optionalAmountField } from "./expense";

export const TOTAL_FIELD = "total";
const CATEGORY_PREFIX = "cat_";

export const categoryField = (categoryId: string) => `${CATEGORY_PREFIX}${categoryId}`;

export type BudgetInput = {
  /** Family total; null = no family budget. */
  totalPaise: number | null;
  /** Category id → budget (null = none). Categories not listed are left as they are. */
  categories: Record<string, number | null>;
};

const totalField = optionalAmountField("Family budget", MAX_BUDGET_PAISE);
const categoryBudget = optionalAmountField("Budget", MAX_BUDGET_PAISE);
const categoryId = z.uuid();

export type BudgetParse = { ok: true; data: BudgetInput } | { ok: false; fieldErrors: Record<string, string[]> };

export function parseBudgetForm(formData: FormData): BudgetParse {
  const fieldErrors: Record<string, string[]> = {};
  const text = (value: FormDataEntryValue | null) => (typeof value === "string" ? value : "");

  const total = totalField.safeParse(text(formData.get(TOTAL_FIELD)));
  if (!total.success) fieldErrors[TOTAL_FIELD] = total.error.issues.map((i) => i.message);

  const categories: Record<string, number | null> = {};
  for (const [name, value] of formData) {
    if (!name.startsWith(CATEGORY_PREFIX)) continue;
    const id = name.slice(CATEGORY_PREFIX.length);
    // A tampered field name never reaches the database.
    if (!categoryId.safeParse(id).success) throw new Error("Invalid request.");
    const parsed = categoryBudget.safeParse(text(value));
    if (parsed.success) categories[id] = parsed.data;
    else fieldErrors[name] = parsed.error.issues.map((i) => i.message);
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, data: { totalPaise: total.success ? total.data : null, categories } };
}
