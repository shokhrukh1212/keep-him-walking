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
    milestones: { hundredWatchersAt: null },
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

test("Dushanbe renders seamless scenery and continuously advancing 3D walking", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  await installApi(page);
  await page.goto("/");
  await expect(page.locator(".scene-stage")).toHaveAttribute("data-renderer", "pixi", { timeout: 20_000 });
  await expect(page.getByRole("button", { name: /Full motion|Motion reduced/ })).toHaveCount(0);
  const actor = page.getByTestId("product-character-stage");
  await expect(actor).toHaveAttribute("data-character-ready", "true", { timeout: 20_000 });
  await expect(actor).toHaveAttribute("data-character-state", "walk");
  await expect(page.locator(".traveler-state")).toContainText("Walking");

  const observedTimes = new Set<string>();
  for (let sample = 0; sample < 10; sample += 1) {
    observedTimes.add(await actor.getAttribute("data-character-seconds") ?? "");
    await page.waitForTimeout(250);
  }
  expect(observedTimes.size).toBeGreaterThanOrEqual(2);

  await page.screenshot({ path: testInfo.outputPath("dushanbe-walking.png") });
  const world = page.locator(".pixi-scene");
  const initialZone = await world.getAttribute("data-zone-id");
  await page.waitForTimeout(8_000);
  await expect(world).not.toHaveAttribute("data-zone-id", initialZone ?? "");
  await page.screenshot({ path: testInfo.outputPath("dushanbe-zone-transition.png") });

});
