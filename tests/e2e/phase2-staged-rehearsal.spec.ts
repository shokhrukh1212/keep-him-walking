import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { phase2EnvironmentIdentity } from "../../scripts/phase2/environment";
import { PHASE2_ROUTE } from "../../src/lib/story-clock/schedule";

type DayRow = {
  id: string;
  day_number: number;
  city_name: string;
  starts_at: string;
};

async function waitForPresence(db: pg.Client, countryDayId: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const result = await db.query<{ visitor_hash: string }>(
      `select visitor_hash from public.presence_leases
       where country_day_id = $1 and visible and scene_ready
       order by last_seen_at desc limit 1`,
      [countryDayId],
    );
    if (result.rows[0]) return result.rows[0].visitor_hash;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("No active preview presence lease appeared");
}

async function stageCountry(db: pg.Client, journeyId: string, day: DayRow) {
  const realNow = new Date();
  const storyNow = new Date(new Date(day.starts_at).getTime() + 13 * 60 * 60_000);
  const shifted = await db.query(
    `update public.journeys
     set real_time_anchor_at = $1, story_time_anchor_at = $2
     where id = $3 and status = 'preview' and phase2_enabled and story_time_scale = 144
     returning id`,
    [realNow.toISOString(), storyNow.toISOString(), journeyId],
  );
  if (shifted.rowCount !== 1) throw new Error("Guarded preview clock update was refused");
  await db.query("select public.reconcile_phase2_state($1)", [realNow.toISOString()]);
}

async function unlockPostcard(db: pg.Client, countryDayId: string, visitorHash: string) {
  const now = new Date();
  await db.query(
    `update public.presence_leases set active_seconds = greatest(active_seconds, 90)
     where country_day_id = $1 and visitor_hash = $2`,
    [countryDayId, visitorHash],
  );
  await db.query(
    `insert into public.visitor_day_contributions
       (country_day_id, visitor_hash, active_seconds, first_contributed_at, last_contributed_at, expires_at)
     values ($1, $2, 90, $3, $3, $4)
     on conflict (country_day_id, visitor_hash) do update set
       active_seconds = greatest(public.visitor_day_contributions.active_seconds, excluded.active_seconds),
       last_contributed_at = excluded.last_contributed_at,
       expires_at = excluded.expires_at`,
    [countryDayId, visitorHash, now.toISOString(), new Date(now.getTime() + 365 * 86_400_000).toISOString()],
  );
}

async function openCountry(page: Page, expectedCity: string, first: boolean) {
  if (first) await page.goto("/");
  else await page.reload();
  await expect(page.locator(".day-mark strong")).toContainText(expectedCity, { timeout: 30_000 });
  await expect(page.locator(".scene-stage")).toBeVisible();
  await expect(page.locator(".live-status")).toContainText(/watching/, { timeout: 30_000 });
}

test("guarded staged preview exercises all seven country-days", async ({ page }, testInfo) => {
  test.skip(process.env.RUN_PHASE2_STAGED_REHEARSAL !== "1", "Staged rehearsal is an explicit preview gate");
  test.setTimeout(12 * 60_000);
  await phase2EnvironmentIdentity();

  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) throw new Error("SUPABASE_DB_URL is required");
  const db = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
    query_timeout: 15_000,
    statement_timeout: 15_000,
  });
  await db.connect();

  const evidence = {
    mode: "guarded-clock-staged-not-70-minute-soak",
    countryOrder: [] as string[],
    votesSubmitted: [] as string[],
    postcardsCreated: [] as string[],
    postcardUrls: [] as string[],
    sponsorDisclosureSeen: false,
    sponsorRedirectVerified: false,
    offlineRecoveryVerified: false,
    fullMotionVerified: false,
    reducedMotionVerified: false,
  };

  try {
    const journeyResult = await db.query<{ id: string }>(
      `select id from public.journeys
       where slug = 'phase2-seven-day-preview' and status = 'preview'
         and phase2_enabled and story_time_scale = 144`,
    );
    const journeyId = journeyResult.rows[0]?.id;
    if (!journeyId) throw new Error("Guarded 144x preview journey was not found");
    const dayResult = await db.query<DayRow>(
      `select id, day_number, city_name, starts_at
       from public.country_days where journey_id = $1 order by day_number`,
      [journeyId],
    );
    expect(dayResult.rows.map((day) => day.city_name)).toEqual(PHASE2_ROUTE.map((entry) => entry.cityName));

    for (const [index, day] of dayResult.rows.entries()) {
      await stageCountry(db, journeyId, day);
      await openCountry(page, day.city_name, index === 0);
      evidence.countryOrder.push(day.city_name);

      if (index === 0) {
        const motionButton = page.getByRole("button", { name: /Full motion|Motion reduced/ });
        await expect(motionButton).toHaveText("Full motion");
        evidence.fullMotionVerified = await page.locator(".pixi-scene canvas").isVisible();
        await motionButton.click();
        await expect(motionButton).toHaveText("Motion reduced");
        evidence.reducedMotionVerified = await page.locator(".static-scene img").isVisible();
        await motionButton.click();

        await page.context().setOffline(true);
        await expect(page.locator(".live-status")).toContainText(/unavailable|reconnecting/i, { timeout: 10_000 });
        await page.context().setOffline(false);
        await expect(page.locator(".live-status")).toContainText(/watching/, { timeout: 30_000 });
        evidence.offlineRecoveryVerified = true;

        const sponsor = page.locator(".sponsor-note");
        await expect(sponsor).toContainText(/Sponsored ·/);
        evidence.sponsorDisclosureSeen = true;
        const href = await sponsor.locator("a").getAttribute("href");
        if (!href?.startsWith("/r/sponsor/")) throw new Error("Missing sponsor redirect URL");
        const redirect = await page.request.get(href, { maxRedirects: 0 });
        expect([302, 303, 307, 308]).toContain(redirect.status());
        evidence.sponsorRedirectVerified = true;
      }

      const visitorHash = await waitForPresence(db, day.id);
      await unlockPostcard(db, day.id, visitorHash);
      await page.reload();
      await expect(page.locator(".day-mark strong")).toContainText(day.city_name);

      await page.getByRole("button", { name: "Daily vote" }).click();
      const votePanel = page.getByRole("region", { name: "Daily vote" });
      const voteOption = votePanel.locator(".vote-options button:not([disabled])").first();
      await expect(voteOption).toBeVisible();
      await voteOption.click();
      await expect(votePanel.locator(".vote-options button[aria-pressed='true']")).toHaveCount(1);
      evidence.votesSubmitted.push(day.city_name);
      await votePanel.getByRole("button", { name: "Close vote" }).click();

      const postcardResponse = page.waitForResponse(
        (response) => response.url().includes("/api/postcards") && response.request().method() === "POST",
        { timeout: 60_000 },
      );
      await page.getByRole("button", { name: /^Postcard$/ }).click();
      const response = await postcardResponse;
      expect(response.ok()).toBe(true);
      const body = await response.json() as { url: string };
      expect(body.url).toContain("/p/");
      evidence.postcardsCreated.push(day.city_name);
      evidence.postcardUrls.push(body.url);

      await db.query("delete from public.mutation_rate_limits where action = 'postcard' and key_hash = $1", [visitorHash]);
    }

    const publicPostcard = await page.request.get(evidence.postcardUrls[0]);
    expect(publicPostcard.ok()).toBe(true);
    const postcardHtml = await publicPostcard.text();
    expect(postcardHtml).toContain("og:image");
    expect(postcardHtml).toContain("Keep Him Walking");

    await page.goto("/archive");
    await expect(page.locator(".passport-card")).toHaveCount(6);
    await expect(page.locator(".passport-card[data-stamped='true']")).toHaveCount(6);

    expect(evidence.countryOrder).toEqual(PHASE2_ROUTE.map((entry) => entry.cityName));
    expect(evidence.votesSubmitted).toEqual(evidence.countryOrder);
    expect(evidence.postcardsCreated).toEqual(evidence.countryOrder);
    expect(evidence).toMatchObject({
      sponsorDisclosureSeen: true,
      sponsorRedirectVerified: true,
      offlineRecoveryVerified: true,
      fullMotionVerified: true,
      reducedMotionVerified: true,
    });
    await testInfo.attach("phase2-staged-rehearsal-evidence", {
      body: Buffer.from(JSON.stringify(evidence, null, 2)),
      contentType: "application/json",
    });
  } finally {
    await db.end();
  }
});
