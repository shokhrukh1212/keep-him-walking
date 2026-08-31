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
        "src/lib/steps/**/*.ts",
        "src/lib/story-clock/**/*.ts",
      ],
      exclude: ["src/**/*.test.{ts,tsx}"],
    },
  },
});
