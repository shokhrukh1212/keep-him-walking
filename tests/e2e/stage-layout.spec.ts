import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { offlineBootstrapSnapshot } from "../../src/lib/bootstrap/offline";
import { tbilisiCountryPackV1 } from "../../src/content/countries/tbilisi.v1";
import { tashkentCountryPackV4 } from "../../src/content/countries/tashkent.v4";
import { stageLayout } from "../../src/lib/world/stage-layout";
import { DEFAULT_CHARACTER_HEIGHT_TARGETS } from "../../src/lib/world/stage-targets";
import { dailyActiveWalkingSecondsAt, travelerMotionAt } from "../../src/lib/traveler/motion-clock";
import { scenePositionAt } from "../../src/lib/world/route-clock";

// Geometric assertions only: no screenshots, recordings, remote database or live writes.
test.use({ trace: "off", screenshot: "off", video: "off", deviceScaleFactor: 1 });

for (const pack of [tbilisiCountryPackV1, tashkentCountryPackV4]) {
  for (const viewport of [{width: 390, height: 844}, {width: 1440, height: 900}]) {
    test(`${pack.assetVersion} shares the painted ground at ${viewport.width} × ${viewport.height}`, async ({ page }) => {
      // Software WebGL on CI is much slower at desktop resolution; cover all five
      // zones plus resize without treating total render time as a layout failure.
      test.setTimeout(240_000);
      await page.setViewportSize(viewport);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      // Start in a walking interval clear of the first action; freeze the authority
      // so camera agreement isn't confused with network/extrapolation timing.
      let rawSeconds = 60;
      await page.route("**/api/**", async (route) => {
        const now = new Date().toISOString();
        if (route.request().url().includes("/bootstrap")) {
          const snapshot = offlineBootstrapSnapshot(new Date(now));
          await route.fulfill({json: {...snapshot, mode: "live", assets: pack,
            countryDay: {...snapshot.countryDay, id: "stage-test-day", countryCode: pack.countryCode,
              countryName: pack.countryName, cityName: pack.cityName, timeZone: pack.timeZone, scenePackId: pack.assetVersion},
            refresh: {nextAt: null, afterMs: 300_000, reason: "none"},
            presence: {status: "live", activeViewers: 1, ttlSeconds: 50},
            route: {globalActiveSeconds: rawSeconds, globalDistanceMetres: rawSeconds*1.25, paceRate:1, walking: true, authoritativeAt: now}}});
        } else if (route.request().url().includes("/presence/heartbeat")) {
          await route.fulfill({json: {countryDayId: "stage-test-day", serverNow: now, realServerNow: now,
            activeViewers: 1, walking: true, globalSteps: 0, visitorActiveSeconds: 5,
            ttlSeconds: 50, nextHeartbeatInMs: 1000, globalActiveSeconds: rawSeconds,
            globalDistanceMetres: rawSeconds*1.25, paceRate:1, routeAuthoritativeAt: now}});
        } else await route.fulfill({json: {ok: true}});
      });
      await page.goto("/");
      const actor = page.getByTestId("product-character-stage");
      const world = page.locator(".pixi-scene");
      await expect(actor).toHaveAttribute("data-character-ready", "true", {timeout: 60_000});
      await expect(page.locator(".scene-stage")).toHaveAttribute("data-renderer", "pixi", {timeout: 30_000});
      for (const [index, zone] of pack.route.zones.entries()) {
        // Locate a raw authoritative time in this 18-minute scene visit. Distance
        // intentionally does not select paintings anymore.
        for (let seconds = 60; seconds < 7_000; seconds += 1) {
          const motion = travelerMotionAt(pack, seconds);
          const scene = scenePositionAt(pack, dailyActiveWalkingSecondsAt(pack, seconds));
          if (scene.zoneIndex === index && scene.secondsIntoVisit > 10 && !motion.action) { rawSeconds = seconds; break; }
        }
        await expect(world).toHaveAttribute("data-zone-id", zone.id, {timeout: 30_000});
        await expect(actor).toHaveAttribute("data-zone-id", zone.id);
        const {width, height} = await sharp(`public${zone.fallbackUrl}`).metadata();
        const expected = stageLayout(
          viewport.width,
          viewport.height,
          width!,
          height!,
          zone.stage,
          DEFAULT_CHARACTER_HEIGHT_TARGETS,
        );
        await expect.poll(async () => Math.abs(Number(await actor.getAttribute("data-foot-y")) - expected.groundY)).toBeLessThanOrEqual(2);
        await expect.poll(async () => Math.abs(Number(await actor.getAttribute("data-person-height")) - expected.personHeightPx)).toBeLessThan(1);
        await expect.poll(async () => Math.abs(
          Number(await actor.getAttribute("data-character-image-scale")) - expected.characterImageScale,
        )).toBeLessThan(0.001);
        if (viewport.width > 600) expect(Number(await actor.getAttribute("data-person-height"))).toBeLessThanOrEqual(viewport.height * 0.36);
        // Actual Pixi publication and Three projection must also agree with one another.
        expect(Math.abs(Number(await actor.getAttribute("data-foot-y")) - Number(await world.getAttribute("data-ground-y")))).toBeLessThanOrEqual(2);
      }
      await page.setViewportSize({width: 320, height: 568});
      await expect.poll(async () => Number(await actor.getAttribute("data-foot-y"))).toBeCloseTo(568 * 0.8, 0);
      expect(errors).toEqual([]);
    });
  }
}
