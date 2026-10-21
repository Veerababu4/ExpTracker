import { config } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

// End-to-end tests drive the installed Microsoft Edge against a production build on port 3100 that uses the
// TEST database (family_test), so test accounts never land in the development database.
// Run with: npm run e2e   (builds first)
config({ path: ".env.local", quiet: true });

const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  globalSetup: "./e2e/global-setup.ts",
  globalTimeout: 15 * 60_000, // a stuck browser fails the run instead of hanging forever
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "msedge",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Edge"], channel: "msedge" } },
    { name: "phone", use: { viewport: { width: 390, height: 844 }, isMobile: false, hasTouch: true, channel: "msedge" } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    // receipts.spec.ts registers these as site admins (one per project; the database is fresh each run).
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? "", ADMIN_USERNAMES: "admin.desktop,admin.phone" },
    timeout: 60_000,
  },
});
