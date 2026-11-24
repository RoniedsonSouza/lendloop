import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

// Clerk keys come from the developer's own .env.local (never committed, never printed).
loadEnv({ path: ".env.local", quiet: true });

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1, // the specs share one lending story (create → request → approve → return)
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "setup", testMatch: /global\.setup\.ts/ },
    { name: "e2e", testMatch: /.*\.spec\.ts/, dependencies: ["setup"], use: { ...devices["Desktop Chrome"] } },
    // README screenshots, opt-in only (see e2e/screenshots.capture.ts).
    ...(process.env.SCREENSHOTS
      ? [{ name: "screenshots", testMatch: /screenshots\.capture\.ts/, dependencies: ["setup"], use: { ...devices["Desktop Chrome"] } }]
      : []),
  ],
});
