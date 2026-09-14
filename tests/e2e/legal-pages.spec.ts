import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const policies = [
  ["/terms", "Terms of Service"],
  ["/privacy", "Privacy Policy"],
  ["/refund-policy", "Refund and Cancellation Policy"],
  ["/sponsor-terms", "Sponsor Terms"],
  ["/content-moderation", "Content and Listing Moderation Policy"],
  ["/contact", "Contact & Support"],
] as const;

test("every policy route is public and every global-footer link resolves", async ({ page, request }) => {
  for (const [path, heading] of policies) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Legal and support" })).toBeVisible();
    await expect(page.locator("input[type=password]")).toHaveCount(0);
  }

  await page.goto("/sponsors");
  const footer = page.getByTestId("page-legal-footer");
  for (const [path] of policies) {
    await expect(footer.locator(`a[href="${path}"]`)).toHaveCount(1);
  }
});

for (const width of [320, 375, 390, 430]) {
  test(`policy pages fit and remain readable at ${width}px`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Widths are set explicitly in this test");
    await page.setViewportSize({ width, height: 844 });
    for (const [path, heading] of policies) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      const layout = await page.evaluate(() => ({
        innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        fontSize: Number.parseFloat(getComputedStyle(document.querySelector("article p")!).fontSize),
      }));
      expect(layout.scrollWidth, path).toBeLessThanOrEqual(layout.innerWidth);
      expect(layout.fontSize, path).toBeGreaterThanOrEqual(14);
      await page.getByTestId("page-legal-footer").scrollIntoViewIfNeeded();
      await expect(page.getByTestId("page-legal-footer")).toBeInViewport();
    }
  });
}

test("captures the desktop and mobile landing legal footers", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Screenshots use explicit viewports");
  const output = "artifacts/compliance";
  await mkdir(output, { recursive: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("landing-legal-footer")).toBeVisible();
  await page.getByTestId("landing-legal-footer").screenshot({ path: `${output}/footer-desktop-1440.png` });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("landing-legal-footer")).toBeVisible();
  await page.getByTestId("landing-legal-footer").screenshot({ path: `${output}/footer-mobile-390.png` });
});
