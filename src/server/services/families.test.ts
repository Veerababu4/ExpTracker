import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { auditLog, familyMembers } from "@/server/db/schema";
import { resetDatabase } from "@/test/db";
import { isJoinCode } from "@/lib/rules/join-code";
import { activeSessionCount, checkLogin, createSession, findSessionUser, registerUser } from "./accounts";
import {
  cancelJoinRequest,
  createFamily,
  createMemberLogin,
  decideJoinRequest,
  getRole,
  leaveFamily,
  listMembers,
  myFamilies,
  myJoinRequests,
  NotAllowedError,
  pendingRequests,
  pickActiveFamily,
  regenerateJoinCode,
  removeMember,
  requestToJoin,
  resetMemberPassword,
  switchFamily,
  transferHead,
} from "./families";

const questions = { question1: "first_school" as const, answer1: "zp", question2: "first_pet" as const, answer2: "tom" };

async function user(username: string) {
  const r = await registerUser({ username, displayName: username.toUpperCase(), password: "secret123", ...questions });
  if (!r.ok) throw new Error("registration failed");
  return r.userId;
}

/** Family with head "ravi" and an approved member "sita". */
async function familyWithMember() {
  const head = await user("ravi");
  const member = await user("sita");
  const family = await createFamily(head, "Kumar family");
  await requestToJoin(member, family.joinCode);
  const [req] = await pendingRequests(head, family.id);
  await decideJoinRequest(head, family.id, req.id, true);
  return { head, member, familyId: family.id, joinCode: family.joinCode };
}

beforeEach(resetDatabase);

describe("creating a family", () => {
  it("makes the creator the head and gives a valid join code", async () => {
    const head = await user("ravi");
    const family = await createFamily(head, "Kumar family");
    expect(isJoinCode(family.joinCode)).toBe(true);
    expect(await getRole(head, family.id)).toBe("HEAD");
    const audit = await db.select().from(auditLog).where(eq(auditLog.familyId, family.id));
    expect(audit.map((a) => a.action)).toEqual(["FAMILY_CREATED"]);
  });

  it("only the head can change the join code", async () => {
    const { head, member, familyId, joinCode } = await familyWithMember();
    await expect(regenerateJoinCode(member, familyId)).rejects.toBeInstanceOf(NotAllowedError);
    const newCode = await regenerateJoinCode(head, familyId);
    expect(newCode).not.toBe(joinCode);
    const outsider = await user("ghost");
    expect(await requestToJoin(outsider, joinCode)).toEqual({ ok: false, reason: "invalid_code" });
    expect((await requestToJoin(outsider, newCode)).ok).toBe(true);
  });
});

describe("joining", () => {
  it("request → pending → approved makes an active member", async () => {
    const head = await user("ravi");
    const sita = await user("sita");
    const family = await createFamily(head, "Kumar family");

    expect(await requestToJoin(sita, family.joinCode)).toEqual({ ok: true, familyName: "Kumar family" });
    expect(await requestToJoin(sita, family.joinCode)).toEqual({ ok: false, reason: "already_pending" });
    expect(await getRole(sita, family.id)).toBeNull();

    const pending = await pendingRequests(head, family.id);
    expect(pending.map((p) => p.username)).toEqual(["sita"]);
    expect(await decideJoinRequest(head, family.id, pending[0].id, true)).toBe(true);
    expect(await decideJoinRequest(head, family.id, pending[0].id, false)).toBe(false); // already decided
    expect(await getRole(sita, family.id)).toBe("MEMBER");
    expect(await requestToJoin(sita, family.joinCode)).toEqual({ ok: false, reason: "already_member" });
  });

  it("a rejected user can ask again; a pending request can be cancelled", async () => {
    const head = await user("ravi");
    const sita = await user("sita");
    const family = await createFamily(head, "Kumar family");
    await requestToJoin(sita, family.joinCode);
    const [first] = await pendingRequests(head, family.id);
    await decideJoinRequest(head, family.id, first.id, false);
    expect(await getRole(sita, family.id)).toBeNull();

    expect((await requestToJoin(sita, family.joinCode)).ok).toBe(true);
    const [second] = await pendingRequests(head, family.id);
    expect(await cancelJoinRequest(sita, second.id)).toBe(true);
    expect(await pendingRequests(head, family.id)).toEqual([]);
    expect((await myJoinRequests(sita)).map((r) => r.status)).toEqual(["CANCELLED", "REJECTED"]);
  });

  it("members can't see or decide requests", async () => {
    const { member, familyId } = await familyWithMember();
    await expect(pendingRequests(member, familyId)).rejects.toBeInstanceOf(NotAllowedError);
  });

  it("someone can't cancel another person's request", async () => {
    const head = await user("ravi");
    const sita = await user("sita");
    const family = await createFamily(head, "Kumar family");
    await requestToJoin(sita, family.joinCode);
    const [req] = await pendingRequests(head, family.id);
    expect(await cancelJoinRequest(head, req.id)).toBe(false);
  });
});

describe("several families (F7)", () => {
  it("a user can belong to two families and switch between them", async () => {
    const sita = await user("sita");
    await createFamily(sita, "Parents");
    const ravi = await user("ravi");
    const own = await createFamily(ravi, "Ravi & Sita");
    await requestToJoin(sita, own.joinCode);
    const [req] = await pendingRequests(ravi, own.id);
    await decideJoinRequest(ravi, own.id, req.id, true);

    const memberships = await myFamilies(sita);
    expect(memberships.map((m) => [m.familyName, m.role])).toEqual([
      ["Parents", "HEAD"],
      ["Ravi & Sita", "MEMBER"],
    ]);

    const { token } = await createSession(sita);
    const session = await findSessionUser(token);
    await switchFamily(sita, own.id, session!.sessionId);
    const after = await findSessionUser(token);
    expect(pickActiveFamily(memberships, after!.activeFamilyId, after!.lastFamilyId)?.familyName).toBe("Ravi & Sita");

    const stranger = await user("ghost");
    await expect(switchFamily(stranger, own.id, session!.sessionId)).rejects.toBeInstanceOf(NotAllowedError);
  });

  it("pickActiveFamily falls back to the last used, then the oldest family", () => {
    const m = (id: string) => ({ familyId: id, familyName: id, role: "MEMBER" as const, joinedAt: new Date() });
    const list = [m("a"), m("b")];
    expect(pickActiveFamily(list, "gone", "b")?.familyId).toBe("b");
    expect(pickActiveFamily(list, null, null)?.familyId).toBe("a");
    expect(pickActiveFamily([], "a", "b")).toBeNull();
  });
});

describe("head-managed logins", () => {
  it("head creates a login that must change its password at first login", async () => {
    const head = await user("ravi");
    const family = await createFamily(head, "Kumar family");
    const r = await createMemberLogin(head, family.id, { username: "kiran", displayName: "Kiran", tempPassword: "temp1234" });
    expect(r.ok).toBe(true);
    expect(await checkLogin("kiran", "temp1234")).toMatchObject({ ok: true, mustChangePassword: true });
    expect((await listMembers(family.id)).map((m) => [m.username, m.role])).toEqual([
      ["ravi", "HEAD"],
      ["kiran", "MEMBER"],
    ]);
    expect(await createMemberLogin(head, family.id, { username: "kiran", displayName: "K2", tempPassword: "temp1234" })).toEqual({
      ok: false,
      reason: "username_taken",
    });
  });

  it("members can't create logins", async () => {
    const { member, familyId } = await familyWithMember();
    await expect(
      createMemberLogin(member, familyId, { username: "kiran", displayName: "Kiran", tempPassword: "temp1234" }),
    ).rejects.toBeInstanceOf(NotAllowedError);
  });

  it("head resets a member's password: temporary, signed out everywhere, lock cleared", async () => {
    const { head, member, familyId } = await familyWithMember();
    await createSession(member);
    for (let i = 0; i < 5; i++) await checkLogin("sita", "wrong-pass1"); // locked
    await resetMemberPassword(head, familyId, member, "fresh1234");
    expect(await activeSessionCount(member)).toBe(0);
    expect(await checkLogin("sita", "fresh1234")).toMatchObject({ ok: true, mustChangePassword: true });
  });

  it("password reset only for this family's members, and not the head's own", async () => {
    const { head, member, familyId } = await familyWithMember();
    const outsider = await user("ghost");
    await expect(resetMemberPassword(head, familyId, outsider, "fresh1234")).rejects.toBeInstanceOf(NotAllowedError);
    await expect(resetMemberPassword(head, familyId, head, "fresh1234")).rejects.toBeInstanceOf(NotAllowedError);
    await expect(resetMemberPassword(member, familyId, head, "fresh1234")).rejects.toBeInstanceOf(NotAllowedError);
  });
});

describe("roles and leaving", () => {
  it("transferring head swaps roles; there is always exactly one head", async () => {
    const { head, member, familyId } = await familyWithMember();
    await transferHead(head, familyId, member);
    expect(await getRole(member, familyId)).toBe("HEAD");
    expect(await getRole(head, familyId)).toBe("MEMBER");
    await expect(transferHead(head, familyId, member)).rejects.toBeInstanceOf(NotAllowedError); // no longer head

    const heads = await db
      .select()
      .from(familyMembers)
      .where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.role, "HEAD")));
    expect(heads).toHaveLength(1);
  });

  it("the database refuses a second head even if code tried", async () => {
    const { member, familyId } = await familyWithMember();
    await expect(
      db
        .update(familyMembers)
        .set({ role: "HEAD" })
        .where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, member))),
    ).rejects.toThrow();
  });

  it("head removes a member; the member can ask to join again", async () => {
    const { head, member, familyId, joinCode } = await familyWithMember();
    await expect(removeMember(member, familyId, head)).rejects.toBeInstanceOf(NotAllowedError);
    await expect(removeMember(head, familyId, head)).rejects.toBeInstanceOf(NotAllowedError);
    await removeMember(head, familyId, member);
    expect(await getRole(member, familyId)).toBeNull();
    expect(await myFamilies(member)).toEqual([]);

    expect((await requestToJoin(member, joinCode)).ok).toBe(true);
    const [req] = await pendingRequests(head, familyId);
    await decideJoinRequest(head, familyId, req.id, true);
    expect(await getRole(member, familyId)).toBe("MEMBER");
  });

  it("a member can leave; the head must hand over first", async () => {
    const { head, member, familyId } = await familyWithMember();
    expect(await leaveFamily(head, familyId)).toEqual({ ok: false, reason: "head_must_transfer" });
    expect(await leaveFamily(member, familyId)).toEqual({ ok: true });
    expect((await listMembers(familyId)).map((m) => m.username)).toEqual(["ravi"]);
    await expect(leaveFamily(member, familyId)).rejects.toBeInstanceOf(NotAllowedError);
  });
});
