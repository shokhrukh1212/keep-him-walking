import { defineConfig, devices } from "@playwright/test";

// Records the prelaunch welcome against an already running production server
// (`pnpm build && pnpm start --port 3100`). Output: artifacts/prelaunch-monologue.
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "prelaunch-record.spec.ts",
  timeout: 180_000,
  workers: 1,
  reporter: [["list"]],
  outputDir: "artifacts/prelaunch-monologue",
  use: {
    baseURL: "http://localhost:3100",
    trace: "off",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
        video: { mode: "on", size: { width: 1280, height: 800 } },
      },
    },
    {
      name: "phone",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        video: { mode: "on", size: { width: 390, height: 844 } },
      },
    },
  ],
  webServer: {
    command: "pnpm start --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
