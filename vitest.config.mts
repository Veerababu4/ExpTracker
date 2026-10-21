import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (path: string) => fileURLToPath(new URL(`./src/${path}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": src(""),
      "server-only": src("test/server-only-stub.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    setupFiles: ["src/test/load-env.ts"],
    globalSetup: ["src/test/global-setup.ts"],
    fileParallelism: false, // database tests share one test database
    testTimeout: 20_000, // password hashing is deliberately slow
  },
});
