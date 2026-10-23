import "server-only";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { auditLog, categories, expenses, families, familyMembers, receipts, users } from "@/server/db/schema";
import { editWindow, isInWindow, monthOf, todayInIndia, type DateWindow, type IsoDate, type IsoMonth } from "@/lib/rules/dates";
import { effectiveLimits, type AlertLimits } from "@/lib/rules/alerts";
import type { PaymentMode } from "@/lib/expense-options";
import { RECEIPTS_CAP_BYTES, type ReceiptType } from "@/lib/rules/receipts";
import type { ExpenseInput } from "@/lib/validation/expense";
import { writeAudit } from "./audit";
import { bookForMonth } from "./books";
import { checkDate, loadForChange, type DateRefusal } from "./expense-access";
import { assertHead, assertMember, getRole, type BookKind } from "./families";
import { ReceiptRefused, storeReceipt, type ReceiptInfo, type ReceiptProblem } from "./receipts";

// Expense rules (DESIGN §3.3, §4.1). Who may change what, and for which dates, is decided here — never in
// the page. `today` is a parameter so tests can pick the date; it defaults to today in India.

export type ChangeResult =
  | { ok: true; id: string }
  | DateRefusal
  | { ok: false; reason: "bad_category" | "not_found" | ReceiptProblem }
  /** The date is in a month whose expenses belong in another book (DESIGN §3.8 P4, P5). */
  | { ok: false; reason: "other_book"; month: IsoMonth };

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

/** A category must belong to this family; hidden ones can only be kept on an expense that already has it. */
async function categoryAllowed(familyId: string, categoryId: string | null, keepId?: string | null): Promise<boolean> {
  if (!categoryId) return true;
  const row = await db.query.categories.findFirst({
    where: and(eq(categories.id, categoryId), eq(categories.familyId, familyId)),
  });
  return row !== undefined && (!row.hidden || row.id === keepId);
}

// ── Changing ──────────────────────────────────────────────────────────────────

/**
 * Adds one of my expenses (P4): it goes to the book that holds my expenses for the date's month — the family I
 * share with that month, else My expenses.
 */
export async function addMyExpense(
  actorId: string,
  input: ExpenseInput,
  today: IsoDate = todayInIndia(),
  options: { receipt?: Buffer; capBytes?: number } = {},
): Promise<ChangeResult> {
  const book = await bookForMonth(actorId, monthOf(input.expenseDate));
  return addExpense(actorId, book, input, today, options);
}

/** Adds an expense to a book, optionally with its receipt (saved together, or neither is saved). */
export async function addExpense(
  actorId: string,
  familyId: string,
  input: ExpenseInput,
  today: IsoDate = todayInIndia(),
  options: { receipt?: Buffer; capBytes?: number } = {},
): Promise<ChangeResult> {
  const role = await assertMember(actorId, familyId);
  const dateProblem = checkDate(input.expenseDate, role, today);
  if (dateProblem) return dateProblem;
  const month = monthOf(input.expenseDate);
  if ((await bookForMonth(actorId, month)) !== familyId) return { ok: false, reason: "other_book", month };
  const after = snapshotOf(input);
  if (!(await categoryAllowed(familyId, after.categoryId))) return { ok: false, reason: "bad_category" };

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(expenses)
        .values({ familyId, ownerId: actorId, createdBy: actorId, ...after })
        .returning({ id: expenses.id });
      const receipt = options.receipt
        ? (await storeReceipt(tx, { familyId, expenseId: row.id, actorId, bytes: options.receipt }, options.capBytes ?? RECEIPTS_CAP_BYTES)).info
        : undefined;
      await writeAudit(tx, {
        familyId,
        actorId,
        action: "EXPENSE_ADDED",
        entityType: "expense",
        entityId: row.id,
        details: receipt ? { after, receipt } : { after },
      });
      return { ok: true as const, id: row.id };
    });
  } catch (error) {
    if (error instanceof ReceiptRefused) return { ok: false, reason: error.reason };
    throw error;
  }
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
  // A new month may belong to another book for the owner; then nothing moves silently (P5).
  const month = monthOf(input.expenseDate);
  if (month !== monthOf(row.expenseDate) && (await bookForMonth(row.ownerId, month)) !== familyId) {
    return { ok: false, reason: "other_book", month };
  }
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

/**
 * Soft delete: hidden everywhere, kept in the database and the change log (DESIGN E6). Its receipt is removed
 * for good, so deleted expenses don't keep using receipt space.
 */
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
    const [receipt] = await tx
      .delete(receipts)
      .where(eq(receipts.expenseId, expenseId))
      .returning({ contentType: receipts.contentType, sizeBytes: receipts.sizeBytes });
    const before = {
      expenseDate: row.expenseDate,
      amountPaise: row.amountPaise,
      categoryId: row.categoryId,
      paymentMode: row.paymentMode,
      note: row.note,
    };
    await writeAudit(tx, {
      familyId,
      actorId,
      action: "EXPENSE_DELETED",
      entityType: "expense",
      entityId: expenseId,
      details: receipt ? { before, receipt } : { before },
    });
  });
  return { ok: true, id: expenseId };
}

// ── Reading ───────────────────────────────────────────────────────────────────

export type ExpenseView = {
  id: string;
  /** The book it's in: a family or the owner's My expenses (M8). */
  familyId: string;
  bookName: string;
  bookKind: BookKind;
  ownerId: string;
  ownerName: string;
  /** The owner has left or was removed from the family (F9: shown as "(former member)"). */
  ownerFormer: boolean;
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
  receipt: { id: string; contentType: ReceiptType; sizeBytes: number } | null;
};

const viewColumns = {
  id: expenses.id,
  familyId: expenses.familyId,
  bookName: families.name,
  bookKind: families.kind,
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
  ownerStatus: familyMembers.status,
  receiptId: receipts.id,
  receiptType: receipts.contentType,
  receiptSize: receipts.sizeBytes,
};

/** Expenses with everything a list shows (owner, category, limits, receipt info). Also used by reports.ts. */
export function viewQuery() {
  return db
    .select(viewColumns)
    .from(expenses)
    .innerJoin(users, eq(users.id, expenses.ownerId))
    .innerJoin(families, eq(families.id, expenses.familyId))
    .leftJoin(categories, eq(categories.id, expenses.categoryId))
    .leftJoin(familyMembers, and(eq(familyMembers.familyId, expenses.familyId), eq(familyMembers.userId, expenses.ownerId)))
    .leftJoin(receipts, eq(receipts.expenseId, expenses.id)); // never selects the file itself
}

export function toView(row: Awaited<ReturnType<typeof viewQuery>>[number]): ExpenseView {
  const { highAlertPaise, veryHighAlertPaise, ownerStatus, receiptId, receiptType, receiptSize, ...rest } = row;
  return {
    ...rest,
    ownerFormer: ownerStatus !== "ACTIVE",
    ownerLimits: effectiveLimits({ highAlertPaise, veryHighAlertPaise }),
    receipt: receiptId ? { id: receiptId, contentType: receiptType as ReceiptType, sizeBytes: receiptSize ?? 0 } : null,
  };
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

/**
 * The book an expense is in, when the viewer may open it (an active member of that book); else null. The expense
 * page uses it, so an expense opens whichever book is chosen in the header (M8).
 */
export async function expenseBookFor(viewerId: string, expenseId: string): Promise<string | null> {
  const row = await db.query.expenses.findFirst({
    where: and(eq(expenses.id, expenseId), isNull(expenses.deletedAt)),
    columns: { familyId: true },
  });
  return row && (await getRole(viewerId, row.familyId)) ? row.familyId : null;
}

/**
 * A person's own entries for one date — the quick check under the add form (DESIGN E8): from My expenses and the
 * families they're in, since a date's month decides the book (P4).
 */
export async function entriesForDay(userId: string, date: IsoDate): Promise<ExpenseView[]> {
  const myBooks = db
    .select({ id: familyMembers.familyId })
    .from(familyMembers)
    .where(and(eq(familyMembers.userId, userId), eq(familyMembers.status, "ACTIVE")));
  const rows = await viewQuery()
    .where(
      and(
        inArray(expenses.familyId, myBooks),
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
  /** Receipt added/replaced/removed with this change. */
  receipt: ReceiptInfo | null;
};

/**
 * Change log of one expense, newest first. Head of the book it's in now (DESIGN E7). The log follows the expense
 * when it moves between books (M8); a move is logged in both books, shown once.
 */
export async function expenseHistory(headId: string, familyId: string, expenseId: string): Promise<HistoryEntry[]> {
  await assertHead(headId, familyId);
  const inBook = await db.query.expenses.findFirst({
    where: and(eq(expenses.id, expenseId), eq(expenses.familyId, familyId)),
    columns: { id: true },
  });
  if (!inBook) return [];
  const all = await db
    .select({ action: auditLog.action, actorName: users.displayName, at: auditLog.at, details: auditLog.details })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(and(eq(auditLog.entityType, "expense"), eq(auditLog.entityId, expenseId)))
    .orderBy(desc(auditLog.at));
  const rows = all.filter((r, i) => !(r.action === "EXPENSE_MOVED" && i > 0 && all[i - 1].action === r.action && +all[i - 1].at === +r.at));
  return rows.map((r) => {
    const d = (r.details ?? {}) as { before?: Partial<Snapshot>; after?: Partial<Snapshot>; receipt?: ReceiptInfo };
    return {
      action: r.action,
      actorName: r.actorName,
      at: r.at,
      before: d.before ?? null,
      after: d.after ?? null,
      receipt: d.receipt ?? null,
    };
  });
}

/**
 * Category names by id, including hidden ones, for the change log of an expense the viewer may already see. Any
 * book's: an expense that moved (M8) keeps its old book's category ids in its log.
 */
export async function categoryNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(inArray(categories.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}
