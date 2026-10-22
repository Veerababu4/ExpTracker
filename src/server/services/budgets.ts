import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { budgets, categories } from "@/server/db/schema";
import { isBudgetMonth } from "@/lib/rules/budget";
import { isIsoMonth, todayInIndia, type IsoDate, type IsoMonth } from "@/lib/rules/dates";
import type { BudgetInput } from "@/lib/validation/budget";
import { writeAudit } from "./audit";
import { assertHead, assertMember } from "./families";

// Monthly budgets (DESIGN §3.6 B1). The head sets a family total and optional per-category budgets; every
// member sees them on the monthly view. No row = no budget.

export type CategoryBudget = { categoryId: string; name: string; hidden: boolean; paise: number };

export type MonthBudget = {
  month: IsoMonth;
  /** Family total, or null when none is set. */
  totalPaise: number | null;
  /** Category budgets in the family's category order. */
  byCategory: CategoryBudget[];
};

/** "2026-10" → "2026-10-01" (budgets.month is always the 1st). */
const firstDay = (month: IsoMonth) => `${month}-01`;

/** One month's budget; any member may read it. */
export async function monthBudget(viewerId: string, familyId: string, month: IsoMonth): Promise<MonthBudget> {
  await assertMember(viewerId, familyId);
  const rows = await db
    .select({
      categoryId: budgets.categoryId,
      name: categories.name,
      hidden: categories.hidden,
      paise: budgets.amountPaise,
    })
    .from(budgets)
    .leftJoin(categories, eq(categories.id, budgets.categoryId))
    .where(and(eq(budgets.familyId, familyId), eq(budgets.month, firstDay(month))))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
  const total = rows.find((r) => r.categoryId === null);
  return {
    month,
    totalPaise: total?.paise ?? null,
    byCategory: rows.flatMap((r) =>
      r.categoryId === null ? [] : [{ categoryId: r.categoryId, name: r.name ?? "", hidden: r.hidden ?? false, paise: r.paise }],
    ),
  };
}

export type BudgetResult = { ok: true; changed: number } | { ok: false; reason: "month_not_allowed" | "bad_category" };

/** Key for the family total in before/after maps. */
const TOTAL = "total";

/**
 * Head saves a month's budget: the family total plus the categories in `input` (others keep their budget).
 * Only what changed is written, and the change log gets one entry listing each change with before/after.
 * `today` is a parameter so tests can pick the date.
 */
export async function setMonthBudget(
  headId: string,
  familyId: string,
  month: IsoMonth,
  input: BudgetInput,
  today: IsoDate = todayInIndia(),
): Promise<BudgetResult> {
  await assertHead(headId, familyId);
  if (!isIsoMonth(month) || !isBudgetMonth(month, today)) return { ok: false, reason: "month_not_allowed" };

  const ids = Object.keys(input.categories);
  if (ids.length > 0) {
    // Hidden categories are allowed: an old budget on them can still be changed or cleared.
    const found = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.familyId, familyId), inArray(categories.id, ids)));
    if (found.length !== ids.length) return { ok: false, reason: "bad_category" };
  }

  return db.transaction(async (tx) => {
    const monthDate = firstDay(month);
    const existing = await tx
      .select({ categoryId: budgets.categoryId, paise: budgets.amountPaise })
      .from(budgets)
      .where(and(eq(budgets.familyId, familyId), eq(budgets.month, monthDate)));
    const before = new Map(existing.map((r) => [r.categoryId ?? TOTAL, r.paise]));
    const wanted: [string, number | null][] = [[TOTAL, input.totalPaise], ...Object.entries(input.categories)];
    const changes = wanted
      .map(([key, after]) => ({ key, before: before.get(key) ?? null, after }))
      .filter((c) => c.before !== c.after);

    for (const c of changes) {
      const categoryId = c.key === TOTAL ? null : c.key;
      const row = and(
        eq(budgets.familyId, familyId),
        eq(budgets.month, monthDate),
        categoryId ? eq(budgets.categoryId, categoryId) : isNull(budgets.categoryId),
      );
      if (c.after === null) {
        await tx.delete(budgets).where(row);
      } else if (c.before === null) {
        await tx.insert(budgets).values({ familyId, month: monthDate, categoryId, amountPaise: c.after, setBy: headId });
      } else {
        await tx.update(budgets).set({ amountPaise: c.after, setBy: headId, updatedAt: new Date() }).where(row);
      }
    }

    if (changes.length > 0) {
      await writeAudit(tx, {
        familyId,
        actorId: headId,
        action: "BUDGET_CHANGED",
        entityType: "budget",
        entityId: month,
        details: { month, changes: changes.map((c) => ({ category: c.key, before: c.before, after: c.after })) },
      });
    }
    return { ok: true, changed: changes.length } as const;
  });
}
