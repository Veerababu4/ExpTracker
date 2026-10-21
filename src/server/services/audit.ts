import "server-only";
import { db } from "@/server/db";
import { auditLog } from "@/server/db/schema";

/** The database or an open transaction, so audit rows commit (or roll back) with the change they describe. */
export type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AuditEntry = {
  familyId: string | null;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  /** Before/after values or context. Never passwords, answers or tokens. */
  details?: Record<string, unknown>;
};

export async function writeAudit(executor: Executor, entry: AuditEntry): Promise<void> {
  await executor.insert(auditLog).values({ ...entry, details: entry.details ?? null });
}
