// Opens the real https://keephimwalking.com origin in Chromium. Documents, bundles and
// /api/* are answered by the local production build (same commit, ASSET_BASE_URL set,
// development Day 2 authority). Every assets.keephimwalking.com request goes to the real
// CDN, so CORS, MIME and status are the real ones for this origin.
//
//   ASSET_BASE_URL=https://assets.keephimwalking.com pnpm build
//   ASSET_BASE_URL=https://assets.keephimwalking.com pnpm start --port 3100
//   node docs/launch-finalization/evidence/p28-refinements/cdn-activation/cdn-probe.mjs <out-dir>
//
// Env: WATCH_MS (phone watch window, default 450000), DSF (device scale, default 1.5),
// RUNS (desktop,mobile), DIRECT=1 (open the deployed site itself, no local routing).
// Routed runs are a real watcher and advance the dev journey.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const OUT = process.argv[2];
const WATCH_MS = Number(process.env.WATCH_MS ?? 450_000);
const LOCAL = "http://localhost:3100";
const APP = "https://keephimwalking.com";
const CDN = "https://assets.keephimwalking.com";
await mkdir(OUT, { recursive: true });

const report = { startedAt: new Date().toISOString(), runs: [] };

function placeOf(url) {
  return /\/scenes\/paris\/v3\/places\/([^/]+)\//.exec(url)?.[1] ?? null;
}

async function forward(route, errors) {
  const request = route.request();
  const url = new URL(request.url());
  const headers = Object.fromEntries(
    Object.entries(await request.allHeaders()).filter(([key]) => !key.startsWith(":") && key !== "host"),
  );
  if (headers.origin) headers.origin = LOCAL;
  if (headers.referer) headers.referer = headers.referer.replace(APP, LOCAL);
  try {
    const response = await route.fetch({ url: LOCAL + url.pathname + url.search, headers, maxRedirects: 0, timeout: 180_000 });
    const location = response.headers().location;
    if (location) await route.fulfill({ response, headers: { ...response.headers(), location: location.replace(LOCAL, APP) } });
    else await route.fulfill({ response });
  } catch (error) {
    errors.push({ url: request.url(), error: String(error).slice(0, 200) });
    await route.abort().catch(() => undefined);
  }
}

async function until(page, label, fn, timeout = 120_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {}
    await page.waitForTimeout(500);
  }
  throw new Error(`timed out: ${label}`);
}

async function run(name, viewport, { modals, sound, watchMs }) {
  const t0 = Date.now();
  const log = {
    name, viewport, checks: [], cdn: [], sameOriginAssetRequests: [], failed: [], console: [],
    forwardErrors: [], bootstrap: null, heartbeats: [], samples: [], dialogue: [], screenshots: [],
  };
  const check = (label, ok, detail) => log.checks.push({ label, ok: Boolean(ok), detail });
  const browser = await chromium.launch({ channel: "chromium", args: ["--enable-unsafe-swiftshader"] });
  const context = await browser.newContext({ viewport, deviceScaleFactor: Number(process.env.DSF ?? 1.5), serviceWorkers: "block" });
  if (process.env.DIRECT !== "1") await context.route((url) => url.hostname === "keephimwalking.com", (route) => forward(route, log.forwardErrors));
  const page = await context.newPage();
  let crashed = false;
  page.on("crash", () => {
    crashed = true;
    log.checks.push({ label: "renderer process stayed alive", ok: false, detail: `crashed at ${Date.now() - t0} ms` });
  });
  let zoneNow = null;
  let nextNow = null;

  page.on("request", (request) => {
    const url = request.url();
    if (/^https:\/\/keephimwalking\.com\/(scenes|characters|audio|npcs)\//.test(url)) log.sameOriginAssetRequests.push(url);
  });
  page.on("response", async (response) => {
    const url = response.url();
    if (url.startsWith(CDN)) {
      const headers = await response.allHeaders().catch(() => ({}));
      log.cdn.push({
        t: Date.now() - t0, path: url.slice(CDN.length), status: response.status(), type: response.request().resourceType(),
        contentType: headers["content-type"] ?? null, acao: headers["access-control-allow-origin"] ?? null,
        place: placeOf(url), zoneAtRequest: zoneNow, nextAtRequest: nextNow,
      });
    } else if (url === `${APP}/api/bootstrap`) {
      const body = await response.json().catch(() => null);
      log.bootstrap = {
        status: response.status(), mode: body?.mode, journeyState: body?.journeyState, day: body?.countryDay?.dayNumber,
        city: body?.countryDay?.cityName, pack: body?.countryDay?.scenePackId, conversations: body?.assets?.conversations?.length ?? null,
      };
    } else if (url.startsWith(`${APP}/api/presence/heartbeat`)) {
      const body = await response.json().catch(() => null);
      log.heartbeats.push({ t: Date.now() - t0, status: response.status(), activityScheduled: body?.activityScheduled ?? null, viewers: body?.presence?.activeViewers ?? body?.activeViewers ?? null });
    }
  });
  page.on("requestfailed", (request) => log.failed.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) log.console.push({ type: message.type(), text: message.text().slice(0, 300) });
  });

  try {
    await page.goto(`${APP}/`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await until(page, "renderer pixi", async () => (await page.locator(".scene-stage").getAttribute("data-renderer")) === "pixi", 180_000);
    await until(page, "traveler ready", async () => (await page.getByTestId("product-character-stage").getAttribute("data-character-ready")) === "true", 180_000);
    const bannerClear = await until(page, "no connection banner", async () => (await page.locator(".connection-banner").count()) === 0, 60_000).catch(() => false);
    check("settled (pixi renderer, traveler ready)", true);
    check("no connection banner", bannerClear, bannerClear ? null : await page.locator(".connection-banner").first().innerText().catch(() => null));
    const world = page.locator(".pixi-scene");
    await until(page, "scene asset ready", async () => (await world.getAttribute("data-scene-asset-state")) === "ready", 120_000);
    zoneNow = await world.getAttribute("data-zone-id");
    nextNow = await world.getAttribute("data-scene-next-zone-id");
    const status = await page.getByRole("status", { name: /Walking rule/ }).innerText().catch(() => null);
    check("scene painting ready from CDN", (await world.getAttribute("data-scene-asset-state")) === "ready", { zone: zoneNow, next: nextNow, status });
    check("status line names the drawn place", Boolean(status), status);
    check("ten place dots", (await page.getByRole("button", { name: /^Stop \d+ of 10/ }).count()) === 10);
    const shot = `${OUT}/${name}-settled.png`;
    await page.screenshot({ path: shot });
    log.screenshots.push(shot);

    if (sound) {
      const toggle = page.locator(".sound-toggle");
      await toggle.click({ force: true });
      await until(page, "sound toggle answered", async () => /Sound (on|unavailable)/.test((await toggle.getAttribute("aria-label")) ?? ""), 15_000).catch(() => null);
      check("sound turns on", (await toggle.getAttribute("aria-pressed")) === "true", await toggle.getAttribute("aria-label"));
    }

    if (modals) {
      const mounts = await world.getAttribute("data-mount-count");
      const journeyButton = page.getByRole("button", { name: "Journey", exact: true });
      await journeyButton.click({ force: true });
      const journey = page.getByRole("dialog", { name: "Journey" });
      await until(page, "journey modal", () => journey.isVisible(), 20_000);
      const modalShot = `${OUT}/${name}-journey-modal.png`;
      await page.screenshot({ path: modalShot });
      log.screenshots.push(modalShot);
      await page.keyboard.press("Escape");
      await until(page, "journey closed", async () => !(await journey.isVisible()), 10_000);
      check("Journey modal opens and closes", true);

      await page.getByRole("button", { name: /^Sponsor a day/ }).first().click({ force: true });
      const sponsor = page.getByRole("dialog", { name: "Sponsor a day" });
      await until(page, "sponsor modal", () => sponsor.isVisible(), 20_000);
      await page.getByRole("button", { name: "Close Sponsor a day" }).click();
      await until(page, "sponsor closed", async () => !(await sponsor.isVisible()), 10_000);
      check("Sponsor modal opens and closes", true);

      if (await page.locator(".vote-chip").count()) {
        await page.locator(".vote-chip").click({ force: true });
        const ballot = page.getByRole("dialog", { name: "Tomorrow’s vote" });
        const opened = await until(page, "vote modal", () => ballot.isVisible(), 20_000).catch(() => false);
        await page.keyboard.press("Escape");
        check("Vote modal opens and closes", opened);
      } else {
        check("Vote chip present", false, "no .vote-chip rendered (no open ballot on this day)");
      }

      const watchers = page.getByRole("button", { name: /watching/ }).first();
      if (await watchers.count()) {
        const label = await watchers.innerText().catch(() => null);
        await watchers.click({ force: true });
        const carrying = page.getByRole("dialog", { name: "Who is carrying him" });
        const opened = await until(page, "watchers modal", () => carrying.isVisible(), 20_000).catch(() => false);
        await page.keyboard.press("Escape");
        check("Watchers modal opens and closes", opened, label);
      }
      check("modals did not remount the world", (await world.getAttribute("data-mount-count")) === mounts, { before: mounts, after: await world.getAttribute("data-mount-count") });
    }

    const end = Date.now() + watchMs;
    let lastBubble = "";
    let shotTaken = false;
    while (Date.now() < end && !crashed) {
      zoneNow = await world.getAttribute("data-zone-id");
      nextNow = await world.getAttribute("data-scene-next-zone-id");
      const stage = page.getByTestId("product-character-stage");
      const sample = {
        t: Date.now() - t0, zone: zoneNow, next: nextNow,
        assetState: await world.getAttribute("data-scene-asset-state"),
        placesLoaded: Number(await world.getAttribute("data-scene-places-loaded")),
        texturesHeld: Number(await world.getAttribute("data-scene-textures-held")),
        character: await stage.getAttribute("data-character-state"),
        resident: await stage.getAttribute("data-resident-state"),
      };
      log.samples.push(sample);
      const bubble = page.locator(".dialogue-bubble");
      if (await bubble.count()) {
        const speaker = await bubble.locator(".eyebrow").first().innerText().catch(() => "");
        const text = (await bubble.first().innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 160);
        if (text !== lastBubble) {
          log.dialogue.push({ t: sample.t, speaker, text, resident: sample.resident });
          lastBubble = text;
          if (!shotTaken) {
            const dialogueShot = `${OUT}/${name}-conversation.png`;
            await page.screenshot({ path: dialogueShot });
            log.screenshots.push(dialogueShot);
            shotTaken = true;
          }
        }
      }
      await page.waitForTimeout(1_000);
    }
  } catch (error) {
    check("run completed", false, String(error).slice(0, 300));
  }

  const requestedPlaces = [...new Set(log.cdn.map((entry) => entry.place).filter(Boolean))];
  const seenZones = new Set(log.samples.flatMap((sample) => [sample.zone, sample.next]).concat([zoneNow, nextNow]).filter(Boolean));
  const offPlan = log.cdn.filter((entry) => entry.place && entry.place !== entry.zoneAtRequest && entry.place !== entry.nextAtRequest && !seenZones.has(entry.place));
  check("scene requests only current or next place", offPlan.length === 0, { requestedPlaces, seenZones: [...seenZones], offPlan });
  check("max places loaded <= 2", Math.max(0, ...log.samples.map((s) => s.placesLoaded || 0)) <= 2, Math.max(0, ...log.samples.map((s) => s.placesLoaded || 0)));
  const badCdn = log.cdn.filter((entry) => entry.status >= 400 || (entry.type !== "document" && entry.acao !== APP));
  check("every CDN response 2xx/3xx with ACAO for the app origin", badCdn.length === 0, badCdn);
  check("no same-origin asset requests", log.sameOriginAssetRequests.length === 0, log.sameOriginAssetRequests.slice(0, 5));
  check("no failed requests", log.failed.length === 0, log.failed.slice(0, 8));
  check("no CORS / CSP console errors", !log.console.some((m) => /CORS|Content Security Policy|Access-Control/i.test(m.text)), log.console.filter((m) => /CORS|Content Security Policy|Access-Control/i.test(m.text)));
  const traveler = log.cdn.filter((entry) => entry.path.startsWith("/characters/v3/traveler"));
  check("traveler model + animations loaded from CDN", traveler.length >= 2 && traveler.every((entry) => entry.status === 200), traveler.map((e) => `${e.path} ${e.status}`));
  log.summary = {
    cdnRequests: log.cdn.length, requestedPlaces, heartbeats: log.heartbeats.length,
    heartbeatStatuses: [...new Set(log.heartbeats.map((h) => h.status))], dialogueLines: log.dialogue.length,
    zonesVisited: [...new Set(log.samples.map((s) => s.zone).filter(Boolean))],
  };
  report.runs.push(log);
  await writeFile(`${OUT}/${name}.json`, `${JSON.stringify(log, null, 2)}\n`);
  console.log(`== ${name}`);
  for (const item of log.checks) console.log(`${item.ok ? "PASS" : "FAIL"}  ${item.label}${item.ok ? "" : `  ${JSON.stringify(item.detail ?? null).slice(0, 400)}`}`);
  console.log(JSON.stringify({ bootstrap: log.bootstrap, summary: log.summary, dialogue: log.dialogue.slice(0, 8) }));
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
}

const RUNS = (process.env.RUNS ?? "desktop,mobile").split(",");
if (RUNS.includes("desktop")) await run(`desktop-1440-dsf${process.env.DSF ?? "1.5"}`, { width: 1440, height: 900 }, { modals: true, sound: true, watchMs: 20_000 });
if (RUNS.includes("mobile")) await run("mobile-390", { width: 390, height: 844 }, { modals: true, sound: false, watchMs: WATCH_MS });
report.finishedAt = new Date().toISOString();
await writeFile(`${OUT}/cdn-probe.json`, `${JSON.stringify(report, null, 2)}\n`);
