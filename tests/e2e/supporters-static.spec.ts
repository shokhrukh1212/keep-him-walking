import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { installJourneyApi, settled, type JourneyState } from "./helpers/journey-api";

const evidenceRoot = "docs/launch-finalization/evidence/supporters";

test("the owner-maintained supporter modal is honest and leaves the traveler mounted", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Each viewport is set explicitly");
  test.setTimeout(150_000);
  await mkdir(evidenceRoot, { recursive: true });
  const state: JourneyState = { rawSeconds: 90, sessions: new Set() };
  await installJourneyApi(page, state);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await settled(page);
  await expect(page.getByRole("link", { name: /buy him a coffee/i }))
    .toHaveAttribute("href", "https://buymeacoffee.com/shokhrukhkarimov");
  const traveler = page.getByTestId("product-character-stage");
  const mounts = await traveler.getAttribute("data-mount-count");
  await page.getByRole("button", { name: "Supporters" }).click();
  const dialog = page.getByRole("dialog", { name: "Supporters" });
  await expect(dialog).toContainText("No public supporters yet");
  await expect(page.getByRole("button", { name: "Close Supporters" })).toBeFocused();
  await page.screenshot({ path: `${evidenceRoot}/supporters-static-390x844.png` });
  await page.getByRole("button", { name: "Close Supporters" }).click();
  await expect(traveler).toHaveAttribute("data-mount-count", mounts ?? "");
});
