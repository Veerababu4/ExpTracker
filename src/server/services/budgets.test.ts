import { and, asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { auditLog, budgets } from "@/server/db/schema";
import { resetDatabase } from "@/test/db";
import { registerUser } from "./accounts";
import { familyTotalBudgets, monthBudget, setMonthBudget } from "./budgets";
import { listCategories, setCategoryHidden } from "./categories";
import { createFamily, decideJoinRequest, NotAllowedError, pendingRequests, requestToJoin } from "./families";

const TODAY = "2026-10-22"; // budgets allowed for 2026-08 … 2027-10

const questions = { question1: "first_school" as const, answer1: "zp", question2: "first_pet" as const, answer2: "tom" };

async function user(username: string) {
  const r = await registerUser({ username, displayName: username.toUpperCase(), password: "secret123", ...questions });
  if (!r.ok) throw new Error("registration failed");
  return r.userId;
}

async function setup() {
  const head = await user("ravi");
  const member = await user("sita");
  const { id: familyId, joinCode } = await createFamily(head, "Kumar family");
  await requestToJoin(member, joinCode);
  const [req] = await pendingRequests(head, familyId);
  await decideJoinRequest(head, familyId, req.id, true);
  const cats = await listCategories(head, familyId);
  const cat = (name: string) => cats.find((c) => c.name === name)!.id;
  return { head, member, familyId, groceries: cat("Groceries"), fuel: cat("Fuel & transport") };
}

const audits = (familyId: string) =>
  db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.familyId, familyId), eq(auditLog.action, "BUDGET_CHANGED")))
    .orderBy(asc(auditLog.at));

beforeEach(resetDatabase);

describe("setMonthBudget / monthBudget", () => {
  it("head sets a family total and category budgets; every member sees them", async () => {
    const { head, member, familyId, groceries, fuel } = await setup();
    const r = await setMonthBudget(head, familyId, "2026-10", { totalPaise: 40_000_00, categories: { [groceries]: 12_000_00, [fuel]: null } }, TODAY);
    expect(r).toEqual({ ok: true, changed: 2 });

    const b = await monthBudget(member, familyId, "2026-10");
    expect(b).toEqual({
      month: "2026-10",
      totalPaise: 40_000_00,
      byCategory: [{ categoryId: groceries, name: "Groceries", hidden: false, paise: 12_000_00 }],
    });
    expect(await monthBudget(member, familyId, "2026-11")).toEqual({ month: "2026-11", totalPaise: null, byCategory: [] });
  });

  it("changes, clears and leaves alone; writes one change-log entry with before/after, none when nothing changed", async () => {
    const { head, familyId, groceries, fuel } = await setup();
    await setMonthBudget(head, familyId, "2026-10", { totalPaise: 40_000_00, categories: { [groceries]: 12_000_00, [fuel]: 3_000_00 } }, TODAY);

    // Fuel isn't in the form this time → keeps its budget.
    const r = await setMonthBudget(head, familyId, "2026-10", { totalPaise: 45_000_00, categories: { [groceries]: null } }, TODAY);
    expect(r).toEqual({ ok: true, changed: 2 });
    const b = await monthBudget(head, familyId, "2026-10");
    expect(b.totalPaise).toBe(45_000_00);
    expect(b.byCategory.map((c) => [c.name, c.paise])).toEqual([["Fuel & transport", 3_000_00]]);

    const log = await audits(familyId);
    expect(log).toHaveLength(2);
    expect(log[1]).toMatchObject({
      actorId: head,
      entityType: "budget",
      entityId: "2026-10",
      details: {
        month: "2026-10",
        changes: [
          { category: "total", before: 40_000_00, after: 45_000_00 },
          { category: groceries, before: 12_000_00, after: null },
        ],
      },
    });

    expect(await setMonthBudget(head, familyId, "2026-10", { totalPaise: 45_000_00, categories: { [fuel]: 3_000_00 } }, TODAY)).toEqual({
      ok: true,
      changed: 0,
    });
    expect(await audits(familyId)).toHaveLength(2);
  });

  it("allows months from 2 back to 12 ahead only", async () => {
    const { head, familyId } = await setup();
    const set = (month: string) => setMonthBudget(head, familyId, month, { totalPaise: 1_000_00, categories: {} }, TODAY);
    expect(await set("2026-08")).toMatchObject({ ok: true });
    expect(await set("2027-10")).toMatchObject({ ok: true });
    expect(await set("2026-07")).toEqual({ ok: false, reason: "month_not_allowed" });
    expect(await set("2027-11")).toEqual({ ok: false, reason: "month_not_allowed" });
    expect(await set("2026-13")).toEqual({ ok: false, reason: "month_not_allowed" });
  });

  it("only the head can set budgets; outsiders can't read them", async () => {
    const { member, familyId } = await setup();
    const outsider = await user("arun");
    await expect(setMonthBudget(member, familyId, "2026-10", { totalPaise: 1_000_00, categories: {} }, TODAY)).rejects.toBeInstanceOf(
      NotAllowedError,
    );
    await expect(monthBudget(outsider, familyId, "2026-10")).rejects.toBeInstanceOf(NotAllowedError);
    expect(await db.select().from(budgets)).toHaveLength(0);
  });

  it("refuses another family's category, accepts a hidden one of its own", async () => {
    const { head, familyId, groceries } = await setup();
    const other = await user("lata");
    const { id: otherFamily } = await createFamily(other, "Rao family");
    const [theirs] = await listCategories(other, otherFamily);

    expect(await setMonthBudget(head, familyId, "2026-10", { totalPaise: null, categories: { [theirs.id]: 5_000_00 } }, TODAY)).toEqual({
      ok: false,
      reason: "bad_category",
    });

    await setCategoryHidden(head, familyId, groceries, true);
    expect(await setMonthBudget(head, familyId, "2026-10", { totalPaise: null, categories: { [groceries]: 5_000_00 } }, TODAY)).toEqual({
      ok: true,
      changed: 1,
    });
    expect((await monthBudget(head, familyId, "2026-10")).byCategory).toEqual([
      { categoryId: groceries, name: "Groceries", hidden: true, paise: 5_000_00 },
    ]);
  });
});

describe("familyTotalBudgets", () => {
  it("gives the family total of each month in the range that has one; category budgets don't count", async () => {
    const { head, member, familyId, groceries } = await setup();
    await setMonthBudget(head, familyId, "2026-08", { totalPaise: 30_000_00, categories: {} }, TODAY);
    await setMonthBudget(head, familyId, "2026-10", { totalPaise: 40_000_00, categories: { [groceries]: 9_000_00 } }, TODAY);
    await setMonthBudget(head, familyId, "2026-09", { totalPaise: null, categories: { [groceries]: 8_000_00 } }, TODAY);
    await setMonthBudget(head, familyId, "2026-11", { totalPaise: 50_000_00, categories: {} }, TODAY); // after the range

    const totals = await familyTotalBudgets(member, familyId, "2026-05", "2026-10");
    expect([...totals.entries()].sort()).toEqual([
      ["2026-08", 30_000_00],
      ["2026-10", 40_000_00],
    ]);
  });
});
