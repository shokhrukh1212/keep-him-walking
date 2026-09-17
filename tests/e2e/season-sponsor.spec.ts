import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { parisCountryPackV3 } from "../../src/content/countries/paris.v3";
import type { BootstrapSnapshot, SeasonSponsorView } from "../../src/lib/contracts";
import type { SeasonOffer } from "../../src/lib/sponsors/season-data";
import { DEMO_LOGO } from "../../src/lib/traveler/demo-sponsor";
import { conversationDurationSeconds } from "../../src/lib/world/activities";
import { installJourneyApi, journeySnapshot, setRawSeconds, settled, type JourneyState } from "./helpers/journey-api";

const evidence = "docs/launch-finalization/evidence/prompt2-season";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** A deliberately long name: the slot must truncate it without covering anything. */
const sponsor: SeasonSponsorView = {
  publicId: "7a1c5b8e-2a4d-4e7b-9c1a-3d2e1f0a9b8c",
  seasonNumber: 1,
  name: "Northwind Travel Supplies International Cooperative",
  description: "Lightweight daypacks and rain shells for people who walk cities.",
  logoUrl: DEMO_LOGO,
  href: "/r/season-sponsor/7a1c5b8e-2a4d-4e7b-9c1a-3d2e1f0a9b8c",
  state: "live",
};

function nextBoundary(fromMs: number, daysAhead: number) {
  const date = new Date(fromMs + daysAhead * DAY);
  date.setUTCHours(16, 0, 0, 0);
  return date;
}

function liveSeason(state: JourneyState, seasonSponsor: SeasonSponsorView | null): BootstrapSnapshot {
  const base = journeySnapshot(state);
  // Day 3 of 7, with the season ending in a little over four days.
  const startsAt = new Date(Date.now() - 2 * DAY - 18 * HOUR);
  return {
    ...base,
    countryDay: { ...base.countryDay, dayNumber: 3, totalDays: 7 },
    season: {
      id: "season-1", number: 1, title: "Season 1", totalDays: 7, state: "live", recap: null, next: null,
      startsAt: startsAt.toISOString(), endsAt: new Date(startsAt.getTime() + 7 * DAY).toISOString(),
    },
    seasonSponsor,
  };
}

function completedSeason(state: JourneyState): BootstrapSnapshot {
  const base = journeySnapshot(state);
  const endsAt = new Date(Date.now() - 5 * HOUR);
  return {
    ...base,
    mode: "completed",
    journeyState: "completed",
    refresh: { nextAt: null, afterMs: 300_000, reason: "none" },
    countryDay: { ...base.countryDay, dayNumber: 7, totalDays: 7 },
    presence: { activeViewers: null, status: "scheduled", ttlSeconds: 50, waitingSince: null },
    reactions: { counts: { wave: 0, water: 0, photo: 0 }, scheduled: [], nextScheduledAction: null },
    route: { ...base.route, walking: false },
    season: {
      id: "season-1", number: 1, title: "Season 1", totalDays: 7, state: "completed",
      startsAt: new Date(endsAt.getTime() - 7 * DAY).toISOString(), endsAt: endsAt.toISOString(),
      recap: {
        distanceMetres: 61_420, finalizedDays: 7, totalDays: 7,
        citiesWalked: ["Paris", "Prague", "Vienna", "Bratislava", "Ljubljana", "Zagreb", "Belgrade"]
          .map((cityName, index) => ({ dayNumber: index + 1, cityName, countryCode: "FR" })),
      },
      next: null,
    },
    seasonSponsor: { ...sponsor, state: "completed" },
  };
}

const offer: SeasonOffer = (() => {
  const startsAt = nextBoundary(Date.now(), 5);
  return {
    season: {
      id: "8b2d6c9f-3b5e-4f8c-8d2b-4e3f2a1b0c9d", number: 2, title: "Season 2",
      startsAt: startsAt.toISOString(), endsAt: new Date(startsAt.getTime() + 7 * DAY).toISOString(),
      saleClosesAt: new Date(startsAt.getTime() - DAY).toISOString(),
      cities: ["Paris", "Prague", "Vienna", "Bratislava", "Ljubljana", "Zagreb", "Belgrade"],
    },
    priceCents: 59_900, currency: "USD", priceIncludesTax: false, cutoffHours: 24,
    checkout: "request_only",
    pricing: [
      { number: 1, priceCents: 49_900, startsAt: null, endsAt: null },
      { number: 2, priceCents: 59_900, startsAt: startsAt.toISOString(), endsAt: new Date(startsAt.getTime() + 7 * DAY).toISOString() },
      { number: 3, priceCents: 69_900, startsAt: null, endsAt: null },
    ],
    ownerXUrl: "https://x.com/keephimwalking",
    currentSponsor: { name: sponsor.name, seasonNumber: 1, priceCents: 5_000 },
  };
})();

type Box = { x: number; y: number; width: number; height: number };

function intersects(a: Box | null, b: Box | null) {
  return Boolean(a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height);
}

/**
 * His on-screen box, from the 3D stage's own published foot point and height. The
 * footer's top edge already meets his soles by design, so the last few pixels of the
 * box are left out.
 */
async function travelerBox(page: Page): Promise<Box> {
  const stage = page.getByTestId("product-character-stage");
  const footX = Number(await stage.getAttribute("data-foot-x"));
  const footY = Number(await stage.getAttribute("data-foot-y"));
  const height = Number(await stage.getAttribute("data-person-height"));
  return { x: footX - height * 0.22, y: footY - height, width: height * 0.44, height: height - 6 };
}

async function open(page: Page, snapshot: (state: JourneyState) => BootstrapSnapshot, state: JourneyState) {
  await installJourneyApi(page, state);
  // Newest route wins: the season snapshot replaces the helper's plain one.
  await page.route("**/api/bootstrap", (route) => route.fulfill({ json: snapshot(state) }));
  await page.route("**/api/season-sponsor/offer", (route) => route.fulfill({ json: offer }));
  await page.goto("/");
  await settled(page);
}

const viewports = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
];

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
});

for (const viewport of viewports) {
  test(`the season sponsor line stays clear of him, the route and the controls at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Each viewport is set explicitly");
    test.setTimeout(180_000);
    await page.setViewportSize(viewport);
    await open(page, (state) => liveSeason(state, sponsor), { rawSeconds: 90 });

    await expect(page.getByTestId("season-clock")).toHaveText(/^Season 1 · Day 3 of 7 · Ends in 4d \d+h$/);
    const line = page.getByRole("link", { name: `Season supported by ${sponsor.name}. Opens their website in a new tab.` });
    await expect(line).toBeVisible();
    await expect(line).toHaveAttribute("target", "_blank");
    await expect(line).toHaveAttribute("rel", /sponsored/);

    const lineBox = await line.boundingBox();
    const statusBox = await page.locator(".traveler-state").boundingBox();
    expect(lineBox!.x).toBeGreaterThanOrEqual(0);
    expect(lineBox!.x + lineBox!.width).toBeLessThanOrEqual(viewport.width);
    // The line shares the status row at every width, so it never adds a footer row.
    expect(Math.abs((lineBox!.y + lineBox!.height / 2) - (statusBox!.y + statusBox!.height / 2))).toBeLessThanOrEqual(2);
    for (const selector of [".goal-bar", ".compact-dock", ".traveler-state"]) {
      expect(intersects(lineBox, await page.locator(selector).first().boundingBox()), `sponsor line overlaps ${selector}`).toBe(false);
    }
    // Wherever the existing status row clears him, the sponsor line does too. (At 320×568
    // the existing footer already rises over his legs, with or without a sponsor.)
    const him = await travelerBox(page);
    if (statusBox!.y >= him.y + him.height) {
      expect(intersects(lineBox, him), "sponsor line overlaps the traveler").toBe(false);
    }
    await page.screenshot({ path: `${evidence}/scene-sponsor-${viewport.width}x${viewport.height}.png` });
  });
}

for (const viewport of viewports.slice(0, 2)) {
  test(`the Sponsor modal is an X-only inquiry at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Each viewport is set explicitly");
    test.setTimeout(180_000);
    await page.setViewportSize(viewport);
    await open(page, (state) => liveSeason(state, sponsor), { rawSeconds: 90 });

    await page.getByRole("button", { name: "Sponsor a season" }).click({ force: true });
    const dialog = page.getByRole("dialog", { name: "Sponsor a season" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Feature your product on the journey");
    await expect(dialog).toContainText("Proposed starting price: $50");
    await expect(dialog).toContainText("One featured sponsor at a time.");
    await expect(dialog).toContainText("No payment or reservation is made here.");
    await expect(dialog.getByRole("button", { name: "Checkout unavailable" })).toBeDisabled();
    await expect(dialog).not.toContainText("$499");
    await expect(dialog.locator("form, input")).toHaveCount(0);
    await page.screenshot({ path: `${evidence}/sponsor-modal-${viewport.width}x${viewport.height}.png` });
  });
}

test("Journey carries one clean sponsor row", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Set explicitly");
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, (state) => liveSeason(state, sponsor), { rawSeconds: 90 });
  await page.getByRole("button", { name: "Journey", exact: true }).click({ force: true });
  const row = page.getByRole("dialog", { name: "Journey" }).getByTestId("season-sponsor-row");
  await row.scrollIntoViewIfNeeded();
  await expect(row).toContainText(sponsor.description);
  await expect(row.getByRole("link", { name: /Visit Northwind/ })).toHaveAttribute("target", "_blank");
  await page.screenshot({ path: `${evidence}/journey-sponsor-row-390x844.png` });
});

test("without a sponsor the slot stays empty and the button is enough", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Set explicitly");
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, (state) => liveSeason(state, null), { rawSeconds: 90 });
  await expect(page.getByTestId("season-clock")).toBeVisible();
  await expect(page.locator(".season-sponsor-line")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sponsor a season" })).toBeVisible();
  await page.screenshot({ path: `${evidence}/scene-no-sponsor-1440x900.png` });
});

test("an encounter caption never meets the sponsor line on a phone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Set explicitly");
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const assets = structuredClone(parisCountryPackV3);
  assets.conversations = assets.conversations.map((script) => ({ ...script, review: "approved" as const }));
  const script = assets.conversations.find((item) => item.id === "paris-canal-footbridge")!;
  const state: JourneyState = { rawSeconds: 405, advancing: true, assets };
  await open(page, (current) => liveSeason(current, sponsor), state);
  await expect(page.locator(".pixi-scene")).toHaveAttribute("data-zone-id", "paris-lanes", { timeout: 30_000 });
  const at = 432;
  state.scheduled = [{
    kind: "conversation",
    atActiveSecond: at,
    endsAtActiveSecond: at + conversationDurationSeconds(script.lines),
    occurrenceKey: "conversation:e2e-season",
    variant: script.id,
    source: "system",
  }];
  setRawSeconds(state, at + 0.1);
  const caption = page.locator(".dialogue-bubble");
  await expect(caption).toContainText("The canal suits your walking pace today.", { timeout: 30_000 });
  const lineBox = await page.locator(".season-sponsor-line").boundingBox();
  const captionBox = await caption.boundingBox();
  const statusBox = await page.locator(".traveler-state").boundingBox();
  expect(lineBox && captionBox && statusBox).toBeTruthy();
  // The caption band has always sat on the status row's top edge (they share a
  // sub-pixel seam). The sponsor line shares that row, so it may meet the caption
  // there but must never reach up into it.
  expect(Math.abs(lineBox!.y - statusBox!.y)).toBeLessThanOrEqual(2);
  expect(captionBox!.y + captionBox!.height).toBeLessThanOrEqual(lineBox!.y + 1);
  await page.screenshot({ path: `${evidence}/encounter-sponsor-390x844.png` });
});

for (const viewport of viewports.slice(0, 2)) {
  test(`a completed season shows its honest end at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Each viewport is set explicitly");
    test.setTimeout(180_000);
    await page.setViewportSize(viewport);
    await open(page, completedSeason, { rawSeconds: 90 });
    await expect(page.getByRole("status", { name: "Walking rule: Journey complete" })).toBeVisible();
    const card = page.locator(".season-complete");
    await expect(card).toContainText("Season 1 complete");
    await expect(card).toContainText("61.4 km");
    await expect(card).toContainText("7 of 7 cities walked");
    await expect(card.getByRole("link", { name: `${sponsor.name} ↗` })).toBeVisible();
    await expect(card).not.toContainText(/starts/i);
    await expect(page.locator(".reaction-buttons")).toHaveCount(0);
    await expect(page.locator(".goal-bar")).toHaveCount(0);
    await page.screenshot({ path: `${evidence}/season-complete-${viewport.width}x${viewport.height}.png` });
  });
}
