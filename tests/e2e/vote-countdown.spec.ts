import { expect, test, type Page } from "@playwright/test";
import { offlineBootstrapSnapshot } from "../../src/lib/bootstrap/offline";
import type { BootstrapSnapshot } from "../../src/lib/contracts";

const COUNTRY_DAY_ID = "10000000-0000-4000-8000-000000000109";
const ROLLOVER_UTC_HOUR = 16;

function snapshot(): BootstrapSnapshot {
  const now = new Date();
  const base = offlineBootstrapSnapshot(now);
  return {
    ...base,
    mode: "live",
    countryDay: { ...base.countryDay, id: COUNTRY_DAY_ID, totalDays: 30 },
    journey: { travelerName: null, rolloverUtcHour: ROLLOVER_UTC_HOUR },
    presence: { activeViewers: 3, status: "live", ttlSeconds: 50, waitingSince: null },
    route: { ...base.route, authoritativeAt: now.toISOString(), walking: true },
    vote: {
      id: "20000000-0000-4000-8000-000000000110",
      question: "Where should he walk tomorrow?",
      kind: "destination",
      opensAt: new Date(now.getTime() - 3_600_000).toISOString(),
      closesAt: new Date(now.getTime() + 86_400_000).toISOString(),
      status: "open",
      totalBallots: 25,
      selectedOptionId: null,
      resultOptionId: null,
      options: [
        {
          id: "30000000-0000-4000-8000-000000000111",
          label: "Georgia",
          displayOrder: 0,
          packId: "tbilisi-v1",
          countryCode: "GE",
          blurb: "Carved balconies above sulphur baths.",
          votes: 13,
        },
        {
          id: "30000000-0000-4000-8000-000000000112",
          label: "Türkiye",
          displayOrder: 1,
          packId: "istanbul-v1",
          countryCode: "TR",
          blurb: "Ferries between two continents.",
          votes: 12,
        },
      ],
    },
  };
}

async function installVoteApi(page: Page) {
  await page.route("**/api/bootstrap", (route) => route.fulfill({ json: snapshot() }));
  await page.route("**/api/presence/heartbeat", (route) => route.fulfill({ status: 503, json: {} }));
}

test("the vote chip shows candidate flags, the live split and a countdown to rollover", async ({ page }) => {
  await installVoteApi(page);
  await page.goto("/");

  const chip = page.getByRole("button", { name: /Destination vote\. Closes in/ });
  await expect(chip).toBeVisible();
  await expect(chip).toContainText("🇬🇪");
  await expect(chip).toContainText("🇹🇷");
  // Server-confirmed ballots only: 13 of 25 is 52 %.
  await expect(chip).toContainText("52%");
  await expect(chip).toContainText("48%");

  // The countdown names a real remaining time, never a placeholder.
  const countdown = chip.locator(".vote-chip-countdown");
  await expect(countdown).toHaveText(/^(\d+h \d+m|\d+m \d{2}s|\d+s)$/);

  const first = await countdown.textContent();
  await expect(async () => {
    const later = await countdown.textContent();
    expect(later).not.toBe(first);
  }).toPass({ timeout: 15_000 });

  // Opening the chip opens the full ballot with its blurbs.
  await chip.click();
  const panel = page.getByLabel("Daily vote");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Carved balconies above sulphur baths.");
});
