import { expect, test, type Page } from "@playwright/test";
import { tashkentCountryPackV3 as tashkentCountryPackV2 } from "../../src/content/countries/tashkent.v3";
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
    mode: "live",
    countryDay: {
      id: tashkentCountryPackV2.countryDayId,
      dayNumber: 1,
      totalDays: 195,
      countryCode: "UZ",
      countryName: "Uzbekistan",
      cityName: "Tashkent",
      timeZone: "Asia/Tashkent",
      startsAt: new Date(now.getTime() - 60_000).toISOString(),
      endsAt: new Date(now.getTime() + 86_340_000).toISOString(),
      storySummary: "The journey begins in Tashkent.",
      scenePackId: tashkentCountryPackV2.assetVersion,
    },
    activeEvent: server.activeEvent,
    nextEvent: null,
    vote: null,
    presence: { activeViewers: 0, status: "live", ttlSeconds: 1 },
    steps: { global: Math.floor(server.routeSeconds * 1.8), updatedAt: now.toISOString(), stale: false },
    route: {
      globalActiveSeconds: server.routeSeconds,
      authoritativeAt: now.toISOString(),
      walking: false,
    },
    sponsor: { status: "unsponsored" },
    assets: tashkentCountryPackV2,
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
        routeAuthoritativeAt: now,
      },
    });
  });
}

test("streams the route, collapses onboarding, and eases stop/resume", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Motion sequencing runs once on desktop Chromium");
  test.setTimeout(60_000);
  const server: MotionServer = { active: true, routeSeconds: 118, activeEvent: null, heartbeatCalls: 0 };
  await installMotionApi(page, server);
  await page.goto("/?debug=world&quality=low");

  await expect(page.locator(".premise-lockup")).toHaveAttribute("data-collapsed", "true");
  await expect.poll(() => server.heartbeatCalls, { timeout: 20_000 }).toBeGreaterThan(0);
  await expect(page.locator(".traveler-sprite[data-state='walk']")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("world-diagnostics")).toContainText("mahalla-street", { timeout: 10_000 });
  await expect(page.getByTestId("world-diagnostics")).toContainText("WORLD / pixi / low");
  await expect(page.getByTestId("world-diagnostics")).toContainText(/objects \d+\/\d+/);

  const firstSegment = await page.getByTestId("world-diagnostics").getAttribute("data-segment");
  await expect.poll(async () => page.getByTestId("world-diagnostics").getAttribute("data-segment"), {
    timeout: 12_000,
  }).not.toBe(firstSegment);

  server.active = false;
  await expect(page.locator(".traveler-sprite[data-state='slow_walk']")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator(".traveler-sprite[data-state='rest']")).toBeVisible({ timeout: 5_000 });
  const stoppedRoute = server.routeSeconds;
  await page.waitForTimeout(1_000);
  expect(server.routeSeconds).toBe(stoppedRoute);

  server.active = true;
  await expect(page.locator(".traveler-sprite[data-state='resume_walk']")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".traveler-sprite[data-state='walk']")).toBeVisible({ timeout: 10_000 });
});

test("runs the canonical NPC encounter through focus, dialogue and resume", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Encounter proof runs once on desktop Chromium");
  const encounter = tashkentCountryPackV2.encounters[0];
  const server: MotionServer = {
    active: true,
    routeSeconds: 245,
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
  await expect(page.locator(".traveler-sprite[data-state='notice']")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".traveler-sprite[data-state='approach']")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".dialogue-bubble")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole("button", { name: "Read today’s conversation" })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".traveler-sprite[data-state='walk']")).toBeVisible({ timeout: 10_000 });
});
