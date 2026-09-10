import { expect, test } from "@playwright/test";
import { offlineBootstrapSnapshot } from "../../src/lib/bootstrap/offline";
import type { JourneyMapData } from "../../src/lib/map/data";

test("an approved Ticket replaces the vote, announces the destination, and draws its flight", async ({ page }) => {
  test.setTimeout(120_000);
  await page.route("**/api/bootstrap", async (route) => {
    const now = new Date();
    const base = offlineBootstrapSnapshot(now);
    await route.fulfill({ json: {
      ...base, mode: "live", countryDay: { ...base.countryDay, dayNumber: 13 }, vote: null,
      ticket: { dayNumber: 14, countryCode: "PT", countryName: "Portugal", cityName: "Lisbon", scenePackId: "lisbon-v1" },
      presence: { status: "live", activeViewers: 2, ttlSeconds: 50, waitingSince: null },
      route: { ...base.route, walking: true, globalActiveSeconds: 100, globalDistanceMetres: 125, authoritativeAt: now.toISOString() },
    } });
  });
  await page.route("**/api/presence/heartbeat", async (route) => {
    const now = new Date().toISOString();
    await route.fulfill({ json: { serverNow: now, realServerNow: now, activeViewers: 2, walking: true, globalSteps: 180, visitorActiveSeconds: 10, ttlSeconds: 50, nextHeartbeatInMs: 20_000, globalActiveSeconds: 100, globalDistanceMetres: 125, paceRate: 2, routeAuthoritativeAt: now, waitingSince: null, wokeHim: false, countryCode: "UZ", reactions: { counts: { wave: 0, water: 0, photo: 0 }, scheduled: [], nextScheduledAction: null }, weather: null } });
  });
  const map: JourneyMapData = {
    cities: [{ countryDayId: "day-13", dayNumber: 13, cityName: "Tashkent", countryName: "Uzbekistan", countryCode: "UZ", scenePackId: "tashkent-v5", lat: 41.3111, lon: 69.2797, status: "current", outcome: "current", distanceMetres: 125, transferFromPrevious: null }],
    candidates: [],
    ticketFlights: [{ ticketId: "ticket-14", dayNumber: 14, countryCode: "PT", countryName: "Portugal", cityName: "Lisbon", lat: 38.7223, lon: -9.1393 }],
    stats: { days: 1, confirmedDistanceMetres: 125, landmarks: 0, marathons: 0 }, currentDayNumber: 13,
  };
  await page.route("**/api/map", (route) => route.fulfill({ json: map }));
  await page.route("**/api/observability/vitals", (route) => route.fulfill({ status: 204 }));
  await page.goto("/");
  await expect(page.getByTestId("ticket-notice")).toHaveText("Ticket: someone is sending him to 🇵🇹 Portugal on Day 14");
  await expect(page.getByRole("button", { name: "Daily vote" })).toHaveCount(0);
  await page.getByRole("button", { name: "Journey details" }).click();
  await expect(page.getByTestId("ticket-flight")).toHaveAttribute("data-transfer", "flight");
  await expect(page.getByTestId("ticket-flight").locator("line")).toHaveClass(/flight/);
});
