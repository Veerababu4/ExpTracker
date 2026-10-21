import "server-only";
import { randomInt } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { categories, families, familyMembers, joinRequests, sessions, users } from "@/server/db/schema";
import { hashSecret } from "@/server/auth/hashing";
import { DEFAULT_CATEGORIES } from "@/lib/expense-options";
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH } from "@/lib/rules/join-code";
import { isUniqueViolation } from "./accounts";
import { writeAudit } from "./audit";

// Family rules (DESIGN §3.2, F1–F10). Every function that changes a family checks the caller's role
// itself — the pages hiding buttons is only a convenience.

export type Role = "HEAD" | "MEMBER";

export type Membership = { familyId: string; familyName: string; role: Role; joinedAt: Date };

/** Thrown when someone tries something their role doesn't allow (a tampered form, an old tab…). */
export class NotAllowedError extends Error {
  constructor(message = "You don't have permission to do that.") {
    super(message);
    this.name = "NotAllowedError";
  }
}

// ── Reading ───────────────────────────────────────────────────────────────────

/** Families the user is an active member of, oldest first. */
export async function myFamilies(userId: string): Promise<Membership[]> {
  return db
    .select({
      familyId: families.id,
      familyName: families.name,
      role: familyMembers.role,
      joinedAt: familyMembers.joinedAt,
    })
    .from(familyMembers)
    .innerJoin(families, eq(families.id, familyMembers.familyId))
    .where(and(eq(familyMembers.userId, userId), eq(familyMembers.status, "ACTIVE")))
    .orderBy(asc(familyMembers.joinedAt));
}

/**
 * Which family to show (F7): the one chosen in this browser, else the last one used anywhere, else the oldest.
 * Null when the user isn't in any family.
 */
export function pickActiveFamily(
  memberships: Membership[],
  activeFamilyId: string | null,
  lastFamilyId: string | null,
): Membership | null {
  return (
    memberships.find((m) => m.familyId === activeFamilyId) ??
    memberships.find((m) => m.familyId === lastFamilyId) ??
    memberships[0] ??
    null
  );
}

export async function getRole(userId: string, familyId: string): Promise<Role | null> {
  const row = await db.query.familyMembers.findFirst({
    where: and(
      eq(familyMembers.familyId, familyId),
      eq(familyMembers.userId, userId),
      eq(familyMembers.status, "ACTIVE"),
    ),
    columns: { role: true },
  });
  return row?.role ?? null;
}

export async function assertHead(userId: string, familyId: string): Promise<void> {
  if ((await getRole(userId, familyId)) !== "HEAD") {
    throw new NotAllowedError("Only the family head can do that.");
  }
}

export async function assertMember(userId: string, familyId: string): Promise<Role> {
  const role = await getRole(userId, familyId);
  if (!role) throw new NotAllowedError("You're not a member of this family.");
  return role;
}

export async function getFamily(familyId: string) {
  return db.query.families.findFirst({ where: eq(families.id, familyId) });
}

export type FamilyMember = {
  userId: string;
  displayName: string;
  username: string;
  mobile: string | null;
  email: string | null;
  role: Role;
  joinedAt: Date;
};

/** Active members, head first. */
export async function listMembers(familyId: string): Promise<FamilyMember[]> {
  return db
    .select({
      userId: users.id,
      displayName: users.displayName,
      username: users.username,
      mobile: users.mobile,
      email: users.email,
      role: familyMembers.role,
      joinedAt: familyMembers.joinedAt,
    })
    .from(familyMembers)
    .innerJoin(users, eq(users.id, familyMembers.userId))
    .where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.status, "ACTIVE")))
    .orderBy(sql`${familyMembers.role} = 'HEAD' desc`, asc(familyMembers.joinedAt));
}

// ── Creating and switching ────────────────────────────────────────────────────

export async function createFamily(userId: string, name: string, sessionId?: string): Promise<{ id: string; joinCode: string }> {
  const family = await insertWithFreshCode(async (joinCode) =>
    db.transaction(async (tx) => {
      const [row] = await tx.insert(families).values({ name, joinCode, createdBy: userId }).returning();
      await tx.insert(familyMembers).values({ familyId: row.id, userId, role: "HEAD" });
      await tx
        .insert(categories)
        .values(DEFAULT_CATEGORIES.map((name, i) => ({ familyId: row.id, name, sortOrder: (i + 1) * 10 })));
      await writeAudit(tx, {
        familyId: row.id,
        actorId: userId,
        action: "FAMILY_CREATED",
        entityType: "family",
        entityId: row.id,
        details: { name },
      });
      return row;
    }),
  );
  await rememberFamily(userId, family.id, sessionId);
  return { id: family.id, joinCode: family.joinCode };
}

/** Makes `familyId` the one shown in this browser and the default on other devices. */
export async function switchFamily(userId: string, familyId: string, sessionId: string): Promise<void> {
  await assertMember(userId, familyId);
  await rememberFamily(userId, familyId, sessionId);
}

async function rememberFamily(userId: string, familyId: string, sessionId?: string): Promise<void> {
  await db.update(users).set({ lastFamilyId: familyId }).where(eq(users.id, userId));
  if (sessionId) await db.update(sessions).set({ activeFamilyId: familyId }).where(eq(sessions.id, sessionId));
}

export async function regenerateJoinCode(headId: string, familyId: string): Promise<string> {
  await assertHead(headId, familyId);
  const row = await insertWithFreshCode(async (joinCode) => {
    const [updated] = await db.update(families).set({ joinCode }).where(eq(families.id, familyId)).returning();
    return updated;
  });
  await writeAudit(db, {
    familyId,
    actorId: headId,
    action: "JOIN_CODE_CHANGED",
    entityType: "family",
    entityId: familyId,
  });
  return row.joinCode;
}

export function newJoinCode(): string {
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  return code;
}

/** Retries with a new code in the (very unlikely) case the random one is already used by another family. */
async function insertWithFreshCode<T>(write: (code: string) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await write(newJoinCode());
    } catch (error) {
      if (!isUniqueViolation(error) || attempt >= 5) throw error;
    }
  }
}

// ── Join requests (F3, F4) ────────────────────────────────────────────────────

export type JoinResult =
  | { ok: true; familyName: string }
  | { ok: false; reason: "invalid_code" | "already_member" | "already_pending" };

export async function requestToJoin(userId: string, code: string): Promise<JoinResult> {
  const family = await db.query.families.findFirst({ where: eq(families.joinCode, code) });
  if (!family) return { ok: false, reason: "invalid_code" };
  if (await getRole(userId, family.id)) return { ok: false, reason: "already_member" };
  try {
    const [request] = await db.insert(joinRequests).values({ familyId: family.id, userId }).returning({ id: joinRequests.id });
    await writeAudit(db, {
      familyId: family.id,
      actorId: userId,
      action: "JOIN_REQUESTED",
      entityType: "join_request",
      entityId: request.id,
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "already_pending" };
    throw error;
  }
  return { ok: true, familyName: family.name };
}

export async function myJoinRequests(userId: string) {
  return db
    .select({
      id: joinRequests.id,
      familyName: families.name,
      status: joinRequests.status,
      createdAt: joinRequests.createdAt,
      decidedAt: joinRequests.decidedAt,
    })
    .from(joinRequests)
    .innerJoin(families, eq(families.id, joinRequests.familyId))
    .where(eq(joinRequests.userId, userId))
    .orderBy(desc(joinRequests.createdAt))
    .limit(10);
}

export async function cancelJoinRequest(userId: string, requestId: string): Promise<boolean> {
  const rows = await db
    .update(joinRequests)
    .set({ status: "CANCELLED", decidedAt: new Date() })
    .where(and(eq(joinRequests.id, requestId), eq(joinRequests.userId, userId), eq(joinRequests.status, "PENDING")))
    .returning({ id: joinRequests.id });
  return rows.length === 1;
}

/** Pending requests for the head to decide. */
export async function pendingRequests(headId: string, familyId: string) {
  await assertHead(headId, familyId);
  return db
    .select({
      id: joinRequests.id,
      userId: users.id,
      displayName: users.displayName,
      username: users.username,
      mobile: users.mobile,
      email: users.email,
      createdAt: joinRequests.createdAt,
    })
    .from(joinRequests)
    .innerJoin(users, eq(users.id, joinRequests.userId))
    .where(and(eq(joinRequests.familyId, familyId), eq(joinRequests.status, "PENDING")))
    .orderBy(asc(joinRequests.createdAt));
}

/** Approve or reject. False when someone already decided it (e.g. the head clicked twice). */
export async function decideJoinRequest(
  headId: string,
  familyId: string,
  requestId: string,
  approve: boolean,
): Promise<boolean> {
  await assertHead(headId, familyId);
  return db.transaction(async (tx) => {
    const now = new Date();
    const [request] = await tx
      .update(joinRequests)
      .set({ status: approve ? "APPROVED" : "REJECTED", decidedBy: headId, decidedAt: now })
      .where(and(eq(joinRequests.id, requestId), eq(joinRequests.familyId, familyId), eq(joinRequests.status, "PENDING")))
      .returning({ userId: joinRequests.userId });
    if (!request) return false;
    if (approve) {
      // A former member (removed or left) comes back as an ordinary member.
      await tx
        .insert(familyMembers)
        .values({ familyId, userId: request.userId, role: "MEMBER", status: "ACTIVE", joinedAt: now })
        .onConflictDoUpdate({
          target: [familyMembers.familyId, familyMembers.userId],
          set: { role: "MEMBER", status: "ACTIVE", joinedAt: now, leftAt: null },
        });
    }
    await writeAudit(tx, {
      familyId,
      actorId: headId,
      action: approve ? "JOIN_APPROVED" : "JOIN_REJECTED",
      entityType: "user",
      entityId: request.userId,
    });
    return true;
  });
}

// ── Head-managed logins (F5, F6) ──────────────────────────────────────────────

export async function createMemberLogin(
  headId: string,
  familyId: string,
  input: { username: string; displayName: string; tempPassword: string; mobile?: string; email?: string },
): Promise<{ ok: true; userId: string } | { ok: false; reason: "username_taken" }> {
  await assertHead(headId, familyId);
  const passwordHash = await hashSecret(input.tempPassword);
  try {
    const userId = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          username: input.username,
          displayName: input.displayName,
          mobile: input.mobile ?? null,
          email: input.email ?? null,
          passwordHash,
          mustChangePassword: true,
          lastFamilyId: familyId,
        })
        .returning({ id: users.id });
      await tx.insert(familyMembers).values({ familyId, userId: user.id, role: "MEMBER" });
      await writeAudit(tx, {
        familyId,
        actorId: headId,
        action: "MEMBER_LOGIN_CREATED",
        entityType: "user",
        entityId: user.id,
        details: { username: input.username },
      });
      return user.id;
    });
    return { ok: true, userId };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "username_taken" };
    throw error;
  }
}

/**
 * Head gives a member a new temporary password: the member must choose their own at next login, and is
 * signed out everywhere. Not for the head's own account (they use the account page).
 */
export async function resetMemberPassword(
  headId: string,
  familyId: string,
  memberId: string,
  tempPassword: string,
): Promise<void> {
  await assertHead(headId, familyId);
  if (memberId === headId) throw new NotAllowedError("Change your own password on the account page.");
  await assertMember(memberId, familyId);
  const passwordHash = await hashSecret(tempPassword);
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        passwordHash,
        mustChangePassword: true,
        failedLogins: 0,
        lockedUntil: null,
        recoveryFailures: 0,
        recoveryLockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, memberId));
    await tx.delete(sessions).where(eq(sessions.userId, memberId));
    await writeAudit(tx, {
      familyId,
      actorId: headId,
      action: "PASSWORD_RESET_BY_HEAD",
      entityType: "user",
      entityId: memberId,
    });
  });
}

// ── Roles and leaving (F8, F9) ────────────────────────────────────────────────

export async function transferHead(headId: string, familyId: string, newHeadId: string): Promise<void> {
  await assertHead(headId, familyId);
  if ((await getRole(newHeadId, familyId)) !== "MEMBER") throw new NotAllowedError("Choose an active member.");
  await db.transaction(async (tx) => {
    // Demote first: the database allows only one active head per family at any moment.
    await tx
      .update(familyMembers)
      .set({ role: "MEMBER" })
      .where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, headId)));
    await tx
      .update(familyMembers)
      .set({ role: "HEAD" })
      .where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, newHeadId)));
    await writeAudit(tx, {
      familyId,
      actorId: headId,
      action: "HEAD_TRANSFERRED",
      entityType: "user",
      entityId: newHeadId,
      details: { from: headId, to: newHeadId },
    });
  });
}

export async function removeMember(headId: string, familyId: string, memberId: string): Promise<void> {
  await assertHead(headId, familyId);
  if (memberId === headId) throw new NotAllowedError("The head can't remove themselves. Make someone else head first.");
  await assertMember(memberId, familyId);
  await endMembership(familyId, memberId, "REMOVED", headId);
}

export async function leaveFamily(
  userId: string,
  familyId: string,
): Promise<{ ok: true } | { ok: false; reason: "head_must_transfer" }> {
  const role = await assertMember(userId, familyId);
  if (role === "HEAD") return { ok: false, reason: "head_must_transfer" };
  await endMembership(familyId, userId, "LEFT", userId);
  return { ok: true };
}

/** Past expenses stay in the family (DESIGN F9); only access ends. */
async function endMembership(familyId: string, userId: string, status: "REMOVED" | "LEFT", actorId: string) {
  await db.transaction(async (tx) => {
    await tx
      .update(familyMembers)
      .set({ status, leftAt: new Date() })
      .where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, userId)));
    await writeAudit(tx, {
      familyId,
      actorId,
      action: status === "REMOVED" ? "MEMBER_REMOVED" : "MEMBER_LEFT",
      entityType: "user",
      entityId: userId,
    });
  });
}
