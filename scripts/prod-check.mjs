// Read-only check of the LIVE (Neon) database: server version, host type, tables, applied migrations, row counts.
// Reads DATABASE_URL (pooled) or MIGRATION_DATABASE_URL (direct) from the git-ignored .env.vercel; never prints a
// connection string. Usage (from the project folder):
//   node --no-warnings --import ./scripts/dns-public.mjs scripts/prod-check.mjs [pooled|direct]
import { readFileSync } from "node:fs";
import pg from "pg";

const { Client } = pg;
const key = process.argv[2] === "direct" ? "MIGRATION_DATABASE_URL" : "DATABASE_URL";
const env = readFileSync(".env.vercel", "utf8");
const url = (env.split(/\r?\n/).find((l) => l.startsWith(`${key}=`)) ?? "").slice(key.length + 1).trim();
if (!url) {
  console.log(`${key} is empty in .env.vercel`);
  process.exit(1);
}
const host = new URL(url).hostname;
console.log(`${key}: host ${host.includes("-pooler") ? "pooled" : "direct"}, ${host.split(".").slice(1).join(".")}`);
const client = new Client({ connectionString: url });
const started = Date.now();
await client.connect();
console.log(`connected in ${Date.now() - started} ms`);
const one = async (q) => (await client.query(q)).rows;
console.log("server:", (await one("show server_version"))[0].server_version);
const tables = await one("select tablename from pg_tables where schemaname = 'public' order by 1");
console.log("tables:", tables.map((t) => t.tablename).join(", ") || "(none)");
try {
  const done = await one("select count(*)::int as n from drizzle.__drizzle_migrations");
  console.log("migrations applied:", done[0].n);
} catch {
  console.log("migrations applied: none yet");
}
for (const t of ["users", "families", "expenses", "budgets", "receipts"]) {
  if (tables.some((r) => r.tablename === t)) console.log(`rows in ${t}:`, (await one(`select count(*)::int as n from ${t}`))[0].n);
}
const size = await one("select pg_size_pretty(pg_database_size(current_database())) as s");
console.log("database size:", size[0].s);
await client.end();
