import { expect, test } from "@playwright/test";
import { tashkentCountryPackV3 as tashkentCountryPackV2 } from "../../src/content/countries/tashkent.v3";
import type { BootstrapSnapshot } from "../../src/lib/contracts";

test("ten-minute route soak keeps bounded pools and non-repeating compositions", async ({ page }, testInfo) => {
  test.skip(process.env.RUN_MOTION_SOAK !== "1", "Run through pnpm test:motion:soak");
  test.skip(testInfo.project.name !== "chromium", "Soak runs once on desktop Chromium");
  test.setTimeout(750_000);
  let routeSeconds = 0;
  const soakStartedAt = performance.now();
  const makeSnapshot = (): BootstrapSnapshot => {
    const now = new Date();
    return {
      serverNow: now.toISOString(), mode: "live",
      countryDay: {
        id: tashkentCountryPackV2.countryDayId, dayNumber: 1, totalDays: 195,
        countryCode: "UZ", countryName: "Uzbekistan", cityName: "Tashkent",
        timeZone: "Asia/Tashkent", startsAt: now.toISOString(),
        endsAt: new Date(now.getTime() + 86_400_000).toISOString(), storySummary: null,
        scenePackId: tashkentCountryPackV2.assetVersion,
      },
      activeEvent: null, nextEvent: null, vote: null,
      presence: { activeViewers: 0, status: "live", ttlSeconds: 1 },
      steps: { global: 0, updatedAt: now.toISOString(), stale: false },
      route: { globalActiveSeconds: routeSeconds, authoritativeAt: now.toISOString(), walking: false },
      sponsor: { status: "unsponsored" }, assets: tashkentCountryPackV2,
    };
  };
  await page.route("**/api/bootstrap", (route) => route.fulfill({ json: makeSnapshot() }));
  await page.route("**/api/presence/heartbeat", async (route) => {
    // Use Node's monotonic clock so host wall-clock corrections cannot create
    // an artificial route jump during this long-running browser test. The
    // elapsed duration still includes time between throttled heartbeats.
    routeSeconds = Math.max(0, (performance.now() - soakStartedAt) / 1_000);
    const now = new Date().toISOString();
    await route.fulfill({ json: {
      serverNow: now, activeViewers: 1, walking: true,
      globalSteps: Math.floor(routeSeconds * 1.8), visitorActiveSeconds: routeSeconds,
      ttlSeconds: 1, nextHeartbeatInMs: 1_000,
      globalActiveSeconds: routeSeconds, routeAuthoritativeAt: now,
    } });
  });
  await page.goto("/?debug=world&quality=low");
  const diagnostics = page.getByTestId("world-diagnostics");
  await diagnostics.waitFor();

  const sampledCompositions: Array<{ zone: string; segment: number; signature: string }> = [];
  let lastSegment = "";
  let maxObjects = 0;
  let minimumFps = Number.POSITIVE_INFINITY;
  let maximumP95 = 0;
  let warmHeap = 0;
  for (let sample = 0; sample < 60; sample += 1) {
    await page.waitForTimeout(10_000);
    const segment = await diagnostics.getAttribute("data-segment") ?? "";
    const zone = await diagnostics.getAttribute("data-zone") ?? "";
    const rawSignature = await diagnostics.getAttribute("data-signature") ?? "";
    const signature = `${zone}:${rawSignature}`;
    const objects = Number(await diagnostics.getAttribute("data-live-objects"));
    const fps = Number(await diagnostics.getAttribute("data-fps"));
    const p95 = Number(await diagnostics.getAttribute("data-p95-frame-ms"));
    const presentedSeconds = Number(await diagnostics.getAttribute("data-route-seconds"));
    const authoritativeSeconds = Number(
      await diagnostics.getAttribute("data-authoritative-route-seconds"),
    );
    maxObjects = Math.max(maxObjects, objects);
    minimumFps = Math.min(minimumFps, fps);
    maximumP95 = Math.max(maximumP95, p95);
    expect(Math.abs(presentedSeconds - authoritativeSeconds)).toBeLessThan(5);
    const segmentKey = `${zone}:${segment}`;
    if (segmentKey !== lastSegment && rawSignature) {
      const segmentNumber = Number(segment);
      const signaturesInsideGuard = sampledCompositions
        .filter((entry) =>
          entry.zone === zone &&
          segmentNumber > entry.segment &&
          segmentNumber - entry.segment <= 11)
        .map((entry) => entry.signature);
      // Sampling can skip multiple segments when software-rendered Chromium is
      // throttled. Compare the actual segment distance, not the number of
      // observations, so a composition 12+ segments away is not a false loop.
      expect(signaturesInsideGuard).not.toContain(signature);
      sampledCompositions.push({ zone, segment: segmentNumber, signature });
      lastSegment = segmentKey;
    }
    if (sample === 5) {
      warmHeap = await page.evaluate(() => {
        const memory = performance as Performance & { memory?: { usedJSHeapSize: number } };
        return memory.memory?.usedJSHeapSize ?? 0;
      });
    }
  }
  const finalHeap = await page.evaluate(() => {
    const memory = performance as Performance & { memory?: { usedJSHeapSize: number } };
    return memory.memory?.usedJSHeapSize ?? 0;
  });
  expect(routeSeconds).toBeGreaterThanOrEqual(590);
  expect(maxObjects).toBeLessThanOrEqual(80);
  // Headless Chromium commonly uses software rendering, so this is a liveness
  // guard rather than the physical-device performance gate documented in the
  // manual QA script.
  expect(minimumFps).toBeGreaterThanOrEqual(2);
  expect(maximumP95).toBeLessThanOrEqual(600);
  if (warmHeap > 0 && finalHeap > 0) {
    expect(finalHeap - warmHeap).toBeLessThanOrEqual(25 * 1_048_576);
  }
});
