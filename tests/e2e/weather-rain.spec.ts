import { expect, test, type Page } from "@playwright/test";
import { offlineBootstrapSnapshot } from "../../src/lib/bootstrap/offline";
import type { BootstrapSnapshot } from "../../src/lib/contracts";
import type { JourneyWeather } from "../../src/lib/weather/open-meteo";

const COUNTRY_DAY_ID = "10000000-0000-4000-8000-000000000113";

// WMO 61: steady rain, with enough wind to speed the particles up.
const RAIN: JourneyWeather = {
  code: 61,
  tempC: 13.4,
  windKmh: 34,
  isDay: true,
  fetchedAt: new Date().toISOString(),
};

function snapshot(weather: JourneyWeather | null): BootstrapSnapshot {
  const now = new Date();
  const base = offlineBootstrapSnapshot(now);
  return {
    ...base,
    mode: "live",
    countryDay: { ...base.countryDay, id: COUNTRY_DAY_ID, totalDays: 30 },
    presence: { activeViewers: 2, status: "live", ttlSeconds: 50, waitingSince: null },
    weather,
    route: {
      globalActiveSeconds: 400,
      globalDistanceMetres: 500,
      paceRate: 1,
      authoritativeAt: now.toISOString(),
      walking: true,
    },
  };
}

async function installWeatherApi(page: Page, weather: JourneyWeather | null) {
  await page.route("**/api/bootstrap", (route) => route.fulfill({ json: snapshot(weather) }));
  await page.route("**/api/presence/heartbeat", async (route) => {
    const now = new Date();
    await route.fulfill({
      json: {
        countryDayId: COUNTRY_DAY_ID,
        serverNow: now.toISOString(),
        realServerNow: now.toISOString(),
        activeViewers: 2,
        walking: true,
        globalSteps: 0,
        visitorActiveSeconds: 0,
        ttlSeconds: 50,
        nextHeartbeatInMs: 20_000,
        globalActiveSeconds: 400,
        globalDistanceMetres: 500,
        paceRate: 1,
        routeAuthoritativeAt: now.toISOString(),
        waitingSince: null,
        wokeHim: false,
        countryCode: "ZZ",
        reactions: { counts: { wave: 0, water: 0, photo: 0 }, scheduled: [], nextScheduledAction: null },
        weather,
      },
    });
  });
}

test("a rain reading falls in the scene and is named in the status pill", async ({ page }) => {
  await installWeatherApi(page, RAIN);
  await page.goto("/");

  const scene = page.locator(".pixi-scene");
  await expect(scene).toHaveAttribute("data-weather-kind", "rain", { timeout: 30_000 });
  await expect(async () => {
    const particles = Number(await scene.getAttribute("data-weather-particles"));
    expect(particles).toBeGreaterThan(0);
  }).toPass({ timeout: 30_000 });

  // Never render a state the status line does not name.
  await expect(page.getByRole("status", { name: /Walking rule/ })).toContainText("in the rain");
  // The HUD carries the real temperature next to the local time.
  await expect(page.locator(".hud-weather")).toHaveText(/^13° /);

  // The grade the world and the character share is a real hour-derived value.
  const localHour = Number(await scene.getAttribute("data-local-hour"));
  expect(localHour).toBeGreaterThanOrEqual(0);
  expect(localHour).toBeLessThan(24);
});

test("clear weather leaves the scene dry and the pill unqualified", async ({ page }) => {
  await installWeatherApi(page, { ...RAIN, code: 0, windKmh: 4 });
  await page.goto("/");

  const scene = page.locator(".pixi-scene");
  await expect(scene).toHaveAttribute("data-weather-kind", "none", { timeout: 30_000 });
  await expect(scene).toHaveAttribute("data-weather-particles", "0");
  await expect(page.getByRole("status", { name: /Walking rule/ })).not.toContainText("in the rain");
});

test("no confirmed reading shows no temperature at all", async ({ page }) => {
  await installWeatherApi(page, null);
  await page.goto("/");

  await expect(page.locator(".journey-hud")).toBeVisible();
  await expect(page.locator(".hud-weather")).toHaveCount(0);
});
