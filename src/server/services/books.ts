import "server-only";
import { and, between, desc, eq, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { categories, expenseSharing, expenses, families, familyMembers, receipts } from "@/server/db/schema";
import { DEFAULT_CATEGORIES } from "@/lib/expense-options";
import { monthOf, monthRange, todayInIndia, type IsoDate, type IsoMonth } from "@/lib/rules/dates";
import { writeAudit, type Executor } from "./audit";
import { NotAllowedError } from "./families";

// Personal books and monthly sharing (DESIGN §3.8). A "book" is a families row: a FAMILY shared by its members,
// or a PERSONAL book ("My expenses") that only its owner sees. For each month a person's expenses live in exactly
// one book: the family they share with that month, else their personal book.

export const PERSONAL_BOOK_NAME = "My expenses";

/** Creates a user's personal book: the owner as its head, with the default categories. */
export async function createPersonalBook(tx: Executor, userId: string): Promise<string> {
  const [book] = await tx
    .insert(families)
    .values({ name: PERSONAL_BOOK_NAME, kind: "PERSONAL", createdBy: userId })
    .returning({ id: families.id });
  await tx.insert(familyMembers).values({ familyId: book.id, userId, role: "HEAD" });
  await tx.insert(categories).values(DEFAULT_CATEGORIES.map((name, i) => ({ familyId: book.id, name, sortOrder: (i + 1) * 10 })));
  return book.id;
}

export async function personalBookId(userId: string, executor: Executor = db): Promise<string> {
  const [row] = await executor
    .select({ id: families.id })
    .from(families)
    .where(and(eq(families.createdBy, userId), eq(families.kind, "PERSONAL")));
  if (!row) throw new Error("This account has no personal book.");
  return row.id;
}

export async function bookKindOf(bookId: string): Promise<"FAMILY" | "PERSONAL" | null> {
  const row = await db.query.families.findFirst({ where: eq(families.id, bookId), columns: { kind: true } });
  return row?.kind ?? null;
}

const firstDay = (month: IsoMonth) => `${month}-01`;

export type Sharing = {
  /** The family the person's expenses go to, or null for personal only. */
  familyId: string | null;
  /** The month the current setting started; null = never switched (personal only from the start). */
  since: IsoMonth | null;
};

/** The person's sharing setting for a month (the latest switch on or before it), ignoring membership. */
async function settingFor(executor: Executor, userId: string, month: IsoMonth): Promise<Sharing> {
  const [row] = await executor
    .select({ familyId: expenseSharing.familyId, fromMonth: expenseSharing.fromMonth })
    .from(expenseSharing)
    .where(and(eq(expenseSharing.userId, userId), lte(expenseSharing.fromMonth, firstDay(month))))
    .orderBy(desc(expenseSharing.fromMonth))
    .limit(1);
  return row ? { familyId: row.familyId, since: monthOf(row.fromMonth) } : { familyId: null, since: null };
}

async function isActiveMember(executor: Executor, userId: string, familyId: string): Promise<boolean> {
  const [row] = await executor
    .select({ userId: familyMembers.userId })
    .from(familyMembers)
    .where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, userId), eq(familyMembers.status, "ACTIVE")));
  return row !== undefined;
}

/** Who the person shares with in a month: the family only while they're still an active member of it (P2, P7). */
export async function sharingFor(userId: string, month: IsoMonth, executor: Executor = db): Promise<Sharing> {
  const setting = await settingFor(executor, userId, month);
  if (setting.familyId && !(await isActiveMember(executor, userId, setting.familyId))) return { familyId: null, since: setting.since };
  return setting;
}

/** The book that holds the person's expenses for a month (P4). */
export async function bookForMonth(userId: string, month: IsoMonth, executor: Executor = db): Promise<string> {
  const { familyId } = await sharingFor(userId, month, executor);
  return familyId ?? (await personalBookId(userId, executor));
}

/** Sharing of each active member of a family this month, for the members list (P3). */
export async function familySharing(familyId: string, today: IsoDate = todayInIndia()): Promise<Map<string, Sharing>> {
  const month = monthOf(today);
  const members = await db
    .select({ userId: familyMembers.userId })
    .from(familyMembers)
    .where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.status, "ACTIVE")));
  const result = new Map<string, Sharing>();
  for (const m of members) {
    // Another family's name is never shown here: from this family's side that's simply "personal only".
    const s = await settingFor(db, m.userId, month);
    result.set(m.userId, s.familyId === familyId ? s : { familyId: null, since: s.since });
  }
  return result;
}

export type SwitchResult = { moved: number; paise: number };

/**
 * Switches where the person's expenses go, from the current month on (P2): `familyId` to include them in that
 * family, null for personal only. This month's live expenses move with it; earlier months never change.
 */
export async function setSharing(
  userId: string,
  familyId: string | null,
  today: IsoDate = todayInIndia(),
  actorId: string = userId,
): Promise<SwitchResult> {
  return db.transaction((tx) => setSharingIn(tx, userId, familyId, today, actorId));
}

/** setSharing inside a transaction the caller already has open (creating a family, approving a request). */
export async function setSharingIn(
  tx: Executor,
  userId: string,
  familyId: string | null,
  today: IsoDate,
  actorId: string,
): Promise<SwitchResult> {
  const month = monthOf(today);
  if (familyId) {
    const [book] = await tx.select({ kind: families.kind }).from(families).where(eq(families.id, familyId));
    if (book?.kind !== "FAMILY" || !(await isActiveMember(tx, userId, familyId))) {
      throw new NotAllowedError("You're not a member of this family.");
    }
  }
  const before = await sharingFor(userId, month, tx);
  if (before.familyId === familyId) return { moved: 0, paise: 0 }; // already so (e.g. a double click)
  await tx
    .insert(expenseSharing)
    .values({ userId, fromMonth: firstDay(month), familyId, setBy: actorId })
    .onConflictDoUpdate({
      target: [expenseSharing.userId, expenseSharing.fromMonth],
      set: { familyId, setBy: actorId, setAt: new Date() },
    });
  const personal = await personalBookId(userId, tx);
  const moved = await moveMonth(tx, userId, month, familyId ?? personal, personal, actorId);
  for (const book of new Set([before.familyId ?? personal, familyId ?? personal])) {
    await writeAudit(tx, {
      familyId: book,
      actorId,
      action: "SHARING_CHANGED",
      entityType: "user",
      entityId: userId,
      details: { month, from: before.familyId ? "FAMILY" : "PERSONAL", to: familyId ? "FAMILY" : "PERSONAL", moved: moved.moved },
    });
  }
  return moved;
}

/**
 * Leaving or being removed (P7): nothing moves (F9), but from this month on the person's expenses are personal,
 * so re-joining later doesn't silently start sharing again.
 */
export async function stopSharingOnLeave(tx: Executor, userId: string, familyId: string, today: IsoDate, actorId: string) {
  const month = monthOf(today);
  const setting = await settingFor(tx, userId, month);
  if (setting.familyId !== familyId) return;
  await tx
    .insert(expenseSharing)
    .values({ userId, fromMonth: firstDay(month), familyId: null, setBy: actorId })
    .onConflictDoUpdate({
      target: [expenseSharing.userId, expenseSharing.fromMonth],
      set: { familyId: null, setBy: actorId, setAt: new Date() },
    });
}

/**
 * Moves the person's live expenses of `month` into `targetId`, from their personal book and the families they're
 * still active in (a family they left keeps its expenses, F9). Receipts move too; categories are matched by name.
 */
async function moveMonth(
  tx: Executor,
  ownerId: string,
  month: IsoMonth,
  targetId: string,
  personalId: string,
  actorId: string,
): Promise<SwitchResult> {
  const activeBooks = tx
    .select({ id: familyMembers.familyId })
    .from(familyMembers)
    .where(and(eq(familyMembers.userId, ownerId), eq(familyMembers.status, "ACTIVE")));
  const { from, to } = monthRange(month);
  const rows = await tx
    .select({ id: expenses.id, familyId: expenses.familyId, amountPaise: expenses.amountPaise, categoryName: categories.name })
    .from(expenses)
    .leftJoin(categories, eq(categories.id, expenses.categoryId))
    .where(
      and(
        eq(expenses.ownerId, ownerId),
        isNull(expenses.deletedAt),
        between(expenses.expenseDate, from, to),
        ne(expenses.familyId, targetId),
        inArray(expenses.familyId, activeBooks),
      ),
    );
  if (rows.length === 0) return { moved: 0, paise: 0 };

  const categoryIds = await categoriesIn(tx, targetId, rows.map((r) => r.categoryName), targetId === personalId);
  for (const row of rows) {
    const categoryId = row.categoryName ? (categoryIds.get(row.categoryName.toLowerCase()) ?? null) : null;
    await tx.update(expenses).set({ familyId: targetId, categoryId }).where(eq(expenses.id, row.id));
    await tx.update(receipts).set({ familyId: targetId }).where(eq(receipts.expenseId, row.id));
    for (const book of [row.familyId, targetId]) {
      await writeAudit(tx, {
        familyId: book,
        actorId,
        action: "EXPENSE_MOVED",
        entityType: "expense",
        entityId: row.id,
        details: { fromKind: row.familyId === personalId ? "PERSONAL" : "FAMILY", toKind: targetId === personalId ? "PERSONAL" : "FAMILY" },
      });
    }
  }
  return { moved: rows.length, paise: rows.reduce((sum, r) => sum + r.amountPaise, 0) };
}

/**
 * Category ids in the target book by lower-case name. Into the personal book a missing category is copied (it's
 * the owner's own list); into a family it stays missing, so the expense becomes Uncategorised there.
 */
async function categoriesIn(tx: Executor, bookId: string, names: (string | null)[], copyMissing: boolean) {
  const wanted = [...new Set(names.filter((n): n is string => n !== null))];
  const found = new Map<string, string>();
  if (wanted.length === 0) return found;
  const lower = sql`lower(${categories.name})`;
  const existing = await tx
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(and(eq(categories.familyId, bookId), inArray(lower, wanted.map((n) => n.toLowerCase()))));
  for (const c of existing) found.set(c.name.toLowerCase(), c.id);
  if (copyMissing) {
    for (const name of wanted) {
      if (found.has(name.toLowerCase())) continue;
      const [row] = await tx.insert(categories).values({ familyId: bookId, name }).returning({ id: categories.id });
      found.set(name.toLowerCase(), row.id);
    }
  }
  return found;
}

/** Number and total of the person's live expenses in a month that a switch to `targetId` would move. */
export async function wouldMove(userId: string, targetId: string, today: IsoDate = todayInIndia()): Promise<SwitchResult> {
  const activeBooks = db
    .select({ id: familyMembers.familyId })
    .from(familyMembers)
    .where(and(eq(familyMembers.userId, userId), eq(familyMembers.status, "ACTIVE")));
  const { from, to } = monthRange(monthOf(today));
  const [row] = await db
    .select({ count: sql<number>`count(*)::int`, paise: sql<string>`coalesce(sum(${expenses.amountPaise}), 0)` })
    .from(expenses)
    .where(
      and(
        eq(expenses.ownerId, userId),
        isNull(expenses.deletedAt),
        between(expenses.expenseDate, from, to),
        ne(expenses.familyId, targetId),
        inArray(expenses.familyId, activeBooks),
      ),
    );
  return { moved: row.count, paise: Number(row.paise) };
}
