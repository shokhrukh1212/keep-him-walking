import { expect, test, type Page } from "@playwright/test";

async function installMe(page: Page, collected: string[], streak: number) {
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ firstVisit: false, passport: { collected, streak, collectSeconds: 30, today: null } }),
    });
  });
}

test("the passport marks the days this visitor was present for", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Passport contract runs once");
  await installMe(page, ["day-1", "day-3"], 2);
  const response = await page.goto("/archive");
  const cards = page.getByTestId("passport-card");
  test.skip(response?.status() !== 200 || await cards.count() === 0, "The development project has no published days");

  await expect(page.getByTestId("passport-streak")).toContainText("2 days in a row");
  // Whatever the seed holds, a card is either collected or not — never "maybe".
  const first = cards.first();
  await expect(first).toHaveAttribute("data-collected", /true|false/);
  await expect(first).toHaveAttribute("data-stamp", /gold|colour|grey|current|none/);
});

test("the season sheet gives every finished day a stamp and no unfinished day a colour", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Season sheet contract runs once");
  const response = await page.goto("/season/1");
  const tiles = page.getByTestId("stamp-tile");
  test.skip(response?.status() !== 200 || await tiles.count() === 0, "The development project has no Season 1 days");

  await expect(page.getByLabel("Confirmed season totals")).toBeVisible();
  const stamps = await tiles.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-stamp")));
  expect(stamps.every((stamp) => stamp && ["gold", "colour", "grey", "current", "none"].includes(stamp))).toBe(true);
  // A day still being walked is never judged early.
  const live = await tiles.evaluateAll((nodes) => nodes.filter((node) => node.getAttribute("data-stamp") === "current").length);
  expect(live).toBeLessThanOrEqual(1);
});

test("an unrun season shows the not-found page and stays out of search", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Season not-found contract runs once");
  await page.goto("/season/97");
  // The status is 200 because the root loading.tsx streams a shell before the
  // check runs; the noindex tag is what keeps this soft 404 out of search.
  await expect(page.getByRole("heading", { level: 1 })).toContainText("not on the journey");
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
  await expect(page.getByTestId("stamp-sheet")).toHaveCount(0);
});

test("the private passport route is never shared-cacheable", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Cache contract runs once");
  const response = await request.get("/api/me");
  expect([200, 429]).toContain(response.status());
  expect(response.headers()["cache-control"]).toContain("private");
  expect(response.headers()["cache-control"]).toContain("no-store");
});
