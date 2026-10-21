import "server-only";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { auditLog, categories, expenses, familyMembers, users } from "@/server/db/schema";
import { editWindow, isInWindow, todayInIndia, type DateWindow, type IsoDate } from "@/lib/rules/dates";
import { effectiveLimits, type AlertLimits } from "@/lib/rules/alerts";
import type { PaymentMode } from "@/lib/expense-options";
import type { ExpenseInput } from "@/lib/validation/expense";
import { writeAudit } from "./audit";
import { assertHead, assertMember, NotAllowedError, type Role } from "./families";

// Expense rules (DESIGN §3.3, §4.1). Who may change what, and for which dates, is decided here — never in
// the page. `today` is a parameter so tests can pick the date; it defaults to today in India.

export type ChangeResult =
  | { ok: true; id: string }
  | { ok: false; reason: "future_date" | "outside_window"; window: DateWindow }
  | { ok: false; reason: "bad_category" | "not_found" };

/** The fields a person edits, in the shape stored in the change log. */
type Snapshot = {
  expenseDate: string;
  amountPaise: number;
  categoryId: string | null;
  paymentMode: PaymentMode | null;
  note: string | null;
};

function snapshotOf(input: ExpenseInput): Snapshot {
  return {
    expenseDate: input.expenseDate,
    amountPaise: input.amount,
    categoryId: input.categoryId ?? null,
    paymentMode: input.paymentMode ?? null,
    note: input.note ?? null,
  };
}

function checkDate(date: IsoDate, role: Role, today: IsoDate): ChangeResult | null {
  const window = editWindow(role, today);
  if (date > today) return { ok: false, reason: "future_date", window };
  if (!isInWindow(date, window)) return { ok: false, reason: "outside_window", window };
  return null;
}

/** A category must belong to this family; hidden ones can only be kept on an expense that already has it. */
async function categoryAllowed(familyId: string, categoryId: string | null, keepId?: string | null): Promise<boolean> {
  if (!categoryId) return true;
  const row = await db.query.categories.findFirst({
    where: and(eq(categories.id, categoryId), eq(categories.familyId, familyId)),
  });
  return row !== undefined && (!row.hidden || row.id === keepId);
}

// ── Changing ──────────────────────────────────────────────────────────────────

export async function addExpense(
  actorId: string,
  familyId: string,
  input: ExpenseInput,
  today: IsoDate = todayInIndia(),
): Promise<ChangeResult> {
  const role = await assertMember(actorId, familyId);
  const dateProblem = checkDate(input.expenseDate, role, today);
  if (dateProblem) return dateProblem;
  const after = snapshotOf(input);
  if (!(await categoryAllowed(familyId, after.categoryId))) return { ok: false, reason: "bad_category" };

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(expenses)
      .values({ familyId, ownerId: actorId, createdBy: actorId, ...after })
      .returning({ id: expenses.id });
    await writeAudit(tx, { familyId, actorId, action: "EXPENSE_ADDED", entityType: "expense", entityId: row.id, details: { after } });
    return { ok: true, id: row.id };
  });
}

/** Loads a live expense of this family and checks the actor may change it at all (role + ownership). */
async function loadForChange(actorId: string, familyId: string, expenseId: string) {
  const role = await assertMember(actorId, familyId);
  const row = await db.query.expenses.findFirst({
    where: and(eq(expenses.id, expenseId), eq(expenses.familyId, familyId), isNull(expenses.deletedAt)),
  });
  if (!row) return null;
  if (role === "MEMBER" && row.ownerId !== actorId) throw new NotAllowedError("You can only change your own expenses.");
  return { role, row };
}

export async function updateExpense(
  actorId: string,
  familyId: string,
  expenseId: string,
  input: ExpenseInput,
  today: IsoDate = todayInIndia(),
): Promise<ChangeResult> {
  const loaded = await loadForChange(actorId, familyId, expenseId);
  if (!loaded) return { ok: false, reason: "not_found" };
  const { role, row } = loaded;
  // Both the current date and the new one must be inside the window (DESIGN §4.1).
  const dateProblem = checkDate(row.expenseDate, role, today) ?? checkDate(input.expenseDate, role, today);
  if (dateProblem) return dateProblem;
  const after = snapshotOf(input);
  if (!(await categoryAllowed(familyId, after.categoryId, row.categoryId))) return { ok: false, reason: "bad_category" };

  const before: Snapshot = {
    expenseDate: row.expenseDate,
    amountPaise: row.amountPaise,
    categoryId: row.categoryId,
    paymentMode: row.paymentMode,
    note: row.note,
  };
  const changed = (Object.keys(after) as (keyof Snapshot)[]).filter((k) => after[k] !== before[k]);
  if (changed.length === 0) return { ok: true, id: expenseId };

  await db.transaction(async (tx) => {
    await tx.update(expenses).set({ ...after, updatedBy: actorId, updatedAt: new Date() }).where(eq(expenses.id, expenseId));
    await writeAudit(tx, {
      familyId,
      actorId,
      action: "EXPENSE_UPDATED",
      entityType: "expense",
      entityId: expenseId,
      details: {
        before: Object.fromEntries(changed.map((k) => [k, before[k]])),
        after: Object.fromEntries(changed.map((k) => [k, after[k]])),
      },
    });
  });
  return { ok: true, id: expenseId };
}

/** Soft delete: hidden everywhere, kept in the database and the change log (DESIGN E6). */
export async function deleteExpense(
  actorId: string,
  familyId: string,
  expenseId: string,
  today: IsoDate = todayInIndia(),
): Promise<ChangeResult> {
  const loaded = await loadForChange(actorId, familyId, expenseId);
  if (!loaded) return { ok: false, reason: "not_found" };
  const { role, row } = loaded;
  const dateProblem = checkDate(row.expenseDate, role, today);
  if (dateProblem) return dateProblem;

  await db.transaction(async (tx) => {
    await tx.update(expenses).set({ deletedBy: actorId, deletedAt: new Date() }).where(eq(expenses.id, expenseId));
    await writeAudit(tx, {
      familyId,
      actorId,
      action: "EXPENSE_DELETED",
      entityType: "expense",
      entityId: expenseId,
      details: {
        before: {
          expenseDate: row.expenseDate,
          amountPaise: row.amountPaise,
          categoryId: row.categoryId,
          paymentMode: row.paymentMode,
          note: row.note,
        },
      },
    });
  });
  return { ok: true, id: expenseId };
}

// ── Reading ───────────────────────────────────────────────────────────────────

export type ExpenseView = {
  id: string;
  ownerId: string;
  ownerName: string;
  expenseDate: IsoDate;
  amountPaise: number;
  categoryId: string | null;
  categoryName: string | null;
  paymentMode: PaymentMode | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date | null;
  /** The owner's limits in this family, for the "High" tag. */
  ownerLimits: AlertLimits;
};

const viewColumns = {
  id: expenses.id,
  ownerId: expenses.ownerId,
  ownerName: users.displayName,
  expenseDate: expenses.expenseDate,
  amountPaise: expenses.amountPaise,
  categoryId: expenses.categoryId,
  categoryName: categories.name,
  paymentMode: expenses.paymentMode,
  note: expenses.note,
  createdAt: expenses.createdAt,
  updatedAt: expenses.updatedAt,
  highAlertPaise: familyMembers.highAlertPaise,
  veryHighAlertPaise: familyMembers.veryHighAlertPaise,
};

function viewQuery() {
  return db
    .select(viewColumns)
    .from(expenses)
    .innerJoin(users, eq(users.id, expenses.ownerId))
    .leftJoin(categories, eq(categories.id, expenses.categoryId))
    .leftJoin(familyMembers, and(eq(familyMembers.familyId, expenses.familyId), eq(familyMembers.userId, expenses.ownerId)));
}

function toView(row: Awaited<ReturnType<typeof viewQuery>>[number]): ExpenseView {
  const { highAlertPaise, veryHighAlertPaise, ...rest } = row;
  return { ...rest, ownerLimits: effectiveLimits({ highAlertPaise, veryHighAlertPaise }) };
}

/** What a member sees on the expense page, and whether they may change it today. */
export async function getExpense(
  viewerId: string,
  familyId: string,
  expenseId: string,
  today: IsoDate = todayInIndia(),
): Promise<{ expense: ExpenseView; canChange: boolean; whyNot?: string; window: DateWindow } | null> {
  const role = await assertMember(viewerId, familyId);
  const [row] = await viewQuery().where(
    and(eq(expenses.id, expenseId), eq(expenses.familyId, familyId), isNull(expenses.deletedAt)),
  );
  if (!row) return null;
  const expense = toView(row);
  const window = editWindow(role, today);
  if (role === "MEMBER" && expense.ownerId !== viewerId) {
    return { expense, canChange: false, whyNot: "Only the person who added it (or the family head) can change it.", window };
  }
  if (!isInWindow(expense.expenseDate, window)) {
    return { expense, canChange: false, whyNot: "outside_window", window };
  }
  return { expense, canChange: true, window };
}

/** A person's own entries for one date — the quick check under the add form (DESIGN E8). */
export async function entriesForDay(userId: string, familyId: string, date: IsoDate): Promise<ExpenseView[]> {
  await assertMember(userId, familyId);
  const rows = await viewQuery()
    .where(
      and(
        eq(expenses.familyId, familyId),
        eq(expenses.ownerId, userId),
        eq(expenses.expenseDate, date),
        isNull(expenses.deletedAt),
      ),
    )
    .orderBy(asc(expenses.createdAt));
  return rows.map(toView);
}

export type HistoryEntry = {
  action: string;
  actorName: string | null;
  at: Date;
  before: Partial<Snapshot> | null;
  after: Partial<Snapshot> | null;
};

/** Change log of one expense, newest first. Head only (DESIGN E7). */
export async function expenseHistory(headId: string, familyId: string, expenseId: string): Promise<HistoryEntry[]> {
  await assertHead(headId, familyId);
  const rows = await db
    .select({ action: auditLog.action, actorName: users.displayName, at: auditLog.at, details: auditLog.details })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(and(eq(auditLog.familyId, familyId), eq(auditLog.entityType, "expense"), eq(auditLog.entityId, expenseId)))
    .orderBy(desc(auditLog.at));
  return rows.map((r) => {
    const d = (r.details ?? {}) as { before?: Partial<Snapshot>; after?: Partial<Snapshot> };
    return { action: r.action, actorName: r.actorName, at: r.at, before: d.before ?? null, after: d.after ?? null };
  });
}

/** Category names by id, including hidden ones (old expenses and the change log may still use them). */
export async function categoryNames(familyId: string, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(and(eq(categories.familyId, familyId), inArray(categories.id, ids)));
  return new Map(rows.map((r) => [r.id, r.name]));
}
