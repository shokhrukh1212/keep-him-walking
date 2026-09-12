import { expect, type Page } from "@playwright/test";
import { offlineBootstrapSnapshot } from "../../../src/lib/bootstrap/offline";
import type { BootstrapSnapshot, ScheduledActionView, VoteView } from "../../../src/lib/contracts";
import { activityWindow } from "../../../src/lib/world/activities";

export const evidenceRoot = "docs/launch-finalization/evidence/p28-refinements";
export const dayId = "10000000-0000-4000-8000-000000000128";

/** A fake authority. Watched seconds stand still unless `advancing` is set. */
export type JourneyState = {
  rawSeconds: number;
  anchoredAt?: number;
  advancing?: boolean;
  cityName?: string;
  scheduled?: ScheduledActionView[];
  vote?: VoteView | null;
  sessions?: Set<string>;
  heartbeats?: number;
};

export function setRawSeconds(state: JourneyState, seconds: number) {
  state.rawSeconds = seconds;
  state.anchoredAt = Date.now();
}

function currentSeconds(state: JourneyState) {
  return state.rawSeconds + (state.advancing ? Math.max(0, Date.now() - (state.anchoredAt ?? Date.now())) / 1_000 : 0);
}

/** Distance, like the server, does not grow while a stop is holding him. */
function distanceAt(state: JourneyState, seconds: number) {
  let held = 0;
  for (const row of state.scheduled ?? []) {
    const window = activityWindow(row);
    if (window) held += Math.max(0, Math.min(seconds, window[1]) - window[0]);
  }
  return Math.max(0, seconds - held) * 1.25;
}

function reactions(state: JourneyState) {
  return { counts: { wave: 0, water: 0, photo: 0 }, scheduled: state.scheduled ?? [], nextScheduledAction: null };
}

export function journeySnapshot(state: JourneyState): BootstrapSnapshot {
  const now = new Date();
  const base = offlineBootstrapSnapshot(now);
  const seconds = currentSeconds(state);
  return {
    ...base,
    mode: "live",
    firstVisit: false,
    countryDay: { ...base.countryDay, id: dayId, cityName: state.cityName ?? base.countryDay.cityName },
    refresh: { nextAt: null, afterMs: 300_000, reason: "none" },
    presence: { activeViewers: 1, status: "live", ttlSeconds: 50, waitingSince: null },
    reactions: reactions(state),
    vote: state.vote ?? null,
    route: {
      globalActiveSeconds: seconds,
      globalDistanceMetres: distanceAt(state, seconds),
      paceRate: 1,
      authoritativeAt: now.toISOString(),
      walking: true,
    },
  };
}

export async function installJourneyApi(page: Page, state: JourneyState) {
  state.anchoredAt ??= Date.now();
  // Playwright evaluates matching routes newest-first. Install the catch-all
  // first so the authoritative fixtures below win for their endpoints.
  await page.route("**/api/**", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/bootstrap", (route) => route.fulfill({ json: journeySnapshot(state) }));
  await page.route("**/api/me", (route) => route.fulfill({ json: { firstVisit: false } }));
  await page.route("**/api/reactions", (route) => route.fulfill({ json: { countryDayId: dayId, reactions: reactions(state) } }));
  await page.route("**/api/presence/heartbeat", (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as { sessionId?: string };
    if (body.sessionId) state.sessions?.add(body.sessionId);
    state.heartbeats = (state.heartbeats ?? 0) + 1;
    const now = new Date().toISOString();
    const seconds = currentSeconds(state);
    return route.fulfill({ json: {
      countryDayId: dayId,
      serverNow: now,
      realServerNow: now,
      activeViewers: 1,
      walking: true,
      globalSteps: Math.floor(seconds / 0.6),
      visitorActiveSeconds: 90,
      ttlSeconds: 50,
      nextHeartbeatInMs: 500,
      globalActiveSeconds: seconds,
      globalDistanceMetres: distanceAt(state, seconds),
      paceRate: 1,
      routeAuthoritativeAt: now,
      waitingSince: null,
      wokeHim: false,
      countryCode: "FR",
      reactions: reactions(state),
    } });
  });
}

export async function settled(page: Page) {
  await expect(page.locator(".scene-stage")).toHaveAttribute("data-renderer", "pixi", { timeout: 90_000 });
  await expect(page.getByTestId("product-character-stage"))
    .toHaveAttribute("data-character-ready", "true", { timeout: 90_000 });
  await expect(page.locator(".connection-banner")).toHaveCount(0, { timeout: 30_000 });
}

export type FrameReport = {
  samples: number;
  p95Ms: number | null;
  maxMs: number | null;
  over50Ms: number;
  longAnimationFrames: number | null;
};

/** requestAnimationFrame intervals, plus long-animation-frame entries where the browser reports them. */
export async function sampleFrames(page: Page, durationMs: number, during?: () => Promise<void>): Promise<FrameReport> {
  await page.evaluate((duration) => {
    const target = window as unknown as { __khwFrames?: { deltas: number[]; long: number | null; done: Promise<void> } };
    const deltas: number[] = [];
    const supported = typeof PerformanceObserver !== "undefined"
      && (PerformanceObserver.supportedEntryTypes ?? []).includes("long-animation-frame");
    const record = { deltas, long: supported ? 0 : null as number | null, done: Promise.resolve() };
    const observer = supported
      ? new PerformanceObserver((list) => { record.long = (record.long ?? 0) + list.getEntries().length; })
      : null;
    observer?.observe({ type: "long-animation-frame" });
    record.done = new Promise<void>((resolve) => {
      let previous = performance.now();
      const end = previous + duration;
      const step = (now: number) => {
        deltas.push(now - previous);
        previous = now;
        if (now >= end) {
          observer?.disconnect();
          resolve();
        } else {
          requestAnimationFrame(step);
        }
      };
      requestAnimationFrame(step);
    });
    target.__khwFrames = record;
  }, durationMs);
  if (during) await during();
  return page.evaluate(async () => {
    const target = window as unknown as { __khwFrames: { deltas: number[]; long: number | null; done: Promise<void> } };
    await target.__khwFrames.done;
    const deltas = target.__khwFrames.deltas.slice(1);
    const sorted = [...deltas].sort((a, b) => a - b);
    const round = (value: number | undefined) => value === undefined ? null : Math.round(value * 10) / 10;
    return {
      samples: deltas.length,
      p95Ms: round(sorted[Math.floor(sorted.length * 0.95)]),
      maxMs: round(sorted.at(-1)),
      over50Ms: deltas.filter((value) => value > 50).length,
      longAnimationFrames: target.__khwFrames.long,
    };
  });
}
