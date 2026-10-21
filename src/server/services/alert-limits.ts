import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { familyMembers, users } from "@/server/db/schema";
import { effectiveLimits, limitsProblem, type AlertLimits } from "@/lib/rules/alerts";
import { writeAudit } from "./audit";
import { assertHead, assertMember, NotAllowedError, type Role } from "./families";

// High-value alert limits per member per family (DESIGN §4.2). Null in the database = the default limits.

export type MemberLimits = {
  userId: string;
  displayName: string;
  role: Role;
  limits: AlertLimits;
  custom: boolean;
};

/** One person's limits in a family (any member may read their own). */
export async function limitsFor(userId: string, familyId: string): Promise<AlertLimits> {
  await assertMember(userId, familyId);
  const row = await db.query.familyMembers.findFirst({
    where: and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, userId)),
    columns: { highAlertPaise: true, veryHighAlertPaise: true },
  });
  return effectiveLimits(row ?? { highAlertPaise: null, veryHighAlertPaise: null });
}

/** Everyone's limits, for the head's settings page. */
export async function allMemberLimits(headId: string, familyId: string): Promise<MemberLimits[]> {
  await assertHead(headId, familyId);
  const rows = await db
    .select({
      userId: users.id,
      displayName: users.displayName,
      role: familyMembers.role,
      highAlertPaise: familyMembers.highAlertPaise,
      veryHighAlertPaise: familyMembers.veryHighAlertPaise,
    })
    .from(familyMembers)
    .innerJoin(users, eq(users.id, familyMembers.userId))
    .where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.status, "ACTIVE")))
    .orderBy(sql`${familyMembers.role} = 'HEAD' desc`, asc(familyMembers.joinedAt));
  return rows.map((r) => ({
    userId: r.userId,
    displayName: r.displayName,
    role: r.role,
    limits: effectiveLimits(r),
    custom: r.highAlertPaise !== null || r.veryHighAlertPaise !== null,
  }));
}

/** Head sets a member's limits (including their own); null = back to the defaults. */
export async function setMemberLimits(
  headId: string,
  familyId: string,
  memberId: string,
  limits: AlertLimits | null,
): Promise<void> {
  await assertHead(headId, familyId);
  if (limits) {
    const problem = limitsProblem(limits);
    if (problem) throw new NotAllowedError(problem);
  }
  const before = await limitsFor(memberId, familyId); // also checks they're an active member
  await db.transaction(async (tx) => {
    await tx
      .update(familyMembers)
      .set({ highAlertPaise: limits?.highPaise ?? null, veryHighAlertPaise: limits?.veryHighPaise ?? null })
      .where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, memberId)));
    await writeAudit(tx, {
      familyId,
      actorId: headId,
      action: limits ? "ALERT_LIMITS_CHANGED" : "ALERT_LIMITS_RESET",
      entityType: "user",
      entityId: memberId,
      details: { before, after: limits ?? "default" },
    });
  });
}
