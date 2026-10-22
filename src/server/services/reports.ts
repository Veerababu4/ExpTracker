import "server-only";
import { and, asc, between, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "@/server/db";
import { categories, expenses, familyMembers, users } from "@/server/db/schema";
import type { PaymentMode } from "@/lib/expense-options";
import { monthRange, type IsoMonth } from "@/lib/rules/dates";
import { NO_CATEGORY, type SearchFilters } from "@/lib/validation/search";
import { toView, viewQuery, type ExpenseView } from "./expenses";
import { assertMember } from "./families";

// Reading many expenses at once (DESIGN §3.5): search between dates and the monthly view. Every member sees
// all of the family's expenses (S5); deleted ones never appear.

export const PAGE_SIZE = 50;

export type SearchResult = {
  expenses: ExpenseView[];
  /** Count and total of the whole result, not just this page. */
  count: number;
  totalPaise: number;
  page: number;
  pages: number;
};

const live = (familyId: string) => and(eq(expenses.familyId, familyId), isNull(expenses.deletedAt));

function filtersWhere(familyId: string, f: SearchFilters): SQL | undefined {
  return and(
    live(familyId),
    between(expenses.expenseDate, f.from, f.to),
    f.memberId ? eq(expenses.ownerId, f.memberId) : undefined,
    f.category === NO_CATEGORY ? isNull(expenses.categoryId) : f.category ? eq(expenses.categoryId, f.category) : undefined,
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
  await assertMember(viewerId, familyId);
  const where = filtersWhere(familyId, filters);
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

export type Group<K> = { key: K; name: string | null; paise: number; count: number };

export type MonthSummary = {
  month: IsoMonth;
  totalPaise: number;
  count: number;
  /** key null = Uncategorised */
  byCategory: Group<string | null>[];
  /** name = the member's display name; `former` for people who left or were removed */
  byMember: (Group<string> & { former: boolean })[];
  /** key null = Not specified */
  byMode: Group<PaymentMode | null>[];
  /** Every expense of the month, newest first. */
  expenses: ExpenseView[];
};

const biggestFirst = [desc(sql`sum(${expenses.amountPaise})`)];

/** Monthly view (S4): total, totals by category, member and payment mode, and the list. */
export async function monthSummary(viewerId: string, familyId: string, month: IsoMonth): Promise<MonthSummary> {
  await assertMember(viewerId, familyId);
  const { from, to } = monthRange(month);
  const where = and(live(familyId), between(expenses.expenseDate, from, to));

  const [byCategory, byMember, byMode, rows] = await Promise.all([
    db
      .select({ key: expenses.categoryId, name: categories.name, ...countAndSum })
      .from(expenses)
      .leftJoin(categories, eq(categories.id, expenses.categoryId))
      .where(where)
      .groupBy(expenses.categoryId, categories.name)
      .orderBy(...biggestFirst, asc(categories.name)),
    db
      .select({ key: expenses.ownerId, name: users.displayName, status: familyMembers.status, ...countAndSum })
      .from(expenses)
      .innerJoin(users, eq(users.id, expenses.ownerId))
      .leftJoin(familyMembers, and(eq(familyMembers.familyId, expenses.familyId), eq(familyMembers.userId, expenses.ownerId)))
      .where(where)
      .groupBy(expenses.ownerId, users.displayName, familyMembers.status)
      .orderBy(...biggestFirst, asc(users.displayName)),
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

  const toGroup = <K>(r: { key: K; name?: string | null; count: number; paise: string }): Group<K> => ({
    key: r.key,
    name: r.name ?? null,
    count: r.count,
    paise: Number(r.paise),
  });
  const categoryGroups = byCategory.map(toGroup);
  return {
    month,
    totalPaise: categoryGroups.reduce((sum, g) => sum + g.paise, 0),
    count: categoryGroups.reduce((sum, g) => sum + g.count, 0),
    byCategory: categoryGroups,
    byMember: byMember.map((r) => ({ ...toGroup(r), former: r.status !== "ACTIVE" })),
    byMode: byMode.map(toGroup),
    expenses: rows.map(toView),
  };
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
