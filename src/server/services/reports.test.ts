import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { expenses } from "@/server/db/schema";
import { resetDatabase } from "@/test/db";
import type { ExpenseInput } from "@/lib/validation/expense";
import type { SearchFilters } from "@/lib/validation/search";
import { registerUser } from "./accounts";
import { listCategories } from "./categories";
import { addExpense, deleteExpense } from "./expenses";
import { createFamily, decideJoinRequest, leaveFamily, NotAllowedError, pendingRequests, requestToJoin } from "./families";
import { exportExpenses, exportHref, familyPeople, monthSummary, monthTrend, PAGE_SIZE, searchExpenses } from "./reports";

const TODAY = "2026-10-21"; // head window: 1 Aug – 21 Oct

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

async function add(actor: string, familyId: string, over: Partial<ExpenseInput> & { expenseDate: string; amount: number }) {
  const r = await addExpense(actor, familyId, { note: undefined, ...over }, TODAY);
  if (!r.ok) throw new Error(`add failed: ${r.reason}`);
  return r.id;
}

const october = (over: Partial<SearchFilters> = {}): SearchFilters => ({ from: "2026-10-01", to: "2026-10-31", ...over });

beforeEach(resetDatabase);

describe("searchExpenses", () => {
  it("finds the family's expenses between the dates (both ends included), newest first, with count and total", async () => {
    const { head, member, familyId } = await setup();
    await add(head, familyId, { expenseDate: "2026-09-30", amount: 100_00 }); // day before
    const first = await add(member, familyId, { expenseDate: "2026-10-01", amount: 250_00 });
    const last = await add(head, familyId, { expenseDate: "2026-10-21", amount: 1_000_00 });

    const r = await searchExpenses(member, familyId, { from: "2026-10-01", to: "2026-10-21" });
    expect(r.expenses.map((e) => e.id)).toEqual([last, first]);
    expect(r).toMatchObject({ count: 2, totalPaise: 1_250_00, page: 1, pages: 1 });
    expect(r.expenses[1]).toMatchObject({ ownerName: "SITA", ownerFormer: false });
  });

  it("filters by member, category (incl. Uncategorised) and payment mode", async () => {
    const { head, member, familyId, groceries, fuel } = await setup();
    const g = await add(member, familyId, { expenseDate: "2026-10-05", amount: 500_00, categoryId: groceries, paymentMode: "UPI" });
    const f = await add(head, familyId, { expenseDate: "2026-10-06", amount: 2_000_00, categoryId: fuel, paymentMode: "CARD" });
    const u = await add(head, familyId, { expenseDate: "2026-10-07", amount: 70_00, paymentMode: "CASH" });

    const ids = async (f: Partial<SearchFilters>) => (await searchExpenses(head, familyId, october(f))).expenses.map((e) => e.id);
    expect(await ids({ memberId: member })).toEqual([g]);
    expect(await ids({ memberId: head })).toEqual([u, f]);
    expect(await ids({ category: groceries })).toEqual([g]);
    expect(await ids({ category: "none" })).toEqual([u]);
    expect(await ids({ mode: "CARD" })).toEqual([f]);
    expect(await ids({ memberId: head, mode: "CASH" })).toEqual([u]);
    expect(await ids({ memberId: member, mode: "CASH" })).toEqual([]);
  });

  it("leaves out deleted expenses and other families", async () => {
    const { head, familyId } = await setup();
    const gone = await add(head, familyId, { expenseDate: "2026-10-10", amount: 300_00 });
    await deleteExpense(head, familyId, gone, TODAY);
    const other = await user("gopal");
    const { id: otherFamily } = await createFamily(other, "Rao family");
    await add(other, otherFamily, { expenseDate: "2026-10-10", amount: 999_00 });

    expect(await searchExpenses(head, familyId, october())).toMatchObject({ count: 0, totalPaise: 0, expenses: [] });
    await expect(searchExpenses(other, familyId, october())).rejects.toThrow(NotAllowedError);
  });

  it("pages by 50; count and total cover every page", async () => {
    const { head, familyId } = await setup();
    const rows = Array.from({ length: PAGE_SIZE + 3 }, (_, i) => ({
      familyId,
      ownerId: head,
      createdBy: head,
      expenseDate: `2026-10-${String((i % 20) + 1).padStart(2, "0")}`,
      amountPaise: 100_00,
    }));
    await db.insert(expenses).values(rows);

    const p1 = await searchExpenses(head, familyId, october());
    expect(p1).toMatchObject({ count: 53, totalPaise: 5_300_00, page: 1, pages: 2 });
    expect(p1.expenses).toHaveLength(50);
    const p2 = await searchExpenses(head, familyId, october(), 2);
    expect(p2.expenses).toHaveLength(3);
    expect(new Set([...p1.expenses, ...p2.expenses].map((e) => e.id)).size).toBe(53); // no repeats across pages
    expect((await searchExpenses(head, familyId, october(), 9)).page).toBe(2); // past the end → last page
  });
});

describe("monthSummary", () => {
  it("totals the month by category, member and payment mode; biggest first", async () => {
    const { head, member, familyId, groceries, fuel } = await setup();
    await add(member, familyId, { expenseDate: "2026-10-02", amount: 500_00, categoryId: groceries, paymentMode: "UPI" });
    await add(member, familyId, { expenseDate: "2026-10-03", amount: 300_00, categoryId: groceries });
    await add(head, familyId, { expenseDate: "2026-10-04", amount: 2_000_00, categoryId: fuel, paymentMode: "UPI" });
    await add(head, familyId, { expenseDate: "2026-10-05", amount: 50_00 });
    await add(head, familyId, { expenseDate: "2026-09-30", amount: 9_999_00 }); // September

    const s = await monthSummary(member, familyId, "2026-10");
    expect(s).toMatchObject({ month: "2026-10", count: 4, totalPaise: 2_850_00 });
    expect(s.byCategory).toEqual([
      { key: fuel, name: "Fuel & transport", count: 1, paise: 2_000_00 },
      { key: groceries, name: "Groceries", count: 2, paise: 800_00 },
      { key: null, name: null, count: 1, paise: 50_00 },
    ]);
    expect(s.byMember).toEqual([
      { key: head, name: "RAVI", count: 2, paise: 2_050_00, former: false },
      { key: member, name: "SITA", count: 2, paise: 800_00, former: false },
    ]);
    expect(s.byMode).toEqual([
      { key: "UPI", name: null, count: 2, paise: 2_500_00 },
      { key: null, name: null, count: 2, paise: 350_00 },
    ]);
    expect(s.expenses.map((e) => e.expenseDate)).toEqual(["2026-10-05", "2026-10-04", "2026-10-03", "2026-10-02"]);
  });

  it("an empty month has zero totals; a former member's expenses still count", async () => {
    const { head, member, familyId } = await setup();
    expect(await monthSummary(head, familyId, "2026-05")).toMatchObject({ count: 0, totalPaise: 0, byCategory: [], expenses: [] });

    await add(member, familyId, { expenseDate: "2026-10-02", amount: 400_00 });
    await leaveFamily(member, familyId);
    const s = await monthSummary(head, familyId, "2026-10");
    expect(s.byMember).toEqual([{ key: member, name: "SITA", count: 1, paise: 400_00, former: true }]);
    expect(s.expenses[0].ownerFormer).toBe(true);
  });
});

describe("familyPeople", () => {
  it("lists current members first, then former ones; never people from other families", async () => {
    const { head, member, familyId } = await setup();
    const other = await user("gopal");
    await createFamily(other, "Rao family");
    await leaveFamily(member, familyId);
    expect(await familyPeople(head, familyId)).toEqual([
      { userId: head, displayName: "RAVI", former: false },
      { userId: member, displayName: "SITA", former: true },
    ]);
  });
});

describe("exportExpenses", () => {
  it("gives every matching expense oldest first (no pages), with the search's filters; deleted ones left out", async () => {
    const { head, member, familyId, groceries } = await setup();
    const late = await add(head, familyId, { expenseDate: "2026-10-09", amount: 300_00, categoryId: groceries });
    const early = await add(member, familyId, { expenseDate: "2026-10-02", amount: 100_00, categoryId: groceries });
    await add(member, familyId, { expenseDate: "2026-10-05", amount: 200_00 }); // other category
    const gone = await add(head, familyId, { expenseDate: "2026-10-03", amount: 999_00, categoryId: groceries });
    await deleteExpense(head, familyId, gone, TODAY);

    expect((await exportExpenses(member, familyId, october({ category: groceries }))).map((e) => e.id)).toEqual([early, late]);
    expect(await exportExpenses(head, familyId, october())).toHaveLength(3);
  });

  it("only for members of the family", async () => {
    const { familyId } = await setup();
    const outsider = await user("arun");
    await expect(exportExpenses(outsider, familyId, october())).rejects.toBeInstanceOf(NotAllowedError);
  });

  it("exportHref keeps the filled-in fields only", () => {
    expect(exportHref("f-1", { from: "2026-10-01", to: "2026-10-21", member: "", category: "none", mode: "" })).toBe(
      "/export/expenses?family=f-1&from=2026-10-01&to=2026-10-21&category=none",
    );
  });
});

describe("monthTrend", () => {
  it("totals the 6 months ending with the given one, oldest first, empty months at 0; deleted and other families left out", async () => {
    const { head, member, familyId } = await setup();
    await add(head, familyId, { expenseDate: "2026-08-31", amount: 100_00 });
    await add(member, familyId, { expenseDate: "2026-10-01", amount: 250_00 });
    await add(head, familyId, { expenseDate: "2026-10-21", amount: 1_000_00 });
    const gone = await add(head, familyId, { expenseDate: "2026-10-05", amount: 999_00 });
    await deleteExpense(head, familyId, gone, TODAY);
    const other = await user("gopal");
    const { id: otherFamily } = await createFamily(other, "Rao family");
    await addExpense(other, otherFamily, { expenseDate: "2026-10-02", amount: 777_00, note: undefined }, TODAY);

    expect(await monthTrend(member, familyId, "2026-10")).toEqual([
      { month: "2026-05", paise: 0, count: 0 },
      { month: "2026-06", paise: 0, count: 0 },
      { month: "2026-07", paise: 0, count: 0 },
      { month: "2026-08", paise: 100_00, count: 1 },
      { month: "2026-09", paise: 0, count: 0 },
      { month: "2026-10", paise: 1_250_00, count: 2 },
    ]);
    expect((await monthTrend(head, familyId, "2026-01", 3)).map((m) => m.month)).toEqual(["2025-11", "2025-12", "2026-01"]);
  });

  it("only for members of the family", async () => {
    const { familyId } = await setup();
    const outsider = await user("arun");
    await expect(monthTrend(outsider, familyId, "2026-10")).rejects.toBeInstanceOf(NotAllowedError);
  });
});
