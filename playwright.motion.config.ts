import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "phase15-record.spec.ts",
  timeout: 105_000,
  workers: 1,
  reporter: [["list"]],
  outputDir: "artifacts/phase15-motion-v3",
  use: {
    baseURL: "http://127.0.0.1:3100",
    video: "on",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop-proof", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile-proof", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
  webServer: {
    command: "pnpm dev --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
