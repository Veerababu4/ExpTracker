import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/server/db";

// GET /api/health — app is up and can reach the database.
export async function GET() {
  await connection();
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: "ok", database: "ok" });
  } catch {
    return Response.json({ status: "error", database: "unreachable" }, { status: 503 });
  }
}
