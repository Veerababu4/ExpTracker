import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import "./load-env";

// Once per test run: rebuild the test database from the migration files (the same SQL production gets).
export default async function setup() {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  try {
    await pool.query("drop schema if exists drizzle cascade; drop schema public cascade; create schema public;");
    await migrate(drizzle(pool), { migrationsFolder: "src/server/db/migrations" });
  } catch (error) {
    throw new Error(`Test database setup failed — is Docker (family-pg) running? ${String(error)}`);
  } finally {
    await pool.end();
  }
}
