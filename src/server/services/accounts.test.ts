import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { resetDatabase } from "@/test/db";
import {
  activeSessionCount,
  changePassword,
  changeSecurityQuestions,
  checkLogin,
  completeFirstLogin,
  createSession,
  decoyQuestions,
  findSessionUser,
  hasSecurityQuestions,
  recoverPassword,
  recoveryQuestions,
  registerUser,
} from "./accounts";

const questions = {
  question1: "first_school" as const,
  answer1: "zp high school",
  question2: "first_pet" as const,
  answer2: "tommy",
};

async function newUser(username = "ravi") {
  const r = await registerUser({ username, displayName: "Ravi", password: "secret123", ...questions });
  if (!r.ok) throw new Error("registration failed");
  return r.userId;
}

const at = (iso: string) => new Date(iso);

beforeEach(resetDatabase);

describe("registration", () => {
  it("rejects a username that is taken", async () => {
    await newUser("ravi");
    const again = await registerUser({ username: "ravi", displayName: "Other", password: "secret123", ...questions });
    expect(again).toEqual({ ok: false, reason: "username_taken" });
  });

  it("stores hashes, never the password or answers", async () => {
    const id = await newUser();
    const row = await db.query.users.findFirst({ where: eq(users.id, id) });
    expect(row?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await hasSecurityQuestions(id)).toBe(true);
  });
});

describe("login and lockout", () => {
  it("accepts the right password", async () => {
    const id = await newUser();
    expect(await checkLogin("ravi", "secret123")).toEqual({ ok: true, userId: id, mustChangePassword: false });
  });

  it("gives the same answer for an unknown user and a wrong password", async () => {
    await newUser();
    expect(await checkLogin("nobody", "secret123")).toEqual({ ok: false, reason: "invalid" });
    expect(await checkLogin("ravi", "wrong-pass1")).toEqual({ ok: false, reason: "invalid" });
  });

  it("locks for 15 minutes after 5 wrong passwords, even for the right one", async () => {
    await newUser();
    const now = at("2026-10-21T10:00:00Z");
    for (let i = 0; i < 4; i++) expect((await checkLogin("ravi", "wrong-pass1", now)).ok).toBe(false);
    const fifth = await checkLogin("ravi", "wrong-pass1", now);
    expect(fifth).toEqual({ ok: false, reason: "locked", lockedUntil: at("2026-10-21T10:15:00Z") });

    expect((await checkLogin("ravi", "secret123", at("2026-10-21T10:14:59Z"))).ok).toBe(false);
    expect((await checkLogin("ravi", "secret123", at("2026-10-21T10:15:01Z"))).ok).toBe(true);
  });

  it("a successful login resets the failure count", async () => {
    await newUser();
    for (let i = 0; i < 4; i++) await checkLogin("ravi", "wrong-pass1");
    expect((await checkLogin("ravi", "secret123")).ok).toBe(true);
    expect((await checkLogin("ravi", "wrong-pass1")).ok).toBe(false); // 1st failure again, not the 5th
    expect((await checkLogin("ravi", "secret123")).ok).toBe(true);
  });
});

describe("sessions", () => {
  it("finds the user for a token and expires after 30 days", async () => {
    const id = await newUser();
    const { token } = await createSession(id, at("2026-10-01T00:00:00Z"));
    expect((await findSessionUser(token, at("2026-10-30T00:00:00Z")))?.id).toBe(id);
    expect(await findSessionUser("not-a-real-token")).toBeNull();
  });

  it("stays alive while used, and dies 30 days after last use", async () => {
    const id = await newUser();
    const { token } = await createSession(id, at("2026-10-01T00:00:00Z"));
    expect(await findSessionUser(token, at("2026-10-25T00:00:00Z"))).not.toBeNull(); // extends to 24 Nov
    expect(await findSessionUser(token, at("2026-11-20T00:00:00Z"))).not.toBeNull();
    expect(await findSessionUser(token, at("2026-12-25T00:00:00Z"))).toBeNull();
  });
});

describe("password changes", () => {
  it("change password needs the current one and signs out other devices", async () => {
    const id = await newUser();
    const here = await createSession(id);
    await createSession(id); // another phone
    const current = await findSessionUser(here.token);

    expect(await changePassword(id, current!.sessionId, "wrong-pass1", "newpass123")).toEqual({ ok: false, reason: "wrong_password" });
    expect(await changePassword(id, current!.sessionId, "secret123", "newpass123")).toEqual({ ok: true });
    expect(await activeSessionCount(id)).toBe(1);
    expect((await checkLogin("ravi", "newpass123")).ok).toBe(true);
  });

  it("first login replaces the temporary password and adds questions", async () => {
    const [row] = await db
      .insert(users)
      .values({ username: "kiran", displayName: "Kiran", passwordHash: "x", mustChangePassword: true })
      .returning({ id: users.id });
    const { token } = await createSession(row.id);
    const s = await findSessionUser(token);
    expect(s?.mustChangePassword).toBe(true);
    expect(await hasSecurityQuestions(row.id)).toBe(false);

    await completeFirstLogin(row.id, s!.sessionId, "kiran-pass1", questions);
    expect((await findSessionUser(token))?.mustChangePassword).toBe(false);
    expect(await hasSecurityQuestions(row.id)).toBe(true);
  });

  it("changing questions needs the password", async () => {
    const id = await newUser();
    const other = { ...questions, question1: "nickname" as const, answer1: "chinnu" };
    expect(await changeSecurityQuestions(id, "wrong-pass1", other)).toEqual({ ok: false, reason: "wrong_password" });
    expect(await changeSecurityQuestions(id, "secret123", other)).toEqual({ ok: true });
    expect(await recoveryQuestions("ravi")).toEqual(["nickname", "first_pet"]);
  });
});

describe("forgot password", () => {
  it("shows the user's questions, and stable decoys for unknown names", async () => {
    await newUser();
    expect(await recoveryQuestions("ravi")).toEqual(["first_school", "first_pet"]);
    const decoys = await recoveryQuestions("nobody");
    expect(decoys).toEqual(decoyQuestions("nobody"));
    expect(decoys[0]).not.toBe(decoys[1]);
  });

  it("resets the password with both right answers and signs out everywhere", async () => {
    const id = await newUser();
    await createSession(id);
    expect(await recoverPassword("ravi", "zp high school", "wrong", "newpass123")).toEqual({ ok: false, reason: "wrong_answers" });
    expect(await recoverPassword("ravi", "zp high school", "tommy", "newpass123")).toEqual({ ok: true, userId: id });
    expect(await activeSessionCount(id)).toBe(0);
    expect((await checkLogin("ravi", "newpass123")).ok).toBe(true);
  });

  it("locks recovery for an hour after 5 wrong tries", async () => {
    await newUser();
    const now = at("2026-10-21T10:00:00Z");
    for (let i = 0; i < 4; i++) await recoverPassword("ravi", "x", "y", "newpass123", now);
    expect(await recoverPassword("ravi", "x", "y", "newpass123", now)).toEqual({
      ok: false,
      reason: "locked",
      lockedUntil: at("2026-10-21T11:00:00Z"),
    });
    expect((await recoverPassword("ravi", "zp high school", "tommy", "newpass123", at("2026-10-21T10:30:00Z"))).ok).toBe(false);
    expect((await recoverPassword("ravi", "zp high school", "tommy", "newpass123", at("2026-10-21T11:00:01Z"))).ok).toBe(true);
  });

  it("an unknown username just gets 'wrong answers'", async () => {
    expect(await recoverPassword("nobody", "a", "b", "newpass123")).toEqual({ ok: false, reason: "wrong_answers" });
  });
});
