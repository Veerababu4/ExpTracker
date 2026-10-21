"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { invalid, keepValues, readForm, type FormState } from "@/lib/form-state";
import { formatIsoDate } from "@/lib/format";
import { formatRupees, paiseToInput } from "@/lib/money";
import { DEFAULT_LIMITS } from "@/lib/rules/alerts";
import { alertLimitsSchema, categoryNameSchema, expenseSchema } from "@/lib/validation/expense";
import { uuidSchema } from "@/lib/validation/family";
import { requireUser } from "@/server/auth/session";
import { setMemberLimits } from "@/server/services/alert-limits";
import { addCategory, renameCategory, setCategoryHidden } from "@/server/services/categories";
import { addExpense, deleteExpense, updateExpense, type ChangeResult } from "@/server/services/expenses";

// Expense, category and alert-limit actions (DESIGN §3.3, §3.4, §4.2).

function idFrom(formData: FormData, name: string): string {
  const parsed = uuidSchema.safeParse(formData.get(name));
  if (!parsed.success) throw new Error("Invalid request.");
  return parsed.data;
}

/** Turns a refused change into words for the form. */
function refusal(result: Exclude<ChangeResult, { ok: true }>): FormState {
  switch (result.reason) {
    case "future_date":
      return { fieldErrors: { expenseDate: ["The date can't be in the future."] } };
    case "outside_window":
      return {
        fieldErrors: {
          expenseDate: [
            `You can only add or change expenses dated from ${formatIsoDate(result.window.from)} to ${formatIsoDate(result.window.to)}.`,
          ],
        },
      };
    case "bad_category":
      return { fieldErrors: { categoryId: ["That category isn't available any more. Choose another."] } };
    case "not_found":
      return { message: "This expense no longer exists — it may have been deleted." };
  }
}

const EXPENSE_FIELDS = ["expenseDate", "amount", "categoryId", "paymentMode", "note"] as const;

/** Add (no expenseId) or edit (with expenseId). */
export async function saveExpenseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const familyId = idFrom(formData, "familyId");
  const expenseId = formData.get("expenseId") ? idFrom(formData, "expenseId") : null;
  const form = readForm(formData, EXPENSE_FIELDS);
  const parsed = expenseSchema.safeParse(form);
  if (!parsed.success) return invalid(parsed.error, form);

  const result = expenseId
    ? await updateExpense(user.id, familyId, expenseId, parsed.data)
    : await addExpense(user.id, familyId, parsed.data);
  if (!result.ok) return { ...refusal(result), values: form };

  refresh();
  const what = `${formatRupees(parsed.data.amount)} on ${formatIsoDate(parsed.data.expenseDate)}`;
  if (expenseId) return { ok: true, message: `Saved: ${what}.`, values: form };
  // After adding, the form starts fresh but keeps the date (people often enter several for one day).
  return { ok: true, message: `Added ${what}.`, values: keepValues(form, ["expenseDate"]) };
}

export async function deleteExpenseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const familyId = idFrom(formData, "familyId");
  const expenseId = idFrom(formData, "expenseId");
  const result = await deleteExpense(user.id, familyId, expenseId);
  if (!result.ok) return refusal(result);
  redirect("/?deleted=1");
}

// ── Categories (head) ─────────────────────────────────────────────────────────

export async function addCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const familyId = idFrom(formData, "familyId");
  const form = readForm(formData, ["name"]);
  const parsed = categoryNameSchema.safeParse(form);
  if (!parsed.success) return invalid(parsed.error, form);
  const result = await addCategory(user.id, familyId, parsed.data.name);
  if (!result.ok) return { fieldErrors: { name: ["There's already a category with this name."] }, values: form };
  refresh();
  return { ok: true, message: `Added “${parsed.data.name}”.` };
}

export async function renameCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const familyId = idFrom(formData, "familyId");
  const categoryId = idFrom(formData, "categoryId");
  const form = readForm(formData, ["name"]);
  const parsed = categoryNameSchema.safeParse(form);
  if (!parsed.success) return invalid(parsed.error, form);
  const result = await renameCategory(user.id, familyId, categoryId, parsed.data.name);
  if (!result.ok) {
    return { fieldErrors: { name: [result.reason === "name_taken" ? "There's already a category with this name." : "Category not found."] }, values: form };
  }
  refresh();
  return { ok: true, message: "Renamed.", values: form };
}

export async function toggleCategoryAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  await setCategoryHidden(user.id, idFrom(formData, "familyId"), idFrom(formData, "categoryId"), formData.get("hide") === "1");
  refresh();
}

// ── Alert limits (head) ───────────────────────────────────────────────────────

/** One form, two buttons: "Save limits" (intent=save) and "Reset to default" (intent=reset). */
export async function saveLimitsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const familyId = idFrom(formData, "familyId");
  const memberId = idFrom(formData, "memberId");
  if (formData.get("intent") === "reset") {
    await setMemberLimits(user.id, familyId, memberId, null);
    refresh();
    return {
      ok: true,
      message: "Back to the default limits.",
      values: { high: rupeesText(DEFAULT_LIMITS.highPaise), veryHigh: rupeesText(DEFAULT_LIMITS.veryHighPaise) },
    };
  }
  const form = readForm(formData, ["high", "veryHigh"]);
  const parsed = alertLimitsSchema.safeParse(form);
  if (!parsed.success) return invalid(parsed.error, form);
  await setMemberLimits(user.id, familyId, memberId, { highPaise: parsed.data.high, veryHighPaise: parsed.data.veryHigh });
  refresh();
  return { ok: true, message: "Saved.", values: form };
}

/** 200000 → "2000" (whole rupees without ".00", as shown in the limit boxes). */
function rupeesText(paise: number): string {
  return paiseToInput(paise).replace(/.00$/, "");
}
