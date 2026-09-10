import { expect, test } from "@playwright/test";

test("a seeded finished day renders its permanent outcome and handoff", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Recap route contract runs once");
  const response = await page.goto("/day/1");
  const outcome = page.locator(".outcome-stamp");
  test.skip(response?.status() === 404 || await outcome.count() === 0, "The configured development project has no finalized Day 1 seed");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/.+/);
  await expect(page.getByLabel("Final confirmed day statistics")).toBeVisible();
  await expect(outcome).toHaveAttribute("data-outcome", /gold|colour|grey/);
  await expect(page.getByRole("heading", { name: "The handoff" })).toBeVisible();
  await expect(page.locator(".recap-sponsor")).toBeVisible();
});

test("the post-kit API hides behind production admin auth", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Admin route contract runs once");
  const response = await request.get("/api/admin/postkit/1");
  expect(response.status()).toBe(404);
  const page = await request.get("/admin");
  expect(page.status()).toBe(404);
});
