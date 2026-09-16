import { expect, test } from "@playwright/test";

/**
 * The public sponsorship page is a server page. In the default inquiry mode it states the
 * proposed offer, offers no form and no checkout, and points to X.
 */
test.describe("sponsorship inquiry page", () => {
  test("publishes the proposed offer with a disabled checkout and no form", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "One rendering of the offer page is enough.");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/sponsors");
    await expect(page.getByRole("heading", { level: 1, name: /sponsor a season/i })).toBeVisible();
    await expect(page.getByText("Proposed starting price: $50")).toBeVisible();
    await expect(page.getByText("One featured sponsor at a time.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Checkout unavailable" })).toBeDisabled();
    await expect(page.getByText("Message me to discuss sponsorship. No payment or reservation is made here.")).toBeVisible();
    await expect(page.locator("form, input, textarea")).toHaveCount(0);
    await expect(page.getByText(/\$499|Seven days|Booking closes/)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Refund policy" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sponsor terms" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("answers 404 on the form, offer and checkout routes", async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "One route check is enough.");
    const headers = { Origin: "http://localhost:3000", "Content-Type": "application/json" };
    expect((await request.post("/api/season-sponsor/requests", { headers, data: {} })).status()).toBe(404);
    expect((await request.post("/api/season-sponsor/checkout", { headers, data: {} })).status()).toBe(404);
    expect((await request.get("/api/season-sponsor/offer")).status()).toBe(404);
  });

  test("keeps the old sponsor link working", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "One redirect check is enough.");
    await page.goto("/sponsor");
    await expect(page).toHaveURL(/\/sponsors$/);
  });
});
