import { expect, test, type Page } from "@playwright/test";
import { offlineBootstrapSnapshot } from "../../src/lib/bootstrap/offline";
import { COUNTRY_HEADER } from "../../src/lib/countries/header";
import type { BootstrapSnapshot } from "../../src/lib/contracts";

const TTL_SECONDS = 50;
const COUNTRY_DAY_ID = "10000000-0000-4000-8000-000000000107";

// The edge normally supplies this. Forcing it here proves the header reaches the
// server on every heartbeat, which is the only way a country is ever credited.
test.use({ extraHTTPHeaders: { [COUNTRY_HEADER]: "GE" } });

type CountryServer = {
  nowMs: number;
  /** Set by the mocked heartbeat from the header it actually received. */
  observedCountry: string | null;
};

function snapshot(server: CountryServer): BootstrapSnapshot {
  const now = new Date(server.nowMs);
  const base = offlineBootstrapSnapshot(now);
  return {
    ...base,
    mode: "live",
    countryDay: { ...base.countryDay, id: COUNTRY_DAY_ID, totalDays: 30 },
    presence: { activeViewers: 3, status: "live", ttlSeconds: TTL_SECONDS, waitingSince: null },
    countries: {
      live: [
        { code: "GE", watchers: 1 },
        { code: "UZ", watchers: 1 },
        { code: "DE", watchers: 1 },
        { code: "US", watchers: 1 },
        { code: "FR", watchers: 1 },
      ],
      todayTop: [
        { code: "GE", watchSeconds: 7_260 },
        { code: "UZ", watchSeconds: 3_600 },
        { code: "ZZ", watchSeconds: 65 },
      ],
    },
    route: { ...base.route, authoritativeAt: now.toISOString(), walking: true },
  };
}

async function installCountryApi(page: Page, server: CountryServer) {
  await page.route("**/api/bootstrap", (route) => route.fulfill({ json: snapshot(server) }));
  await page.route("**/api/presence/heartbeat", async (route) => {
    server.observedCountry = route.request().headers()[COUNTRY_HEADER] ?? null;
    await route.fulfill({
      json: {
        countryDayId: COUNTRY_DAY_ID,
        serverNow: new Date(server.nowMs).toISOString(),
        realServerNow: new Date(server.nowMs).toISOString(),
        activeViewers: 3,
        walking: true,
        globalSteps: 0,
        visitorActiveSeconds: 0,
        ttlSeconds: TTL_SECONDS,
        nextHeartbeatInMs: 60_000,
        globalActiveSeconds: 0,
        globalDistanceMetres: 0,
        paceRate: 1,
        routeAuthoritativeAt: new Date(server.nowMs).toISOString(),
        waitingSince: null,
        wokeHim: false,
        countryCode: server.observedCountry ?? "ZZ",
      },
    });
  });
}

test("the HUD renders watcher flags and opens today's country leaderboard", async ({ page }) => {
  const server: CountryServer = { nowMs: Date.now(), observedCountry: null };
  await installCountryApi(page, server);
  await page.goto("/");

  const flags = page.getByRole("button", { name: /Watching from 5 countries/ });
  await expect(flags).toBeVisible();
  await expect(flags).toContainText("🇬🇪");
  await expect(flags).toContainText("🇺🇿");
  // Four flags are shown, the rest collapse into the overflow count.
  await expect(flags).toContainText("+1");
  await expect(flags).not.toContainText("🇫🇷");

  await flags.click();
  const sheet = page.getByLabel("Countries watching today");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Georgia" })).toBeVisible();
  await expect(sheet).toContainText("02:01");
  await expect(sheet).toContainText("01:00");
  // The unknown country renders as a globe and is never given a place name.
  await expect(sheet).toContainText("🌐");
  await expect(sheet).toContainText("Unknown");

  await sheet.getByRole("button", { name: "Close the country leaderboard" }).click();
  await expect(sheet).toBeHidden();

  // The forced header is what the server saw, so a real edge country would be credited.
  expect(server.observedCountry).toBe("GE");
});
