import { mkdir, writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { PRELAUNCH_MONOLOGUES } from "../../src/content/prelaunch/monologues";
import { PREVIEW_INTERVAL_SECONDS, monologueCues, monologueTimeline } from "../../src/lib/preview/monologue";
import { settled } from "./helpers/journey-api";
import {
  installPrelaunchApi,
  installPreviewRecorder,
  prelaunchApi,
  prelaunchEvidenceRoot,
  previewLog,
  setPageVisible,
  speechSpans,
  type PrelaunchApi,
  type PreviewLog,
} from "./helpers/prelaunch-api";

const FIRST_LINE_SECONDS = monologueTimeline(PRELAUNCH_MONOLOGUES[0]!.text).durationSeconds;
const INTERVAL_MS = PREVIEW_INTERVAL_SECONDS * 1_000;
/** Every cue he can say, fallbacks included, each measured in the caption at every width. */
const ALL_CUES = [...new Set(PRELAUNCH_MONOLOGUES
  .flatMap((line) => [line.text, ...(line.fallback ? [line.fallback] : [])])
  .flatMap((text) => monologueCues(text)))];

type Viewport = { width: number; height: number };
const measurements: Record<string, unknown> = {};

const caption = (page: Page) => page.getByTestId("preview-caption");
const stage = (page: Page) => page.getByTestId("product-character-stage");

async function openPreview(page: Page, api: PrelaunchApi, viewport: Viewport) {
  await installPrelaunchApi(page, api);
  await installPreviewRecorder(page);
  await page.setViewportSize(viewport);
  await page.goto("/");
  await settled(page);
}

async function waitForSpeech(page: Page, sequence: number, timeout = 30_000) {
  await expect(caption(page)).toHaveAttribute("data-sequence", String(sequence), { timeout });
  await expect(caption(page)).toHaveAttribute("data-speaking", "true", { timeout: 2_000 });
}

/** Makes sure a line is being spoken now, fast-forwarding the page clock to the next one if needed. */
async function speechUnderWay(page: Page): Promise<number> {
  const current = Number(await caption(page).getAttribute("data-sequence"));
  if (await caption(page).getAttribute("data-speaking") === "true") return current;
  if (current === 0) {
    await waitForSpeech(page, 1);
    return 1;
  }
  await page.clock.fastForward(INTERVAL_MS);
  await waitForSpeech(page, current + 1, 20_000);
  return current + 1;
}

type Box = { x: number; y: number; w: number; h: number };

async function layoutReport(page: Page) {
  return page.evaluate(() => {
    const box = (element: Element | null) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
    };
    const character = document.querySelector<HTMLElement>("[data-testid='product-character-stage']")!;
    const footX = Number(character.dataset.footX);
    const footY = Number(character.dataset.footY);
    const person = Number(character.dataset.personHeight);
    const text = document.querySelector<HTMLElement>("[data-testid='preview-caption']");
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      caption: box(text),
      band: box(document.querySelector("[data-testid='preview-caption-band']")),
      // His whole figure, arms at rest included: head to soles.
      body: { x: footX - person * 0.2, y: footY - person * 1.02, w: person * 0.4, h: person * 1.04 },
      status: box(document.querySelector(".journey-progress-panel")),
      dock: [...document.querySelectorAll(".compact-dock > *")].map(box),
      sound: box(document.querySelector(".sound-toggle")),
      header: box(document.querySelector(".journey-hud .day-mark")),
      rule: box(document.querySelector(".journey-rule")),
      overflow: text ? { scrollHeight: text.scrollHeight, clientHeight: text.clientHeight, scrollWidth: text.scrollWidth, clientWidth: text.clientWidth } : null,
      pageScrollWidth: document.documentElement.scrollWidth,
      fontSizePx: text ? parseFloat(getComputedStyle(text).fontSize) : 0,
    };
  });
}

type LayoutReport = Awaited<ReturnType<typeof layoutReport>>;

const intersects = (a: Box | null, b: Box | null) => Boolean(a && b
  && a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5);

function expectClear(report: LayoutReport, label: string) {
  const { caption: box, viewport } = report;
  expect(box, label).not.toBeNull();
  expect(box!.x, `${label}: left edge`).toBeGreaterThanOrEqual(-0.5);
  expect(box!.y, `${label}: top edge`).toBeGreaterThanOrEqual(-0.5);
  expect(box!.x + box!.w, `${label}: right edge`).toBeLessThanOrEqual(viewport.w + 0.5);
  expect(box!.y + box!.h, `${label}: bottom edge`).toBeLessThanOrEqual(viewport.h + 0.5);
  expect(intersects(box, report.body), `${label}: covers him`).toBe(false);
  for (const [name, other] of [["status", report.status], ["sound", report.sound], ["header", report.header], ["rule", report.rule]] as const) {
    expect(intersects(box, other), `${label}: covers the ${name}`).toBe(false);
  }
  report.dock.forEach((other, index) => expect(intersects(box, other), `${label}: covers dock control ${index}`).toBe(false));
  expect(report.overflow!.scrollHeight, `${label}: clipped vertically`).toBeLessThanOrEqual(report.overflow!.clientHeight + 1);
  expect(report.overflow!.scrollWidth, `${label}: clipped horizontally`).toBeLessThanOrEqual(report.overflow!.clientWidth + 1);
  expect(report.pageScrollWidth, `${label}: page scrolls sideways`).toBeLessThanOrEqual(viewport.w);
  expect(report.fontSizePx, `${label}: text shrunk`).toBeGreaterThanOrEqual(15);
}

/** Puts one cue into the (idle) caption, as it would show while speaking, and measures it. */
async function measureCue(page: Page, text: string) {
  await page.evaluate((cue) => {
    const element = document.querySelector<HTMLElement>("[data-testid='preview-caption']")!;
    element.dataset.speaking = "true";
    element.querySelector("span")!.textContent = cue;
  }, text);
  const report = await layoutReport(page);
  await page.evaluate(() => {
    const element = document.querySelector<HTMLElement>("[data-testid='preview-caption']")!;
    element.dataset.speaking = "false";
    element.querySelector("span")!.textContent = "";
  });
  return report;
}

/** How far the drawn take trailed or led the caption, for each line in the log. */
function syncReport(log: PreviewLog) {
  const { captions, talks } = speechSpans(log.events);
  const sorted = [...log.frames].sort((left, right) => left - right);
  const p90FrameMs = sorted[Math.floor(sorted.length * 0.9)] ?? 16.7;
  // A caption is a DOM change and the take a WebGL draw: they can be one rendered frame apart.
  const toleranceMs = Math.max(250, 1.5 * p90FrameMs);
  return {
    p90FrameMs,
    toleranceMs,
    lines: captions.map((span, index) => {
      const talk = talks.find((candidate) => Math.abs(candidate.start - span.start) <= Math.max(toleranceMs, 2_000)) ?? talks[index];
      return {
        sequence: span.sequence,
        line: span.line,
        captionSeconds: span.end === null ? null : (span.end - span.start) / 1_000,
        talkStartDeltaMs: talk ? talk.start - span.start : null,
        talkEndDeltaMs: talk?.end != null && span.end !== null ? talk.end - span.end : null,
      };
    }),
  };
}

function expectInSync(report: ReturnType<typeof syncReport>) {
  for (const line of report.lines.filter((entry) => entry.captionSeconds !== null)) {
    expect(Math.abs(line.talkStartDeltaMs ?? Number.POSITIVE_INFINITY), `${line.line}: talk start`).toBeLessThanOrEqual(report.toleranceMs);
    expect(Math.abs(line.talkEndDeltaMs ?? Number.POSITIVE_INFINITY), `${line.line}: talk end`).toBeLessThanOrEqual(report.toleranceMs);
  }
}

test.afterAll(async ({}, workerInfo) => {
  if (Object.keys(measurements).length === 0) return;
  await mkdir(prelaunchEvidenceRoot, { recursive: true });
  await writeFile(
    `${prelaunchEvidenceRoot}/measurements-${workerInfo.project.name}.json`,
    `${JSON.stringify({ recordedAt: new Date().toISOString(), environment: "headless Chromium emulation (SwiftShader), not a physical device", ...measurements }, null, 2)}\n`,
  );
});

test.describe("prelaunch preview · desktop", () => {
  test.use({ deviceScaleFactor: 1 });
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Each viewport is set explicitly");
    await mkdir(prelaunchEvidenceRoot, { recursive: true });
  });

  test("first arrival: an honest preview, facing the camera, and a welcome about five seconds after he is ready", async ({ page }) => {
    test.setTimeout(240_000);
    const api = prelaunchApi();
    await installPrelaunchApi(page, api);
    await installPreviewRecorder(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(stage(page)).toHaveAttribute("data-character-ready", "true", { timeout: 90_000 });
    await waitForSpeech(page, 1, 20_000);
    await page.screenshot({ path: `${prelaunchEvidenceRoot}/desktop-1440x900-speaking.png` });
    await expect(stage(page)).toHaveAttribute("data-traveler-yaw", "0");
    await expect(stage(page)).toHaveAttribute("data-resident-visible", "false");
    await expect(caption(page)).toHaveAttribute("data-speaking", "false", { timeout: 20_000 });
    // Software rendering is slow enough that a line can end before a live check reads it, so the
    // line and its cue order come from the page's own log.
    const spoken = (await previewLog(page)).events.filter((event) => event.caption && event.sequence === 1);
    expect([...new Set(spoken.map((event) => event.line))]).toEqual(["journey-starts"]);
    expect([...new Set(spoken.map((event) => event.cue))]).toEqual([0]);
    await expect(stage(page)).toHaveAttribute("data-preview", "idle");

    // The state on screen, and nothing the server has not said.
    await expect(page.locator(".day-mark strong")).toHaveText("Paris · Preview");
    await expect(page.locator(".journey-progress-primary")).toContainText("The Anniversary Journey starts September 17.");
    await expect(page.getByText(/No journey day|Live count unavailable|Retrying|Preview only|unavailable/)).toHaveCount(0);
    await expect(page.locator(".goal-distance, .reaction-buttons, .connection-banner")).toHaveCount(0);
    // The header counts people with the site open (DataFast) before launch too.
    await expect(page.locator(".audience-control")).toHaveText("1 person watching");
    await page.screenshot({ path: `${prelaunchEvidenceRoot}/desktop-1440x900-idle.png` });

    const log = await previewLog(page);
    const firstStart = log.events.find((event) => event.caption)!;
    const welcomeDelaySeconds = (firstStart.t - log.characterReadyAt!) / 1_000;
    expect(welcomeDelaySeconds).toBeGreaterThan(4);
    expect(welcomeDelaySeconds).toBeLessThan(7.5);
    const sync = syncReport(log);
    // The schedule is exact; showing and hiding the caption each land on a rendered frame, and
    // software rendering can take most of a second per frame at this size.
    expect(Math.abs(sync.lines[0]!.captionSeconds! - FIRST_LINE_SECONDS) * 1_000).toBeLessThanOrEqual(2 * sync.toleranceMs);
    expectInSync(sync);
    for (const path of ["/api/presence/heartbeat", "/api/me", "/api/reactions", "/api/votes"]) {
      expect(api.requests[path] ?? 0, `${path} must not be called before launch`).toBe(0);
    }
    measurements.firstArrival = { viewport: "1440x900", welcomeDelaySeconds, expectedLineSeconds: FIRST_LINE_SECONDS, sync, requests: api.requests };
  });

  test("the next line starts 180 visible seconds after the first, in real time", async ({ page }) => {
    test.setTimeout(360_000);
    await openPreview(page, prelaunchApi(), { width: 1280, height: 800 });
    await waitForSpeech(page, 2, 240_000);
    await expect(caption(page)).toHaveAttribute("data-speaking", "false", { timeout: 20_000 });
    const log = await previewLog(page);
    const { captions } = speechSpans(log.events);
    const intervalSeconds = (captions[1]!.start - captions[0]!.start) / 1_000;
    expect(intervalSeconds).toBeGreaterThan(179);
    expect(intervalSeconds).toBeLessThan(181.5);
    expect(captions[0]!.end!).toBeLessThan(captions[1]!.start);
    expectInSync(syncReport(log));
    measurements.realTimeInterval = { intervalSeconds, lines: captions.map((span) => span.line), sync: syncReport(log) };
  });

  for (const offer of ["open"] as const) {
    test("a long session before launch: one line per interval, in order, never overlapping", async ({ page }) => {
      test.setTimeout(300_000);
      await page.clock.install();
      const api = prelaunchApi({ offer });
      await openPreview(page, api, { width: 1280, height: 800 });
      await speechUnderWay(page);
      const startedWith = Number(await caption(page).getAttribute("data-sequence"));
      for (let sequence = startedWith + 1; sequence <= startedWith + 9; sequence += 1) {
        await page.clock.fastForward(16_000);
        await expect(caption(page)).toHaveAttribute("data-speaking", "false", { timeout: 15_000 });
        await page.clock.fastForward(INTERVAL_MS - 16_000);
        await waitForSpeech(page, sequence, 20_000);
      }
      const { captions } = speechSpans((await previewLog(page)).events);
      expect(captions.map((span) => span.sequence)).toEqual(Array.from({ length: captions.length }, (_, index) => index + 1));
      expect(captions.slice(0, 10).map((span) => span.line)).toEqual([
        "journey-starts", "first-anniversary", "virtual-journey", "watching-keeps-me-walking", "choose-the-setting",
        "watching-is-free", "journey-starts", "first-anniversary", "virtual-journey", "watching-keeps-me-walking",
      ]);
      captions.slice(1).forEach((span, index) => {
        expect(captions[index]!.end, `line ${index + 1} ended`).not.toBeNull();
        expect(span.start).toBeGreaterThan(captions[index]!.end!);
      });
      // No line depends on sponsorship any more, so the offer is never asked for.
      expect(api.requests["/api/season-sponsor/offer"] ?? 0).toBe(0);
      measurements[`longSession-${offer}`] = { lines: captions.map((span) => span.line), offerRequests: api.requests["/api/season-sponsor/offer"] };
    });
  }

  test("a hidden tab pauses the line and the schedule, and returns without catching up", async ({ page }) => {
    test.setTimeout(240_000);
    await page.clock.install();
    await openPreview(page, prelaunchApi(), { width: 1280, height: 800 });
    const sequence = await speechUnderWay(page);
    await setPageVisible(page, false);
    await page.clock.fastForward(10 * 60_000);
    await expect(caption(page)).toHaveAttribute("data-speaking", "true");
    await expect(caption(page)).toHaveAttribute("data-sequence", String(sequence));
    await setPageVisible(page, true);
    await page.clock.fastForward(16_000);
    await expect(caption(page)).toHaveAttribute("data-speaking", "false", { timeout: 15_000 });
    await page.clock.fastForward(INTERVAL_MS - 30_000);
    await page.waitForTimeout(1_000);
    await expect(caption(page)).toHaveAttribute("data-sequence", String(sequence));
    await page.clock.fastForward(20_000);
    await waitForSpeech(page, sequence + 1, 20_000);
    const { captions } = speechSpans((await previewLog(page)).events);
    expect(captions.filter((span) => span.sequence === sequence + 1)).toHaveLength(1);
    measurements.hiddenTab = { hiddenForMs: 10 * 60_000, lines: captions.map((span) => span.line) };
  });

  test("a modal defers a new line without restarting the schedule; a line under way finishes beneath it", async ({ page }) => {
    test.setTimeout(300_000);
    await page.clock.install();
    const api = prelaunchApi();
    await installPrelaunchApi(page, api);
    await installPreviewRecorder(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.locator(".journey-progress-primary")).toContainText("The Anniversary Journey starts September 17.", { timeout: 30_000 });
    expect(await caption(page).getAttribute("data-sequence")).toBe("0");
    const journeyButton = page.getByRole("button", { name: "Journey", exact: true });
    await journeyButton.click({ force: true });
    const journey = page.getByRole("dialog", { name: "Journey" });
    await expect(journey).toBeVisible();
    await expect(journey).toContainText("Shared distance starts counting when Season 1 begins.");
    await expect(journey).toContainText("Your watching time starts counting when Season 1 begins.");
    await expect(stage(page)).toHaveAttribute("data-character-ready", "true", { timeout: 90_000 });
    await page.clock.fastForward(30_000);
    await page.waitForTimeout(1_000);
    await expect(caption(page)).toHaveAttribute("data-sequence", "0");
    await page.keyboard.press("Escape");
    await expect(journey).toBeHidden();
    await waitForSpeech(page, 1, 5_000);
    await page.clock.fastForward(16_000);
    await expect(caption(page)).toHaveAttribute("data-speaking", "false", { timeout: 15_000 });

    // Now a line already under way when the modal opens.
    await settled(page);
    const mounts = await page.evaluate(() => [
      document.querySelector<HTMLElement>(".pixi-scene")?.dataset.mountCount,
      document.querySelector<HTMLElement>("[data-testid='product-character-stage']")?.dataset.mountCount,
    ]);
    await page.clock.fastForward(INTERVAL_MS - 16_000);
    await waitForSpeech(page, 2, 20_000);
    await journeyButton.click({ force: true });
    await expect(journey).toBeVisible();
    await expect(caption(page)).toHaveAttribute("data-speaking", "true");
    await expect(stage(page)).toHaveAttribute("data-preview", "talk");
    await page.screenshot({ path: `${prelaunchEvidenceRoot}/desktop-1280x800-speaking-under-modal.png` });
    await page.clock.fastForward(16_000);
    await expect(caption(page)).toHaveAttribute("data-speaking", "false", { timeout: 15_000 });
    await expect(stage(page)).toHaveAttribute("data-preview", "idle");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1_000);
    await expect(caption(page)).toHaveAttribute("data-sequence", "2");
    expect(await page.evaluate(() => [
      document.querySelector<HTMLElement>(".pixi-scene")?.dataset.mountCount,
      document.querySelector<HTMLElement>("[data-testid='product-character-stage']")?.dataset.mountCount,
    ])).toEqual(mounts);
    measurements.modal = { sync: syncReport(await previewLog(page)) };
  });

  test("reduced motion keeps every word on schedule while he stays in the idle take", async ({ page }) => {
    test.setTimeout(240_000);
    await page.clock.install();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openPreview(page, prelaunchApi(), { width: 1280, height: 800 });
    await speechUnderWay(page);
    await expect(caption(page)).toHaveAttribute("data-motion", "reduced");
    await expect(stage(page)).toHaveAttribute("data-preview", "idle");
    await page.clock.fastForward(16_000);
    await expect(caption(page)).toHaveAttribute("data-speaking", "false", { timeout: 15_000 });
    const log = await previewLog(page);
    expect(log.events.some((event) => event.take === "talk")).toBe(false);
    expect(speechSpans(log.events).captions.length).toBeGreaterThanOrEqual(1);
  });

  test("the preview ends at once when a live season begins mid-line", async ({ page }) => {
    test.setTimeout(240_000);
    await page.clock.install();
    const api = prelaunchApi({ refreshAfterMs: 1_000 });
    await openPreview(page, api, { width: 1280, height: 800 });
    await speechUnderWay(page);
    api.mode = "live";
    await expect(page.getByTestId("preview-caption-band")).toHaveCount(0, { timeout: 15_000 });
    await expect(stage(page)).toHaveAttribute("data-preview", "", { timeout: 15_000 });
    await expect(stage(page)).toHaveAttribute("data-traveler-yaw", "0.68", { timeout: 15_000 });
    await expect(page.locator(".day-mark strong")).toHaveText("Paris · Day 1");
    await expect.poll(() => api.live.heartbeats ?? 0, { timeout: 20_000 }).toBeGreaterThan(0);
    await page.screenshot({ path: `${prelaunchEvidenceRoot}/desktop-1280x800-after-launch.png` });
  });

  test("a genuine outage is still shown as one, and never starts the preview", async ({ page }) => {
    test.setTimeout(180_000);
    const api = prelaunchApi({ mode: "outage" });
    await installPrelaunchApi(page, api);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.locator(".connection-banner")).toContainText("No journey day is active");
    await expect(page.locator(".journey-progress-primary")).toContainText("Preview only · waiting for the live journey");
    await expect(stage(page)).toHaveAttribute("data-character-ready", "true", { timeout: 90_000 });
    await page.waitForTimeout(9_000);
    await expect(page.getByTestId("preview-caption-band")).toHaveCount(0);
    await expect(stage(page)).toHaveAttribute("data-preview", "");
  });

  test("a failed read during the preview is disclosed, and the line under way still finishes", async ({ page }) => {
    test.setTimeout(240_000);
    await page.clock.install();
    const api = prelaunchApi({ refreshAfterMs: 1_000 });
    await openPreview(page, api, { width: 1280, height: 800 });
    await speechUnderWay(page);
    api.mode = "outage";
    await expect(page.locator(".connection-banner")).toContainText("No journey day is active right now. Retrying…", { timeout: 15_000 });
    await expect(caption(page)).toHaveAttribute("data-speaking", "true");
    await page.clock.fastForward(16_000);
    await expect(caption(page)).toHaveAttribute("data-speaking", "false", { timeout: 15_000 });
    api.mode = "prelaunch";
    await expect(page.locator(".connection-banner")).toHaveCount(0, { timeout: 20_000 });
  });
});

const phones: Viewport[] = [
  { width: 320, height: 568 },
  { width: 360, height: 740 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 414, height: 896 },
  { width: 430, height: 932 },
];
const wider: Viewport[] = [
  { width: 667, height: 375 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];

async function checkEveryCue(page: Page, viewport: Viewport) {
  const label = `${viewport.width}x${viewport.height}`;
  await speechUnderWay(page);
  await page.waitForTimeout(1_000);
  const speaking = await layoutReport(page);
  expectClear(speaking, `${label} speaking`);
  await page.screenshot({ path: `${prelaunchEvidenceRoot}/caption-${label}-speaking.png` });
  await page.clock.fastForward(16_000);
  await expect(caption(page)).toHaveAttribute("data-speaking", "false", { timeout: 15_000 });
  await page.waitForTimeout(500);
  const idle = await layoutReport(page);
  // On a phone the band is in the footer's flow and must keep its room whether he speaks or
  // not. Wider, the caption floats beside him out of flow: its height follows the text, but
  // nothing else on the page may move.
  const inFlow = viewport.width <= 600;
  const stable = (report: LayoutReport) => (inFlow
    ? report.band
    : { body: report.body, status: report.status, dock: report.dock, header: report.header });
  expect(stable(idle), `${label}: layout moved between speaking and idle`).toEqual(stable(speaking));
  await page.screenshot({ path: `${prelaunchEvidenceRoot}/caption-${label}-idle.png` });
  let tallest = 0;
  for (const cue of ALL_CUES) {
    const report = await measureCue(page, cue);
    expectClear(report, `${label} "${cue}"`);
    tallest = Math.max(tallest, report.caption!.h);
    expect(stable(report), `${label}: a longer cue moved the layout`).toEqual(stable(idle));
  }
  measurements[`layout-${label}`] = { captionBox: speaking.caption, band: idle.band, body: idle.body, tallestCuePx: tallest, fontSizePx: idle.fontSizePx };
}

test.describe("prelaunch preview · phones", () => {
  test.use({ deviceScaleFactor: 1.5, hasTouch: true, isMobile: true });
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Each viewport is set explicitly");
    await mkdir(prelaunchEvidenceRoot, { recursive: true });
  });

  for (const viewport of phones) {
    test(`every cue fits the reserved band above the footer at ${viewport.width}×${viewport.height}`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.clock.install();
      await openPreview(page, prelaunchApi(), viewport);
      await checkEveryCue(page, viewport);
    });
  }

  test("rotating mid-line keeps the caption readable and clear of him and the controls", async ({ page }) => {
    test.setTimeout(300_000);
    await page.clock.install();
    await openPreview(page, prelaunchApi(), { width: 390, height: 844 });
    const sequence = await speechUnderWay(page);
    expectClear(await layoutReport(page), "390x844 before rotation");
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(2_000);
    await expect(caption(page)).toHaveAttribute("data-sequence", String(sequence));
    expectClear(await layoutReport(page), "844x390 after rotation");
    await page.screenshot({ path: `${prelaunchEvidenceRoot}/rotation-844x390-speaking.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(2_000);
    expectClear(await layoutReport(page), "390x844 after rotating back");
  });

  for (const [viewport, insets] of [
    [{ width: 390, height: 844 }, { top: 47, topMax: 47, bottom: 34, bottomMax: 34, left: 0, leftMax: 0, right: 0, rightMax: 0 }],
    [{ width: 844, height: 390 }, { top: 0, topMax: 0, bottom: 21, bottomMax: 21, left: 47, leftMax: 47, right: 47, rightMax: 47 }],
  ] as const) {
    test(`respects emulated safe areas at ${viewport.width}×${viewport.height}`, async ({ page }) => {
      test.setTimeout(240_000);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets });
      await page.clock.install();
      await openPreview(page, prelaunchApi(), viewport);
      await speechUnderWay(page);
      await page.waitForTimeout(1_000);
      const report = await layoutReport(page);
      expectClear(report, `${viewport.width}x${viewport.height} safe areas`);
      expect(report.caption!.x).toBeGreaterThanOrEqual(insets.left - 0.5);
      expect(report.caption!.x + report.caption!.w).toBeLessThanOrEqual(report.viewport.w - insets.right + 0.5);
      for (const control of report.dock) expect(control!.y + control!.h).toBeLessThanOrEqual(report.viewport.h - insets.bottom + 0.5);
      expect(report.header!.y).toBeGreaterThanOrEqual(insets.top - 0.5);
      await page.screenshot({ path: `${prelaunchEvidenceRoot}/safe-area-${viewport.width}x${viewport.height}.png` });
      measurements[`safeArea-${viewport.width}x${viewport.height}`] = { insets, caption: report.caption, dock: report.dock, header: report.header };
    });
  }
});

test.describe("prelaunch preview · tablet and landscape", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Each viewport is set explicitly");
    await mkdir(prelaunchEvidenceRoot, { recursive: true });
  });

  for (const viewport of wider) {
    test(`every cue sits clear of him at ${viewport.width}×${viewport.height}`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.clock.install();
      await openPreview(page, prelaunchApi(), viewport);
      await checkEveryCue(page, viewport);
    });
  }
});
