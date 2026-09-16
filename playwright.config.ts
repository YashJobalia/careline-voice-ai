import { defineConfig } from "@playwright/test";
import { loadEnvFile } from "node:process";
try {
  loadEnvFile(".env.test.local");
} catch {}
try {
  loadEnvFile(".env.local");
} catch {}
export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:3000",
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure",
  },
  reporter: "list",
  outputDir: "artifacts/test-results",
});
