import { expect, test, type Page } from "@playwright/test";
import { offlineBootstrapSnapshot } from "../../src/lib/bootstrap/offline";
import type { JourneyMapData } from "../../src/lib/map/data";
import { SEASON_ONE_ROUTE } from "../../src/lib/season/anniversary";

const mapFixture: JourneyMapData = {
  cities: [
    { countryDayId: "day-1", dayNumber: 1, cityName: "Tashkent", countryName: "Uzbekistan", countryCode: "UZ", scenePackId: "tashkent-v4", lat: 41.3111, lon: 69.2797, status: "completed", outcome: "landmark", distanceMetres: 12_400, transferFromPrevious: null },
    { countryDayId: "day-2", dayNumber: 2, cityName: "Dushanbe", countryName: "Tajikistan", countryCode: "TJ", scenePackId: "dushanbe-v1", lat: 38.5598, lon: 68.787, status: "completed", outcome: "unfinished", distanceMetres: 6_100, transferFromPrevious: "walk" },
    { countryDayId: "day-3", dayNumber: 3, cityName: "Bishkek", countryName: "Kyrgyzstan", countryCode: "KG", scenePackId: "bishkek-v1", lat: 42.8746, lon: 74.5698, status: "current", outcome: "current", distanceMetres: 3_200, transferFromPrevious: "walk" },
  ],
  candidates: [
    { optionId: "option-1", label: "Kazakhstan", countryCode: "KZ", lat: 43.2389, lon: 76.8897, percent: 61, transfer: "walk" },
    { optionId: "option-2", label: "Azerbaijan", countryCode: "AZ", lat: 40.4093, lon: 49.8671, percent: 39, transfer: "flight" },
  ],
  ticketFlights: [],
  stats: { days: 3, confirmedDistanceMetres: 21_700, landmarks: 1, marathons: 0 },
  currentDayNumber: 3,
};

async function installJourneyApi(page: Page, mapData: JourneyMapData = mapFixture) {
  await page.route("**/api/bootstrap", async (route) => {
    const now = new Date();
    const snapshot = offlineBootstrapSnapshot(now);
    await route.fulfill({ json: {
      ...snapshot,
      mode: "live",
      presence: { status: "live", activeViewers: 2, ttlSeconds: 50, waitingSince: null },
      route: { ...snapshot.route, walking: true, globalActiveSeconds: 100, globalDistanceMetres: 125, authoritativeAt: now.toISOString() },
    } });
  });
  await page.route("**/api/presence/heartbeat", async (route) => {
    const now = new Date().toISOString();
    await route.fulfill({ json: { countryDayId: offlineBootstrapSnapshot().countryDay.id, serverNow: now, realServerNow: now, activeViewers: 2, walking: true, globalSteps: 180, visitorActiveSeconds: 10, ttlSeconds: 50, nextHeartbeatInMs: 20_000, globalActiveSeconds: 100, globalDistanceMetres: 125, paceRate: 2, routeAuthoritativeAt: now, waitingSince: null, wokeHim: false, reactions: { counts: { wave: 0, water: 0, photo: 0 }, scheduled: [], nextScheduledAction: null } } });
  });
  await page.route("**/api/map", (route) => route.fulfill({ json: mapData }));
  await page.route("**/api/observability/vitals", (route) => route.fulfill({ status: 204 }));
}

test("the 14-country virtual route fits the Journey modal and records desktop/mobile views", async ({ page }, testInfo) => {
  const cities: JourneyMapData["cities"] = SEASON_ONE_ROUTE.map((stop, index) => ({
    countryDayId: `season1-${index + 1}`, dayNumber: index + 1,
    cityName: stop.city, countryName: stop.country, countryCode: stop.code,
    scenePackId: stop.packId, lat: stop.lat, lon: stop.lon,
    status: index < 4 ? "completed" : index === 4 ? "current" : "upcoming",
    outcome: index === 4 ? "current" : "unfinished", distanceMetres: 0,
    transferFromPrevious: index === 0 ? null : "train",
  }));
  await installJourneyApi(page, { cities, candidates: [], ticketFlights: [], stats: { days: 5, confirmedDistanceMetres: 0, landmarks: 0, marathons: 0 }, currentDayNumber: 5 });
  await page.goto("/");
  await page.getByRole("button", { name: "Journey", exact: true }).click();
  await page.getByText("Route map", { exact: true }).click();
  const map = page.getByTestId("journey-map-compact");
  await expect(map).toBeVisible();
  await expect(map.locator(".map-city")).toHaveCount(14);
  await expect(map.locator('[data-status="completed"]')).toHaveCount(4);
  await expect(map.locator('[data-status="current"]')).toHaveCount(1);
  await expect(map.locator('[data-status="upcoming"]')).toHaveCount(9);
  const frame = map.locator(".journey-map-frame");
  expect(await frame.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(await frame.evaluate((element) => element.getBoundingClientRect().right <= window.innerWidth + 1)).toBe(true);
  await map.screenshot({ path: `artifacts/season1-route-map-${testInfo.project.name}.png` });
});

test("the compact journey map renders three visited days and two live candidates", async ({ page }) => {
  test.setTimeout(120_000);
  await installJourneyApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Journey", exact: true }).click();
  await page.getByText("Route map", { exact: true }).click();
  const map = page.getByTestId("journey-map-compact");
  await expect(map).toBeVisible();
  await expect(map.locator(".map-city")).toHaveCount(3);
  await expect(map.locator(".map-candidate")).toHaveCount(2);
  await expect(map.locator('.map-city[data-current="true"]')).toHaveCount(1);
  await expect(map.locator('.map-candidate[data-transfer="flight"]')).toHaveCount(1);
  await expect(map.locator('a[href="/day/1"]')).toHaveCount(1);
});

test("the full map page renders the configured journey", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Server map contract runs once");
  const response = await page.goto("/map");
  test.skip(response?.status() === 503 || await page.getByTestId("journey-map-full").count() === 0, "The configured development project has no journey map seed");
  await expect(page.getByTestId("journey-map-full")).toBeVisible();
  await expect(page.getByLabel("Season map statistics")).toBeVisible();
});
