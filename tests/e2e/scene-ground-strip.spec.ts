import { expect, test } from "@playwright/test";
import { offlineBootstrapSnapshot } from "../../src/lib/bootstrap/offline";
import { tbilisiCountryPackV1 } from "../../src/content/countries/tbilisi.v1";

/** Regression guard for the retired generated ground strip plus P4's bounded wrap. */
const ZONE_ID = "rustaveli-arrival";
const PANORAMA_ASSET = `/scenes/tbilisi/v1/zones/${ZONE_ID}/fallback.webp`;
/** Zone 0 spans 1,200 m; 75 m is clear of the wave beat at 150 m. */
const WALKING_RAW_SECONDS = 60;

test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

test("Tbilisi arrival draws one wrapping panorama with no ground strip over it", async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const anchoredAt = Date.now();
  await page.route("**/api/**", async (route) => {
    const time = Date.now();
    const seconds = WALKING_RAW_SECONDS + (time - anchoredAt) / 1_000;
    const now = new Date(time).toISOString();
    if (route.request().url().includes("/bootstrap")) {
      const snapshot = offlineBootstrapSnapshot(new Date(time));
      await route.fulfill({ json: {
        ...snapshot,
        mode: "live",
        assets: tbilisiCountryPackV1,
        countryDay: {
          ...snapshot.countryDay,
          id: "test-day",
          countryCode: "GE",
          countryName: "Georgia",
          cityName: "Tbilisi",
          timeZone: "Asia/Tbilisi",
          scenePackId: tbilisiCountryPackV1.assetVersion,
        },
        refresh: { nextAt: null, afterMs: 300_000, reason: "none" },
        presence: { status: "live", activeViewers: 1, ttlSeconds: 50 },
        route: { globalActiveSeconds: seconds, globalDistanceMetres: seconds * 1.25, paceRate: 1, walking: true, authoritativeAt: now },
      } });
      return;
    }
    if (route.request().url().includes("/presence/heartbeat")) {
      await route.fulfill({ json: {
        countryDayId: "test-day", serverNow: now, realServerNow: now,
        activeViewers: 1, walking: true, globalSteps: 0, visitorActiveSeconds: 5,
        ttlSeconds: 50, nextHeartbeatInMs: 20_000,
        globalActiveSeconds: seconds, globalDistanceMetres: seconds * 1.25, paceRate: 1,
        routeAuthoritativeAt: now,
      } });
      return;
    }
    await route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  const stage = page.locator(".pixi-scene");
  await expect(page.locator(".scene-stage")).toHaveAttribute("data-renderer", "pixi", { timeout: 30_000 });
  await expect(stage).toHaveAttribute("data-character-state", "walk", { timeout: 30_000 });

  // 1. Structural: only the panorama and P3's named radial contact shadow. The
  //    inventory covers every Sprite reachable from app.stage; Assets-loaded
  //    textures carry their URL, browser-built ones (the retired canvas strip was
  //    one) are recorded as `generated:<w>x<h>`.
  await expect
    .poll(async () => await stage.getAttribute("data-scene-textures"), { timeout: 15_000 })
    .toContain(PANORAMA_ASSET);
  const drawn = ((await stage.getAttribute("data-scene-textures")) ?? "").split(" ").filter(Boolean);
  expect(drawn.filter((url) => url.includes("ground-"))).toEqual([]);
  expect(drawn.filter((url) => url.startsWith("generated:"))).toEqual([]);
  const panoramaTextures = drawn.filter((url) => url !== "character-contact-shadow");
  expect(panoramaTextures).toHaveLength(1);
  expect(new URL(panoramaTextures[0]!, page.url()).pathname).toBe(PANORAMA_ASSET);
  await expect(stage).toHaveAttribute("data-shadow-visible", "true");
  await expect.poll(async () => Number(await stage.getAttribute("data-shadow-x"))).toBeCloseTo(1440 * 0.61, 0);
  await expect.poll(async () => Number(await stage.getAttribute("data-shadow-y"))).toBeCloseTo(900 * 0.86, 0);

  // The offset is modulo one texture span and advances continuously on the
  // distance clock. This directly guards the wrap contract without relying on
  // screenshot timing or fractional WebGL texture sampling.
  const span = Number(await stage.getAttribute("data-panorama-span"));
  const offsetBefore = Number(await stage.getAttribute("data-panorama-offset"));
  const groundPixelsBefore = Number(await stage.getAttribute("data-ground-pixels"));
  expect(span).toBeGreaterThan(0);
  expect(offsetBefore).toBeGreaterThanOrEqual(0);
  expect(offsetBefore).toBeLessThan(span);
  await expect.poll(async () => Number(await stage.getAttribute("data-ground-pixels")))
    .toBeGreaterThan(groundPixelsBefore + 30);
  const offsetAfter = Number(await stage.getAttribute("data-panorama-offset"));
  expect(offsetAfter).not.toBe(offsetBefore);
  expect(offsetAfter).toBeGreaterThanOrEqual(0);
  expect(offsetAfter).toBeLessThan(span);

  expect(errors).toEqual([]);
});
