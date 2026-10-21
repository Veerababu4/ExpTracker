import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { auditLog, expenses, receipts } from "@/server/db/schema";
import { resetDatabase } from "@/test/db";
import { MAX_RECEIPT_BYTES } from "@/lib/rules/receipts";
import type { ExpenseInput } from "@/lib/validation/expense";
import { registerUser } from "./accounts";
import { addExpense, deleteExpense, expenseHistory, getExpense } from "./expenses";
import { createFamily, decideJoinRequest, NotAllowedError, pendingRequests, removeMember, requestToJoin } from "./families";
import { attachReceipt, receiptFile, receiptUsage, removeReceipt, setReceiptsEnabled, uploadState } from "./receipts";

const TODAY = "2026-10-21"; // member window: 1–21 Oct; head window: 1 Aug – 21 Oct

const questions = { question1: "first_school" as const, answer1: "zp", question2: "first_pet" as const, answer2: "tom" };

const jpeg = (size = 1000) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(size - 4, 1)]);
const pdf = (size = 1000) => Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(size - 9, 32)]);

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
  return { head, member, familyId };
}

const input = (over: Partial<ExpenseInput> = {}): ExpenseInput => ({ expenseDate: TODAY, amount: 250000, note: undefined, ...over });

async function added(actor: string, familyId: string, receipt?: Buffer, over: Partial<ExpenseInput> = {}) {
  const r = await addExpense(actor, familyId, input(over), TODAY, { receipt });
  if (!r.ok) throw new Error(`add failed: ${r.reason}`);
  return r.id;
}

async function receiptOf(viewer: string, familyId: string, expenseId: string) {
  return (await getExpense(viewer, familyId, expenseId, TODAY))!.expense.receipt;
}

const admin = { id: "", username: "ravi" };

beforeEach(async () => {
  await resetDatabase();
  process.env.ADMIN_USERNAMES = "ravi";
});
afterAll(() => {
  delete process.env.ADMIN_USERNAMES;
});

describe("adding with an expense", () => {
  it("saves the receipt with the expense; family members can open it", async () => {
    const { head, member, familyId } = await setup();
    const id = await added(member, familyId, jpeg(1234));
    const receipt = await receiptOf(head, familyId, id);
    expect(receipt).toMatchObject({ contentType: "image/jpeg", sizeBytes: 1234 });

    const file = await receiptFile(head, receipt!.id);
    expect(file).toMatchObject({ contentType: "image/jpeg", expenseDate: TODAY });
    expect(file!.data.equals(jpeg(1234))).toBe(true);

    const [log] = await expenseHistory(head, familyId, id);
    expect(log).toMatchObject({ action: "EXPENSE_ADDED", receipt: { contentType: "image/jpeg", sizeBytes: 1234 } });
  });

  it("checks the real file type, not the name — and then saves nothing at all", async () => {
    const { member, familyId } = await setup();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(await addExpense(member, familyId, input(), TODAY, { receipt: svg })).toEqual({ ok: false, reason: "bad_file" });
    expect(await db.select().from(expenses)).toHaveLength(0);
  });

  it("refuses files over 2 MB", async () => {
    const { member, familyId } = await setup();
    const r = await addExpense(member, familyId, input(), TODAY, { receipt: jpeg(MAX_RECEIPT_BYTES + 1) });
    expect(r).toEqual({ ok: false, reason: "too_big" });
    expect(await added(member, familyId, pdf(MAX_RECEIPT_BYTES))).toBeTruthy(); // exactly 2 MB is fine
  });

  it("an expense without a receipt has none", async () => {
    const { member, familyId } = await setup();
    const id = await added(member, familyId);
    expect(await receiptOf(member, familyId, id)).toBeNull();
  });
});

describe("who can see a receipt", () => {
  it("nobody outside the family, and not a removed member", async () => {
    const { head, member, familyId } = await setup();
    const id = await added(head, familyId, jpeg());
    const receiptId = (await receiptOf(head, familyId, id))!.id;

    const stranger = await user("gopal");
    await createFamily(stranger, "Rao family");
    expect(await receiptFile(stranger, receiptId)).toBeNull();
    expect(await receiptFile(member, receiptId)).not.toBeNull();

    await removeMember(head, familyId, member);
    expect(await receiptFile(member, receiptId)).toBeNull();
  });

  it("unknown ids find nothing", async () => {
    const { head } = await setup();
    expect(await receiptFile(head, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});

describe("adding, replacing and removing later", () => {
  it("follows the expense rules: members only their own, the head anyone's", async () => {
    const { head, member, familyId } = await setup();
    const headsExpense = await added(head, familyId);
    const sitasExpense = await added(member, familyId);

    await expect(attachReceipt(member, familyId, headsExpense, jpeg(), TODAY)).rejects.toThrow(NotAllowedError);
    expect(await attachReceipt(member, familyId, sitasExpense, jpeg(), TODAY)).toEqual({ ok: true });
    expect(await attachReceipt(head, familyId, sitasExpense, pdf(), TODAY)).toEqual({ ok: true });
    expect(await receiptOf(member, familyId, sitasExpense)).toMatchObject({ contentType: "application/pdf" });
  });

  it("only inside the person's date window", async () => {
    const { head, member, familyId } = await setup();
    const id = await added(member, familyId, undefined, { expenseDate: "2026-10-01" });
    // On 3 Nov a member may only change 28 Oct – 3 Nov; the head still may (1 Sep – 3 Nov).
    const later = "2026-11-03";
    expect(await attachReceipt(member, familyId, id, jpeg(), later)).toMatchObject({ ok: false, reason: "outside_window" });
    expect(await removeReceipt(member, familyId, id, later)).toMatchObject({ ok: false, reason: "outside_window" });
    expect(await attachReceipt(head, familyId, id, jpeg(), later)).toEqual({ ok: true });
  });

  it("replacing gives the receipt a new id and logs it; removing frees the space", async () => {
    const { head, member, familyId } = await setup();
    const id = await added(member, familyId, jpeg(1000));
    const first = (await receiptOf(member, familyId, id))!.id;

    await attachReceipt(member, familyId, id, pdf(3000), TODAY);
    const second = (await receiptOf(member, familyId, id))!;
    expect(second.id).not.toBe(first);
    expect(await receiptFile(member, first)).toBeNull();
    expect(await db.select().from(receipts)).toHaveLength(1);

    expect(await removeReceipt(member, familyId, id, TODAY)).toEqual({ ok: true });
    expect(await receiptOf(member, familyId, id)).toBeNull();
    expect((await receiptUsage(admin)).usedBytes).toBe(0);

    const actions = (await expenseHistory(head, familyId, id)).map((h) => h.action);
    expect(actions).toEqual(expect.arrayContaining(["EXPENSE_ADDED", "RECEIPT_REPLACED", "RECEIPT_REMOVED"]));
  });

  it("an unknown or deleted expense is not found", async () => {
    const { member, familyId } = await setup();
    const id = await added(member, familyId);
    await deleteExpense(member, familyId, id, TODAY);
    expect(await attachReceipt(member, familyId, id, jpeg(), TODAY)).toEqual({ ok: false, reason: "not_found" });
  });

  it("deleting an expense removes its receipt for good", async () => {
    const { member, familyId } = await setup();
    const id = await added(member, familyId, jpeg(500));
    const receiptId = (await receiptOf(member, familyId, id))!.id;
    await deleteExpense(member, familyId, id, TODAY);
    expect(await receiptFile(member, receiptId)).toBeNull();
    expect(await db.select().from(receipts)).toHaveLength(0);
    const [log] = await db.select().from(auditLog).where(eq(auditLog.action, "EXPENSE_DELETED"));
    expect(log.details).toMatchObject({ receipt: { contentType: "image/jpeg", sizeBytes: 500 } });
  });
});

describe("space limit", () => {
  it("refuses a receipt that doesn't fit; replacing counts only the new file", async () => {
    const { member, familyId } = await setup();
    const cap = 2500;
    const first = await addExpense(member, familyId, input(), TODAY, { receipt: jpeg(2000), capBytes: cap });
    expect(first.ok).toBe(true);
    const second = await addExpense(member, familyId, input(), TODAY, { receipt: jpeg(1000), capBytes: cap });
    expect(second).toEqual({ ok: false, reason: "storage_full" });
    // Replacing the 2000-byte receipt with a 2500-byte one fits, because the old one goes.
    const id = (first as { id: string }).id;
    expect(await attachReceipt(member, familyId, id, jpeg(2500), TODAY, cap)).toEqual({ ok: true });
    expect(await uploadState(cap)).toBe("full");
    expect(await uploadState()).toBe("on");
  });
});

describe("site admin", () => {
  it("can turn new receipts off; saved ones can still be opened and removed", async () => {
    const { head, member, familyId } = await setup();
    const id = await added(member, familyId, jpeg());
    const receiptId = (await receiptOf(member, familyId, id))!.id;

    await setReceiptsEnabled({ id: head, username: "ravi" }, false);
    expect(await uploadState()).toBe("off");
    expect(await addExpense(member, familyId, input(), TODAY, { receipt: jpeg() })).toEqual({ ok: false, reason: "receipts_off" });
    expect(await attachReceipt(member, familyId, id, jpeg(), TODAY)).toEqual({ ok: false, reason: "receipts_off" });
    expect(await receiptFile(member, receiptId)).not.toBeNull();
    expect(await removeReceipt(member, familyId, id, TODAY)).toEqual({ ok: true });

    await setReceiptsEnabled({ id: head, username: "ravi" }, true);
    expect(await uploadState()).toBe("on");
    const actions = (await db.select().from(auditLog).where(eq(auditLog.entityType, "setting"))).map((r) => r.action);
    expect(actions.sort()).toEqual(["RECEIPTS_TURNED_OFF", "RECEIPTS_TURNED_ON"]);
  });

  it("sees space per family (sizes only) and the database size", async () => {
    const { head, member, familyId } = await setup();
    await added(member, familyId, jpeg(1000));
    await added(head, familyId, pdf(3000));
    const usage = await receiptUsage({ id: head, username: "ravi" });
    expect(usage).toMatchObject({ enabled: true, usedBytes: 4000, count: 2, capBytes: 500 * 1024 * 1024 });
    expect(usage.byFamily).toEqual([{ familyId, familyName: "Kumar family", count: 2, bytes: 4000 }]);
    expect(usage.databaseBytes).toBeGreaterThan(0);
  });

  it("is only who ADMIN_USERNAMES lists — a family head is not enough", async () => {
    const { member } = await setup();
    await expect(setReceiptsEnabled({ id: member, username: "sita" }, false)).rejects.toThrow(NotAllowedError);
    await expect(receiptUsage({ id: member, username: "sita" })).rejects.toThrow(NotAllowedError);
    process.env.ADMIN_USERNAMES = " Gopal , SITA ";
    await expect(receiptUsage({ id: member, username: "sita" })).resolves.toBeTruthy();
  });
});
