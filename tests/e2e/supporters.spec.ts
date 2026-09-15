import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import type { VoteView } from "../../src/lib/contracts";
import { installJourneyApi, settled, type JourneyState } from "./helpers/journey-api";

const evidenceRoot = "docs/launch-finalization/evidence/supporters";

type PublicSupporter = {
  id: string;
  occurredAt: string;
  displayName: string;
  coffeeCount: number | null;
};

const supporters: PublicSupporter[] = Array.from({ length: 45 }, (_, index) => ({
  id: String(index + 1),
  occurredAt: new Date(Date.UTC(2026, 0, index + 1, 12)).toISOString(),
  displayName: index === 44
    ? "A supporter with an intentionally very long acknowledgment name that must wrap rather than widen the page"
    : `Supporter ${String(index + 1).padStart(2, "0")}`,
  coffeeCount: index % 3 === 0 ? null : index % 4 + 1,
}));

const vote: VoteView = {
  id: "30000000-0000-4000-8000-000000000128",
  question: "Where should he walk tomorrow?",
  kind: "destination",
  opensAt: "2026-09-12T16:00:00Z",
  closesAt: "2026-09-13T16:00:00Z",
  status: "open",
  totalBallots: 25,
  selectedOptionId: null,
  resultOptionId: null,
  options: [
    { id: "a", label: "Lyon", displayOrder: 0, packId: null, countryCode: "FR", blurb: null, votes: 13 },
    { id: "b", label: "Brussels", displayOrder: 1, packId: null, countryCode: "BE", blurb: null, votes: 12 },
  ],
};

async function installSupportersApi(page: Page) {
  await page.route("**/api/supporters**", (route) => {
    const url = new URL(route.request().url());
    const beforeId = Number(url.searchParams.get("beforeId"));
    const end = Number.isSafeInteger(beforeId) && beforeId > 0 ? beforeId - 1 : supporters.length;
    const start = Math.max(0, end - 20);
    return route.fulfill({ json: { items: supporters.slice(start, end), hasEarlier: start > 0 } });
  });
}

async function open(page: Page, state: JourneyState, viewport: { width: number; height: number }) {
  await installJourneyApi(page, state);
  await installSupportersApi(page);
  await page.setViewportSize(viewport);
  await page.goto("/");
  await settled(page);
}

async function footerLayout(page: Page) {
  return page.evaluate(() => {
    const box = (node: Element | null) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const traveler = document.querySelector<HTMLElement>("[data-testid='product-character-stage']");
    return {
      viewportWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      footer: box(document.querySelector(".journey-footer-region")),
      dock: [...document.querySelectorAll(".compact-dock > *")].map((node) => box(node)),
      support: box(document.querySelector(".support-footer-row")),
      legal: box(document.querySelector(".global-legal-footer-landing")),
      footY: Number(traveler?.dataset.footY),
    };
  });
}

test.describe("supporter footer and modal", () => {
  test.use({ deviceScaleFactor: 1 });

  for (const viewport of [
    { width: 320, height: 568 }, { width: 375, height: 667 }, { width: 390, height: 844 },
    { width: 430, height: 932 }, { width: 667, height: 375 }, { width: 1440, height: 900 },
  ]) {
    test(`keeps two primary actions equal and the traveler clear at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "chromium", "Each viewport is set explicitly");
      test.setTimeout(150_000);
      await mkdir(evidenceRoot, { recursive: true });
      await open(page, { rawSeconds: 90, sessions: new Set() }, viewport);
      await expect(page.getByRole("link", { name: /buy him a coffee/i })).toHaveAttribute("href", "https://buymeacoffee.com/shohruxkar1");
      const layout = await footerLayout(page);
      expect(layout.dock).toHaveLength(2);
      if (viewport.width <= 600) {
        expect(Math.abs(layout.dock[0]!.width - layout.dock[1]!.width)).toBeLessThanOrEqual(1);
      } else {
        expect(layout.dock.every((control) => control!.width >= 44)).toBe(true);
      }
      expect(layout.support!.y).toBeGreaterThan(layout.dock[0]!.y);
      expect(layout.legal!.y).toBeGreaterThan(layout.support!.y);
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth);
      expect(layout.footY).toBeLessThanOrEqual(layout.footer!.y + 1);
      if (viewport.width === 320 || viewport.width === 1440 || viewport.width === 667) {
        await page.screenshot({ path: `${evidenceRoot}/footer-${viewport.width}x${viewport.height}.png` });
      }
    });
  }

  test("gives Sponsor, Vote and Journey three equal columns when voting is open", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Each viewport is set explicitly");
    test.setTimeout(150_000);
    await open(page, { rawSeconds: 90, vote, sessions: new Set() }, { width: 390, height: 844 });
    const layout = await footerLayout(page);
    expect(layout.dock).toHaveLength(3);
    expect(Math.max(...layout.dock.map((box) => box!.width)) - Math.min(...layout.dock.map((box) => box!.width))).toBeLessThanOrEqual(1);
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth);
  });

  test("paginates an overflowing chronological feed without remounting the traveler", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Each viewport is set explicitly");
    test.setTimeout(150_000);
    await mkdir(evidenceRoot, { recursive: true });
    await open(page, { rawSeconds: 90, sessions: new Set() }, { width: 390, height: 844 });
    const traveler = page.getByTestId("product-character-stage");
    const mounts = await traveler.getAttribute("data-mount-count");
    const control = page.getByRole("button", { name: "Supporters", exact: true });
    await control.click();
    const dialog = page.getByRole("dialog", { name: "Supporters" });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("button", { name: "Close Supporters" })).toBeFocused();
    await expect(dialog.getByText("Supporter 26 bought 2 coffees")).toBeVisible();
    const scroll = dialog.locator(".supporters-scroll");
    const scrollMetrics = await scroll.evaluate((node) => ({ height: node.scrollHeight, viewport: node.clientHeight }));
    expect(scrollMetrics.height).toBeGreaterThan(scrollMetrics.viewport);
    await dialog.getByRole("button", { name: "Earlier supporters" }).click();
    await expect(dialog.getByText("Supporter 06 bought 2 coffees")).toBeVisible();
    await expect(dialog.getByText("Supporter 26 bought 2 coffees")).toBeVisible();
    await expect(dialog.getByText(/intentionally very long acknowledgment name/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.screenshot({ path: `${evidenceRoot}/supporters-overflow-390x844.png` });
    await dialog.getByRole("button", { name: "Latest" }).click();
    await expect(dialog.getByText("Supporter 26 bought 2 coffees")).toBeVisible();
    await page.getByRole("button", { name: "Close Supporters" }).click();
    await expect(dialog).toBeHidden();
    await expect(control).toBeFocused();
    await expect(traveler).toHaveAttribute("data-mount-count", mounts ?? "");
  });
});
