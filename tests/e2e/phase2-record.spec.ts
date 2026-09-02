import { test, type Page } from "@playwright/test";
import { tashkentCountryPackV4 } from "../../src/content/countries/tashkent.v4";
import type { BootstrapSnapshot, ScheduledEventView } from "../../src/lib/contracts";

const recordingPack = {
  ...tashkentCountryPackV4,
  route: {
    ...tashkentCountryPackV4.route,
    zones: tashkentCountryPackV4.route.zones.map((zone) => ({
      ...zone,
      durationActiveSeconds: 20,
    })),
  },
};

const sponsorPatch = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='128'%3E%3Crect width='128' height='128' rx='24' fill='%23f5cf79'/%3E%3Cpath d='M32 68h64' stroke='%23133a43' stroke-width='12'/%3E%3C/svg%3E";

function snapshot(routeSeconds: number, event: ScheduledEventView): BootstrapSnapshot {
  const now = new Date();
  return {
    serverNow: now.toISOString(),
    realServerNow: now.toISOString(),
    storyScale: 1,
    mode: "live",
    journeyState: "live",
    refresh: { nextAt: null, afterMs: 300_000, reason: "none" },
    countryDay: {
      id: "10000000-0000-4000-8000-000000000070",
      dayNumber: 1,
      totalDays: 7,
      countryCode: "UZ",
      countryName: "Uzbekistan",
      cityName: "Tashkent",
      timeZone: "Asia/Tashkent",
      startsAt: new Date(now.getTime() - 60_000).toISOString(),
      endsAt: new Date(now.getTime() + 86_340_000).toISOString(),
      storySummary: "The seven-day journey begins in Tashkent.",
      scenePackId: recordingPack.assetVersion,
    },
    activeEvent: event,
    nextEvent: null,
    vote: null,
    presence: { activeViewers: 1, status: "live", ttlSeconds: 2 },
    steps: { global: Math.floor(routeSeconds * 1.8), updatedAt: now.toISOString(), stale: false },
    route: { globalActiveSeconds: routeSeconds, authoritativeAt: now.toISOString(), walking: true },
    sponsor: {
      status: "sponsored",
      publicId: "phase2-recording-fixture",
      name: "Private preview fixture",
      disclosure: "Sponsored",
      patchUrl: sponsorPatch,
      ctaLabel: null,
      clickUrl: null,
    },
    postcard: { eligible: true, unlockSeconds: 60, contributedSeconds: 75, url: null },
    assets: recordingPack,
  };
}

async function installRecordingApi(page: Page) {
  let routeSeconds = 18;
  const startedAt = Date.now();
  const encounter = recordingPack.encounters[0];
  const event: ScheduledEventView = {
    id: encounter.id,
    type: "encounter",
    startsAt: new Date(startedAt + 28_000).toISOString(),
    durationSeconds: 24,
    status: "live",
    locationLabel: encounter.locationLabel,
    lines: encounter.lines.map((line) => ({ ...line, durationMs: 2_200 })),
  };
  await page.route("**/api/bootstrap", (route) => route.fulfill({ json: snapshot(routeSeconds, event) }));
  await page.route("**/api/presence/heartbeat", async (route) => {
    const body = route.request().postDataJSON() as { state: "active" | "inactive" };
    const elapsed = Date.now() - startedAt;
    const proofStop = elapsed >= 14_000 && elapsed < 20_000;
    const walking = body.state === "active" && !proofStop;
    if (walking) routeSeconds += 1;
    const now = new Date().toISOString();
    await route.fulfill({ json: {
      serverNow: now,
      realServerNow: now,
      storyScale: 1,
      activeViewers: walking ? 1 : 0,
      walking,
      globalSteps: Math.floor(routeSeconds * 1.8),
      visitorActiveSeconds: Math.max(0, routeSeconds - 18),
      ttlSeconds: 2,
      nextHeartbeatInMs: 500,
      globalActiveSeconds: routeSeconds,
      routeAuthoritativeAt: now,
    } });
  });
  await page.route("**/api/sponsor/metrics", (route) => route.fulfill({ json: { accepted: true } }));
}

test("Phase 2 production-sprite motion proof", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  await installRecordingApi(page);
  await page.goto("/?debug=world");
  await page.getByTestId("world-diagnostics").waitFor();
  const travelerBox = await page.locator(".traveler-sprite").boundingBox();
  const sponsorBox = await page.locator(".traveler-sponsor-patch").boundingBox();
  if (!travelerBox || !sponsorBox || sponsorBox.width / travelerBox.width >= 0.25) {
    throw new Error("Sponsor patch must remain a small, separately transformed traveler layer");
  }
  let previous = 0;
  for (const seconds of [8, 18, 32, 40, 49, 62, 72]) {
    await page.waitForTimeout((seconds - previous) * 1_000);
    await page.screenshot({ path: testInfo.outputPath(`checkpoint-${seconds}s.png`) });
    previous = seconds;
  }
});
