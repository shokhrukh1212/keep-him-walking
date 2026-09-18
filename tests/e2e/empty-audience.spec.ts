import { expect, test } from "@playwright/test";
import { installJourneyApi, settled, type JourneyState } from "./helpers/journey-api";

/**
 * The rule printed under the header: he only walks while someone is watching. When the
 * server confirms nobody is, the page must say so with one voice — he stops, turns his
 * face to the viewer and speaks, the status line names the wait, and the header's count
 * agrees instead of contradicting the walk.
 */
test("nobody watching: he stops, faces the viewer and says why", async ({ page }) => {
  const state: JourneyState = { rawSeconds: 900, emptyAudience: true, onlineVisitors: 0 };
  await installJourneyApi(page, state);
  await page.goto("/");
  await settled(page);

  const stage = page.getByTestId("product-character-stage");
  // Facing the camera turns his root to zero yaw; walking holds it at 0.68.
  await expect(stage).toHaveAttribute("data-traveler-yaw", "0");
  await expect(stage).not.toHaveAttribute("data-character-state", "walk");
  await expect(page.locator(".journey-progress-primary")).toContainText("Waiting for the internet");
  // Each waiting line is spoken for six seconds, then four seconds of silence.
  await expect(page.locator("[data-dialogue=waiting]")).toContainText(
    /I only walk while someone is watching|I’ll wait right here for you|Stay with me a moment/,
    { timeout: 20_000 },
  );
  await expect(page.locator("[data-hud-region=header]")).toContainText("0 people watching");
});

/**
 * The header's count comes from DataFast, which lags and can answer 0 while the server
 * holds live leases. It may never report fewer people than the leases keeping him walking.
 */
test("a lagging visitor count never denies the watchers keeping him walking", async ({ page }) => {
  const state: JourneyState = { rawSeconds: 900, advancing: true, onlineVisitors: 0 };
  await installJourneyApi(page, state);
  await page.goto("/");
  await settled(page);

  const header = page.locator("[data-hud-region=header]");
  await expect(header).toHaveAttribute("data-confirmed-watchers", "1");
  await expect(header).toContainText("1 person watching");
});
