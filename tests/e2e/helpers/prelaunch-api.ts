import type { Page } from "@playwright/test";
import { parisCountryPackV3 } from "../../../src/content/countries/paris.v3";
import { offlineBootstrapSnapshot } from "../../../src/lib/bootstrap/offline";
import type { BootstrapSnapshot } from "../../../src/lib/contracts";
import { installJourneyApi, journeySnapshot, type JourneyState } from "./journey-api";

export const prelaunchEvidenceRoot = "docs/launch-finalization/evidence/prelaunch-monologue";
/** The presentation-only day id the switched-off preview carries (src/lib/bootstrap/server.ts). */
export const PREVIEW_DAY_ID = "00000000-0000-4000-8000-000000000002";

/** What /api/bootstrap answers in Production while the launch switch is off. */
export function prelaunchSnapshot(options: { refreshAfterMs?: number; startsAt?: string | null } = {}): BootstrapSnapshot {
  const now = new Date();
  const base = offlineBootstrapSnapshot(now);
  return {
    ...base,
    mode: "prelaunch",
    journeyState: "prelaunch",
    refresh: { nextAt: null, afterMs: options.refreshAfterMs ?? 300_000, reason: "none" },
    countryDay: {
      ...base.countryDay,
      id: PREVIEW_DAY_ID,
      totalDays: 7,
      scenePackId: parisCountryPackV3.assetVersion,
      startsAt: now.toISOString(),
      endsAt: now.toISOString(),
    },
    presence: { activeViewers: null, status: "scheduled", ttlSeconds: 50, waitingSince: null },
    steps: { ...base.steps, stale: false },
    assets: parisCountryPackV3,
    season: null,
    seasonSponsor: null,
    prelaunch: { startsAt: options.startsAt ?? null, seasonNumber: 1 },
  };
}

export type PrelaunchApi = {
  /** What the server says now; a test can change it mid-run. */
  mode: "prelaunch" | "live" | "outage";
  offer: "open" | "closed" | "missing" | "failing";
  refreshAfterMs?: number;
  /** Every /api/ path the page asked for, and how often. */
  requests: Record<string, number>;
  /** The live journey served once the mode becomes "live". */
  live: JourneyState;
};

export function prelaunchApi(overrides: Partial<PrelaunchApi> = {}): PrelaunchApi {
  return {
    mode: "prelaunch",
    offer: "closed",
    requests: {},
    live: { rawSeconds: 90, sessions: new Set(), assets: structuredClone(parisCountryPackV3) },
    ...overrides,
  };
}

const seasonOffer = (open: boolean) => ({
  season: open
    ? {
        id: "20000000-0000-4000-8000-000000000001",
        number: 1,
        title: "Season 1",
        startsAt: "2026-10-01T16:00:00.000Z",
        endsAt: "2026-10-08T16:00:00.000Z",
        saleClosesAt: "2026-09-30T16:00:00.000Z",
        cities: ["Paris"],
      }
    : null,
  priceCents: 49_900,
  currency: "USD",
  priceIncludesTax: false,
  cutoffHours: 24,
  checkout: "request_only",
  pricing: [],
  ownerXUrl: null,
  currentSponsor: null,
});

/** A fake server: the prelaunch preview, then (when switched) the live journey or an outage. */
export async function installPrelaunchApi(page: Page, api: PrelaunchApi) {
  // The live endpoints (heartbeat, reactions, me) are the ordinary journey fixture.
  await installJourneyApi(page, api.live);
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/")) api.requests[path] = (api.requests[path] ?? 0) + 1;
  });
  await page.route("**/api/season-sponsor/offer", (route) => {
    if (api.offer === "missing") return route.fulfill({ status: 404, json: { error: "Season sponsorship is not offered." } });
    if (api.offer === "failing") return route.fulfill({ status: 503, json: { error: "The season offer is temporarily unavailable." } });
    return route.fulfill({ json: seasonOffer(api.offer === "open") });
  });
  // Installed last, so it answers before the journey fixture's own bootstrap route.
  await page.route("**/api/bootstrap", (route) => {
    if (api.mode === "outage") return route.fulfill({ status: 503, json: { code: "NO_ACTIVE_DAY" } });
    if (api.mode === "live") return route.fulfill({ json: journeySnapshot(api.live) });
    return route.fulfill({ json: prelaunchSnapshot({ refreshAfterMs: api.refreshAfterMs }) });
  });
}

export type PreviewEvent = {
  t: number;
  caption: boolean;
  take: string;
  sequence: number;
  cue: number;
  line: string;
  yaw: string;
};

export type PreviewLog = { events: PreviewEvent[]; frames: number[]; characterReadyAt: number | null };

/**
 * From the first frame of the page, records every change to the caption and to the take the
 * 3D stage actually drew, with the page's own clock, plus recent frame intervals. The log is
 * what a visitor would have seen, independent of when the test got round to looking.
 */
export async function installPreviewRecorder(page: Page) {
  await page.addInitScript(() => {
    const log = { events: [] as Array<Record<string, unknown>>, frames: [] as number[], characterReadyAt: null as number | null };
    (window as unknown as { __previewLog: typeof log }).__previewLog = log;
    let previous = "";
    const snapshot = () => {
      const caption = document.querySelector<HTMLElement>("[data-testid='preview-caption']");
      const stage = document.querySelector<HTMLElement>("[data-testid='product-character-stage']");
      if (stage?.dataset.characterReady === "true" && log.characterReadyAt === null) log.characterReadyAt = performance.now();
      const entry = {
        caption: caption?.dataset.speaking === "true",
        take: stage?.dataset.preview ?? "",
        sequence: Number(caption?.dataset.sequence ?? 0),
        cue: Number(caption?.dataset.cueIndex ?? 0),
        line: caption?.dataset.lineId ?? "",
        yaw: stage?.dataset.travelerYaw ?? "",
      };
      const key = JSON.stringify(entry);
      if (key === previous) return;
      previous = key;
      log.events.push({ t: performance.now(), ...entry });
    };
    const start = () => {
      new MutationObserver(snapshot).observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["data-speaking", "data-cue-index", "data-sequence", "data-preview", "data-traveler-yaw", "data-character-ready"],
      });
      let last = performance.now();
      const frame = (now: number) => {
        log.frames.push(now - last);
        if (log.frames.length > 900) log.frames.shift();
        last = now;
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
  });
}

export async function previewLog(page: Page): Promise<PreviewLog> {
  return page.evaluate(() => (window as unknown as { __previewLog: PreviewLog }).__previewLog);
}

export type Span = { sequence: number; line: string; start: number; end: number | null };

/** When each caption showed and when the stage drew the talk take, as spans on the page clock. */
export function speechSpans(events: readonly PreviewEvent[]) {
  const captions: Span[] = [];
  const talks: Array<{ start: number; end: number | null }> = [];
  let previous: PreviewEvent | null = null;
  for (const event of events) {
    const captionStarted = event.caption && (!previous?.caption || previous.sequence !== event.sequence);
    if ((captionStarted || !event.caption) && previous?.caption && captions.at(-1)?.end === null) captions.at(-1)!.end = event.t;
    if (captionStarted) captions.push({ sequence: event.sequence, line: event.line, start: event.t, end: null });
    if (event.take === "talk" && previous?.take !== "talk") talks.push({ start: event.t, end: null });
    if (event.take !== "talk" && previous?.take === "talk") talks.at(-1)!.end = event.t;
    previous = event;
  }
  return { captions, talks };
}

/** Simulates the tab being hidden or shown again, exactly as the browser reports it to the page. */
export async function setPageVisible(page: Page, visible: boolean) {
  await page.evaluate((isVisible) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (isVisible ? "visible" : "hidden") });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => !isVisible });
    document.dispatchEvent(new Event("visibilitychange"));
  }, visible);
}
