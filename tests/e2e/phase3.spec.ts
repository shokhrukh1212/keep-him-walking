import { expect, test } from "@playwright/test";

test("launch metadata is safe for non-Production previews", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toContain("Disallow: /");
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect(await manifest.json()).toMatchObject({ name: "Keep Him Walking", display: "standalone" });
});

test("health response is non-secret and reports explicit readiness", async ({ request }) => {
  const response = await request.get("/api/health");
  expect([200, 503]).toContain(response.status());
  const text = await response.text();
  expect(text).not.toContain("SUPABASE_SECRET_KEY");
  const result = JSON.parse(text) as { status: string; checks: { registeredPacks: number } };
  expect(["ready", "degraded"]).toContain(result.status);
  expect(result.checks.registeredPacks).toBeGreaterThanOrEqual(16);
});

test("calendar reminder is UTC, downloadable and validates inputs", async ({ request }) => {
  const response = await request.get("/api/calendar?pack=dushanbe-v1&startsAt=2026-09-05T00%3A00%3A00.000Z");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("text/calendar");
  const body = await response.text();
  expect(body).toContain("DTSTART:20260905T000000Z");
  expect(body).toContain("Keep Him Walking — Dushanbe");
  expect((await request.get("/api/calendar?pack=unknown&startsAt=nope")).status()).toBe(400);
});

test("protected pack API rejects anonymous access and preview page offers login", async ({ page, request }) => {
  expect((await request.get("/api/admin/preview/sofia-v1")).status()).toBe(403);
  await page.goto("/preview");
  await expect(page.getByRole("heading", { name: "Country-pack preview" })).toBeVisible();
  await expect(page.getByLabel("Preview access key")).toBeVisible();
});

test("editorial-buffer assets are not inserted into the public next-day sequence", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("body")).not.toContainText("Sofia");
  await expect(page.locator("body")).not.toContainText("Prague");
});
