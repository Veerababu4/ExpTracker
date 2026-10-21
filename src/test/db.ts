import { sql } from "drizzle-orm";
import { db } from "@/server/db";

/** Empties every table (keeps the structure). Call in beforeEach of database tests. */
export async function resetDatabase(): Promise<void> {
  const rows = await db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public'`);
  const tables = rows.rows.map((r) => `"${r.tablename}"`).join(", ");
  if (tables) await db.execute(sql.raw(`truncate table ${tables} restart identity cascade`));
}
