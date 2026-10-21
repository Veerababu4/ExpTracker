import "server-only";
import { and, eq, gt, ne, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { securityAnswers, sessions, users } from "@/server/db/schema";
import { hashSecret, verifyAgainstDummy, verifySecret } from "@/server/auth/hashing";
import { keyedHash, newSessionToken, sessionIdFor } from "@/server/auth/tokens";
import { QUESTION_CODES, type QuestionCode } from "@/lib/security-questions";
import { SESSION_DAYS } from "@/lib/session-cookie";

// Account rules (DESIGN §3.1). No cookies or redirects here — those belong to the actions — so every
// function can be tested straight against the database. `now` is a parameter so tests can move the clock.

export const MAX_LOGIN_FAILURES = 5;
export const LOGIN_LOCK_MINUTES = 15;
export const MAX_RECOVERY_FAILURES = 5;
export const RECOVERY_LOCK_MINUTES = 60;

const minutes = (n: number) => n * 60_000;
const days = (n: number) => n * 86_400_000;

export type SecurityQuestionInput = {
  question1: QuestionCode;
  answer1: string; // already normalised by the schema
  question2: QuestionCode;
  answer2: string;
};

// ── Registration ──────────────────────────────────────────────────────────────

export type NewUser = {
  username: string;
  displayName: string;
  password: string;
  mobile?: string;
  email?: string;
};

export async function registerUser(
  input: NewUser & SecurityQuestionInput,
): Promise<{ ok: true; userId: string } | { ok: false; reason: "username_taken" }> {
  const passwordHash = await hashSecret(input.password);
  const answerRows = await hashAnswers(input);
  try {
    const userId = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(users)
        .values({
          username: input.username,
          displayName: input.displayName,
          mobile: input.mobile ?? null,
          email: input.email ?? null,
          passwordHash,
        })
        .returning({ id: users.id });
      await tx.insert(securityAnswers).values(answerRows.map((a) => ({ ...a, userId: row.id })));
      return row.id;
    });
    return { ok: true, userId };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "username_taken" };
    throw error;
  }
}

export async function isUsernameTaken(username: string): Promise<boolean> {
  const row = await db.query.users.findFirst({ where: eq(users.username, username), columns: { id: true } });
  return row !== undefined;
}

// ── Login ─────────────────────────────────────────────────────────────────────

export type LoginResult =
  | { ok: true; userId: string; mustChangePassword: boolean }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "locked"; lockedUntil: Date };

export async function checkLogin(username: string, password: string, now = new Date()): Promise<LoginResult> {
  const user = await db.query.users.findFirst({ where: eq(users.username, username) });
  if (!user) {
    await verifyAgainstDummy(password);
    return { ok: false, reason: "invalid" };
  }
  if (user.lockedUntil && user.lockedUntil > now) {
    return { ok: false, reason: "locked", lockedUntil: user.lockedUntil };
  }

  if (await verifySecret(user.passwordHash, password)) {
    if (user.failedLogins > 0 || user.lockedUntil) {
      await db.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, user.id));
    }
    return { ok: true, userId: user.id, mustChangePassword: user.mustChangePassword };
  }

  // Count the failure in one statement so two quick attempts can't both read the old count.
  const lockUntil = new Date(now.getTime() + minutes(LOGIN_LOCK_MINUTES));
  const [updated] = await db
    .update(users)
    .set({
      failedLogins: sql`case when ${users.failedLogins} + 1 >= ${MAX_LOGIN_FAILURES} then 0 else ${users.failedLogins} + 1 end`,
      lockedUntil: sql`case when ${users.failedLogins} + 1 >= ${MAX_LOGIN_FAILURES} then ${lockUntil.toISOString()}::timestamptz else null end`,
    })
    .where(eq(users.id, user.id))
    .returning({ lockedUntil: users.lockedUntil });
  if (updated?.lockedUntil) return { ok: false, reason: "locked", lockedUntil: updated.lockedUntil };
  return { ok: false, reason: "invalid" };
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function createSession(userId: string, now = new Date()): Promise<{ token: string; expiresAt: Date }> {
  const token = newSessionToken();
  const expiresAt = new Date(now.getTime() + days(SESSION_DAYS));
  await db.insert(sessions).values({ id: sessionIdFor(token), userId, expiresAt, lastSeenAt: now });
  return { token, expiresAt };
}

export type SessionUser = {
  sessionId: string;
  id: string;
  username: string;
  displayName: string;
  mustChangePassword: boolean;
};

/** The user behind a cookie token, or null. Keeps an active session alive for another 30 days. */
export async function findSessionUser(token: string, now = new Date()): Promise<SessionUser | null> {
  const sessionId = sessionIdFor(token);
  const [row] = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      mustChangePassword: users.mustChangePassword,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, sessionId));
  if (!row) return null;
  if (row.expiresAt <= now) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }
  // Extending on every request would mean a write per page; once an hour is plenty.
  if (now.getTime() - row.lastSeenAt.getTime() > minutes(60)) {
    await db
      .update(sessions)
      .set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + days(SESSION_DAYS)) })
      .where(eq(sessions.id, sessionId));
  }
  return {
    sessionId: row.sessionId,
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    mustChangePassword: row.mustChangePassword,
  };
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionIdFor(token)));
}

/** Signs the user out everywhere except the given session (or everywhere when null). */
async function deleteSessionsExcept(userId: string, keepSessionId: string | null): Promise<void> {
  await db
    .delete(sessions)
    .where(keepSessionId ? and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)) : eq(sessions.userId, userId));
}

// ── Password and profile changes ──────────────────────────────────────────────

export async function changePassword(
  userId: string,
  currentSessionId: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; reason: "wrong_password" }> {
  if (!(await passwordMatches(userId, currentPassword))) return { ok: false, reason: "wrong_password" };
  await setPassword(userId, newPassword);
  await deleteSessionsExcept(userId, currentSessionId);
  return { ok: true };
}

/** First login: the user replaces a temporary password, and sets security questions if they have none. */
export async function completeFirstLogin(
  userId: string,
  currentSessionId: string,
  newPassword: string,
  questions?: SecurityQuestionInput,
): Promise<void> {
  if (questions) await replaceAnswers(userId, questions);
  await setPassword(userId, newPassword);
  await deleteSessionsExcept(userId, currentSessionId);
}

export async function hasSecurityQuestions(userId: string): Promise<boolean> {
  const rows = await db.select({ slot: securityAnswers.slot }).from(securityAnswers).where(eq(securityAnswers.userId, userId));
  return rows.length === 2;
}

export async function changeSecurityQuestions(
  userId: string,
  currentPassword: string,
  questions: SecurityQuestionInput,
): Promise<{ ok: true } | { ok: false; reason: "wrong_password" }> {
  if (!(await passwordMatches(userId, currentPassword))) return { ok: false, reason: "wrong_password" };
  await replaceAnswers(userId, questions);
  return { ok: true };
}

export async function getProfile(userId: string) {
  return db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { username: true, displayName: true, mobile: true, email: true, createdAt: true },
  });
}

export async function updateProfile(
  userId: string,
  profile: { displayName: string; mobile?: string; email?: string },
): Promise<void> {
  await db
    .update(users)
    .set({
      displayName: profile.displayName,
      mobile: profile.mobile ?? null,
      email: profile.email ?? null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

// ── Forgot password (security questions) ──────────────────────────────────────

/**
 * The two questions to ask for a username. An unknown username (or one without questions) gets two
 * "decoy" questions that are always the same for that name, so the page never reveals who has an account.
 */
export async function recoveryQuestions(username: string): Promise<[QuestionCode, QuestionCode]> {
  const user = await db.query.users.findFirst({ where: eq(users.username, username), columns: { id: true } });
  if (user) {
    const rows = await db
      .select({ slot: securityAnswers.slot, code: securityAnswers.questionCode })
      .from(securityAnswers)
      .where(eq(securityAnswers.userId, user.id))
      .orderBy(securityAnswers.slot);
    if (rows.length === 2) return [rows[0].code as QuestionCode, rows[1].code as QuestionCode];
  }
  return decoyQuestions(username);
}

export function decoyQuestions(username: string): [QuestionCode, QuestionCode] {
  const h = keyedHash(`decoy:${username}`);
  const n = QUESTION_CODES.length;
  const first = h[0] % n;
  const second = (first + 1 + (h[1] % (n - 1))) % n; // always different from the first
  return [QUESTION_CODES[first], QUESTION_CODES[second]];
}

export type RecoveryResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "wrong_answers" }
  | { ok: false; reason: "locked"; lockedUntil: Date };

export async function recoverPassword(
  username: string,
  answer1: string,
  answer2: string,
  newPassword: string,
  now = new Date(),
): Promise<RecoveryResult> {
  const user = await db.query.users.findFirst({ where: eq(users.username, username) });
  const answers = user
    ? await db.select().from(securityAnswers).where(eq(securityAnswers.userId, user.id)).orderBy(securityAnswers.slot)
    : [];
  if (!user || answers.length !== 2) {
    await verifyAgainstDummy(answer1);
    return { ok: false, reason: "wrong_answers" };
  }
  if (user.recoveryLockedUntil && user.recoveryLockedUntil > now) {
    return { ok: false, reason: "locked", lockedUntil: user.recoveryLockedUntil };
  }

  // Check both answers every time, so the response doesn't hint which one was wrong.
  const [ok1, ok2] = await Promise.all([
    verifySecret(answers[0].answerHash, answer1),
    verifySecret(answers[1].answerHash, answer2),
  ]);
  if (!(ok1 && ok2)) {
    const lockUntil = new Date(now.getTime() + minutes(RECOVERY_LOCK_MINUTES));
    const [updated] = await db
      .update(users)
      .set({
        recoveryFailures: sql`case when ${users.recoveryFailures} + 1 >= ${MAX_RECOVERY_FAILURES} then 0 else ${users.recoveryFailures} + 1 end`,
        recoveryLockedUntil: sql`case when ${users.recoveryFailures} + 1 >= ${MAX_RECOVERY_FAILURES} then ${lockUntil.toISOString()}::timestamptz else null end`,
      })
      .where(eq(users.id, user.id))
      .returning({ lockedUntil: users.recoveryLockedUntil });
    if (updated?.lockedUntil) return { ok: false, reason: "locked", lockedUntil: updated.lockedUntil };
    return { ok: false, reason: "wrong_answers" };
  }

  await setPassword(user.id, newPassword);
  await deleteSessionsExcept(user.id, null);
  return { ok: true, userId: user.id };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function passwordMatches(userId: string, password: string): Promise<boolean> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { passwordHash: true } });
  return user !== undefined && (await verifySecret(user.passwordHash, password));
}

/** New password also clears both lockouts and the "must change" flag. */
async function setPassword(userId: string, newPassword: string): Promise<void> {
  await db
    .update(users)
    .set({
      passwordHash: await hashSecret(newPassword),
      mustChangePassword: false,
      failedLogins: 0,
      lockedUntil: null,
      recoveryFailures: 0,
      recoveryLockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

async function hashAnswers(q: SecurityQuestionInput) {
  return [
    { slot: 1, questionCode: q.question1, answerHash: await hashSecret(q.answer1) },
    { slot: 2, questionCode: q.question2, answerHash: await hashSecret(q.answer2) },
  ];
}

async function replaceAnswers(userId: string, q: SecurityQuestionInput): Promise<void> {
  const rows = await hashAnswers(q);
  await db.transaction(async (tx) => {
    await tx.delete(securityAnswers).where(eq(securityAnswers.userId, userId));
    await tx.insert(securityAnswers).values(rows.map((r) => ({ ...r, userId })));
  });
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

/** Sessions that are still valid for a user (used by tests and the account page). */
export async function activeSessionCount(userId: string, now = new Date()): Promise<number> {
  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, now)));
  return rows.length;
}
