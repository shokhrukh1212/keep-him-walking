import { expect, test } from "@playwright/test";

test.skip(
  !process.env.PHASE3_PREVIEW_URL || !process.env.PREVIEW_ACCESS_SECRET,
  "Opt-in protected Preview recording requires local environment configuration",
);

test("protected Phase 3 staging and live journey evidence", async ({ page }, testInfo) => {
  const previewSecret = process.env.PREVIEW_ACCESS_SECRET;
  if (!previewSecret) throw new Error("PREVIEW_ACCESS_SECRET is required");

  await page.goto("/");
  await expect(page.getByText("Tashkent", { exact: true })).toBeVisible();
  await expect(page.locator(".traveler-sprite")).toBeVisible();
  await expect(page.getByRole("status", { name: /Walking rule/ })).toBeVisible();
  await page.waitForTimeout(5_000);
  await page.screenshot({ path: testInfo.outputPath("live-journey.png"), fullPage: true });

  const session = await page.request.post("/api/admin/preview/session", {
    data: { secret: previewSecret, packId: "sofia-v1" },
  });
  expect(session.ok()).toBe(true);

  await page.goto("/preview/sofia-v1");
  await expect(page.getByRole("heading", { name: "Sofia, Bulgaria" })).toBeVisible();
  await expect(page.locator(".preview-country article")).toHaveCount(5);
  await page.screenshot({ path: testInfo.outputPath("sofia-top.png"), fullPage: false });
  await page.locator(".preview-country article").last().scrollIntoViewIfNeeded();
  await page.waitForTimeout(2_000);
  await page.screenshot({ path: testInfo.outputPath("sofia-departure.png"), fullPage: false });

  await page.goto("/preview/prague-v1");
  await expect(page.getByRole("heading", { name: "Prague, Czechia" })).toBeVisible();
  await expect(page.locator(".preview-country article")).toHaveCount(5);
  await page.waitForTimeout(2_000);
  await page.screenshot({ path: testInfo.outputPath("prague-top.png"), fullPage: false });
});
