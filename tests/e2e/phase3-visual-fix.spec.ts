import { expect, test, type Page } from "@playwright/test";
import { dushanbeCountryPackV1 } from "../../src/content/countries/dushanbe.v1";
import type { BootstrapSnapshot } from "../../src/lib/contracts";

const recordingPack = {
  ...dushanbeCountryPackV1,
  dayRouteMetres: 90,
  route: {
    ...dushanbeCountryPackV1.route,
    zones: dushanbeCountryPackV1.route.zones.map((zone) => ({
      ...zone,
      lengthMetres: 18,
    })),
  },
};

function snapshot(routeSeconds: number): BootstrapSnapshot {
  const now = new Date();
  return {
    serverNow: now.toISOString(),
    realServerNow: now.toISOString(),
    storyScale: 1,
    mode: "live",
    journeyState: "live",
    refresh: { nextAt: null, afterMs: 300_000, reason: "none" },
    journey: { travelerName: null, rolloverUtcHour: 16 },
    countryDay: {
      id: "10000000-0000-4000-8000-000000000071",
      dayNumber: 2,
      totalDays: 7,
      countryCode: "TJ",
      countryName: "Tajikistan",
      cityName: "Dushanbe",
      timeZone: "Asia/Dushanbe",
      startsAt: new Date(now.getTime() - 60_000).toISOString(),
      endsAt: new Date(now.getTime() + 86_340_000).toISOString(),
      storySummary: "The route continues through Dushanbe.",
      scenePackId: recordingPack.assetVersion,
    },
    activeEvent: null,
    nextEvent: null,
    vote: null,
    presence: { activeViewers: 1, status: "live", ttlSeconds: 2, waitingSince: null },
    countries: { live: [], todayTop: [] },
    reactions: { counts: { wave: 0, water: 0, photo: 0 }, scheduled: [], nextScheduledAction: null },
    dayPhotos: [],
    weather: null,
    steps: { global: Math.floor(routeSeconds * 1.8), updatedAt: now.toISOString(), stale: false },
    route: { globalActiveSeconds: routeSeconds, globalDistanceMetres: routeSeconds * 1.25, paceRate: 1, authoritativeAt: now.toISOString(), walking: true },
    sponsor: { status: "unsponsored" },
    postcard: { eligible: true, unlockSeconds: 60, contributedSeconds: 75, url: null },
    passport: { streak: 0, collectedToday: false, collectSeconds: 30 },
    assets: recordingPack,
  };
}

async function installApi(page: Page) {
  let routeSeconds = 4;
  await page.route("**/api/bootstrap", (route) => route.fulfill({ json: snapshot(routeSeconds) }));
  await page.route("**/api/presence/heartbeat", async (route) => {
    routeSeconds += 1.25;
    const now = new Date().toISOString();
    await route.fulfill({ json: {
      serverNow: now,
      realServerNow: now,
      storyScale: 1,
      activeViewers: 1,
      walking: true,
      globalSteps: Math.floor(routeSeconds * 1.8),
      visitorActiveSeconds: routeSeconds,
      ttlSeconds: 2,
      nextHeartbeatInMs: 400,
      globalActiveSeconds: routeSeconds,
      globalDistanceMetres: routeSeconds * 1.25,
      paceRate: 1,
      routeAuthoritativeAt: now,
    } });
  });
}

test("Dushanbe renders seamless scenery and continuously advancing production-v2 walking", async ({ page }, testInfo) => {
  test.setTimeout(75_000);
  await installApi(page);
  await page.goto("/");
  await expect(page.locator(".scene-stage")).toHaveAttribute("data-renderer", "pixi", { timeout: 20_000 });
  await expect(page.getByRole("button", { name: /Full motion|Motion reduced/ })).toHaveCount(0);
  await expect(page.locator(".traveler-sprite[data-state='walk']")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".traveler-state")).toContainText("Walking");

  const observedFrames = new Set<string>();
  for (let sample = 0; sample < 10; sample += 1) {
    observedFrames.add(await page.locator(".traveler-frame").getAttribute("src") ?? "");
    await page.waitForTimeout(120);
  }
  expect(observedFrames.size).toBeGreaterThanOrEqual(5);
  expect([...observedFrames].every((src) => src.includes("/traveler/production/v2/walk/"))).toBe(true);

  await page.screenshot({ path: testInfo.outputPath("dushanbe-walking.png") });
  const initialZone = await page.locator(".route-status strong").textContent();
  await page.waitForTimeout(8_000);
  await expect(page.locator(".route-status strong")).not.toHaveText(initialZone ?? "");
  await page.screenshot({ path: testInfo.outputPath("dushanbe-zone-transition.png") });

});
