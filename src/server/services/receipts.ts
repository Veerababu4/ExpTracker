import "server-only";
import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { appSettings, expenses, families, receipts } from "@/server/db/schema";
import { todayInIndia, type IsoDate } from "@/lib/rules/dates";
import { detectReceiptType, MAX_RECEIPT_BYTES, RECEIPTS_CAP_BYTES, type ReceiptType } from "@/lib/rules/receipts";
import { isSiteAdmin } from "@/server/auth/site-admin";
import { writeAudit, type Executor } from "./audit";
import { checkDate, loadForChange, type DateRefusal } from "./expense-access";
import { getRole, NotAllowedError } from "./families";

// Receipts (DESIGN §3.7): one photo or PDF per expense, stored in PostgreSQL. Adding, replacing and removing
// follow the expense's own edit rules. All families share one space limit (RECEIPTS_CAP_BYTES); the site admin
// can turn new uploads off. Receipts already saved can always be opened and removed.

export type ReceiptProblem = "receipts_off" | "storage_full" | "bad_file" | "too_big";
export type ReceiptResult = { ok: true } | { ok: false; reason: ReceiptProblem | "not_found" } | DateRefusal;

/** Shown in the change log; never the file itself. */
export type ReceiptInfo = { contentType: ReceiptType; sizeBytes: number };

const RECEIPTS_ENABLED = "receipts_enabled";
/** Serialises uploads so two at once can't both squeeze under the space limit. */
const SPACE_LOCK = 4_000_001;

/** Thrown inside a transaction to roll it back and hand a refusal to the caller. */
export class ReceiptRefused extends Error {
  constructor(readonly reason: ReceiptProblem) {
    super(reason);
  }
}

async function enabled(executor: Executor): Promise<boolean> {
  const row = await executor.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, RECEIPTS_ENABLED));
  return row.length === 0 || row[0].value !== false; // on unless the admin turned it off
}

async function usedBytes(executor: Executor, exceptExpenseId?: string): Promise<number> {
  const [row] = await executor
    .select({ used: sql<string>`coalesce(sum(${receipts.sizeBytes}), 0)` })
    .from(receipts)
    .where(exceptExpenseId ? ne(receipts.expenseId, exceptExpenseId) : undefined);
  return Number(row.used);
}

/**
 * Saves (or replaces) the receipt of an expense inside the caller's transaction. Permission checks are the
 * caller's job. Throws ReceiptRefused if uploads are off, the file isn't a receipt, or there's no space left.
 * A replaced receipt gets a new id, so browsers never show the old picture from their cache.
 */
export async function storeReceipt(
  tx: Executor,
  args: { familyId: string; expenseId: string; actorId: string; bytes: Buffer },
  capBytes = RECEIPTS_CAP_BYTES,
): Promise<{ info: ReceiptInfo; replaced: boolean }> {
  const contentType = detectReceiptType(args.bytes);
  if (!contentType) throw new ReceiptRefused("bad_file");
  if (args.bytes.length > MAX_RECEIPT_BYTES) throw new ReceiptRefused("too_big");
  await tx.execute(sql`select pg_advisory_xact_lock(${SPACE_LOCK})`);
  if (!(await enabled(tx))) throw new ReceiptRefused("receipts_off");
  if ((await usedBytes(tx, args.expenseId)) + args.bytes.length > capBytes) throw new ReceiptRefused("storage_full");

  const old = await tx.delete(receipts).where(eq(receipts.expenseId, args.expenseId)).returning({ id: receipts.id });
  await tx.insert(receipts).values({
    familyId: args.familyId,
    expenseId: args.expenseId,
    contentType,
    sizeBytes: args.bytes.length,
    data: args.bytes,
    createdBy: args.actorId,
  });
  return { info: { contentType, sizeBytes: args.bytes.length }, replaced: old.length > 0 };
}

/** Adds or replaces the receipt of an existing expense (expense page). */
export async function attachReceipt(
  actorId: string,
  familyId: string,
  expenseId: string,
  bytes: Buffer,
  today: IsoDate = todayInIndia(),
  capBytes = RECEIPTS_CAP_BYTES,
): Promise<ReceiptResult> {
  const loaded = await loadForChange(actorId, familyId, expenseId);
  if (!loaded) return { ok: false, reason: "not_found" };
  const dateProblem = checkDate(loaded.row.expenseDate, loaded.role, today);
  if (dateProblem) return dateProblem;
  try {
    await db.transaction(async (tx) => {
      const { info, replaced } = await storeReceipt(tx, { familyId, expenseId, actorId, bytes }, capBytes);
      await writeAudit(tx, {
        familyId,
        actorId,
        action: replaced ? "RECEIPT_REPLACED" : "RECEIPT_ADDED",
        entityType: "expense",
        entityId: expenseId,
        details: { receipt: info },
      });
    });
  } catch (error) {
    if (error instanceof ReceiptRefused) return { ok: false, reason: error.reason };
    throw error;
  }
  return { ok: true };
}

/** Removes the receipt of an expense. Allowed even while uploads are off (it frees space). */
export async function removeReceipt(
  actorId: string,
  familyId: string,
  expenseId: string,
  today: IsoDate = todayInIndia(),
): Promise<ReceiptResult> {
  const loaded = await loadForChange(actorId, familyId, expenseId);
  if (!loaded) return { ok: false, reason: "not_found" };
  const dateProblem = checkDate(loaded.row.expenseDate, loaded.role, today);
  if (dateProblem) return dateProblem;
  await db.transaction(async (tx) => {
    const [gone] = await tx
      .delete(receipts)
      .where(eq(receipts.expenseId, expenseId))
      .returning({ contentType: receipts.contentType, sizeBytes: receipts.sizeBytes });
    if (gone) {
      await writeAudit(tx, { familyId, actorId, action: "RECEIPT_REMOVED", entityType: "expense", entityId: expenseId, details: { receipt: gone } });
    }
  });
  return { ok: true };
}

/** The file behind /receipts/[id], or null when it doesn't exist or the viewer isn't in that family. */
export async function receiptFile(
  viewerId: string,
  receiptId: string,
): Promise<{ contentType: ReceiptType; data: Buffer; expenseDate: IsoDate } | null> {
  const [row] = await db
    .select({ familyId: receipts.familyId, contentType: receipts.contentType, data: receipts.data, expenseDate: expenses.expenseDate })
    .from(receipts)
    .innerJoin(expenses, and(eq(expenses.id, receipts.expenseId), isNull(expenses.deletedAt)))
    .where(eq(receipts.id, receiptId));
  if (!row || !(await getRole(viewerId, row.familyId))) return null;
  return { contentType: row.contentType as ReceiptType, data: row.data, expenseDate: row.expenseDate };
}

/** Whether people can attach new receipts right now (decides what the forms show). */
export async function uploadState(capBytes = RECEIPTS_CAP_BYTES): Promise<"on" | "off" | "full"> {
  if (!(await enabled(db))) return "off";
  return (await usedBytes(db)) >= capBytes ? "full" : "on";
}

// ── Site admin ────────────────────────────────────────────────────────────────

type Actor = { id: string; username: string };

function assertSiteAdmin(actor: Actor) {
  if (!isSiteAdmin(actor.username)) throw new NotAllowedError("Only the site admin can do that.");
}

/** The admin page's single line for every personal book's receipts together. */
export const PERSONAL_BOOKS_LABEL = "Personal books (My expenses, all users)";

export type ReceiptUsage = {
  enabled: boolean;
  usedBytes: number;
  capBytes: number;
  count: number;
  /** The whole database (expenses, accounts, receipts…), to compare with the hosting plan's limit. */
  databaseBytes: number;
  byFamily: { familyId: string; familyName: string; count: number; bytes: number }[];
};

/** Receipt space per family. Only sizes and family names — the admin never sees anyone's receipts here. */
export async function receiptUsage(actor: Actor, capBytes = RECEIPTS_CAP_BYTES): Promise<ReceiptUsage> {
  assertSiteAdmin(actor);
  const bytes = sql<string>`sum(${receipts.sizeBytes})`;
  const [byFamily, dbSize, isOn] = await Promise.all([
    db
      .select({ familyId: families.id, familyName: families.name, kind: families.kind, count: sql<number>`count(*)::int`, bytes })
      .from(receipts)
      .innerJoin(families, eq(families.id, receipts.familyId))
      .groupBy(families.id, families.name, families.kind)
      .orderBy(desc(bytes)),
    db.execute<{ size: string }>(sql`select pg_database_size(current_database()) as size`),
    enabled(db),
  ]);
  // Personal books (M8) are one line together: their owners' names aren't the admin's business.
  const rows: ReceiptUsage["byFamily"] = [];
  const personal = { familyId: "personal", familyName: PERSONAL_BOOKS_LABEL, count: 0, bytes: 0 };
  for (const { kind, ...r } of byFamily) {
    if (kind === "PERSONAL") {
      personal.count += r.count;
      personal.bytes += Number(r.bytes);
    } else rows.push({ ...r, bytes: Number(r.bytes) });
  }
  if (personal.count > 0) rows.push(personal);
  rows.sort((a, b) => b.bytes - a.bytes);
  return {
    enabled: isOn,
    usedBytes: rows.reduce((sum, r) => sum + r.bytes, 0),
    capBytes,
    count: rows.reduce((sum, r) => sum + r.count, 0),
    databaseBytes: Number(dbSize.rows[0].size),
    byFamily: rows,
  };
}

export async function setReceiptsEnabled(actor: Actor, on: boolean): Promise<void> {
  assertSiteAdmin(actor);
  await db.transaction(async (tx) => {
    await tx
      .insert(appSettings)
      .values({ key: RECEIPTS_ENABLED, value: on, updatedBy: actor.id })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: on, updatedBy: actor.id, updatedAt: new Date() } });
    await writeAudit(tx, {
      familyId: null,
      actorId: actor.id,
      action: on ? "RECEIPTS_TURNED_ON" : "RECEIPTS_TURNED_OFF",
      entityType: "setting",
      entityId: RECEIPTS_ENABLED,
    });
  });
}
