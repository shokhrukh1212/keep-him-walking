import { expect, test } from "@playwright/test";

test("protected Phase 3 staging and live journey evidence", async ({ page }, testInfo) => {
  const previewSecret = process.env.PREVIEW_ACCESS_SECRET;
  if (!previewSecret) throw new Error("PREVIEW_ACCESS_SECRET is required");

  await page.goto("/?debug=world");
  await expect(page.getByRole("heading", { name: "Tashkent" })).toBeVisible();
  await expect(page.getByTestId("world-diagnostics")).toBeVisible();
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
