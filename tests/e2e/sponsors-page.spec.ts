import { expect, test } from "@playwright/test";

/**
 * The public season offer is a server page over the configured seasons, so it cannot
 * be stubbed from the browser. It must be reachable without signing in and state the
 * offer exactly, whether or not a season is currently open.
 */
test.describe("season sponsor offer", () => {
  test("publishes the exact offer, the terms and either a season or an honest none", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "One rendering of the offer page is enough.");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/sponsors");
    await expect(page.getByRole("heading", { level: 1, name: /sponsor a season/i })).toBeVisible();
    await expect(page.getByText("One sponsor. Seven days. $499.")).toBeVisible();
    await expect(page.getByText(/Audience size and results are not guaranteed\./).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Refund policy" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sponsor terms" })).toBeVisible();

    const facts = page.getByTestId("season-offer-facts");
    if (await facts.count() > 0) {
      await expect(facts).toContainText(/16:00 UTC/);
      await expect(facts).toContainText("USD 499.00");
      await expect(page.getByRole("button", { name: /Request this season|Submit for review/ })).toBeVisible();
    } else {
      await expect(page.getByTestId("season-offer-none")).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test("keeps the old sponsor link working", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "One redirect check is enough.");
    await page.goto("/sponsor");
    await expect(page).toHaveURL(/\/sponsors$/);
  });
});
