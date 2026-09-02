import { expect, test } from "@playwright/test";
import { PHASE2_ROUTE } from "../../src/lib/story-clock/schedule";

test("isolated accelerated preview traverses all seven country-days for ten minutes each", async ({ page }) => {
  test.skip(process.env.RUN_PHASE2_REHEARSAL !== "1", "70-minute rehearsal is an explicit manual/CI gate");
  test.setTimeout(75 * 60_000);
  await page.goto("/");
  for (const expected of PHASE2_ROUTE) {
    await expect(page.locator(".day-mark")).toContainText(expected.cityName, { timeout: 11 * 60_000 });
    await expect(page.locator(".scene-stage")).toBeVisible();
    await page.waitForTimeout(9.5 * 60_000);
  }
});
