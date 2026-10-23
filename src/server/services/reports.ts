import "server-only";
import { and, asc, between, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "@/server/db";
import { categories, expenses, families, familyMembers, users } from "@/server/db/schema";
import type { PaymentMode } from "@/lib/expense-options";
import { addMonths, monthRange, type IsoMonth } from "@/lib/rules/dates";
import { NO_CATEGORY, type SearchFilters } from "@/lib/validation/search";
import { bookKindOf } from "./books";
import { toView, viewQuery, type ExpenseView } from "./expenses";
import { assertMember } from "./families";

// Reading many expenses at once (DESIGN §3.5): search between dates and the monthly view. Every member sees
// all of the family's expenses (S5); deleted ones never appear.
//
// M8 (§3.8 P8): with My expenses open the "scope" is all of my own expenses — my personal book plus what I
// shared with the families I'm still in. Categories are then matched by name (each book has its own list), and
// a "Where" breakdown (which book) replaces "By member".

export const PAGE_SIZE = 50;

export type SearchResult = {
  expenses: ExpenseView[];
  /** Count and total of the whole result, not just this page. */
  count: number;
  totalPaise: number;
  page: number;
  pages: number;
};

/** What a report covers: one family's book, or every expense of mine (My expenses). */
type Scope = { mine: false; bookId: string; where: SQL } | { mine: true; bookId: string; viewerId: string; where: SQL };

/** The books I'm an active member of (My expenses and my families), as a subquery. */
const myBooks = (userId: string) =>
  db
    .select({ id: familyMembers.familyId })
    .from(familyMembers)
    .where(and(eq(familyMembers.userId, userId), eq(familyMembers.status, "ACTIVE")));

/** Checks the viewer may read `bookId` and returns what its reports cover. */
async function scopeOf(viewerId: string, bookId: string): Promise<Scope> {
  await assertMember(viewerId, bookId); // a personal book's only member is its owner
  if ((await bookKindOf(bookId)) === "PERSONAL") {
    const where = and(isNull(expenses.deletedAt), eq(expenses.ownerId, viewerId), inArray(expenses.familyId, myBooks(viewerId)))!;
    return { mine: true, bookId, viewerId, where };
  }
  return { mine: false, bookId, where: and(eq(expenses.familyId, bookId), isNull(expenses.deletedAt))! };
}

/**
 * Category filter. In a family: that category. In My expenses: any of my books' categories with the same name, so
 * "Groceries" finds groceries whether they're in My expenses or shared with a family.
 */
function categoryWhere(scope: Scope, category: string): SQL {
  if (!scope.mine) return eq(expenses.categoryId, category);
  const sameName = db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        inArray(categories.familyId, myBooks(scope.viewerId)),
        sql`lower(${categories.name}) = (select lower(c.name) from ${categories} c where c.id = ${category})`,
      ),
    );
  return inArray(expenses.categoryId, sameName);
}

function filtersWhere(scope: Scope, f: SearchFilters): SQL | undefined {
  return and(
    scope.where,
    between(expenses.expenseDate, f.from, f.to),
    f.memberId && !scope.mine ? eq(expenses.ownerId, f.memberId) : undefined,
    f.category === NO_CATEGORY ? isNull(expenses.categoryId) : f.category ? categoryWhere(scope, f.category) : undefined,
    f.mode ? eq(expenses.paymentMode, f.mode) : undefined,
  );
}

const newestFirst = [desc(expenses.expenseDate), desc(expenses.createdAt), desc(expenses.id)];

const countAndSum = {
  count: sql<number>`count(*)::int`,
  paise: sql<string>`coalesce(sum(${expenses.amountPaise}), 0)`,
};

/** Search between two dates (S1–S3): newest first, 50 per page. A page past the end shows the last page. */
export async function searchExpenses(viewerId: string, familyId: string, filters: SearchFilters, page = 1): Promise<SearchResult> {
  const where = filtersWhere(await scopeOf(viewerId, familyId), filters);
  const [summary] = await db.select(countAndSum).from(expenses).where(where);
  const pages = Math.max(1, Math.ceil(summary.count / PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  const rows = summary.count
    ? await viewQuery()
        .where(where)
        .orderBy(...newestFirst)
        .limit(PAGE_SIZE)
        .offset((current - 1) * PAGE_SIZE)
    : [];
  return { expenses: rows.map(toView), count: summary.count, totalPaise: Number(summary.paise), page: current, pages };
}

/** Every expense matching a search, oldest first (no pages), for the CSV download (DESIGN §3.6 B4). */
export async function exportExpenses(viewerId: string, familyId: string, filters: SearchFilters): Promise<ExpenseView[]> {
  const rows = await viewQuery()
    .where(filtersWhere(await scopeOf(viewerId, familyId), filters))
    .orderBy(asc(expenses.expenseDate), asc(expenses.createdAt), asc(expenses.id));
  return rows.map(toView);
}

/** Address of the CSV download for a search (the same fields as /search; empty ones are left out). */
export function exportHref(familyId: string, filters: Partial<Record<"from" | "to" | "member" | "category" | "mode", string>>): string {
  const params = new URLSearchParams({ family: familyId });
  for (const [name, value] of Object.entries(filters)) if (value) params.set(name, value);
  return `/export/expenses?${params}`;
}

export type Group<K> = { key: K; name: string | null; paise: number; count: number };

export type MonthSummary = {
  month: IsoMonth;
  totalPaise: number;
  count: number;
  /** key null = Uncategorised. In My expenses the key is my own category with that name when I have one. */
  byCategory: Group<string | null>[];
  /** name = the member's display name; `former` for people who left or were removed. Empty in My expenses. */
  byMember: (Group<string> & { former: boolean })[];
  /** My expenses only: which book they're in (My expenses or a family I share with). */
  byBook: Group<string>[];
  /** key null = Not specified */
  byMode: Group<PaymentMode | null>[];
  /** Every expense of the month, newest first. */
  expenses: ExpenseView[];
};

const biggestFirst = [desc(sql`sum(${expenses.amountPaise})`)];

const toGroup = <K>(r: { key: K; name?: string | null; count: number; paise: string | number }): Group<K> => ({
  key: r.key,
  name: r.name ?? null,
  count: r.count,
  paise: Number(r.paise),
});

/**
 * My expenses: the same category name in different books is one row. Its key is my own category with that name
 * (so the row links to a search and shows my category budget); a name only a family uses keeps that family's id.
 */
async function mergeByName(groups: Group<string | null>[], personalId: string): Promise<Group<string | null>[]> {
  const mine = await db.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.familyId, personalId));
  const myIds = new Map(mine.map((c) => [c.name.toLowerCase(), c.id]));
  const merged = new Map<string, Group<string | null>>();
  for (const g of groups) {
    const name = g.name?.toLowerCase() ?? "";
    const row = merged.get(name);
    if (row) {
      row.paise += g.paise;
      row.count += g.count;
    } else {
      merged.set(name, { ...g, key: g.name === null ? null : (myIds.get(name) ?? g.key) });
    }
  }
  return [...merged.values()].sort((a, b) => b.paise - a.paise || (a.name ?? "").localeCompare(b.name ?? ""));
}

/** Monthly view (S4): total, totals by category, member (or book) and payment mode, and the list. */
export async function monthSummary(viewerId: string, familyId: string, month: IsoMonth): Promise<MonthSummary> {
  const scope = await scopeOf(viewerId, familyId);
  const { from, to } = monthRange(month);
  const where = and(scope.where, between(expenses.expenseDate, from, to));

  const [byCategory, byMember, byBook, byMode, rows] = await Promise.all([
    db
      .select({ key: expenses.categoryId, name: categories.name, ...countAndSum })
      .from(expenses)
      .leftJoin(categories, eq(categories.id, expenses.categoryId))
      .where(where)
      .groupBy(expenses.categoryId, categories.name)
      .orderBy(...biggestFirst, asc(categories.name)),
    scope.mine
      ? Promise.resolve([])
      : db
          .select({ key: expenses.ownerId, name: users.displayName, status: familyMembers.status, ...countAndSum })
          .from(expenses)
          .innerJoin(users, eq(users.id, expenses.ownerId))
          .leftJoin(familyMembers, and(eq(familyMembers.familyId, expenses.familyId), eq(familyMembers.userId, expenses.ownerId)))
          .where(where)
          .groupBy(expenses.ownerId, users.displayName, familyMembers.status)
          .orderBy(...biggestFirst, asc(users.displayName)),
    scope.mine
      ? db
          .select({ key: expenses.familyId, name: families.name, ...countAndSum })
          .from(expenses)
          .innerJoin(families, eq(families.id, expenses.familyId))
          .where(where)
          .groupBy(expenses.familyId, families.name)
          .orderBy(...biggestFirst, asc(families.name))
      : Promise.resolve([] as { key: string; name: string; count: number; paise: string }[]),
    db
      .select({ key: expenses.paymentMode, ...countAndSum })
      .from(expenses)
      .where(where)
      .groupBy(expenses.paymentMode)
      .orderBy(...biggestFirst),
    viewQuery()
      .where(where)
      .orderBy(...newestFirst),
  ]);

  const categoryGroups = scope.mine ? await mergeByName(byCategory.map(toGroup), scope.bookId) : byCategory.map(toGroup);
  return {
    month,
    totalPaise: categoryGroups.reduce((sum, g) => sum + g.paise, 0),
    count: categoryGroups.reduce((sum, g) => sum + g.count, 0),
    byCategory: categoryGroups,
    byMember: byMember.map((r) => ({ ...toGroup(r), former: r.status !== "ACTIVE" })),
    byBook: byBook.map(toGroup),
    byMode: byMode.map(toGroup),
    expenses: rows.map(toView),
  };
}

export type MonthTotal = { month: IsoMonth; paise: number; count: number };

/** Spending per month for the `months` months ending with `month` (oldest first; months with nothing are 0). */
export async function monthTrend(viewerId: string, familyId: string, month: IsoMonth, months = 6): Promise<MonthTotal[]> {
  const scope = await scopeOf(viewerId, familyId);
  const first = addMonths(month, -(months - 1));
  const monthOfDate = sql<string>`to_char(${expenses.expenseDate}, 'YYYY-MM')`;
  const rows = await db
    .select({ month: monthOfDate, ...countAndSum })
    .from(expenses)
    .where(and(scope.where, between(expenses.expenseDate, monthRange(first).from, monthRange(month).to)))
    .groupBy(monthOfDate);
  const found = new Map(rows.map((r) => [r.month, r]));
  return Array.from({ length: months }, (_, i) => {
    const m = addMonths(first, i);
    const r = found.get(m);
    return { month: m, paise: Number(r?.paise ?? 0), count: r?.count ?? 0 };
  });
}

export type Person = { userId: string; displayName: string; former: boolean };

/** Everyone who is or was in the family (for the member filter): current members first, then former ones. */
export async function familyPeople(viewerId: string, familyId: string): Promise<Person[]> {
  await assertMember(viewerId, familyId);
  const rows = await db
    .select({ userId: users.id, displayName: users.displayName, status: familyMembers.status })
    .from(familyMembers)
    .innerJoin(users, eq(users.id, familyMembers.userId))
    .where(eq(familyMembers.familyId, familyId))
    .orderBy(sql`${familyMembers.status} = 'ACTIVE' desc`, asc(users.displayName));
  return rows.map((r) => ({ userId: r.userId, displayName: r.displayName, former: r.status !== "ACTIVE" }));
}
