import { expect, test } from "@playwright/test";
import { offlineBootstrapSnapshot } from "../../src/lib/bootstrap/offline";
import { tashkentCountryPackV4 } from "../../src/content/countries/tashkent.v4";

// A laptop at 150 % display scaling. Pixi snaps its screen to whole device pixels, so this
// 1333 × 811 page gets a 1333.33 × 811.33 world. The other layout specs pin a scale of 1,
// where that rounding never shows, which is how frozen and vanishing people went unnoticed.
test.use({
  trace: "off", screenshot: "off", video: "off",
  viewport: { width: 1333, height: 811 }, deviceScaleFactor: 1.5,
});

test("the characters keep drawing when the world is snapped to device pixels", async ({ page }) => {
  // Software WebGL at 1.5 device pixels per CSS pixel is slow; give both canvases time.
  test.setTimeout(420_000);
  const pack = tashkentCountryPackV4;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Mocked authority only: no remote database, no live writes.
  await page.route("**/api/**", async (route) => {
    const now = new Date().toISOString();
    if (route.request().url().includes("/bootstrap")) {
      const snapshot = offlineBootstrapSnapshot(new Date(now));
      await route.fulfill({ json: { ...snapshot, mode: "live", assets: pack,
        countryDay: { ...snapshot.countryDay, id: "scaling-test-day", countryCode: pack.countryCode,
          countryName: pack.countryName, cityName: pack.cityName, timeZone: pack.timeZone, scenePackId: pack.assetVersion },
        refresh: { nextAt: null, afterMs: 300_000, reason: "none" },
        presence: { status: "live", activeViewers: 1, ttlSeconds: 50 },
        route: { globalActiveSeconds: 60, globalDistanceMetres: 75, paceRate: 1, walking: true, authoritativeAt: now } } });
    } else if (route.request().url().includes("/presence/heartbeat")) {
      await route.fulfill({ json: { countryDayId: "scaling-test-day", serverNow: now, realServerNow: now,
        activeViewers: 1, walking: true, globalSteps: 0, visitorActiveSeconds: 5,
        ttlSeconds: 50, nextHeartbeatInMs: 20_000, globalActiveSeconds: 60,
        globalDistanceMetres: 75, paceRate: 1, routeAuthoritativeAt: now,
        reactions: { counts: { wave: 0, water: 0, photo: 0 }, scheduled: [], nextScheduledAction: null },
        weather: null, hundredWatchersAt: null } });
    // Everything else is simply unavailable, which every other panel already handles; a
    // made-up body would crash the journey map into the error page instead.
    } else await route.fulfill({ status: 404, json: {} });
  });
  // The high tier renders the world at 1.5 device pixels per CSS pixel on this screen.
  await page.goto("/?quality=high");
  const actor = page.getByTestId("product-character-stage");
  await expect(actor).toHaveAttribute("data-character-ready", "true", { timeout: 60_000 });
  await expect(page.locator(".scene-stage")).toHaveAttribute("data-renderer", "pixi", { timeout: 30_000 });
  await expect(page.locator(".pixi-scene")).toHaveAttribute("data-zone-id", /.+/, { timeout: 30_000 });

  // Without fractional world dimensions this test would prove nothing.
  const worldWidth = await page.locator(".pixi-scene canvas").evaluate(
    (canvas) => Number.parseFloat((canvas as HTMLCanvasElement).style.width),
  );
  expect(worldWidth).not.toBe(1333);

  // The actor writes its pose only after it has drawn a frame, so a stalled stage shows
  // up as a pose that never changes while the world goes on walking.
  const first = await actor.getAttribute("data-character-seconds");
  await expect.poll(() => actor.getAttribute("data-character-seconds"), { timeout: 30_000 }).not.toBe(first);
  await expect.poll(async () => Number(await actor.getAttribute("data-foot-y"))).toBeCloseTo(811 * 0.86, 0);
  expect(errors).toEqual([]);
});
