import { expect, test, type Page } from "@playwright/test";
import { adminClient } from "../../scripts/phase2/lib";
import { phase2EnvironmentIdentity } from "../../scripts/phase2/environment";
import { PHASE2_ROUTE } from "../../src/lib/story-clock/schedule";

type RehearsalEvidence = {
  countryOrder: string[];
  countrySeconds: Record<string, number>;
  routeZones: Record<string, string[]>;
  travelerStates: string[];
  activeEventTypes: string[];
  votesSubmitted: string[];
  postcardsCreated: string[];
  sponsorDisclosureSeen: boolean;
  sponsorRedirectVerified: boolean;
  offlineRecoveryVerified: boolean;
  fullMotionVerified: boolean;
  reducedMotionVerified: boolean;
};

async function responseJson(response: { json(): Promise<unknown> }): Promise<Record<string, unknown> | null> {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function reconcilePreview() {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const request = adminClient().rpc("reconcile_phase2_state", {
        p_real_now: new Date().toISOString(),
      }).abortSignal(AbortSignal.timeout(20_000));
      const { data, error } = await Promise.race([
        Promise.resolve(request),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error(`Preview reconciliation attempt ${attempt} timed out`)), 20_000);
        }),
      ]);
      if (!error) return data;
      lastError = error;
    } catch (cause) {
      lastError = cause;
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
  }
  throw lastError;
}

async function currentCity(page: Page): Promise<string | null> {
  const text = await page.locator(".day-mark strong").textContent().catch(() => null);
  return PHASE2_ROUTE.find((entry) => text?.includes(entry.cityName))?.cityName ?? null;
}

test("isolated accelerated preview traverses and exercises all seven country-days", async ({ page }, testInfo) => {
  test.skip(process.env.RUN_PHASE2_REHEARSAL !== "1", "70-minute rehearsal is an explicit manual/CI gate");
  test.setTimeout(75 * 60_000);

  await phase2EnvironmentIdentity();
  const { data: rehearsalJourney, error: rehearsalJourneyError } = await adminClient()
    .from("journeys")
    .select("status,phase2_enabled,story_time_scale")
    .eq("slug", "phase2-seven-day-preview")
    .maybeSingle();
  if (rehearsalJourneyError) throw rehearsalJourneyError;
  expect(rehearsalJourney?.status).toBe("preview");
  expect(rehearsalJourney?.phase2_enabled).toBe(true);
  expect(Number(rehearsalJourney?.story_time_scale), "canonical rehearsal requires the guarded 144× clock").toBe(144);
  const observedOrder: string[] = [];
  const countrySamples = new Map<string, number>();
  const zones = new Map<string, Set<string>>();
  const travelerStates = new Set<string>();
  const activeEventTypes = new Set<string>();
  const votesSubmitted = new Set<string>();
  const lastVoteAttempt = new Map<string, number>();
  const postcardUrls = new Map<string, string>();
  let sponsorDisclosureSeen = false;
  let sponsorRedirectVerified = false;
  let offlineRecoveryVerified = false;
  let fullMotionVerified = false;
  let reducedMotionVerified = false;

  page.on("response", async (response) => {
    if (!response.url().includes("/api/bootstrap") || !response.ok()) return;
    const body = await responseJson(response);
    const activeEvent = body?.activeEvent as { type?: string } | null | undefined;
    if (activeEvent?.type) activeEventTypes.add(activeEvent.type);
  });
  page.on("response", async (response) => {
    if (!response.url().includes("/api/postcards") || response.request().method() !== "POST" || !response.ok()) return;
    const body = await responseJson(response);
    const city = await currentCity(page);
    if (city && typeof body?.url === "string") postcardUrls.set(city, body.url);
  });

  await page.goto("/");
  await expect(page.locator(".connection-banner.offline")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator(".scene-stage")).toBeVisible();

  const motionButton = page.getByRole("button", { name: /Full motion|Motion reduced/ });
  await expect(motionButton).toHaveText("Full motion");
  fullMotionVerified = await page.locator(".pixi-scene canvas").isVisible();
  await motionButton.click();
  await expect(motionButton).toHaveText("Motion reduced");
  reducedMotionVerified = await page.locator(".static-scene img").isVisible();
  await motionButton.click();
  await expect(motionButton).toHaveText("Full motion");

  await page.context().setOffline(true);
  await expect(page.locator(".live-status")).toContainText(/unavailable|reconnecting/i, { timeout: 10_000 });
  await page.context().setOffline(false);
  await expect(page.locator(".live-status")).toContainText(/watching/, { timeout: 20_000 });
  offlineRecoveryVerified = true;

  const startedAt = performance.now();
  const deadline = startedAt + 71 * 60_000;
  let lastCountry: string | null = null;
  let sponsorMetricChecked = false;
  let lastSampledAt = startedAt;
  let lastProgressReportedAt = startedAt;

  while (performance.now() < deadline) {
    const sampledAt = performance.now();
    const city = await currentCity(page);
    if (!city) {
      await page.waitForTimeout(500);
      lastSampledAt = sampledAt;
      continue;
    }
    if (city !== lastCountry) {
      const expected = PHASE2_ROUTE[observedOrder.length]?.cityName;
      expect(city, `country transition ${observedOrder.length + 1}`).toBe(expected);
      observedOrder.push(city);
      lastCountry = city;
      console.log(`[phase2-rehearsal] entered ${city} (${observedOrder.length}/7)`);
    }

    const observedSeconds = Math.max(0, (sampledAt - lastSampledAt) / 1_000);
    countrySamples.set(city, (countrySamples.get(city) ?? 0) + observedSeconds);
    lastSampledAt = sampledAt;
    const zone = (await page.locator(".route-status strong").textContent().catch(() => null))?.trim();
    if (zone) {
      const cityZones = zones.get(city) ?? new Set<string>();
      cityZones.add(zone);
      zones.set(city, cityZones);
    }
    const state = await page.locator(".traveler-sprite").getAttribute("data-state").catch(() => null);
    if (state) travelerStates.add(state);
    if (await page.locator(".dialogue-bubble").isVisible().catch(() => false)) activeEventTypes.add("encounter-visible");

    if (!votesSubmitted.has(city) && sampledAt - (lastVoteAttempt.get(city) ?? 0) >= 10_000) {
      lastVoteAttempt.set(city, sampledAt);
      await page.getByRole("button", { name: "Daily vote" }).click();
      const panel = page.getByRole("region", { name: "Daily vote" });
      const option = panel.locator(".vote-options button:not([disabled])").first();
      if (await option.isVisible().catch(() => false)) {
        await option.click();
        await expect(panel.locator(".vote-options button[aria-pressed='true']")).toHaveCount(1);
        votesSubmitted.add(city);
      }
      await panel.getByRole("button", { name: "Close vote" }).click();
    }

    if (!postcardUrls.has(city)) {
      const postcard = page.getByRole("button", { name: /^Postcard$/ });
      if (await postcard.isEnabled().catch(() => false)) await postcard.click();
    }

    const sponsor = page.locator(".sponsor-note");
    if (await sponsor.getByText(/Sponsored ·/).isVisible().catch(() => false)) {
      sponsorDisclosureSeen = true;
      if (!sponsorMetricChecked) {
        const href = await sponsor.locator("a").getAttribute("href");
        if (href?.startsWith("/r/sponsor/")) {
          const redirect = await page.request.get(href, { maxRedirects: 0 });
          expect([302, 303, 307, 308]).toContain(redirect.status());
          sponsorRedirectVerified = true;
          sponsorMetricChecked = true;
        }
      }
    }

    if (observedOrder.length === PHASE2_ROUTE.length && (countrySamples.get("Istanbul") ?? 0) >= 500) break;
    if (sampledAt - lastProgressReportedAt >= 5 * 60_000) {
      console.log(`[phase2-rehearsal] ${Math.floor((sampledAt - startedAt) / 60_000)}m healthy; current=${city}`);
      lastProgressReportedAt = sampledAt;
    }
    await page.waitForTimeout(1_000);
  }

  await reconcilePreview();
  expect(observedOrder).toEqual(PHASE2_ROUTE.map((entry) => entry.cityName));
  for (const entry of PHASE2_ROUTE) {
    expect(countrySamples.get(entry.cityName) ?? 0, `${entry.cityName} observation seconds`).toBeGreaterThanOrEqual(500);
    expect(zones.get(entry.cityName)?.size ?? 0, `${entry.cityName} route-zone count`).toBeGreaterThanOrEqual(3);
  }
  expect(travelerStates.has("walk")).toBe(true);
  expect(activeEventTypes.has("encounter") || activeEventTypes.has("encounter-visible")).toBe(true);
  expect(votesSubmitted.size).toBe(PHASE2_ROUTE.length);
  expect(postcardUrls.size).toBe(PHASE2_ROUTE.length);
  expect(sponsorDisclosureSeen).toBe(true);
  expect(sponsorRedirectVerified).toBe(true);
  expect(offlineRecoveryVerified).toBe(true);
  expect(fullMotionVerified).toBe(true);
  expect(reducedMotionVerified).toBe(true);

  const firstPostcard = postcardUrls.values().next().value as string | undefined;
  expect(firstPostcard).toBeTruthy();
  const publicPostcard = await page.request.get(firstPostcard!);
  expect(publicPostcard.ok()).toBe(true);
  const postcardHtml = await publicPostcard.text();
  expect(postcardHtml).toContain("og:image");
  expect(postcardHtml).toContain("Keep Him Walking");

  await page.goto("/archive");
  await expect(page.locator(".passport-card")).toHaveCount(6);
  await expect(page.locator(".passport-card[data-stamped='true']")).toHaveCount(6);

  const evidence: RehearsalEvidence = {
    countryOrder: observedOrder,
    countrySeconds: Object.fromEntries([...countrySamples].map(([city, seconds]) => [city, Math.floor(seconds)])),
    routeZones: Object.fromEntries([...zones].map(([city, values]) => [city, [...values]])),
    travelerStates: [...travelerStates],
    activeEventTypes: [...activeEventTypes],
    votesSubmitted: [...votesSubmitted],
    postcardsCreated: [...postcardUrls.keys()],
    sponsorDisclosureSeen,
    sponsorRedirectVerified,
    offlineRecoveryVerified,
    fullMotionVerified,
    reducedMotionVerified,
  };
  await testInfo.attach("phase2-rehearsal-evidence", {
    body: Buffer.from(JSON.stringify(evidence, null, 2)),
    contentType: "application/json",
  });
});
