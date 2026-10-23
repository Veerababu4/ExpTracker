import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { expenses } from "@/server/db/schema";
import { resetDatabase } from "@/test/db";
import { DEFAULT_LIMITS } from "@/lib/rules/alerts";
import type { ExpenseInput } from "@/lib/validation/expense";
import { registerUser } from "./accounts";
import { allMemberLimits, limitsFor, setMemberLimits } from "./alert-limits";
import { addCategory, listCategories, renameCategory, setCategoryHidden } from "./categories";
import { addExpense, deleteExpense, entriesForDay, expenseHistory, getExpense, updateExpense } from "./expenses";
import { createFamily, decideJoinRequest, NotAllowedError, pendingRequests, requestToJoin } from "./families";

const TODAY = "2026-10-21"; // member window: 1–21 Oct; head window: 1 Aug – 21 Oct

/** Members share their expenses with the family from Jan 2026, so every month used here is shared (M8). */
const SHARED = { includeExpenses: true, today: "2026-01-01" };

const questions = { question1: "first_school" as const, answer1: "zp", question2: "first_pet" as const, answer2: "tom" };

async function user(username: string) {
  const r = await registerUser({ username, displayName: username.toUpperCase(), password: "secret123", ...questions });
  if (!r.ok) throw new Error("registration failed");
  return r.userId;
}

async function setup() {
  const head = await user("ravi");
  const member = await user("sita");
  const { id: familyId, joinCode } = await createFamily(head, "Kumar family", undefined, SHARED);
  await requestToJoin(member, joinCode, true);
  const [req] = await pendingRequests(head, familyId);
  await decideJoinRequest(head, familyId, req.id, true, SHARED.today);
  const cats = await listCategories(head, familyId);
  return { head, member, familyId, groceries: cats.find((c) => c.name === "Groceries")!.id };
}

const input = (over: Partial<ExpenseInput> = {}): ExpenseInput => ({ expenseDate: TODAY, amount: 250000, note: undefined, ...over });

async function added(actor: string, familyId: string, over: Partial<ExpenseInput> = {}) {
  const r = await addExpense(actor, familyId, input(over), TODAY);
  if (!r.ok) throw new Error(`add failed: ${r.reason}`);
  return r.id;
}

beforeEach(resetDatabase);

describe("adding", () => {
  it("a new family starts with the default categories", async () => {
    const { head, familyId } = await setup();
    const cats = await listCategories(head, familyId);
    expect(cats).toHaveLength(17);
    expect(cats[0].name).toBe("Groceries");
    expect(cats.at(-1)!.name).toBe("Other");
  });

  it("stores the expense for the person who added it", async () => {
    const { member, familyId, groceries } = await setup();
    const id = await added(member, familyId, { categoryId: groceries, paymentMode: "UPI", note: "DMart" });
    const view = await getExpense(member, familyId, id, TODAY);
    expect(view?.expense).toMatchObject({
      ownerId: member,
      ownerName: "SITA",
      expenseDate: TODAY,
      amountPaise: 250000,
      categoryName: "Groceries",
      paymentMode: "UPI",
      note: "DMart",
    });
    expect(view?.canChange).toBe(true);
  });

  it("member window: last 7 days or this month; never the future", async () => {
    const { member, familyId } = await setup();
    expect((await addExpense(member, familyId, input({ expenseDate: "2026-10-01" }), TODAY)).ok).toBe(true);
    expect(await addExpense(member, familyId, input({ expenseDate: "2026-09-30" }), TODAY)).toMatchObject({
      ok: false,
      reason: "outside_window",
      window: { from: "2026-10-01", to: TODAY },
    });
    expect(await addExpense(member, familyId, input({ expenseDate: "2026-10-22" }), TODAY)).toMatchObject({ ok: false, reason: "future_date" });
    // Early in a month the last 7 days reach back into the previous month.
    expect((await addExpense(member, familyId, input({ expenseDate: "2026-10-28" }), "2026-11-03")).ok).toBe(true);
    expect((await addExpense(member, familyId, input({ expenseDate: "2026-10-27" }), "2026-11-03")).ok).toBe(false);
  });

  it("head window: this month and the two before", async () => {
    const { head, familyId } = await setup();
    expect((await addExpense(head, familyId, input({ expenseDate: "2026-08-01" }), TODAY)).ok).toBe(true);
    expect((await addExpense(head, familyId, input({ expenseDate: "2026-07-31" }), TODAY)).ok).toBe(false);
  });

  it("refuses another family's category or a hidden one", async () => {
    const { head, member, familyId, groceries } = await setup();
    const other = await user("ghost");
    const { id: otherFamily } = await createFamily(other, "Other", undefined, SHARED);
    const [otherCat] = await listCategories(other, otherFamily);
    expect(await addExpense(member, familyId, input({ categoryId: otherCat.id }), TODAY)).toEqual({ ok: false, reason: "bad_category" });
    await setCategoryHidden(head, familyId, groceries, true);
    expect(await addExpense(member, familyId, input({ categoryId: groceries }), TODAY)).toEqual({ ok: false, reason: "bad_category" });
  });

  it("outsiders can't add to a family", async () => {
    const { familyId } = await setup();
    const outsider = await user("ghost");
    await expect(addExpense(outsider, familyId, input(), TODAY)).rejects.toBeInstanceOf(NotAllowedError);
  });
});

describe("editing and deleting", () => {
  it("member edits own expense; the change log records before and after", async () => {
    const { head, member, familyId, groceries } = await setup();
    const id = await added(member, familyId);
    expect(await updateExpense(member, familyId, id, input({ amount: 300000, categoryId: groceries }), TODAY)).toEqual({ ok: true, id });

    const history = await expenseHistory(head, familyId, id);
    expect(history.map((h) => h.action)).toEqual(["EXPENSE_UPDATED", "EXPENSE_ADDED"]);
    expect(history[0]).toMatchObject({
      actorName: "SITA",
      before: { amountPaise: 250000, categoryId: null },
      after: { amountPaise: 300000, categoryId: groceries },
    });
    await expect(expenseHistory(member, familyId, id)).rejects.toBeInstanceOf(NotAllowedError);
  });

  it("member can't change someone else's expense", async () => {
    const { head, member, familyId } = await setup();
    const headsExpense = await added(head, familyId);
    await expect(updateExpense(member, familyId, headsExpense, input({ amount: 100 }), TODAY)).rejects.toBeInstanceOf(NotAllowedError);
    await expect(deleteExpense(member, familyId, headsExpense, TODAY)).rejects.toBeInstanceOf(NotAllowedError);
    expect((await getExpense(member, familyId, headsExpense, TODAY))?.canChange).toBe(false);
  });

  it("member can't move an expense in or out of the window", async () => {
    const { head, member, familyId } = await setup();
    const id = await added(member, familyId, { expenseDate: "2026-10-05" });
    expect((await updateExpense(member, familyId, id, input({ expenseDate: "2026-09-25" }), TODAY)).ok).toBe(false);
    // In November the October expense is outside the member's window: no edit, no delete.
    expect((await updateExpense(member, familyId, id, input({ expenseDate: "2026-11-02" }), "2026-11-10")).ok).toBe(false);
    expect((await deleteExpense(member, familyId, id, "2026-11-10")).ok).toBe(false);
    expect((await getExpense(member, familyId, id, "2026-11-10"))?.whyNot).toBe("outside_window");
    // The head still can (October is within the head's 3 months).
    expect((await updateExpense(head, familyId, id, input({ expenseDate: "2026-10-05", amount: 1000 }), "2026-11-10")).ok).toBe(true);
  });

  it("head edits a member's expense; ownership stays with the member", async () => {
    const { head, member, familyId } = await setup();
    const id = await added(member, familyId);
    expect((await updateExpense(head, familyId, id, input({ amount: 99900 }), TODAY)).ok).toBe(true);
    const row = await db.query.expenses.findFirst({ where: eq(expenses.id, id) });
    expect(row).toMatchObject({ ownerId: member, updatedBy: head, amountPaise: 99900 });
  });

  it("an unchanged save writes no log entry", async () => {
    const { head, member, familyId } = await setup();
    const id = await added(member, familyId);
    await updateExpense(member, familyId, id, input(), TODAY);
    expect(await expenseHistory(head, familyId, id)).toHaveLength(1);
  });

  it("delete hides the expense but keeps it and logs it", async () => {
    const { head, member, familyId } = await setup();
    const id = await added(member, familyId);
    expect(await deleteExpense(member, familyId, id, TODAY)).toEqual({ ok: true, id });
    expect(await getExpense(member, familyId, id, TODAY)).toBeNull();
    expect(await entriesForDay(member, TODAY)).toEqual([]);
    const row = await db.query.expenses.findFirst({ where: eq(expenses.id, id) });
    expect(row?.deletedBy).toBe(member);
    expect((await expenseHistory(head, familyId, id))[0].action).toBe("EXPENSE_DELETED");
    expect(await updateExpense(member, familyId, id, input(), TODAY)).toEqual({ ok: false, reason: "not_found" });
  });

  it("a kept hidden category doesn't block editing other fields", async () => {
    const { head, member, familyId, groceries } = await setup();
    const id = await added(member, familyId, { categoryId: groceries });
    await setCategoryHidden(head, familyId, groceries, true);
    expect((await updateExpense(member, familyId, id, input({ categoryId: groceries, amount: 100 }), TODAY)).ok).toBe(true);
  });

  it("the day list shows only the person's own entries for that date", async () => {
    const { head, member, familyId } = await setup();
    await added(member, familyId, { amount: 1000 });
    await added(member, familyId, { amount: 2000, expenseDate: "2026-10-20" });
    await added(head, familyId, { amount: 3000 });
    expect((await entriesForDay(member, TODAY)).map((e) => e.amountPaise)).toEqual([1000]);
  });
});

describe("categories", () => {
  it("head adds, renames and hides; names are unique ignoring case", async () => {
    const { head, member, familyId } = await setup();
    expect(await addCategory(head, familyId, "School fees")).toEqual({ ok: true });
    expect(await addCategory(head, familyId, "school FEES")).toEqual({ ok: false, reason: "name_taken" });
    expect(await addCategory(head, familyId, "groceries")).toEqual({ ok: false, reason: "name_taken" });
    await expect(addCategory(member, familyId, "Toys")).rejects.toBeInstanceOf(NotAllowedError);

    const fees = (await listCategories(head, familyId)).find((c) => c.name === "School fees")!;
    expect((await listCategories(head, familyId)).at(-1)!.name).toBe("School fees"); // added at the end
    expect(await renameCategory(head, familyId, fees.id, "Tuition")).toEqual({ ok: true });
    expect(await renameCategory(head, familyId, fees.id, "Travel")).toEqual({ ok: false, reason: "name_taken" });
    await setCategoryHidden(head, familyId, fees.id, true);
    expect((await listCategories(member, familyId)).some((c) => c.name === "Tuition")).toBe(false);
    expect((await listCategories(head, familyId, true)).find((c) => c.name === "Tuition")?.hidden).toBe(true);
  });
});

describe("alert limits", () => {
  it("default for everyone; head sets per member (incl. self) and can reset", async () => {
    const { head, member, familyId } = await setup();
    expect(await limitsFor(member, familyId)).toEqual(DEFAULT_LIMITS);

    await setMemberLimits(head, familyId, member, { highPaise: 50000, veryHighPaise: 500000 });
    await setMemberLimits(head, familyId, head, { highPaise: 500000, veryHighPaise: 5000000 });
    expect(await limitsFor(member, familyId)).toEqual({ highPaise: 50000, veryHighPaise: 500000 });
    const all = await allMemberLimits(head, familyId);
    expect(all.map((m) => [m.displayName, m.custom])).toEqual([
      ["RAVI", true],
      ["SITA", true],
    ]);

    await setMemberLimits(head, familyId, member, null);
    expect(await limitsFor(member, familyId)).toEqual(DEFAULT_LIMITS);
  });

  it("only the head changes limits, and they must be in order", async () => {
    const { head, member, familyId } = await setup();
    await expect(setMemberLimits(member, familyId, member, { highPaise: 100, veryHighPaise: 200 })).rejects.toBeInstanceOf(NotAllowedError);
    await expect(setMemberLimits(head, familyId, member, { highPaise: 900, veryHighPaise: 800 })).rejects.toBeInstanceOf(NotAllowedError);
    await expect(allMemberLimits(member, familyId)).rejects.toBeInstanceOf(NotAllowedError);
  });

  it("the expense view carries the owner's limits (used for the High tag)", async () => {
    const { head, member, familyId } = await setup();
    await setMemberLimits(head, familyId, member, { highPaise: 50000, veryHighPaise: 500000 });
    const id = await added(member, familyId);
    expect((await getExpense(head, familyId, id, TODAY))?.expense.ownerLimits).toEqual({ highPaise: 50000, veryHighPaise: 500000 });
  });
});
