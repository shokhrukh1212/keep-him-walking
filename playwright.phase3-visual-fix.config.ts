import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "phase3-visual-fix.spec.ts",
  timeout: 75_000,
  workers: 1,
  reporter: [["list"]],
  outputDir: "artifacts/phase3-visual-fix",
  use: {
    baseURL: "http://127.0.0.1:3102",
    video: "on",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
  webServer: {
    command: "pnpm dev --hostname 127.0.0.1 --port 3102",
    url: "http://127.0.0.1:3102",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
