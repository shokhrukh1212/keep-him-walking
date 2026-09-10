import { expect, test, type Page } from "@playwright/test";
import { tashkentCountryPackV4 } from "../../src/content/countries/tashkent.v4";
import type { BootstrapSnapshot, ScheduledEventView } from "../../src/lib/contracts";

type MotionServer = {
  active: boolean;
  routeSeconds: number;
  activeEvent: ScheduledEventView | null;
  heartbeatCalls: number;
};

function makeSnapshot(server: MotionServer): BootstrapSnapshot {
  const now = new Date();
  return {
    serverNow: now.toISOString(),
    realServerNow: now.toISOString(),
    mode: "live",
    journeyState: "live",
    refresh: { nextAt: null, afterMs: 300_000, reason: "none" },
    journey: { travelerName: null, rolloverUtcHour: 16 },
    countryDay: {
      id: "10000000-0000-4000-8000-000000000001",
      dayNumber: 1,
      totalDays: 195,
      countryCode: "UZ",
      countryName: "Uzbekistan",
      cityName: "Tashkent",
      timeZone: "Asia/Tashkent",
      startsAt: new Date(now.getTime() - 60_000).toISOString(),
      endsAt: new Date(now.getTime() + 86_340_000).toISOString(),
      storySummary: "The journey begins in Tashkent.",
      scenePackId: tashkentCountryPackV4.assetVersion,
    },
    activeEvent: server.activeEvent,
    nextEvent: null,
    vote: null,
    presence: { activeViewers: 0, status: "live", ttlSeconds: 1, waitingSince: null },
    steps: { global: Math.floor(server.routeSeconds * 1.8), updatedAt: now.toISOString(), stale: false },
    route: {
      globalActiveSeconds: server.routeSeconds,
      globalDistanceMetres: server.routeSeconds * 1.25,
      paceRate: 1,
      authoritativeAt: now.toISOString(),
      walking: false,
    },
    countries: { live: [], todayTop: [] },
    reactions: { counts: { wave: 0, water: 0, photo: 0 }, scheduled: [], nextScheduledAction: null },
    dayPhotos: [],
    weather: null,
    sponsor: { status: "unsponsored" },
    postcard: { eligible: false, unlockSeconds: 60, contributedSeconds: 0, url: null },
    passport: { streak: 0, collectedToday: false, collectSeconds: 30 },
    milestones: { hundredWatchersAt: null },
    assets: tashkentCountryPackV4,
  };
}

async function installMotionApi(page: Page, server: MotionServer) {
  await page.route("**/api/bootstrap", (route) => route.fulfill({ json: makeSnapshot(server) }));
  await page.route("**/api/presence/heartbeat", async (route) => {
    server.heartbeatCalls += 1;
    const body = route.request().postDataJSON() as { state: "active" | "inactive" };
    const walking = server.active && body.state === "active";
    if (walking) server.routeSeconds += 0.3;
    const now = new Date().toISOString();
    await route.fulfill({
      json: {
        serverNow: now,
        activeViewers: walking ? 1 : 0,
        walking,
        globalSteps: Math.floor(server.routeSeconds * 1.8),
        visitorActiveSeconds: Math.max(0, server.routeSeconds - 118),
        ttlSeconds: 1,
        nextHeartbeatInMs: 300,
        globalActiveSeconds: server.routeSeconds,
        globalDistanceMetres: server.routeSeconds * 1.25,
        paceRate: 1,
        routeAuthoritativeAt: now,
      },
    });
  });
}

test("streams the route, collapses onboarding, and eases stop/resume", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Motion sequencing runs once on desktop Chromium");
  test.setTimeout(60_000);
  const server: MotionServer = { active: true, routeSeconds: 1_000, activeEvent: null, heartbeatCalls: 0 };
  await installMotionApi(page, server);
  await page.goto("/?debug=world&quality=low");

  await expect(page.locator(".premise-lockup")).toHaveAttribute("data-collapsed", "true");
  await expect.poll(() => server.heartbeatCalls, { timeout: 20_000 }).toBeGreaterThan(0);
  await expect(page.locator(".pixi-scene[data-character-state='walk']")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("world-diagnostics")).toContainText("mahalla-street", { timeout: 10_000 });
  await expect(page.getByTestId("world-diagnostics")).toContainText("WORLD / pixi / low");
  await expect(page.getByTestId("world-diagnostics")).toContainText(/objects \d+\/\d+/);

  const firstGroundPosition = Number(await page.locator(".pixi-scene").getAttribute("data-ground-pixels"));
  await expect.poll(async () => Number(await page.locator(".pixi-scene").getAttribute("data-ground-pixels")), {
    timeout: 12_000,
  }).toBeGreaterThan(firstGroundPosition + 5);

  server.active = false;
  const actor = page.getByTestId("product-character-stage");
  await expect(actor).toHaveAttribute("data-character-state", /stop|walk_stop/, { timeout: 5_000 });
  await expect(actor).toHaveAttribute("data-character-state", "wait_pockets", { timeout: 5_000 });
  const stoppedRoute = server.routeSeconds;
  await page.waitForTimeout(1_000);
  expect(server.routeSeconds).toBe(stoppedRoute);

  server.active = true;
  await expect(actor).toHaveAttribute("data-character-state", "resume", { timeout: 10_000 });
  await expect(actor).toHaveAttribute("data-character-state", "walk", { timeout: 10_000 });
});

test("runs the canonical NPC encounter through focus, dialogue and resume", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Encounter proof runs once on desktop Chromium");
  const encounter = tashkentCountryPackV4.encounters[0];
  const server: MotionServer = {
    active: true,
    routeSeconds: 1_520,
    activeEvent: {
      id: encounter.id,
      type: "encounter",
      startsAt: new Date(Date.now() + 10_000).toISOString(),
      durationSeconds: 45,
      status: "live",
      locationLabel: encounter.locationLabel,
      lines: encounter.lines.map((line) => ({ ...line, durationMs: 1_500 })),
    },
    heartbeatCalls: 0,
  };
  await installMotionApi(page, server);
  await page.goto("/?debug=world&quality=low");

  test.setTimeout(90_000);
  await expect(page.locator(".pixi-scene[data-character-state='notice']")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".dialogue-bubble")).toBeVisible({ timeout: 20_000 });
  // Confirm a route point beyond the metre-owned encounter. This tests the
  // authoritative resume without coupling route progress to headless GPU speed.
  server.routeSeconds = 1_570;
  await expect(page.locator(".pixi-scene[data-character-state='walk']")).toBeVisible({ timeout: 10_000 });
});
