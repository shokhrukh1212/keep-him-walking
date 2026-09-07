import { defineConfig, devices } from "@playwright/test";
import { PHASE2_VERCEL_STORAGE_STATE } from "./tests/e2e/phase2-global-setup";

const baseURL = process.env.PHASE2_PREVIEW_URL
  ?? "https://keep-him-walking-git-phase-2-f6cf95-shokhrukh-karimovs-projects.vercel.app";
const parsed = new URL(baseURL);

if (parsed.protocol !== "https:" || !parsed.hostname.includes("git-phase-2")) {
  throw new Error("PHASE2_PREVIEW_URL must be the HTTPS phase-2 branch alias, never Production");
}

export default defineConfig({
  globalSetup: "./tests/e2e/phase2-global-setup.ts",
  globalTeardown: "./tests/e2e/phase2-global-teardown.ts",
  testDir: "./tests/e2e",
  testMatch: process.env.RUN_PHASE2_STAGED_REHEARSAL === "1"
    ? "phase2-staged-rehearsal.spec.ts"
    : "phase2-rehearsal.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "artifacts/phase2-rehearsal/report", open: "never" }]],
  outputDir: "artifacts/phase2-rehearsal/results",
  timeout: 75 * 60_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL,
    ...devices["Desktop Chrome"],
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    storageState: PHASE2_VERCEL_STORAGE_STATE,
    trace: "off",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
  },
  projects: [{ name: "phase2-preview-desktop" }],
});
