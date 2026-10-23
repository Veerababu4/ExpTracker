"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { invalid, keepValues, readForm, type FormState } from "@/lib/form-state";
import { formatIsoDate, formatMonth } from "@/lib/format";
import { formatRupees, paiseToInput } from "@/lib/money";
import { DEFAULT_LIMITS } from "@/lib/rules/alerts";
import { MAX_RECEIPT_BYTES } from "@/lib/rules/receipts";
import { alertLimitsSchema, categoryNameSchema, expenseSchema } from "@/lib/validation/expense";
import { uuidSchema } from "@/lib/validation/family";
import { requireUser } from "@/server/auth/session";
import { setMemberLimits } from "@/server/services/alert-limits";
import { addCategory, renameCategory, setCategoryHidden } from "@/server/services/categories";
import { addMyExpense, deleteExpense, updateExpense, type ChangeResult } from "@/server/services/expenses";
import { attachReceipt, removeReceipt, type ReceiptProblem } from "@/server/services/receipts";

// Expense, receipt, category and alert-limit actions (DESIGN §3.3, §3.4, §3.7, §4.2).

function idFrom(formData: FormData, name: string): string {
  const parsed = uuidSchema.safeParse(formData.get(name));
  if (!parsed.success) throw new Error("Invalid request.");
  return parsed.data;
}

const RECEIPT_TEXT: Record<ReceiptProblem, string> = {
  receipts_off: "Receipts are turned off at the moment. Save without one, or try again later.",
  storage_full: "Receipt storage is full, so new receipts can't be added. Save without one.",
  bad_file: "Only JPG, PNG or WebP photos and PDF files can be attached.",
  too_big: "The receipt is too big — at most 2 MB.",
};

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
    case "other_book":
      return {
        fieldErrors: {
          expenseDate: [
            `Expenses dated in ${formatMonth(result.month)} are kept in another book (your sharing for that month). Delete this one and add it again with the new date.`,
          ],
        },
      };
    default:
      return { fieldErrors: { receipt: [RECEIPT_TEXT[result.reason]] } };
  }
}

/**
 * The receipt file from a form, or undefined when none was picked. "too_big" is refused here, before the
 * bytes are copied; the service checks the real type and the space left.
 */
async function receiptFrom(formData: FormData): Promise<Buffer | undefined | "too_big"> {
  const file = formData.get("receipt");
  if (!(file instanceof File) || file.size === 0) return undefined;
  if (file.size > MAX_RECEIPT_BYTES) return "too_big";
  return Buffer.from(await file.arrayBuffer());
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
  // Receipts come with the add form only; on the expense page they have their own card.
  const receipt = expenseId ? undefined : await receiptFrom(formData);
  if (receipt === "too_big") return { fieldErrors: { receipt: [RECEIPT_TEXT.too_big] }, values: form };

  const result = expenseId
    ? await updateExpense(user.id, familyId, expenseId, parsed.data)
    : await addMyExpense(user.id, parsed.data, undefined, { receipt }); // the date's month picks the book (M8)
  if (!result.ok) return { ...refusal(result), values: form };

  refresh();
  const what = `${formatRupees(parsed.data.amount)} on ${formatIsoDate(parsed.data.expenseDate)}`;
  if (expenseId) return { ok: true, message: `Saved: ${what}.`, values: form };
  // After adding, the form starts fresh but keeps the date (people often enter several for one day).
  return { ok: true, message: `Added ${what}${receipt ? " with receipt" : ""}.`, values: keepValues(form, ["expenseDate"]) };
}

// ── Receipts (expense page) ───────────────────────────────────────────────────

/** The receipt card has no date field, so a date refusal becomes a message for the whole form. */
function forReceiptCard(state: FormState): FormState {
  const dateError = state.fieldErrors?.expenseDate?.[0];
  return dateError ? { message: dateError } : state;
}

/** Adds or replaces the receipt of an existing expense. */
export async function attachReceiptAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const familyId = idFrom(formData, "familyId");
  const expenseId = idFrom(formData, "expenseId");
  const receipt = await receiptFrom(formData);
  if (receipt === undefined) return { fieldErrors: { receipt: ["Choose a photo or PDF first."] } };
  if (receipt === "too_big") return { fieldErrors: { receipt: [RECEIPT_TEXT.too_big] } };
  const result = await attachReceipt(user.id, familyId, expenseId, receipt);
  if (!result.ok) return forReceiptCard(refusal(result));
  refresh();
  return { ok: true, message: "Receipt saved." };
}

export async function removeReceiptAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await removeReceipt(user.id, idFrom(formData, "familyId"), idFrom(formData, "expenseId"));
  if (!result.ok) return forReceiptCard(refusal(result));
  refresh();
  return { ok: true, message: "Receipt removed." };
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
