import { expect, test, type Page } from "@playwright/test";
import { offlineBootstrapSnapshot } from "../../src/lib/bootstrap/offline";
import type { BootstrapSnapshot } from "../../src/lib/contracts";

const TTL_SECONDS = 50;
const FIRST_WATCHER_GAP_SECONDS = 600;

type WaitingServer = {
  nowMs: number;
  leases: Map<string, number>;
  waitingSince: number | null;
  distanceMetres: number;
};

function expireLeases(server: WaitingServer) {
  const expiries = [...server.leases.values()]
    .map((lastSeen) => lastSeen + TTL_SECONDS * 1_000)
    .filter((expiresAt) => expiresAt <= server.nowMs);
  for (const [sessionId, lastSeen] of server.leases) {
    if (lastSeen + TTL_SECONDS * 1_000 <= server.nowMs) server.leases.delete(sessionId);
  }
  if (server.leases.size === 0 && expiries.length > 0 && server.waitingSince === null) {
    server.waitingSince = Math.max(...expiries);
  }
}

function snapshot(server: WaitingServer): BootstrapSnapshot {
  expireLeases(server);
  const now = new Date(server.nowMs);
  const base = offlineBootstrapSnapshot(now);
  return {
    ...base,
    mode: "live",
    countryDay: {
      ...base.countryDay,
      id: "10000000-0000-4000-8000-000000000106",
      totalDays: 30,
    },
    presence: {
      activeViewers: server.leases.size,
      status: "live",
      ttlSeconds: TTL_SECONDS,
      waitingSince: server.waitingSince === null
        ? null
        : new Date(server.waitingSince).toISOString(),
    },
    route: {
      ...base.route,
      globalDistanceMetres: server.distanceMetres,
      authoritativeAt: now.toISOString(),
      walking: server.leases.size > 0,
    },
  };
}

async function installWaitingApi(page: Page, server: WaitingServer) {
  await page.route("**/api/bootstrap", (route) => route.fulfill({ json: snapshot(server) }));
  await page.route("**/api/presence/heartbeat", async (route) => {
    expireLeases(server);
    const body = route.request().postDataJSON() as {
      sessionId: string;
      state: "active" | "inactive";
    };
    const viewersBefore = server.leases.size;
    const endedWait = server.waitingSince;
    if (body.state === "active") server.leases.set(body.sessionId, server.nowMs);
    else server.leases.delete(body.sessionId);
    if (viewersBefore > 0 && server.leases.size === 0) server.waitingSince = server.nowMs;

    const firstArrival = viewersBefore === 0 && server.leases.size === 1;
    const waitingSince = firstArrival ? endedWait : server.waitingSince;
    const wokeHim = firstArrival && waitingSince !== null
      && server.nowMs - waitingSince >= FIRST_WATCHER_GAP_SECONDS * 1_000;
    if (firstArrival) server.waitingSince = null;

    await route.fulfill({
      json: {
        countryDayId: "10000000-0000-4000-8000-000000000106",
        serverNow: new Date(server.nowMs).toISOString(),
        realServerNow: new Date(server.nowMs).toISOString(),
        activeViewers: server.leases.size,
        walking: server.leases.size > 0,
        globalSteps: 0,
        visitorActiveSeconds: 0,
        ttlSeconds: TTL_SECONDS,
        nextHeartbeatInMs: 60_000,
        globalActiveSeconds: 0,
        globalDistanceMetres: server.distanceMetres,
        paceRate: 1,
        routeAuthoritativeAt: new Date(server.nowMs).toISOString(),
        waitingSince: waitingSince === null ? null : new Date(waitingSince).toISOString(),
        wokeHim,
      },
    });
  });
}

test("an arrival after the last lease expires sees the first-watcher beat and wake card", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The two-context lease transition runs once");
  const server: WaitingServer = {
    nowMs: Date.now(),
    leases: new Map(),
    waitingSince: null,
    distanceMetres: 0,
  };

  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await installWaitingApi(pageA, server);
  await pageA.goto("/");
  await expect(pageA.getByText("1 person watching")).toBeVisible();
  await contextA.close();

  // Cross both the lease-expiry boundary and the configured first-watcher gap.
  server.nowMs += (TTL_SECONDS + FIRST_WATCHER_GAP_SECONDS + 1) * 1_000;

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await installWaitingApi(pageB, server);
  await pageB.goto("/");

  await expect(pageB.getByRole("heading", { name: /He's been waiting since/ })).toBeVisible();
  await expect(pageB.getByText("You're the first person here.")).toBeVisible();
  await pageB.getByRole("button", { name: "Journey", exact: true }).click({ force: true });
  await expect(pageB.getByRole("heading", { name: "You woke him up" })).toBeVisible();
  await expect(pageB.getByLabel("You woke him up")).toContainText("Tashkent");
  await expect(pageB.getByLabel("You woke him up").getByRole("button", { name: "Share" }))
    .toBeVisible();

  await contextB.close();
});
