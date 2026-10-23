import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { auditLog, expenses } from "@/server/db/schema";
import { resetDatabase } from "@/test/db";
import type { ExpenseInput } from "@/lib/validation/expense";
import { registerUser } from "./accounts";
import { bookForMonth, familySharing, personalBookId, setSharing, sharingFor, wouldMove } from "./books";
import { addCategory, listCategories } from "./categories";
import { addExpense, addMyExpense, entriesForDay, expenseBookFor, getExpense, updateExpense } from "./expenses";
import {
  createFamily,
  createMemberLogin,
  decideJoinRequest,
  leaveFamily,
  myBooks,
  myFamilies,
  NotAllowedError,
  pendingRequests,
  regenerateJoinCode,
  requestToJoin,
} from "./families";
import { exportExpenses, monthSummary, monthTrend, searchExpenses } from "./reports";

// M8 (DESIGN §3.8): My expenses for everyone, and month-by-month sharing with one family.

const TODAY = "2026-10-21"; // personal window (head): 1 Aug – 21 Oct
const questions = { question1: "first_school" as const, answer1: "zp", question2: "first_pet" as const, answer2: "tom" };

async function user(username: string) {
  const r = await registerUser({ username, displayName: username.toUpperCase(), password: "secret123", ...questions });
  if (!r.ok) throw new Error("registration failed");
  return r.userId;
}

/** Ravi heads Kumar family; Sita joins without sharing (the default). */
async function setup() {
  const head = await user("ravi");
  const member = await user("sita");
  const { id: familyId, joinCode } = await createFamily(head, "Kumar family", undefined, { today: TODAY });
  await requestToJoin(member, joinCode);
  const [req] = await pendingRequests(head, familyId);
  await decideJoinRequest(head, familyId, req.id, true, TODAY);
  return { head, member, familyId, joinCode, personal: await personalBookId(member) };
}

const input = (over: Partial<ExpenseInput> = {}): ExpenseInput => ({ expenseDate: TODAY, amount: 10000, note: undefined, ...over });

async function mine(userId: string, over: Partial<ExpenseInput> = {}) {
  const r = await addMyExpense(userId, input(over), TODAY);
  if (!r.ok) throw new Error(`add failed: ${r.reason}`);
  return r.id;
}

const bookOf = async (id: string) => (await db.query.expenses.findFirst({ where: eq(expenses.id, id) }))!.familyId;

beforeEach(resetDatabase);

describe("personal book", () => {
  it("every new account gets My expenses with the default categories, owned as head", async () => {
    const id = await user("ravi");
    const books = await myBooks(id);
    expect(books).toHaveLength(1);
    expect(books[0]).toMatchObject({ familyName: "My expenses", kind: "PERSONAL", role: "HEAD" });
    expect(await listCategories(id, books[0].familyId)).toHaveLength(17);
    expect(await myFamilies(id)).toEqual([]);
  });

  it("is listed before the families, and never counts as a family", async () => {
    const { member, familyId } = await setup();
    const books = await myBooks(member);
    expect(books.map((b) => b.kind)).toEqual(["PERSONAL", "FAMILY"]);
    expect((await myFamilies(member)).map((f) => f.familyId)).toEqual([familyId]);
  });

  it("has no family features: codes, member logins, leaving", async () => {
    const id = await user("ravi");
    const personal = await personalBookId(id);
    await expect(regenerateJoinCode(id, personal)).rejects.toBeInstanceOf(NotAllowedError);
    await expect(createMemberLogin(id, personal, { username: "kiran", displayName: "K", tempPassword: "temp1234" })).rejects.toBeInstanceOf(
      NotAllowedError,
    );
    await expect(leaveFamily(id, personal)).rejects.toBeInstanceOf(NotAllowedError);
  });

  it("head-created logins get their own book too", async () => {
    const { head, familyId } = await setup();
    const r = await createMemberLogin(head, familyId, { username: "kiran", displayName: "Kiran", tempPassword: "temp1234" }, TODAY);
    if (!r.ok) throw new Error("login not created");
    expect((await myBooks(r.userId)).map((b) => b.kind)).toEqual(["PERSONAL", "FAMILY"]);
    expect((await sharingFor(r.userId, "2026-10")).familyId).toBeNull(); // unticked = personal only
  });
});

describe("where an expense goes", () => {
  it("personal only by default: the family sees nothing of it", async () => {
    const { head, member, familyId, personal } = await setup();
    const id = await mine(member);
    expect(await bookOf(id)).toBe(personal);
    expect((await monthSummary(head, familyId, "2026-10")).count).toBe(0);
    expect(await expenseBookFor(head, id)).toBeNull(); // the head can't open it
  });

  it("after including, new expenses of that month go to the family", async () => {
    const { head, member, familyId } = await setup();
    await setSharing(member, familyId, TODAY);
    const id = await mine(member);
    expect(await bookOf(id)).toBe(familyId);
    expect((await monthSummary(head, familyId, "2026-10")).count).toBe(1);
  });

  it("the date's month decides: an earlier personal month stays personal", async () => {
    const { member, familyId, personal } = await setup();
    await setSharing(member, familyId, TODAY);
    expect(await bookOf(await mine(member, { expenseDate: "2026-09-30" }))).toBe(personal);
    expect(await bookForMonth(member, "2026-09")).toBe(personal);
    expect(await bookForMonth(member, "2026-10")).toBe(familyId);
  });

  it("adding straight into the wrong book is refused", async () => {
    const { member, familyId } = await setup();
    expect(await addExpense(member, familyId, input(), TODAY)).toEqual({ ok: false, reason: "other_book", month: "2026-10" });
  });

  it("the day list shows my entries from every book", async () => {
    const { member, familyId } = await setup();
    await mine(member, { amount: 1000 });
    await setSharing(member, familyId, TODAY); // moves the first one too
    await mine(member, { amount: 2000 });
    const day = await entriesForDay(member, TODAY);
    expect(day.map((e) => [e.amountPaise, e.bookName])).toEqual([
      [1000, "Kumar family"],
      [2000, "Kumar family"],
    ]);
  });

  it("an edit into a month kept in another book is refused (nothing moves silently)", async () => {
    const { member, familyId } = await setup();
    await setSharing(member, familyId, TODAY);
    const id = await mine(member, { expenseDate: "2026-10-02" });
    expect(await updateExpense(member, familyId, id, input({ expenseDate: "2026-09-30" }), "2026-10-04")).toEqual({
      ok: false,
      reason: "other_book",
      month: "2026-09",
    });
    expect((await updateExpense(member, familyId, id, input({ expenseDate: "2026-10-03" }), "2026-10-04")).ok).toBe(true);
  });
});

describe("switching", () => {
  it("including moves this month's expenses into the family, not earlier months", async () => {
    const { head, member, familyId, personal } = await setup();
    const october = await mine(member, { amount: 1500 });
    const september = await mine(member, { expenseDate: "2026-09-10" });
    expect(await wouldMove(member, familyId, TODAY)).toEqual({ moved: 1, paise: 1500 });

    expect(await setSharing(member, familyId, TODAY)).toEqual({ moved: 1, paise: 1500 });
    expect(await bookOf(october)).toBe(familyId);
    expect(await bookOf(september)).toBe(personal);
    expect((await getExpense(head, familyId, october, TODAY))?.expense.ownerId).toBe(member);
    const logs = await db.select().from(auditLog).where(and(eq(auditLog.entityId, october), eq(auditLog.action, "EXPENSE_MOVED")));
    expect(logs.map((l) => l.familyId).sort()).toEqual([familyId, personal].sort());
  });

  it("stopping moves them back to My expenses", async () => {
    const { head, member, familyId, personal } = await setup();
    await setSharing(member, familyId, TODAY);
    const id = await mine(member);
    await setSharing(member, null, TODAY);
    expect(await bookOf(id)).toBe(personal);
    expect((await monthSummary(head, familyId, "2026-10")).count).toBe(0);
    expect(await sharingFor(member, "2026-10")).toEqual({ familyId: null, since: "2026-10" });
  });

  it("categories follow by name; a family-only category is copied into My expenses", async () => {
    const { head, member, familyId, personal } = await setup();
    await addCategory(head, familyId, "School fees");
    const familyCats = await listCategories(member, familyId);
    await setSharing(member, familyId, TODAY);
    const groceries = await mine(member, { categoryId: familyCats.find((c) => c.name === "Groceries")!.id });
    const school = await mine(member, { categoryId: familyCats.find((c) => c.name === "School fees")!.id });

    await setSharing(member, null, TODAY);
    const personalCats = await listCategories(member, personal);
    const byId = new Map(personalCats.map((c) => [c.id, c.name]));
    const row = async (id: string) => (await db.query.expenses.findFirst({ where: eq(expenses.id, id) }))!;
    expect(byId.get((await row(groceries)).categoryId!)).toBe("Groceries");
    expect(byId.get((await row(school)).categoryId!)).toBe("School fees");
  });

  it("into a family without that category it becomes Uncategorised", async () => {
    const { member, familyId, personal } = await setup();
    await addCategory(member, personal, "Gym");
    const gym = (await listCategories(member, personal)).find((c) => c.name === "Gym")!.id;
    const id = await mine(member, { categoryId: gym });
    await setSharing(member, familyId, TODAY);
    expect((await db.query.expenses.findFirst({ where: eq(expenses.id, id) }))!.categoryId).toBeNull();
  });

  it("one family at a time: including B switches A off and moves A's expenses to B", async () => {
    const { member, familyId } = await setup();
    const other = await user("rao");
    const b = await createFamily(other, "Rao family", undefined, { today: TODAY });
    await requestToJoin(member, b.joinCode);
    const [req] = await pendingRequests(other, b.id);
    await decideJoinRequest(other, b.id, req.id, true, TODAY);

    await setSharing(member, familyId, TODAY);
    const id = await mine(member);
    await setSharing(member, b.id, TODAY);
    expect(await bookOf(id)).toBe(b.id);
    expect((await sharingFor(member, "2026-10")).familyId).toBe(b.id);
  });

  it("only into a family the person is in", async () => {
    const { familyId } = await setup();
    const stranger = await user("ghost");
    await expect(setSharing(stranger, familyId, TODAY)).rejects.toBeInstanceOf(NotAllowedError);
    await expect(setSharing(stranger, await personalBookId(stranger), TODAY)).rejects.toBeInstanceOf(NotAllowedError);
  });

  it("the members list labels who shares (another family's name is never shown)", async () => {
    const { head, member, familyId } = await setup();
    await setSharing(head, familyId, TODAY);
    const labels = await familySharing(familyId, TODAY);
    expect(labels.get(head)).toEqual({ familyId, since: "2026-10" });
    expect(labels.get(member)).toEqual({ familyId: null, since: null });
  });
});

describe("My expenses reports: all of my own expenses (P8)", () => {
  /** Sita: Sept in My expenses, Oct shared with Kumar family; Ravi's own expense must never show up. */
  async function sitaWithBoth() {
    const s = await setup();
    const familyCats = await listCategories(s.member, s.familyId);
    const myCats = await listCategories(s.member, s.personal);
    const id = (cats: { id: string; name: string }[], name: string) => cats.find((c) => c.name === name)!.id;
    await mine(s.member, { expenseDate: "2026-09-12", amount: 30000, categoryId: id(myCats, "Groceries") });
    await mine(s.member, { amount: 1000, categoryId: id(myCats, "Groceries") });
    await setSharing(s.member, s.familyId, TODAY); // the 1000 moves to the family
    await mine(s.member, { amount: 2000, categoryId: id(familyCats, "Groceries") });
    await mine(s.member, { amount: 500 });
    await setSharing(s.head, s.familyId, TODAY);
    await mine(s.head, { amount: 99900 });
    return { ...s, myGroceries: id(myCats, "Groceries") };
  }

  it("the month covers what I shared with the family, grouped by category name, with a Where breakdown", async () => {
    const { member, personal, myGroceries } = await sitaWithBoth();
    const s = await monthSummary(member, personal, "2026-10");
    expect(s.totalPaise).toBe(3500);
    expect(s.byCategory.map((g) => [g.key, g.name, g.paise])).toEqual([
      [myGroceries, "Groceries", 3000],
      [null, null, 500],
    ]);
    expect(s.byBook.map((g) => [g.name, g.paise])).toEqual([["Kumar family", 3500]]);
    expect(s.byMember).toEqual([]);
    expect(s.expenses.every((e) => e.bookName === "Kumar family")).toBe(true);
  });

  it("the trend has both months; search by my category finds it in every book", async () => {
    const { member, personal, myGroceries } = await sitaWithBoth();
    const trend = await monthTrend(member, personal, "2026-10", 2);
    expect(trend.map((t) => [t.month, t.paise])).toEqual([
      ["2026-09", 30000],
      ["2026-10", 3500],
    ]);
    const found = await searchExpenses(member, personal, { from: "2026-09-01", to: TODAY, category: myGroceries });
    expect([found.count, found.totalPaise]).toEqual([3, 33000]);
    const csv = await exportExpenses(member, personal, { from: "2026-09-01", to: TODAY });
    expect(csv.map((e) => e.bookName)).toEqual(["My expenses", "Kumar family", "Kumar family", "Kumar family"]);
  });

  it("the family's reports are unchanged: only what is in the family", async () => {
    const { head, familyId } = await sitaWithBoth();
    const s = await monthSummary(head, familyId, "2026-10");
    expect(s.totalPaise).toBe(3500 + 99900);
    expect(s.byBook).toEqual([]);
  });

  it("nobody else can read my My expenses", async () => {
    const { head, personal } = await sitaWithBoth();
    await expect(monthSummary(head, personal, "2026-10")).rejects.toBeInstanceOf(NotAllowedError);
  });

  it("a family I left drops out of My expenses (its expenses stay with the family)", async () => {
    const { member, familyId, personal } = await sitaWithBoth();
    await leaveFamily(member, familyId, TODAY);
    expect((await monthSummary(member, personal, "2026-10")).totalPaise).toBe(0);
    expect((await monthSummary(member, personal, "2026-09")).totalPaise).toBe(30000);
  });
});

describe("checkboxes, leaving and re-joining", () => {
  it("creating a family with the box ticked shares from this month", async () => {
    const head = await user("ravi");
    const { id } = await createFamily(head, "Kumar family", undefined, { includeExpenses: true, today: TODAY });
    expect(await sharingFor(head, "2026-10")).toEqual({ familyId: id, since: "2026-10" });
  });

  it("a ticked join request shares from the approval month and moves that month's expenses", async () => {
    const head = await user("ravi");
    const member = await user("sita");
    const { id: familyId, joinCode } = await createFamily(head, "Kumar family", undefined, { today: TODAY });
    const before = await mine(member);
    await requestToJoin(member, joinCode, true);
    expect((await sharingFor(member, "2026-10")).familyId).toBeNull(); // not until approved
    const [req] = await pendingRequests(head, familyId);
    await decideJoinRequest(head, familyId, req.id, true, TODAY);
    expect((await sharingFor(member, "2026-10")).familyId).toBe(familyId);
    expect(await bookOf(before)).toBe(familyId);
  });

  it("leaving keeps past expenses in the family; later ones are personal, also after re-joining", async () => {
    const { head, member, familyId, joinCode, personal } = await setup();
    await setSharing(member, familyId, TODAY);
    const kept = await mine(member);
    await leaveFamily(member, familyId, TODAY);
    expect(await bookOf(kept)).toBe(familyId); // F9
    expect(await bookForMonth(member, "2026-10")).toBe(personal);

    await requestToJoin(member, joinCode); // unticked this time
    const [req] = await pendingRequests(head, familyId);
    await decideJoinRequest(head, familyId, req.id, true, TODAY);
    expect(await bookForMonth(member, "2026-10")).toBe(personal);
  });
});
