import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["phase15-record.spec.ts", "phase2-record.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile-320",
      use: {
        ...devices["iPhone SE"],
        browserName: "chromium",
        viewport: { width: 320, height: 667 },
      },
    },
  ],
  webServer: {
    command: "pnpm dev --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
