"use server";

import { refresh } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { formatMonth } from "@/lib/format";
import { isIsoMonth } from "@/lib/rules/dates";
import { parseBudgetForm } from "@/lib/validation/budget";
import { uuidSchema } from "@/lib/validation/family";
import { requireUser } from "@/server/auth/session";
import { setMonthBudget } from "@/server/services/budgets";

// Budget actions (DESIGN §3.6 B1). The service checks that the user is the head and the month is allowed.

/** Saves one month's family total and category budgets (empty box = no budget). */
export async function saveBudgetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const familyId = uuidSchema.safeParse(formData.get("familyId"));
  const month = formData.get("month");
  if (!familyId.success || typeof month !== "string" || !isIsoMonth(month)) throw new Error("Invalid request.");

  const parsed = parseBudgetForm(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, message: "Check the amounts marked in red." };

  const result = await setMonthBudget(user.id, familyId.data, month, parsed.data);
  if (!result.ok) {
    return {
      message:
        result.reason === "month_not_allowed"
          ? "Budgets can be set from 2 months back to 12 months ahead. Pick another month."
          : "A category on this page isn't available any more. Reload the page and try again.",
    };
  }
  refresh();
  return { ok: true, message: result.changed ? `Budget for ${formatMonth(month)} saved.` : "No changes to save." };
}
