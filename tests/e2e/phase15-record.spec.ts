import { test, type Page } from "@playwright/test";
import { tashkentCountryPackV3 as tashkentCountryPackV2 } from "../../src/content/countries/tashkent.v3";
import type { BootstrapSnapshot, ScheduledEventView } from "../../src/lib/contracts";

const recordingPack = {
  ...tashkentCountryPackV2,
  route: {
    ...tashkentCountryPackV2.route,
    zones: tashkentCountryPackV2.route.zones.map((zone) => ({
      ...zone,
      durationActiveSeconds: 20,
    })),
  },
};

function snapshot(routeSeconds: number, event: ScheduledEventView): BootstrapSnapshot {
  const now = new Date();
  return {
    serverNow: now.toISOString(),
    realServerNow: now.toISOString(),
    mode: "live",
    journeyState: "live",
    refresh: { nextAt: null, afterMs: 300_000, reason: "none" },
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
    activeEvent: event,
    nextEvent: null,
    vote: null,
    presence: { activeViewers: 0, status: "live", ttlSeconds: 1 },
    steps: { global: Math.floor(routeSeconds * 1.8), updatedAt: now.toISOString(), stale: false },
    route: { globalActiveSeconds: routeSeconds, authoritativeAt: now.toISOString(), walking: false },
    sponsor: { status: "unsponsored" },
    postcard: { eligible: false, unlockSeconds: 60, contributedSeconds: 0, url: null },
    assets: recordingPack,
  };
}

async function installRecordingApi(page: Page) {
  let routeSeconds = 18;
  const startedAt = Date.now();
  const encounter = tashkentCountryPackV2.encounters[0];
  const event: ScheduledEventView = {
    id: encounter.id,
    type: "encounter",
    startsAt: new Date(startedAt + 30_000).toISOString(),
    durationSeconds: 18,
    status: "live",
    locationLabel: encounter.locationLabel,
    lines: encounter.lines.map((line) => ({ ...line, durationMs: 1_500 })),
  };
  await page.route("**/api/bootstrap", (route) => route.fulfill({ json: snapshot(routeSeconds, event) }));
  await page.route("**/api/presence/heartbeat", async (route) => {
    const body = route.request().postDataJSON() as { state: "active" | "inactive" };
    const elapsed = Date.now() - startedAt;
    const demoPause = elapsed >= 16_000 && elapsed < 21_000;
    const walking = body.state === "active" && !demoPause;
    if (walking) routeSeconds += 1;
    const now = new Date().toISOString();
    await route.fulfill({ json: {
      serverNow: now,
      activeViewers: walking ? 1 : 0,
      walking,
      globalSteps: Math.floor(routeSeconds * 1.8),
      visitorActiveSeconds: routeSeconds - 18,
      ttlSeconds: 1,
      nextHeartbeatInMs: 500,
      globalActiveSeconds: routeSeconds,
      routeAuthoritativeAt: now,
    } });
  });
}

test("Phase 1.5 visual-motion proof", async ({ page }) => {
  await installRecordingApi(page);
  await page.goto("/?debug=world");
  await page.getByTestId("world-diagnostics").waitFor();
  await page.waitForTimeout(68_000);
});
