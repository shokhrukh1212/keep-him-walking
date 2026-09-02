import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "src/lib/content/schema.ts",
        "src/lib/presence/**/*.ts",
        "src/lib/payments/state-machine.ts",
        "src/lib/payments/webhook.ts",
        "src/lib/steps/**/*.ts",
        "src/lib/story-clock/**/*.ts",
        "src/lib/traveler/rig-contract.ts",
        "src/lib/world/**/*.ts",
      ],
      exclude: ["src/**/*.test.{ts,tsx}"],
      thresholds: {
        "src/lib/payments/{state-machine,webhook}.ts": {
          statements: 85, lines: 85, functions: 85, branches: 80,
        },
        "src/lib/story-clock/{schedule,cadence,cron-auth}.ts": {
          statements: 85, lines: 85, functions: 85, branches: 80,
        },
        "src/lib/traveler/rig-contract.ts": {
          statements: 85, lines: 85, functions: 85, branches: 80,
        },
      },
    },
  },
});
