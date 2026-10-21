import "server-only";
import { and, asc, eq, max } from "drizzle-orm";
import { db } from "@/server/db";
import { categories } from "@/server/db/schema";
import { isUniqueViolation } from "./accounts";
import { writeAudit } from "./audit";
import { assertHead, assertMember } from "./families";

// Family categories (DESIGN §3.4). Categories are never deleted — hiding keeps old expenses and reports intact.

export type Category = { id: string; name: string; hidden: boolean };

export async function listCategories(userId: string, familyId: string, includeHidden = false): Promise<Category[]> {
  await assertMember(userId, familyId);
  const rows = await db
    .select({ id: categories.id, name: categories.name, hidden: categories.hidden })
    .from(categories)
    .where(includeHidden ? eq(categories.familyId, familyId) : and(eq(categories.familyId, familyId), eq(categories.hidden, false)))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
  return rows;
}

type NameResult = { ok: true } | { ok: false; reason: "name_taken" | "not_found" };

export async function addCategory(headId: string, familyId: string, name: string): Promise<NameResult> {
  await assertHead(headId, familyId);
  try {
    await db.transaction(async (tx) => {
      const [{ last }] = await tx.select({ last: max(categories.sortOrder) }).from(categories).where(eq(categories.familyId, familyId));
      const [row] = await tx
        .insert(categories)
        .values({ familyId, name, sortOrder: (last ?? 0) + 10 })
        .returning({ id: categories.id });
      await writeAudit(tx, { familyId, actorId: headId, action: "CATEGORY_ADDED", entityType: "category", entityId: row.id, details: { name } });
    });
    return { ok: true };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "name_taken" };
    throw error;
  }
}

export async function renameCategory(headId: string, familyId: string, categoryId: string, name: string): Promise<NameResult> {
  await assertHead(headId, familyId);
  try {
    return await db.transaction(async (tx) => {
      const old = await tx.query.categories.findFirst({ where: and(eq(categories.id, categoryId), eq(categories.familyId, familyId)) });
      if (!old) return { ok: false, reason: "not_found" } as const;
      if (old.name === name) return { ok: true } as const;
      await tx.update(categories).set({ name }).where(eq(categories.id, categoryId));
      await writeAudit(tx, {
        familyId,
        actorId: headId,
        action: "CATEGORY_RENAMED",
        entityType: "category",
        entityId: categoryId,
        details: { before: { name: old.name }, after: { name } },
      });
      return { ok: true } as const;
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "name_taken" };
    throw error;
  }
}

export async function setCategoryHidden(headId: string, familyId: string, categoryId: string, hidden: boolean): Promise<void> {
  await assertHead(headId, familyId);
  const rows = await db
    .update(categories)
    .set({ hidden })
    .where(and(eq(categories.id, categoryId), eq(categories.familyId, familyId)))
    .returning({ name: categories.name });
  if (rows.length === 0) return;
  await writeAudit(db, {
    familyId,
    actorId: headId,
    action: hidden ? "CATEGORY_HIDDEN" : "CATEGORY_SHOWN",
    entityType: "category",
    entityId: categoryId,
    details: { name: rows[0].name },
  });
}
