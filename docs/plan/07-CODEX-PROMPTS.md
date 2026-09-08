# 07 — Codex Prompts

> Run in order. Paste one prompt, let Codex finish, run the checks in **What you should
> see**, then paste the next. Each prompt starts with the same house-rules block — keep
> it; it is what stops Codex from breaking the authority model.
>
> Before Prompt 0: copy `01`–`06` from this bundle into `docs/plan/` in the repo.

---

## House rules (prefix every prompt with this block)

```
HOUSE RULES for this repository (Keep Him Walking):
- Read docs/plan/*.md, PRODUCT.md and TECHNICAL.md before changing anything. TECHNICAL.md
  describes the code accurately as of 2026-09-06; trust it over assumptions.
- Authority stays in Postgres: journey_runtime is advanced only inside security definer
  RPCs under a row lock. The browser never calls RPCs. Never compute progress client-side
  except bounded extrapolation (≤ 60 s).
- travelerMotionAt / routePositionAt stay pure functions of authoritative inputs. New
  inputs are parameters, never side channels or module state.
- Never render a state the status line does not name. Never show a count or distance
  the server has not confirmed without labelling it "extrapolated" / "last confirmed".
- No free text from visitors is stored or displayed (the only exception is the private
  corrections queue in P20). Reactions are enums.
- Zod schemas in src/lib/content/schema.ts are the source of truth for packs; add
  defaults so existing packs keep validating.
- Keep pnpm verify green: lint, typecheck, unit tests, build. Add tests for every new
  pure function and every new RPC (pgTAP). Update TECHNICAL.md sections you change.
- Do not add dependencies unless the prompt names them. Do not add paid services.
- Small commits with clear messages. At the end, print: files changed, how to test
  manually, and anything you could not finish.
```

---

## P0 — Orientation and roadmap

```
[HOUSE RULES]

Task: orient and create the roadmap. Do not change product code in this prompt.
1. Read docs/plan/00-README.md through 06 fully, then PRODUCT.md and TECHNICAL.md.
2. Write docs/plan/ROADMAP.md: a table of prompts P1–P22 from docs/plan/07 (title,
   files you expect to touch, risk level, which tests you will add). Mark anything in the
   plan that conflicts with what you find in the code, with file:line references.
3. Write docs/plan/DECISIONS.md with the five decisions in 00-README §"five decisions"
   and the four choices in 01-PRODUCT §0 (leave the values as TODO where the owner has
   not filled them: product name, domain, character-name shortlist, rollover hour).
4. Add the env vars from 04-IMPLEMENTATION-CHANGES §9 to .env.example with the defaults.
5. Run pnpm verify and report the result.
```

**What you should see:** two new docs in `docs/plan/`, `.env.example` updated, no
product code changed, `pnpm verify` green. Read `ROADMAP.md` — if Codex flagged
conflicts, resolve them in the plan before P1.

---

## P1 — Remove the ghost ground strip

```
[HOUSE RULES]

Fix the rendering defect described in TECHNICAL.md §8.3.
1. In PixiScene's buildZone and the per-frame update, remove groundRoot, contactSprites,
   the ground-1.webp canvas masking, and the stripHeight/pitch/offset logic entirely.
   Nothing may draw ground-1.webp on the v3 panorama branch.
2. Keep groundLifeRoot and weatherRoot; fix the draw order so it is
   sky → panorama → groundLife → weather.
3. Remove ground-1/2/3 and prop URLs from preload/preloadGroups for schema-v3 packs
   (keep the files on disk for now; P18 deletes them).
4. Playwright: add a screenshot assertion on the Tbilisi "rustaveli-arrival" zone that
   samples pixels at y = 0.79 × height and y = 0.95 × height and asserts they differ from
   the pre-fix ghost band signature (document how you derived the check), plus an
   assertion that no Sprite in the Pixi stage has a texture whose URL contains "ground-".
5. Update TECHNICAL.md §8.3 to "fixed in <commit>".
```

**What you should see:** open the Tbilisi preview. The translucent second copy of the
street across the lower middle of the frame is gone; the painting is continuous from
sky to the bottom edge. He will still float and be too big — that is P2. Diagnostics
overlay shows fewer live sprites.

---

## P2 — Ground truth: stage metadata, bottom-anchored panorama, correct scale

```
[HOUSE RULES]

Implement docs/plan/02-WORLD-AND-BACKGROUNDS.md §4–5 (the stage block) and fix
TECHNICAL.md §8.4.
1. Schema: add zone.stage { groundLineY, horizonY, personHeightFrac, walkableX,
   palette[3], lightDir, parallax{far,mid,near} } with defaults
   { 0.82, 0.55, 0.28, [0.15,0.85], ["#b9a27a","#6f7a5a","#2e3a4f"], "left",
   {far:0.35, mid:0.7, near:1.25} }. All 16 packs must still validate.
2. PixiScene: anchor the panorama so groundLineY lands at viewport fraction 0.86
   (desktop) / 0.80 (mobile, ≤ 600 px); scale = cover on width, never centre vertically;
   if the image is shorter than the viewport, extend with the sky fill above. Export a
   pure helper stageLayout(viewportW, viewportH, imageW, imageH, stage) →
   { imageScale, imageX, imageY, groundY, personHeightPx, pxPerMetre } with unit tests
   at 320×568, 390×844, 1440×900, 2560×1080.
3. actor-layout.ts: replace the hardcoded layout with values from stageLayout for the
   current zone (personHeightPx, groundY). ProductCharacterStage3D reads them through the
   existing ref pattern and resizes the orthographic camera so 1.78 m == personHeightPx
   and y=0 == groundY. Cross-fade the height/ground values over 400 ms at zone changes
   so he never pops.
4. Calibration overlay in /api/admin/preview/[packId] (Preview only): a draggable ground
   line, a draggable horizon line, a 1.78 m stick figure whose height you drag, and a
   "copy stage JSON" button. Persist nothing server-side; the owner pastes into the pack.
5. Calibrate Tbilisi and Tashkent zones yourself by inspecting the master PNGs under art/
   (estimate the pavement line and a door height); write the values into those packs.
6. Playwright: at 390×844 and 1440×900, assert the character's foot y (from
   data-foot-y you will publish on the host element) equals stageLayout.groundY ± 2 px,
   and character height ≤ 0.36 × viewport height on desktop.
```

**What you should see:** he stands on the painted pavement in Tbilisi and Tashkent,
about a quarter of the screen tall, in every window size; resizing the window keeps his
feet on the line. In the preview route you can drag lines and copy JSON. Other cities
use defaults and look roughly right (calibrate them later with the overlay).

---

## P3 — Make him part of the painting

```
[HOUSE RULES]

Implement docs/plan/03-CHARACTERS.md §2.
1. CharacterActor: at load, replace skin/cloth/hair materials with MeshToonMaterial
   using a 3-step gradient map (generate the DataTexture in code); keep maps and colours;
   keep alpha-cutout fixes for hair cards and lashes; eyes stay as they are.
2. Outline: an inverted-hull pass (cloned meshes, BackSide, scale 1.018, colour from
   stage.palette[2] at 70 % alpha, depthWrite on). Toggle via quality tier (off on low).
3. Renderer: NoToneMapping, exposure 1.0, sRGB output. Lights: hemisphere from
   palette[0]/palette[2]; key colour palette[0] from the side named by stage.lightDir;
   fill palette[2] at 0.35. Remove the ShadowMaterial floor and shadow maps.
4. Contact shadow in Pixi: the character stage publishes {footX, footY, scale} to a
   shared ref every frame; PixiScene draws a soft radial-gradient ellipse on the
   ground-life layer at that position, radius 0.55 × personHeightPx × 0.5 horizontally,
   alpha 0.28, following the ground scroll.
5. Shared grade: a {exposure, tint(r,g,b)} object owned by PixiScene (constant for now;
   P10 animates it) applied to both the world ColorMatrixFilter and a uniform on the toon
   materials.
6. Update the character review page so the "Setting" dropdown includes each Tbilisi zone
   with the real background, to review the composition.
```

**What you should see:** flat-shaded, outlined character that reads as illustrated;
lighting matches the scene side; a soft shadow under his feet that moves with the
pavement; no more grey PBR look. In the review page you can see him against the real
Tbilisi zones. Compare a screenshot to the old one — it should look like one image.

---

## P4 — Distance-based route and day goals

```
[HOUSE RULES]

Implement docs/plan/01-PRODUCT.md §3 and 04 §2 item 4, §3 (runtime columns), §5.
1. Migration 0011 part 1: journey_runtime.global_distance_metres, pace_rate (default 1;
   used in P5), day_outcomes table (04 §3). record_presence_heartbeat_v4 = v3 plus
   distance accrual at 1.25 m/s × pace_rate; returns distance. read_bootstrap_bundle_v5
   returns it. Keep v3 for rollback.
2. Schema: zone.lengthMetres (defaults 1200/1600/1600/1400/2200 by zone order);
   pack.dayRouteMetres default 8000; marathonMetres 42195. Story beats become
   { atMetres } (defaults 150 / 1900 / 4800 / 7900) with departure remaining time-based
   at rollover. Keep durationActiveSeconds in the schema as deprecated (ignored).
3. routePositionAt(pack, distanceMetres) → { phase:'route'|'evening', zoneIndex,
   zoneProgress, metresIntoZone, remainingToLandmark, marathonProgress }. After 8000 m,
   phase 'evening' loops the landmark zone.
4. PresentationClock: second track `distance` easing toward the target at
   rate 1.25 × pace while traveling, same 60-s cap and snap rules. Expose both tracks.
5. PixiScene: the near layer scrolls by metres × pxPerMetre; the panorama at 0.7×, the
   sky/far at 0.35×; wrap the panorama horizontally (tileable — add a sharp step to
   scripts/process-phase2-art.mjs that cross-fades the last 8 % into the first 8 % and
   regenerate the Tbilisi/Tashkent webps); zone transitions cross-dissolve over 60 m.
6. motion-clock: beats scheduled by metres; still aligned to the 0.6-s plant grid.
7. HUD goal bar: distance, "landmark at 8 km", "marathon N%", turns gold past 42.2 km.
8. Tests: routePositionAt table incl. evening; clock two-track; pgTAP for v4 accrual.
```

**What you should see:** the goal bar under the status pill filling as he walks; the
zone label changes at the metre boundaries; the world scrolls continuously (no visible
seam) and dissolves between zones instead of cutting; after 8 km (temporarily set
`DAY_ROUTE_METRES=800` locally to see it) the status pill reads "Resting at the
landmark" and then evening wandering continues.

---

## P5 — Pace: more watchers, faster walk

```
[HOUSE RULES]

Implement pace (01 §3, 04 §4).
1. In record_presence_heartbeat_v4: n = count(distinct visitor_hash) of live leases
   including the caller; pace = least(1 + log(2, greatest(n,1)), PACE_CAP); persist
   pace_rate; distance accrues at 1.25 × pace. Return pace and watchers.
2. Bootstrap/heartbeat responses carry pace. HUD sub-line becomes
   "The internet is keeping him moving · ×{pace}" (pace shown with one decimal only
   when not integer). Add a tiny "bring a friend → faster" link that opens the share
   sheet (P12 builds the card; for now share the URL).
3. Character: when pace ≥ 3, play the walk clip at 1.25× timeScale and lean 2° forward;
   keep footfall/plant derivation consistent (document the choice in TECHNICAL.md §3).
4. pgTAP: pace table for n = 1,2,4,8,16,40. Playwright: two contexts → pace shows ×2.
```

**What you should see:** open the site in one tab: "×1". Open a second browser (or
incognito): "×2" in both, and the goal bar fills twice as fast. With four different
browsers/devices: "×3" and a visibly brisker walk.

---

## P6 — The waiting state and the first watcher

```
[HOUSE RULES]

Implement 01 §5 "Waiting state" and 03 §6 (behaviour parts that need no new clips).
1. Runtime columns waiting_since, last_watcher_left_at. In the heartbeat RPC: when live
   watchers transition >0 → 0 set waiting_since=now(); when 0 → >0 clear it and set
   last_watcher_left_at; return woke_him=true to the caller that made the transition if
   the gap ≥ FIRST_WATCHER_GAP_SECONDS. Return waiting_since always.
2. HUD when walking=false and you are the only lease: headline "He's been waiting since
   {local time} ({duration})." + "You're the first person here." then the existing
   3-second start beat. When not the first: "Waiting for the internet · since {time}".
3. Journey details panel: a "You woke him up" card with city, local time, waited
   duration, and a Share button (URL for now; P12 adds the image).
4. Character while waiting: cycle idle → look-around → idle deterministically from
   waited seconds; after 600 s use `rest` (sit) — P11 will swap in better clips.
5. Tests: pgTAP for the transitions; Playwright: context A leaves (close), advance TTL,
   context B arrives → sees the first-watcher headline and the card.
```

**What you should see:** close all tabs, wait a minute, open one: the headline says how
long he waited and that you're first; after ~3 s he starts walking; the details panel
has the "You woke him up" card. A second visitor who arrives while you're there does
not get the card.

---

## P7 — Watchers by country

```
[HOUSE RULES]

Implement 04 §2 item 7.
1. Heartbeat route reads the country from the x-vercel-ip-country header (fallback
   "ZZ"), passes it to the RPC; leases store country_code; never store IPs.
2. Table country_day_watch (04 §3); the RPC adds the caller's own visible delta to its
   country row and updates peak_watchers per country from the current distinct count.
3. Bootstrap returns: liveCountries (up to 8 codes with live counts) and todayTop5
   (country_code, watch_seconds). HUD shows up to 4 flag emojis + "+N"; tapping opens a
   sheet with the day's leaderboard (rank, flag, name, hh:mm carried).
4. Page /country/[cc]: today's rank and time, all-time time across the season, the days
   this country was "the home team" (the visited country), and share text.
5. Tests: unit for flag rendering + header parsing; pgTAP for aggregation; Playwright
   with a forced header (Playwright extraHTTPHeaders) showing 🇬🇪 in the HUD.
```

**What you should see:** flags next to the count (locally you'll see "ZZ" → render as a
🌐 globe; in Vercel Preview your real flag). The leaderboard sheet lists countries and
carried time; `/country/uz` renders.

---

## P8 — Reactions and crowd-scheduled actions

```
[HOUSE RULES]

Implement 01 §5 "Reactions" and 04 §3–5 (reaction_windows, scheduled_actions,
submit_reaction).
1. Migration: reaction_kind enum, reaction_windows, scheduled_actions (unique per
   at_active_second per day).
2. RPC submit_reaction: rate limit via consume_mutation_rate_limit (1 per 60 s per kind
   per visitor); increment the current 30-s bucket; threshold = greatest(2,
   ceil(0.3 × live_watchers)); on threshold and no same-kind action within the last 120
   active seconds, insert scheduled_actions at global_active_seconds + 2 and reset the
   bucket. Return {count, threshold, scheduledAt?}.
3. POST /api/reactions {kind} with Origin check. Heartbeat and bootstrap return
   nextScheduledAction {kind, atActiveSecond} and current bucket counts for the 3 kinds.
4. motion-clock: accept scheduledActions[]; a crowd 'wave' → wave 2.5 s, 'water' →
   drink 5.5 s, 'photo' → photo 4 s, aligned to the plant grid, entry/exit as beats.
   Crowd actions never interrupt an encounter (defer to after goodbye).
5. HUD: three buttons with "3/5" style counters, disabled during cooldown with a
   countdown; when triggered, a 1-second "he heard you" pulse.
6. 'photo': when the action fires, the client captures the composed frame (Pixi canvas
   + character canvas → offscreen canvas, 1280×720 crop around him) — the visitor who
   triggered it POSTs it to /api/day-photos (server validates size/type, stores to the
   public bucket, dedupes per at_active_second); day_photos table. Show the last 6 in
   the details panel.
7. Tests: threshold table; determinism test that two clients with the same inputs play
   the crowd action at the same second; pgTAP for the 120-s dedupe; Playwright: two
   contexts wave → he waves in both.
```

**What you should see:** three buttons under the status pill. Alone, tap Wave twice
(threshold 2 with cooldown means you need a second browser): with two browsers waving
within 30 s he waves in both within ~2 s. Water makes him drink; Photo flashes and a
photo appears in the details panel.

---

## P9 — Vote 2.0: neighbours, rollover, the Day-1 name vote

```
[HOUSE RULES]

Implement 01 §3 vote and 04 §4 reconcile changes.
1. Schema: pack.neighbours: string[] of pack ids (fill for all 16 packs using real
   borders; Istanbul → sofia; Tbilisi → baku, istanbul; etc.), pack.voteBlurb (≤ 140
   chars). votes.kind ('destination'|'name'), vote_options.pack_id.
2. Candidate builder (server): for the current pack, neighbours ∩ registered packs with
   reviewStatus in (approved, creator_reviewed), max 3, excluding packs visited this
   season; if < 2, fall back to the nearest unvisited ready packs by lat/lon and log a
   warning. Add pack.lat/lon.
3. reconcile_phase2_state at rollover: close the vote, pick the winner (ties → fewest
   visits, then alphabetical pack id), create tomorrow's country_day from the winner's
   pack, create tomorrow's vote from the new candidates, and if today was the name vote,
   store the winning name in journeys.traveler_name and expose it in bootstrap.
4. Name vote: seed script creates Day 1's vote with kind 'name' and the four options
   from docs/plan/DECISIONS.md. The HUD uses "the traveler" until a name exists, then
   the name everywhere (status pill, share cards, postcards).
5. Vote chip in the HUD: flags + live % + countdown to ROLLOVER_UTC_HOUR; one ballot,
   changing refused (existing). Results panel shows "Tomorrow: 🇦🇲 Armenia (52 %)".
6. Tests: candidate builder unit tests (neighbour, fallback, exclusion); pgTAP for the
   rollover picking the winner and creating tomorrow; Playwright for the countdown.
```

**What you should see:** the vote shows two or three neighbour countries with flags
and a countdown; run the rollover cron locally (with the clock advanced) and the next
day is the winner's city; the Day-1 seed shows four names instead of countries, and
after its rollover the HUD says "Milo is walking" (or whichever won).

---

## P10 — Local time of day and real weather

```
[HOUSE RULES]

Implement 02 §6–7.
1. Server: a weather fetcher for the current pack's lat/lon from
   https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&current=temperature_2m,weather_code,wind_speed_10m,is_day
   run at most every 10 min (cache in journey_runtime.weather jsonb, refreshed
   opportunistically inside the bootstrap route with a claim in operation_ledger so
   only one request runs). Bootstrap/heartbeat return weather.
2. PixiScene grade: keyframes by local hour (02 §6 table) interpolated each second from
   the pack timezone; applied via the shared grade object from P3 (world filter +
   character uniforms).
3. Night variant: if the zone has night.webp, cross-fade by the dusk/dawn curve; else
   grade only. Add a sharp derivation for night masters when present.
4. Weather particles: rain (motes with downward velocity + streak), snow (slow drift),
   fog band at horizonY, wind speed scales leaf/mote velocity; thunderstorm adds a rare
   80-ms white flash (respect reduced motion: no flash).
5. HUD: "21° ☀" next to local time; status pill "→ Walking in the rain · {zone}" when
   raining/snowing.
6. Tests: hour→grade interpolation unit tests; WMO code → effect mapping table;
   Playwright with a mocked weather payload showing rain particles count > 0.
```

**What you should see:** the scene warms toward local evening and cools at night
(fake the local clock in dev to check all hours); a temperature and icon in the HUD;
with a mocked "rain" payload, rain falls and the pill says he's walking in the rain.

---

## P11 — Animation retarget integration, gaze, waiting behaviours

```
[HOUSE RULES]

The owner will supply a new public/characters/v3/traveler.glb (and optionally
traveler-anim.glb) built from retargeted clips per docs/plan/03-CHARACTERS.md §4. Make
the runtime ready for it; until it exists, everything must keep working with v2.
1. Manifest: support a separate animation GLB (skeleton-only) bound to the mesh GLB at
   runtime; support clip aliases and the extended clip list (walk_brisk, wait_pockets,
   wait_watch, wait_stretch, wait_yawn, sit_down, sitting, stand_up, sleep, look_up,
   tie_shoe, umbrella_walk, photo_pose, stumble, cheer, walk_start, walk_stop, turn).
   Missing clips fall back to today's mappings.
2. Semantic states: add wait, sit, sleep, look_up, tie_shoe, cheer, stumble to
   TravelerState; clipForState maps them; motion-clock schedules look_up in 'lanes' and
   'landmark' (every ~9 min), tie_shoe every ~15 min (4 s), stumble once per day at a
   deterministic metre from the pack seed, cheer at marathon; waiting behaviour per 03 §6
   (sit after 600 s; sleep after 600 s at local night).
3. Gaze: head/neck look-at with clamp ±35° and blend 0.6 toward the resident in
   talk/listen, toward the camera 0.8 s after a crowd wave, toward the phone in phone.
4. Umbrella: simple cone+stick prop in code, shown when weather is rain and clip
   umbrella_walk exists; else nothing.
5. Character review page: list all clips in the manifest with "missing" badges.
6. Tests: fallback mapping table; determinism of the waiting cycle; Playwright: the
   review page renders every state without console errors.
```

**What you should see:** nothing visibly different until the v3 GLB exists — except
the review page now lists the extended clips with "missing" badges, and the waiting
state sits him down after 10 minutes. When you drop the retargeted GLB in, the walk,
idle and waiting behaviours change without code changes.

---

## P12 — Landing, HUD rewrite, share cards and OG images

```
[HOUSE RULES]

Implement 01 §5–6 fully (the copy is final; use it verbatim).
1. Restructure the HUD into the regions in 01 §5 (top-left where/when incl. season and
   weather; top-right who; status pill; goal bar; reactions; vote chip; dock; sponsor
   line). Remove "/ 195". Mobile stacking per the spec. Keep all data-* attributes the
   Playwright suites use.
2. First-visit overlay (4 s, dismissible, once per visitor via the existing cookie).
3. Waiting-state headline per P6 with the final copy.
4. Dynamic OG images with next/og (Satori): /api/og/day (city, day, count bucket,
   flags), /api/og/steps?token= (personal steps card), /api/og/first?token= (first-
   watcher card), /api/og/country/[cc], /api/og/recap/[n]. Cache 60 s at the edge.
   Tokens are signed, short-lived, and contain only the numbers to render.
5. Share sheet (Web Share API with clipboard fallback) from: the "bring a friend" link,
   the You-woke-him-up card, the steps meter, the country sheet. Text per 01 §6.
6. Landing metadata: title/description per 01 §6; the OG image is /api/og/day.
7. Playwright: HUD regions exist at 320/390/1440 widths; OG routes return image/png.
```

**What you should see:** the new HUD layout on desktop and phone; the 4-second
onboarding line on first visit only; pasting the site URL into a chat shows an OG
image with today's city and the live count bucket; the share buttons open the native
share sheet with the right text, and the personal steps card renders as an image.

---

## P13 — Day outcomes, the recap page and the post kit

```
[HOUSE RULES]

Implement 04 §2 item 12 and §3 day_outcomes.
1. At rollover, reconcile_phase2_state writes day_outcomes for the ending day: distance,
   landmark_reached, marathon, peak & unique watchers, countries_count, top_country.
2. Page /day/[n]: city, date, outcome stamp (colour/gold/grey), km, watchers, countries,
   top-5 countries, the encounter's local phrase, the day's photos (from P8), the
   sponsor line (permanent), the vote result, "Tomorrow: …". Static-cacheable after
   rollover.
3. Recap image: /api/og/recap/[n] renders the stamp + numbers; store a copy to the
   public bucket at rollover and save its path in day_outcomes.
4. Admin route GET /api/admin/postkit/[n] (protected like the preview routes): returns
   JSON { recapText, homeTeamText, voteText, priceText, imageUrls[] } using the templates
   in docs/plan/06-LAUNCH-AND-GROWTH.md §5. Also render it as a simple HTML page with
   copy buttons.
5. Tests: pgTAP for outcomes; unit for the templates; Playwright for /day/1 with a
   seeded finished day.
```

**What you should see:** `/day/1` shows the finished day with a stamp and numbers;
`/api/admin/postkit/1` shows ready-to-paste posts and an image; the recap image
matches the share format in 01 §6.

---

## P14 — The journey map

```
[HOUSE RULES]

Build /map.
1. Use a lightweight world SVG (Natural Earth 110m simplified to < 150 KB, public
   domain; commit it under public/map/world.svg). No map libraries.
2. Draw: the season path as a polyline through visited cities (lat/lon → equirectangular
   with a fixed viewBox), visited cities as stamps (colour by outcome), the current city
   pulsing, tomorrow's candidates as dashed lines with flags and live %.
3. Make it embeddable in the details panel (compact) and full-page at /map with the
   season stats. Tapping a visited city opens /day/[n].
4. Playwright: renders with 3 seeded visited days and 2 candidates.
```

**What you should see:** a clean map with the route so far, the current city
pulsing, and tomorrow's two dashed candidates. It also appears compactly inside
Journey details.

---

## P15 — Sponsor pricing engine and the sponsors page

```
[HOUSE RULES]

Implement docs/plan/05-SPONSORS-AND-PRICING.md §2–5 on top of the existing sponsor
state machine (do not change the lifecycle or the review gate).
1. Migration: sponsor_pricing; sponsorships.tier.
2. Rollover: compute P(D+7) = clamp(yesterday_unique_watchers × SPONSOR_CENTS_PER_UNIQUE,
   SPONSOR_FLOOR_CENTS, 299900); insert the row; a seed flag marks days 1–7 as founding
   at SPONSOR_FOUNDING_CENTS. Only D+1..D+7 are purchasable (server-enforced in
   reserve_sponsor_slot / checkout).
3. Checkout: tier standard/premium (× SPONSOR_PREMIUM_MULTIPLIER, rounded to $); the
   provider checkout receives the computed price; the webhook verifies the paid amount
   against the sponsor_pricing row (reject mismatch → paid_pending_review with a flag).
4. Page /sponsors with the copy in 05 §5: the 7-day calendar (sold → name; open →
   price), the formula sentence with yesterday's number, tiers, links to the policies.
5. Premium placements: bottle skin texture slot on the in-code bottle prop (setSponsor
   already handles the patch; add setBottle(url)); café-sign texture slot on the near
   layer in the café zone (a 512×256 plane). Both only for tier premium and only after
   approval.
6. Admin: a preview URL parameter that renders any https logo on the patch for sales
   DMs (Preview only, like the existing demoSponsor gating).
7. Sponsor report page /sponsor/[publicId]/report from sponsor_daily_metrics.
8. Tests: pgTAP for pricing rows and the window; unit for clamp; Playwright for /sponsors.
```

**What you should see:** `/sponsors` with seven days, prices and the "set by N
watchers" line; choosing Premium changes the price; a completed fixture checkout
lands in `paid_pending_review` as before; after approval, the patch and (premium) bottle
show the logo; the report page shows impressions/engaged/clicks.

---

## P16 — Passport, streaks, season sheet

```
[HOUSE RULES]

Upgrade the passport (existing archive) to 01 §2 "Passport & streak".
1. Stamps take their colour from day_outcomes (colour/gold/grey). "Collected" = the
   visitor had a contribution ≥ 30 s that day (visitor_day_contributions).
2. Streak: consecutive days with a contribution, computed server-side per visitor hash
   and returned in bootstrap; shown as "4 days in a row".
3. /season/1: the sheet of all stamps so far, season stats, the map (P14 compact), and a
   share card /api/og/season/1.
4. Playwright: seeded 3 days with mixed outcomes render the right stamp colours.
```

**What you should see:** the passport shows colour/grey/gold stamps, marks the ones you
were present for, and a streak count; `/season/1` is a shareable poster page.

---

## P17 — Living world

```
[HOUSE RULES]

Implement docs/plan/02-WORLD-AND-BACKGROUNDS.md §8–9 in PixiScene, all deterministic
from global_active_seconds via deterministicVariant.
1. Birds (3-frame sheet you draw in code as simple shapes or a 96×32 PNG you generate),
   leaves/petals per pack season, café steam in the café zone, tram/bus silhouette
   opt-in per pack in 'arrival', awning flutter on foreground cutouts when windy,
   window-lights additive layer at dusk where lights.webp exists, bunting in 'market'
   after the first 100-watcher moment of the day (runtime flag set by the RPC).
2. Background walkers: reuse the resident GLB in the Three canvas at 0.45–0.6 scale
   behind the traveler (render order), 1–3 at a time, opposite direction, variant by
   deterministic seed, count by local hour (0 at 02:00, 3 at 13:00). Toon-shaded like
   him. One of them waves back when a crowd wave fires.
3. Cat: 4-frame loop on a wall in 'lanes', 20 s every ~6 min.
4. Quality tiers: walkers 0/1/3, birds 0/2/4.
5. Tests: unit for the schedule functions; Playwright: no console errors over 3 minutes
   of accelerated time; frame-time p95 under the tier budget in the diagnostics.
```

**What you should see:** birds cross occasionally; a cat appears in the lanes; small
figures walk past in the background at the right size; at local dusk windows light up
(Tbilisi landmark); when it's windy (mock), awnings flutter.

---

## P18 — Performance, cost protection and deletions

```
[HOUSE RULES]

Implement 04 §6–7.
1. Compress GLBs with meshoptimizer (gltfpack, dev dependency) and load with
   MeshoptDecoder; target traveler ≤ 1.8 MB. Split animations into traveler-anim.glb
   if the total stays > 3 MB.
2. Delete the code and assets in 04 §7 (sprite renderer, puppet, Rive, unused zone
   layers, prop cutouts, v1 character, tashkent-v2/v3 packs) and their tests/preloads.
   content:validate must still pass; document the removal in TECHNICAL.md §6.5/§8.5.
3. Asset base URL: a helper assetUrl(path) that prefixes ASSET_BASE_URL when set;
   packs, GLBs and audio go through it. Add scripts/upload-assets.mjs that syncs
   public/{characters,scenes,audio,npcs} to an S3-compatible bucket (env-configured;
   the owner will use a free-egress bucket). Same-origin fallback when unset.
4. Adaptive heartbeat: the RPC returns heartbeatSeconds (20 → 30 above 300 watchers →
   40 above 1000); the client uses it; lease TTL stays 50 s (adjust to max(50, 2×hb+10)).
5. Bootstrap route: Cache-Control public, s-maxage=3, stale-while-revalidate=10;
   strip anything visitor-specific into a separate tiny /api/me call.
6. Re-run the 1,000-viewer load gate with reactions at 5 % per minute; record results
   in docs/phase-3-results.md.
```

**What you should see:** the network panel shows a GLB under ~2 MB; total transfer for
a first visit under ~5 MB; `pnpm content:validate` green with fewer assets; with
`ASSET_BASE_URL` set, assets load from the bucket; the load-test report updated.

---

## P19 — Pack generator CLI

```
[HOUSE RULES]

Implement docs/plan/02-WORLD-AND-BACKGROUNDS.md §10.
1. pnpm pack:new <slug>: prompts for (or reads pack.yaml) country, city, iso2, lat/lon,
   timezone, neighbours, five zone one-liners, landmark, local phrase fields, resident
   {name, role, variantId}, 6 dialogue lines with mood, 8 notebook lines, voteBlurb,
   postcard copy; writes content/countries/<slug>.ts and art/<slug>/README.md containing
   the filled-in image prompts from 02 §3 (one per zone + night + cutouts).
2. pnpm pack:build <slug>: sharp pipeline — normalise masters to 3600×1200, tileable
   blend, derive day.webp/night.webp/lights.webp when present, estimate palette (3
   dominant colours) into stage.palette, default stage values, write the asset budget.
3. Validation: the schema rejects any text field not in the allowed slots; a lint that
   flags banned topics by keyword list (religion/politics/ethnic terms — keep the list in
   docs/plan/content-banned-words.txt for the owner to edit).
4. Build the pipeline and convert Sofia only as the worked example, using the owner's
   supplied paintings. No other city is regenerated by Codex at any point.
```

**What you should see:** `pnpm pack:new lisbon` creates a stub pack and a README of
image prompts; after the owner drops PNGs in, `pnpm pack:build lisbon` produces the webps
and a valid pack; owner-supplied Sofia paintings are the only conversion example.

---

## P20 — Locals' corrections loop

```
[HOUSE RULES]

The only free text in the product; it is private and never rendered.
1. Table corrections (04 §3). POST /api/corrections {packId, zoneId?, category enum
   (place|phrase|dialogue|art|other), body ≤ 280} rate-limited 3 per hour per visitor,
   Origin-checked, stored with country_code; no email.
2. UI: "Locals: tell us what we got wrong" in the footer and on /country/[cc] → a small
   form; thank-you state; nothing echoed back.
3. Admin list at /api/admin/corrections (protected) with status new/accepted/rejected.
4. Country page shows "Reviewed with help from N locals" = count of accepted
   corrections for that pack.
```

**What you should see:** the form submits, the admin list shows it, accepting one
increments the count on the country page. Nothing a visitor typed appears anywhere
public.

---

## P21 — Production launch configuration

```
[HOUSE RULES]

Prepare production without changing behaviour.
1. Replace the "always false on production" rule in phase2DeploymentAllowed with an
   explicit LAUNCH_ENABLED=true env gate plus a launch_at timestamp in journeys; before
   launch_at, production shows the waiting scene with "Starts {countdown}" and no
   presence accounting.
2. Seed script for Season 1: journey (30 days, launch_at, rollover 16:00 UTC),
   Day 1 = tashkent-v5 (calibrated), the name vote, sponsor_pricing for days 1–7 as
   founding, empty slots 1–7.
3. Cron: verify /api/cron/rollover is scheduled at 16:00 UTC; add a 15:55 UTC
   "prewarm" run that preloads tomorrow's assets to the CDN and warms the OG cache.
4. Health: /api/health includes provider status, weather age, asset base reachability.
5. docs/runbooks/launch-day.md: the 15:30–16:10 UTC checklist from docs/plan/06 §3 plus
   rollback (flip LAUNCH_ENABLED, switch pack version).
6. Run pnpm verify:phase3 and report.
```

**What you should see:** production shows a countdown to `launch_at`; after it passes
(or with a past timestamp in preview), the live journey starts on Day 1 with the name
vote; health is green; the runbook exists.

---

## P22 — "Buy him a ticket" (post-launch, week 2)

```
[HOUSE RULES]

Implement the Ticket product from docs/plan/05-SPONSORS-AND-PRICING.md §2.
1. Product ticket: choose a day ≥ D+3 within a configurable horizon and a country from
   a curated list (packs with reviewStatus ready, or 'buildable' flag set by the owner);
   price max($249, 3 × P(day)); includes Standard sponsorship for that day.
2. On approval: the chosen day's country is fixed; the vote for that day is skipped and
   the HUD shows "Ticket: someone is sending him to 🇵🇹 Portugal on Day 14"; the map
   shows a dashed flight line.
3. Neighbour logic: the day after a ticket continues from the ticket country.
4. Tests: pgTAP for the day lock; Playwright for the HUD notice.
```

**What you should see:** a ticket purchase (fixture) locks a future day's country,
the vote for that day disappears, the map shows the flight, and the HUD announces it.

---

## After the last prompt

Ask Codex for a final pass: `Re-read docs/plan/01 §8 honesty rules and audit every UI
string and every number shown for compliance; list violations and fix them.` Then do the
10-stranger comprehension test in `06 §2` before launch day.
