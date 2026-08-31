import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { tashkentCountryPack } from "../../src/content/countries/tashkent.v1";
import type { BootstrapSnapshot } from "../../src/lib/contracts";

type SharedServer = {
  sessions: Set<string>;
  blockedSessions: Set<string>;
  steps: number;
  selectedOptionId: string | null;
  totalBallots: number;
  startsAt: string;
};

const voteId = "30000000-0000-4000-8000-000000000001";
const optionOne = "40000000-0000-4000-8000-000000000001";
const optionTwo = "40000000-0000-4000-8000-000000000002";

function createServer(): SharedServer {
  return {
    sessions: new Set(),
    blockedSessions: new Set(),
    steps: 40,
    selectedOptionId: null,
    totalBallots: 6,
    startsAt: new Date(Date.now() - 6_000).toISOString(),
  };
}

function snapshot(server: SharedServer): BootstrapSnapshot {
  const now = new Date();
  return {
    serverNow: now.toISOString(),
    mode: "live",
    countryDay: {
      id: tashkentCountryPack.countryDayId,
      dayNumber: 1,
      totalDays: 195,
      countryCode: "UZ",
      countryName: "Uzbekistan",
      cityName: "Tashkent",
      timeZone: "Asia/Tashkent",
      startsAt: new Date(now.getTime() - 60_000).toISOString(),
      endsAt: new Date(now.getTime() + 86_340_000).toISOString(),
      storySummary: "The journey begins in Tashkent.",
    },
    activeEvent: {
      id: "20000000-0000-4000-8000-000000000001",
      type: "encounter",
      startsAt: server.startsAt,
      durationSeconds: 300,
      status: "live",
      locationLabel: "Near Chorsu Bazaar",
      lines: tashkentCountryPack.encounters[0]?.lines,
    },
    nextEvent: null,
    vote: {
      id: voteId,
      question: "Where should he pause next?",
      opensAt: new Date(now.getTime() - 60_000).toISOString(),
      closesAt: new Date(now.getTime() + 86_340_000).toISOString(),
      status: "open",
      totalBallots: server.totalBallots,
      selectedOptionId: server.selectedOptionId,
      options: [
        { id: optionOne, label: "Find the best plov", displayOrder: 0 },
        { id: optionTwo, label: "Explore Chorsu Bazaar", displayOrder: 1 },
      ],
    },
    presence: {
      activeViewers: server.sessions.size,
      status: "live",
      ttlSeconds: 50,
    },
    steps: {
      global: server.steps,
      updatedAt: now.toISOString(),
      stale: false,
    },
    sponsor: { status: "unsponsored" },
    assets: tashkentCountryPack,
  };
}

async function installApi(page: Page, server: SharedServer) {
  let currentSessionId: string | null = null;
  await page.route("**/api/bootstrap", async (route) => {
    await route.fulfill({ json: snapshot(server) });
  });
  await page.route("**/api/presence/heartbeat", async (route) => {
    const body = route.request().postDataJSON() as {
      sessionId: string;
      state: "active" | "inactive";
    };
    if (body.state === "active" && !server.blockedSessions.has(body.sessionId)) {
      if (currentSessionId && currentSessionId !== body.sessionId) {
        server.sessions.delete(currentSessionId);
      }
      currentSessionId = body.sessionId;
      server.sessions.add(body.sessionId);
    } else {
      server.sessions.delete(body.sessionId);
    }
    if (server.sessions.size > 0) server.steps += 2;
    await route.fulfill({
      json: {
        serverNow: new Date().toISOString(),
        activeViewers: server.sessions.size,
        walking: server.sessions.size > 0,
        globalSteps: server.steps,
        visitorActiveSeconds: Math.max(0, server.steps - 40),
        ttlSeconds: 50,
        nextHeartbeatInMs: 450,
      },
    });
  });
  await page.route("**/api/votes", async (route) => {
    const body = route.request().postDataJSON() as { optionId: string };
    const isNewBallot = server.selectedOptionId === null;
    if (isNewBallot) {
      server.selectedOptionId = body.optionId;
      server.totalBallots += 1;
    }
    await route.fulfill({
      json: {
        accepted: true,
        idempotent: !isNewBallot,
        selectedOptionId: server.selectedOptionId,
        totalBallots: server.totalBallots,
      },
    });
  });
  return () => currentSessionId;
}

test("the first viewport explains the live rule and remains keyboard accessible", async ({ page }) => {
  const server = createServer();
  await installApi(page, server);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "He only walks while someone is watching." })).toBeVisible();
  await expect(page.getByText("DAY 1 / 195")).toBeVisible();
  await expect(page.getByText(/person watching/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Today’s choice", { exact: false })).not.toBeVisible();

  await page.getByRole("button", { name: "Daily vote" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Daily vote" })).toBeVisible();
  await page.getByRole("button", { name: "Find the best plov" }).click();
  await expect(page.getByRole("button", { name: "Find the best plov" })).toHaveAttribute("aria-pressed", "true");

  const results = await new AxeBuilder({ page }).exclude("canvas").analyze();
  expect(results.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);

  const dock = await page.locator(".bottom-dock").boundingBox();
  const viewport = page.viewportSize();
  expect(dock).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(dock!.x).toBeGreaterThanOrEqual(0);
  expect(dock!.x + dock!.width).toBeLessThanOrEqual(viewport!.width + 1);
});

test("two browsers share presence, story, vote and persistent steps", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Two-context synchronization runs once on desktop Chromium");
  const server = createServer();
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  const getFirstSession = await installApi(first, server);
  const getSecondSession = await installApi(second, server);
  await Promise.all([first.goto("/"), second.goto("/")]);

  await expect(first.getByText("2 people watching")).toBeVisible();
  await expect(second.getByText("2 people watching")).toBeVisible();
  await expect(first.locator(".dialogue-bubble p")).toContainText(/Tashkent|plov|serious problem/);
  await expect(second.locator(".dialogue-bubble p")).toContainText(/Tashkent|plov|serious problem/);

  const secondSession = getSecondSession();
  expect(secondSession).toBeTruthy();
  server.blockedSessions.add(secondSession!);
  server.sessions.delete(secondSession!);
  await expect(first.getByText("1 person watching")).toBeVisible();
  await expect(first.getByText("The internet is keeping him moving")).toBeVisible();

  const stepsBefore = server.steps;
  const sessionBeforeReload = getFirstSession();
  await first.reload();
  await expect(first.getByText(/global steps/)).toBeVisible();
  await expect.poll(getFirstSession).not.toBe(sessionBeforeReload);
  expect(server.steps).toBeGreaterThanOrEqual(stepsBefore);

  const finalSession = getFirstSession();
  expect(finalSession).toBeTruthy();
  server.blockedSessions.add(finalSession!);
  server.sessions.delete(finalSession!);
  await expect(first.getByText("0 people watching")).toBeVisible();
  await expect(first.getByText("He’s waiting for a watcher")).toBeVisible();

  await firstContext.close();
  await secondContext.close();
});

test("the semantic experience survives without WebGL", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "WebGL fallback runs once on desktop Chromium");
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type === "webgl" || type === "webgl2" || type === "webgpu") return null;
      const invoke = original as unknown as (
        this: HTMLCanvasElement,
        contextType: string,
        ...contextAttributes: unknown[]
      ) => RenderingContext | null;
      return invoke.call(this, type, ...args);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  const server = createServer();
  await installApi(page, server);
  await page.goto("/");
  await expect(page.locator(".static-scene img")).toBeVisible();
  await expect(page.getByRole("heading", { name: "He only walks while someone is watching." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sound off" })).toBeVisible();
});
