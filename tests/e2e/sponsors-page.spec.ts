import { expect, test } from "@playwright/test";

/**
 * The price board is a server page over real inventory, so it cannot be stubbed
 * from the browser. It skips honestly when the development project has no open
 * window rather than asserting against data that is not there.
 */
test.describe("sponsor price board", () => {
  test("publishes the window, the formula and the tier price", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "One rendering of the price board is enough.");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

    await page.goto("/sponsors");
    await expect(page.getByRole("heading", { level: 1, name: /sponsor a day of the walk/i })).toBeVisible();

    const calendar = page.getByTestId("sponsor-calendar");
    test.skip(await calendar.count() === 0, "The configured development project has no open sponsor window.");

    // Exactly the rolling window is ever on sale, and each cell is a price or a name.
    const cells = page.getByTestId("sponsor-day");
    await expect(cells).toHaveCount(7);
    for (const cell of await cells.all()) {
      await expect(cell).toHaveText(/\$\d|—|✓/);
    }

    // The number that set the price is published next to it.
    await expect(page.getByTestId("sponsor-formula")).toContainText(/one cent per unique watcher/i);

    const price = page.getByTestId("sponsor-selected-price");
    if (await price.count() > 0) {
      const standard = await price.innerText();
      await page.getByLabel("Tier").selectOption("premium");
      await expect(price).not.toHaveText(standard);
      const premium = await price.innerText();
      const cents = (text: string) => Number(text.match(/\$([\d,]+)/)?.[1].replaceAll(",", "") ?? 0);
      expect(cents(premium)).toBeGreaterThan(cents(standard));
    }

    expect(errors).toEqual([]);
  });

  test("keeps the old sponsor link working", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "One redirect check is enough.");
    await page.goto("/sponsor");
    await expect(page).toHaveURL(/\/sponsors$/);
  });
});
