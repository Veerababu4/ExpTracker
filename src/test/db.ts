import { sql } from "drizzle-orm";
import { db } from "@/server/db";

/** Empties every table (keeps the structure). Call in beforeEach of database tests. */
export async function resetDatabase(): Promise<void> {
  await db.execute(sql`truncate table users, sessions, security_answers restart identity cascade`);
}
