import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PHASE3_PREVIEW_URL;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
if (!baseURL) throw new Error("PHASE3_PREVIEW_URL is required");
if (!bypass) throw new Error("VERCEL_AUTOMATION_BYPASS_SECRET is required");

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "phase3-preview-record.spec.ts",
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  outputDir: "artifacts/phase3-preview-v1",
  use: {
    baseURL,
    extraHTTPHeaders: { "x-vercel-protection-bypass": bypass },
    video: "on",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop-preview", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile-preview", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
});
