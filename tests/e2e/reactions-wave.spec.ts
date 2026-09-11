import { expect, test, type Page } from "@playwright/test";
import { offlineBootstrapSnapshot } from "../../src/lib/bootstrap/offline";
import type { BootstrapSnapshot, ScheduledActionView } from "../../src/lib/contracts";

const TTL_SECONDS = 50;
const COUNTRY_DAY_ID = "10000000-0000-4000-8000-000000000108";
// Past every route beat, so the story timeline is quiet and 600 s sits exactly
// on a planted-foot boundary (600 / 0.6 = 1000).
const GLOBAL_ACTIVE_SECONDS = 600;
const GLOBAL_DISTANCE_METRES = 9_000;

type ReactionServer = {
  waveCount: number;
  waveVisitors: Set<string>;
  scheduled: ScheduledActionView[];
};

function reactions(server: ReactionServer) {
  return {
    counts: { wave: server.waveCount, water: 0, photo: 0 },
    scheduled: server.scheduled,
    nextScheduledAction: server.scheduled[0] ?? null,
  };
}

function snapshot(server: ReactionServer): BootstrapSnapshot {
  const now = new Date();
  const base = offlineBootstrapSnapshot(now);
  return {
    ...base,
    mode: "live",
    countryDay: { ...base.countryDay, id: COUNTRY_DAY_ID, totalDays: 30 },
    refresh: { nextAt: null, afterMs: 1_000, reason: "none" },
    presence: { activeViewers: 1, status: "live", ttlSeconds: TTL_SECONDS, waitingSince: null },
    reactions: reactions(server),
    route: {
      globalActiveSeconds: GLOBAL_ACTIVE_SECONDS,
      globalDistanceMetres: GLOBAL_DISTANCE_METRES,
      paceRate: 1,
      authoritativeAt: now.toISOString(),
      walking: true,
    },
  };
}

async function installReactionApi(page: Page, server: ReactionServer, visitor: string) {
  await page.route("**/api/bootstrap", (route) => route.fulfill({ json: snapshot(server) }));
  await page.route("**/api/me", (route) => route.fulfill({ json: { firstVisit: false } }));
  await page.route("**/api/observability/vitals", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/presence/heartbeat", async (route) => {
    const now = new Date();
    await route.fulfill({
      json: {
        countryDayId: COUNTRY_DAY_ID,
        serverNow: now.toISOString(),
        realServerNow: now.toISOString(),
        activeViewers: 1,
        walking: true,
        globalSteps: 0,
        visitorActiveSeconds: 0,
        ttlSeconds: TTL_SECONDS,
        nextHeartbeatInMs: 500,
        // Re-anchoring at the same second keeps both clients inside the wave's
        // 2.5 s window for the length of the assertion.
        globalActiveSeconds: GLOBAL_ACTIVE_SECONDS,
        globalDistanceMetres: GLOBAL_DISTANCE_METRES,
        paceRate: 1,
        routeAuthoritativeAt: now.toISOString(),
        waitingSince: null,
        wokeHim: false,
        countryCode: "ZZ",
        reactions: reactions(server),
      },
    });
  });
  await page.route("**/api/reactions", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { countryDayId: COUNTRY_DAY_ID, reactions: reactions(server) } });
      return;
    }
    // One wave per visitor, exactly as consume_mutation_rate_limit enforces.
    if (!server.waveVisitors.has(visitor)) {
      server.waveVisitors.add(visitor);
      server.waveCount += 1;
    }
    let scheduledAt: number | null = null;
    if (server.waveCount >= 1 && server.scheduled.length === 0) {
      scheduledAt = GLOBAL_ACTIVE_SECONDS;
      server.scheduled = [{ kind: "wave", atActiveSecond: scheduledAt }];
      server.waveCount = 0;
    }
    await route.fulfill({
      json: {
        accepted: true,
        kind: "wave",
        count: server.waveCount,
        threshold: 1,
        scheduledAt,
        cooldownSeconds: 60,
      },
    });
  });
}

test("one confirmed watcher can make him wave", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The solo crowd action runs once");
  const server: ReactionServer = { waveCount: 0, waveVisitors: new Set(), scheduled: [] };

  await installReactionApi(page, server, "solo");
  await page.goto("/");
  const intro = page.getByRole("button", { name: "Dismiss introduction" });
  if (await intro.count()) await intro.click();

  const wave = page.locator('.reaction-button[data-kind="wave"]');
  await expect(wave).toBeEnabled();

  // The scene is continuously animated; bypass Playwright's layout-stability wait
  // while retaining a real pointer click on the fixed HUD control.
  await wave.click({ force: true });
  await expect(wave).toBeDisabled();
  expect(server.scheduled).toEqual([{ kind: "wave", atActiveSecond: GLOBAL_ACTIVE_SECONDS }]);

  await expect(page.getByRole("status", { name: /Walking rule/ })).toContainText("Waving back");
});
