import { config } from "dotenv";

// Tests always use the separate family_test database, never the development one.
config({ path: ".env.local", quiet: true });
if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is missing from .env.local");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
