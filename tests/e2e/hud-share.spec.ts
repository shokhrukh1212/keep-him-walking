import { expect, test, type Page } from "@playwright/test";
import { offlineBootstrapSnapshot } from "../../src/lib/bootstrap/offline";

async function installHudApi(page: Page, firstVisit = false) {
  let bootstraps = 0;
  await page.route("**/api/bootstrap", async (route) => {
    const now = new Date();
    const base = offlineBootstrapSnapshot(now);
    bootstraps += 1;
    await route.fulfill({ json: {
      ...base,
      mode: "live",
      firstVisit: firstVisit && bootstraps === 1,
      presence: { status: "live", activeViewers: 13, ttlSeconds: 50, waitingSince: null },
      route: { ...base.route, walking: true, globalActiveSeconds: 300, globalDistanceMetres: 375, paceRate: 4, authoritativeAt: now.toISOString() },
      vote: {
        id: "30000000-0000-4000-8000-000000000012",
        question: "Where tomorrow?",
        kind: "destination",
        opensAt: now.toISOString(),
        closesAt: new Date(now.getTime() + 3_600_000).toISOString(),
        status: "open",
        totalBallots: 10,
        selectedOptionId: null,
        resultOptionId: null,
        options: [
          { id: "40000000-0000-4000-8000-000000000012", label: "Georgia", displayOrder: 0, packId: "tbilisi-v1", countryCode: "GE", blurb: null, votes: 6 },
          { id: "40000000-0000-4000-8000-000000000013", label: "Türkiye", displayOrder: 1, packId: "istanbul-v1", countryCode: "TR", blurb: null, votes: 4 },
        ],
      },
    } });
  });
  await page.route("**/api/presence/heartbeat", async (route) => {
    const now = new Date().toISOString();
    await route.fulfill({ json: {
      countryDayId: offlineBootstrapSnapshot().countryDay.id,
      serverNow: now,
      realServerNow: now,
      activeViewers: 13,
      walking: true,
      globalSteps: 500,
      visitorActiveSeconds: 20,
      ttlSeconds: 50,
      nextHeartbeatInMs: 20_000,
      globalActiveSeconds: 300,
      globalDistanceMetres: 375,
      paceRate: 4,
      routeAuthoritativeAt: now,
      waitingSince: null,
      wokeHim: false,
      firstWatcherShareToken: null,
      reactions: { counts: { wave: 1, water: 2, photo: 0 }, scheduled: [], nextScheduledAction: null },
    } });
  });
  await page.route("**/api/observability/vitals", (route) => route.fulfill({ status: 204 }));
}

test("HUD regions stay visible at 320, 390, and 1440 pixels", async ({ page }) => {
  test.setTimeout(120_000);
  await installHudApi(page);
  await page.goto("/");

  for (const viewport of [
    { width: 320, height: 667 },
    { width: 390, height: 844 },
    { width: 1_440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    for (const region of ["header", "where-when", "who", "status", "goal", "reactions", "vote", "dock", "sponsor"]) {
      const locator = page.locator(`[data-hud-region="${region}"]`).first();
      await expect(locator).toBeVisible();
      const box = await locator.boundingBox();
      expect(box, `${region} has a box at ${viewport.width}px`).not.toBeNull();
      expect(box!.x + box!.width, `${region} right edge at ${viewport.width}px`).toBeLessThanOrEqual(viewport.width + 1);
      expect(box!.x, `${region} left edge at ${viewport.width}px`).toBeGreaterThanOrEqual(-1);
    }
  }

  await expect(page.getByText("DAY 1 · SEASON 1")).toBeVisible();
  await expect(page.getByText(/\/ 195/)).toHaveCount(0);
});

test("first-visit line dismisses and is absent after the cookie-backed bootstrap changes", async ({ page }) => {
  await installHudApi(page, true);
  await page.goto("/");
  const overlay = page.getByRole("button", { name: "Dismiss introduction" });
  await expect(overlay).toContainText("You're watching. He's walking. That's the whole idea.");
  await overlay.click();
  await expect(overlay).toHaveCount(0);
  await page.reload();
  await expect(overlay).toHaveCount(0);
});

test("live OG routes return PNG cards", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Server route contract runs once");
  const bootstrap = await request.get("/api/bootstrap");
  test.skip(!bootstrap.ok(), "The remote development seed has no current country-day");
  const snapshot = await bootstrap.json() as { countryDay: { dayNumber: number; countryCode: string } };
  const share = await request.post("/api/share/steps");
  expect(share.status()).toBe(200);
  const { token } = await share.json() as { token: string };
  const paths = [
    "/api/og/day",
    `/api/og/steps?token=${encodeURIComponent(token)}`,
    `/api/og/country/${snapshot.countryDay.countryCode.toLowerCase()}`,
  ];
  for (const path of paths) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"], path).toContain("image/png");
    expect(response.headers()["cache-control"], path).toContain("s-maxage=60");
  }
});
