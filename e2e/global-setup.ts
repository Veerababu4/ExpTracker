import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

// Fresh, empty test database for every E2E run.
export default async function globalSetup() {
  config({ path: ".env.local", quiet: true });
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  try {
    await pool.query("drop schema if exists drizzle cascade; drop schema public cascade; create schema public;");
    await migrate(drizzle(pool), { migrationsFolder: "src/server/db/migrations" });
  } finally {
    await pool.end();
  }
}
