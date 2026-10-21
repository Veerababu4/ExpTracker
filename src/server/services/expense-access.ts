import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { expenses } from "@/server/db/schema";
import { editWindow, isInWindow, type DateWindow, type IsoDate } from "@/lib/rules/dates";
import { assertMember, NotAllowedError, type Role } from "./families";

// Who may change an expense (DESIGN §3.3 E5, §4.1). Shared by expenses.ts and receipts.ts, so a receipt follows
// exactly the same rules as the expense it belongs to.

export type DateRefusal = { ok: false; reason: "future_date" | "outside_window"; window: DateWindow };

export function checkDate(date: IsoDate, role: Role, today: IsoDate): DateRefusal | null {
  const window = editWindow(role, today);
  if (date > today) return { ok: false, reason: "future_date", window };
  if (!isInWindow(date, window)) return { ok: false, reason: "outside_window", window };
  return null;
}

/** Loads a live expense of this family and checks the actor may change it at all (role + ownership). */
export async function loadForChange(actorId: string, familyId: string, expenseId: string) {
  const role = await assertMember(actorId, familyId);
  const row = await db.query.expenses.findFirst({
    where: and(eq(expenses.id, expenseId), eq(expenses.familyId, familyId), isNull(expenses.deletedAt)),
  });
  if (!row) return null;
  if (role === "MEMBER" && row.ownerId !== actorId) throw new NotAllowedError("You can only change your own expenses.");
  return { role, row };
}
