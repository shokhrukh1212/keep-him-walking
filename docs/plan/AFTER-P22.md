# Deferred work — after all 22 prompts

Things found while building P1–P22 that are **deliberately not being done yet**. None
of them is a bug and none blocks the next prompt. They are parked here so they are not
carried in someone's head, and so P22 is not the first time they are remembered.

**Read this file when P22 is finished**, before the launch checklist in
`06-LAUNCH-AND-GROWTH.md`.

Every entry follows the house rule in `AGENTS.md`: what it is in plain English, what
happens if nothing changes, and exactly what to do.

These are the residue of P18. The related pre-P18 conflicts C16, C17 and C19 in
[ROADMAP.md](ROADMAP.md) are resolved and closed; what is below is what P18 could not
finish rather than what it got wrong.

| # | Item | Blocks launch? | Whose call |
|---|---|---|---|
| D1 | His 3D model is bigger than the old target | **Resolved — 2.48 MiB accepted with separate exact budgets** | Owner decision (12 Sep 2026) |
| D2 | The 1,000-viewer load test has not been run on current code | No — owner deferred it to after launch (11 Sep 2026) | Owner (needs a deployed Preview) |
| D3 | Lit windows at dusk have no artwork | **Resolved — optional windows skipped** | Owner decision (12 Sep 2026) |
| D4 | Sofia has one source painting instead of the six the pack builder needs | **Superseded — Paris is Day 1** | Owner decision (12 Sep 2026) |
| D5 | Minute-accurate scheduling on the free Vercel plan | **Chosen 13 Sep — external minute job (cron-job.org) plus a daily Vercel backup. Deployed; `CRON_SECRET` verified; owner confirms the cron-job.org history shows 200** | Owner (cron-job.org account) |
| D6 | Some of his new movements do not fit the moment they are used for | **Resolved — current motion accepted** | Owner decision (12 Sep 2026) |
| D7 | After the landmark he stays there for the rest of the day, and its painting jumps | **Resolved, then superseded — every place lasts 7 walking minutes and the list repeats** | P25, then P28 (12 Sep 2026) |
| D8 | R2 is live on `keephimwalking.com`; Preview addresses are refused by the CDN, and desktop needs a real-browser check | No — production build `82e517a` uses the CDN (13 Sep). Preview needs the CORS choice | Owner (Cloudflare CORS rule, desktop check) |
| D9 | Paris v3 paintings and Day 1 conversations | **Resolved — owner approved and development Day 2 switched to v3** | Owner decision (13 Sep 2026) |

---

## D1 — His 3D model is 2.48 MB, not the 1.8 MB target

**Resolved 12 September 2026.** The owner accepts the current traveler. The manifest now
records separate exact limits: model 2,598,064 bytes, animations 1,973,112 bytes, total
4,571,176 bytes. The options below are preserved as the history of that choice.

**What it is.** P18 made the traveler's 3D model 44% smaller — 4.43 MB down to 2.48 MB —
without changing how he looks. The plan asked for 1.8 MB. Getting the last 0.7 MB means
either changing how he looks or rebuilding the model, so it stopped there.

What is left is 0.90 MB of his skin and clothing textures, 0.68 MB of structural data
(the list describing every piece of his mesh), and 0.86 MB of the compressed model
itself. Measurements and the compression method are in `TECHNICAL.md`, section
"Compression, cost protection and deletions (P18)".

**What happens if nothing changes.** Every first-time visitor downloads about 0.7 MB
more than planned. Nothing breaks, and he loads fine. It costs more bandwidth per
visitor, which matters only if a day goes viral on a free-tier host.

**What to do — pick one.**

- **A — Softer textures. Saves about 0.45 MB.** Lower the texture size cap in
  `scripts/characters/optimize-glb.mjs` from 1536 to 1024 pixels, then re-run
  `pnpm characters:compress public/characters/v2/*.glb`.
  **His face and clothing become slightly less sharp, so the owner must look at the
  result and approve it.** This is the only option that changes what people see.
- **B — Rebuild the mesh. Saves most of the structural 0.68 MB.** His model is 31
  separate pieces; merging them into a few shrinks the structural list. No visual
  change at all, but it is Blender work on the source model, not a script.
- **C — Accept 2.48 MB.** Say so and the number gets recorded as the agreed budget in
  `CHARACTER_MANIFEST.combinedBudgetBytes` and in `TECHNICAL.md`.

---

## D2 — The 1,000-viewer load test has never been run against this code

**Owner decision, 11 September 2026:** launch without this test. The owner will watch
how the first real audience behaves and run the full 1,000-viewer test after launch.
Everything below still stands until the test is run.

**What it is.** The test that answers "does the site survive 1,000 people watching at
the same time". The numbers currently in `docs/phase-3-results.md` were measured on
6 September 2026 and describe a version of the code that no longer exists.

Three things changed since that run, and each one moves the result: reactions are now
part of the test (the old run measured a site where nobody pressed anything), each
visitor now makes one extra call on arrival, and the heartbeat slows down as the crowd
grows. The full explanation is in `docs/phase-3-results.md`, section "The load gate has
not been re-run since P18".

**What happens if nothing changes.** Launch happens without knowing whether a viral day
holds up. **This is the largest remaining unknown before launch** — larger than anything
else in this file.

**What to do.** Deploy a Preview to Vercel, then run:

```
pnpm exec tsx scripts/load/phase3-load.ts --execute \
  --base-url <preview url> --confirm-host <preview host> \
  --watchers 1000 --duration 300 --reaction-percent 5 \
  --vercel-bypass-file <path to bypass token file>
```

Paste the JSON it prints into a message; the results table in
`docs/phase-3-results.md` then gets replaced and that section deleted. A dry run
(the same command without `--execute`) prints the plan and sends no traffic — it has
already been done and proves nothing about capacity.

This cannot be run from the development environment: it needs a real deployment, a
`--confirm-host` match and a protection-bypass file.

---

## D3 — Lit windows at dusk have no artwork

**Resolved 12 September 2026.** Optional window overlays are skipped for this launch.
The renderer remains available for a later reviewed asset. The alternatives below are
preserved as history.

**What it is.** The code that makes city windows glow as the sun goes down is finished
and working. No city has the painting it needs, so it never draws anything. See
`TECHNICAL.md`, section "The living world (P17)", under "Honest gap".

**What happens if nothing changes.** Nothing lights up at dusk. There is no error and
no broken layout — the feature is simply absent, and the scene grades to night as it
does today.

**What to do — pick one.**

- **Paint them.** One image per zone, the same pixel size as that zone's main painting,
  everything black except the windows that are lit. Save each as
  `public/scenes/<city>/<version>/zones/<zone>/lights.webp` and say which cities are
  ready; the `lightsUrl` field then gets filled in for those zones. Start with one
  evening zone to see whether it is worth doing for the rest.
- **Skip it.** Say so and it gets recorded as a deliberate choice rather than an
  unfinished feature.

`nightUrl` is now rendered when a pack supplies it; colour grading remains the honest
fallback. This entry is only about the optional lit-window overlay.

---

## D4 — Sofia needs separate paintings before it can be the P19 example

**Superseded 12 September 2026.** Paris is the validation launch city. Sofia remains
ordinary later content and is not a launch dependency.

**What it is.** The new pack builder needs five separate zone paintings plus a night
version of the landmark. Sofia currently has one painting at
`art/phase3/sofia/master.png`, cropped five ways by the older pipeline.

**What happens if nothing changes.** The pack tools still create and build new cities,
and Sofia keeps using its current checked-in pack. Sofia cannot demonstrate the new
one-painting-per-zone workflow.

**What to do.** Put the five day paintings at
`art/sofia/zones/sofia-<arrival|lanes|market|cafe|landmark>/master.png`, and put the
night painting at `art/sofia/zones/sofia-landmark/night.png`. First scaffold the new,
immutable version with `pnpm pack:new sofia --version 2 --from <reviewed-json-file>`;
after placing the paintings, run `pnpm pack:build sofia`. This registers `sofia-v2` and
keeps the current `sofia-v1` available for rollback.

---

## D5 — The production scheduler must be minute-accurate

**Implementation completed 12 September 2026; account action remains.** An authenticated
idempotent reconciler now runs every minute, derives 15:55–15:59 prewarm and 16:00 UTC
boundaries without using invocation time as the boundary, and is also called as catch-up
from authoritative reads. Production must use Vercel Pro (or another verified
minute-accurate host) and configure `CRON_SECRET`; no plan was purchased here.

**What it is.** The launch needs one job at 15:55 UTC and rollover at exactly 16:00 UTC, while Vercel's free scheduler may start a daily job anywhere inside its scheduled hour.

**What happens if nothing changes.** Prewarming or a daily border crossing can happen up to 59 minutes late, so the launch and every later day can show the wrong state.

**What to do.** Before launch, choose a production scheduler that guarantees minute-level runs and point it at the two authenticated cron URLs; Vercel Pro is the simplest paid choice, while a free external scheduler avoids that cost but adds another account and failure point.

**Update 13 September 2026 — this now blocks deployment, not just timing.** Vercel
refuses to deploy this repository on the free (Hobby) plan: "Hobby accounts are limited
to daily cron jobs. This cron expression (* * * * *) would run more than once per day."
The every-minute schedule entered `main` in `9672fbc` (12 September, 14:32 +05). The last
production build that succeeded is from 12 September, 12:16 +05, before it. So
`keephimwalking.com` still runs that build, without Paris v3 and without the CDN.

**Decision 13 September 2026: stay free.** `vercel.json` now schedules
`/api/cron/reconcile` once a day at 16:00 UTC as a backup. The free plan accepts that.
The minute-accurate runs come from an external scheduler the owner controls.

- **What it is.** A free cron-job.org job calls the reconciler every minute. Vercel's own
  daily run is only a safety net.
- **What happens if nothing changes.** If the external job is missing or failing, the
  15:55 prewarm does not run. The 16:00 border crossing then waits for one of two things:
  the daily backup, up to an hour late, or the next visitor's page load, which runs the
  same catch-up.
- **What to do.**
  1. **Done 13 September.** `CRON_SECRET` is in Vercel Production. The deployment of
     `82e517a` reads it: `/api/cron/reconcile` answers 403 without it and 200 with it.
  2. On cron-job.org, create a job with:
     - URL `https://keephimwalking.com/api/cron/reconcile`
     - schedule every minute, method GET
     - header `Authorization: Bearer <CRON_SECRET>`
  3. After a few minutes, confirm its history shows HTTP 200. A 403 means the header
     and the Vercel value differ.

---

## D6 — Some of his new movements do not fit the moment they are used for

**Resolved 12 September 2026.** The owner accepts the present traveler, residents and
Mixamo motion for validation. Premium remains unavailable unless its placements are
actually fulfilled. The visual observations below remain as an honest historical record.

**What it is.** On 10 September 2026 his movements were replaced with Mixamo motion the owner
picked. The owner approved using every clip exactly as downloaded, so they all went in, and
the ones that look wrong in a specific moment are listed here to judge on screen at
`/preview/characters`. The list of which clip plays which moment is in
`public/characters/v3/CREDITS.md`.

**What happens if nothing changes.** Viewers see these moments:

| Moment | What viewers see |
|---|---|
| He drinks | He drinks with his **left** hand while the bottle, including a premium sponsor's label, sits in his right hand at his side. The drink also plays about 2× fast. |
| He sleeps at night | After sitting down he jumps straight to lying on the pavement, with no lying-down movement, while the status line says "Asleep on a bench". When someone arrives he jumps back to sitting, then stands. |
| He stumbles, once a day | He falls flat on his face, about 2× fast, then is instantly walking again. |
| He ties his shoe, about every 15 minutes | He kneels and never gets up, then pops upright when he walks on. |
| He checks his phone | A 23-second clip squeezed into 3.4 seconds, about 7× fast. |
| He laughs in a conversation | A 10-second clip squeezed into 2.5 seconds, about 4× fast. |
| He sets off after any stop | A 3-second clip squeezed into 0.65 seconds, about 4.5× fast, after every drink, photo and wave. |
| The crowd makes him wave, or he looks up on his own | About 3.4× and 3.3× fast. The old wave was just as fast. |
| He cheers at the marathon | About 2.4× fast. |
| He rests | He leans back against a wall that is not in the picture. |
| He waits | He searches his pockets every five seconds rather than standing with his hands in them. |
| He walks | His feet slide backwards about 18% faster than the pavement moves. |
| He listens, notices, stops, turns or takes a photo | These still use his old movements, so their style differs. In rain there is still no umbrella. |

His first-visit download also grows by 1.9 MB for these movements, separately from D1.

**What to do.** Each fix is one Mixamo download into `Downloads\mixamo\traveler\` that
replaces the old file there, then a re-run of the import (commands in
`scripts/characters/README.md`), which also updates the clip lengths and bottle timing.

- **Drinking:** download Drinking again with **Mirror** ticked, so the drinking hand matches the bottle.
- **Sleeping:** save a seated sleeping clip as `sleep.fbx`. Or keep lying down and change the status line to "Asleep · since …", which is a small copy change in the code.
- **Stumble:** save a small trip that stays on its feet as `stumble.fbx`.
- **Tie shoe:** save a clip that kneels and stands back up as `tie_shoe.fbx`.
- **Phone, laugh, setting off, cheer:** use Mixamo's **Trim** slider to keep roughly 3.5 s of Texting While Standing (`phone.fbx`), 2.5 s of Laughing (`react.fbx`), 1 s of Start Walking (`resume.fbx`) and 2 s of Victory (`cheer.fbx`). Trimming Looking Around would also shorten his look around while waiting, so leave it unless the quick version bothers you.
- **Resting and waiting:** save a plain standing idle as `rest.fbx`, and a hands-in-pockets idle as `wait_pockets.fbx`, if the current ones read wrong.
- **Walk:** save a walk with shorter steps as `walk.fbx` if the slide is visible.
- **Old-style movements:** add `listen.fbx`, `notice.fbx`, `stop.fbx`, `photo.fbx` (phone in the right hand), `wait_watch.fbx` (left wrist), `walk_brisk.fbx` and `umbrella_walk.fbx`.
- **Or accept the list as it is.** Say so, and this entry becomes a record of the choice.

---

## D7 — After the landmark he stays there for the rest of the day

**Superseded later on 12 September 2026 (P28).** Places now come from a variable-length
manifest, each visit lasts 420 active-walking seconds, and every stop is a server window
that also pauses distance. See `TECHNICAL.md` §3 and §8.7.

**Resolved 12 September 2026.** Scene selection no longer clamps or follows distance.
Five paintings repeat in fixed 1,080-second global active-walking visits; stop actions
pause that clock, and viewer count/pace cannot shorten a visit. The city painting is
stationary and only the road/ground-life layer moves. Distance and rewards still accrue
separately. The original diagnosis below is preserved as history.

**Found 11 September 2026** while testing Paris. Nothing has been changed yet.

**What it is.** A day's five places add up to 8 km, which he walks in about 1 hour 47
minutes when one person is watching. After that the code keeps him at the landmark for
the rest of the 24-hour day, still walking. `PRODUCT.md` §3 says the opposite: that the
five places repeat.

How long each place lasts. These are watched minutes: he stands still when nobody
watches.

| Place | Length | 1 viewer (×1) | 16+ viewers (×5) |
|---|---|---|---|
| Arrival | 1.2 km | 16 min | 3 min |
| Lanes | 1.6 km | 21 min | 4 min |
| Market | 1.6 km | 21 min | 4 min |
| Café | 1.4 km | 19 min | 4 min |
| Landmark | 2.2 km | 29 min | 6 min |
| **All five** | **8 km** | **1 h 47 min** | **21 min** |

He walks 4.5 km an hour at ×1. More viewers make him faster: 2 viewers ×2, 4 viewers
×3, 8 viewers ×4, 16 or more ×5. This is the approved "collective pace" in
`DECISIONS.md`.

A day watched for all 24 hours by one viewer covers about 108 km:

| Time into the day | What happens |
|---|---|
| 0:02 | Arrival moment (150 m) |
| 0:25 | Meets the local resident, in the lanes (1.9 km) |
| 0:27–1:20 | Stumbles once, at a point between 2 and 6 km picked for each pack |
| 1:04 | Food moment at the café (4.8 km) |
| 1:45 | Landmark moment (7.9 km) |
| **1:47** | **All five places done (8 km)** |
| 1:47–24:00 | **Stays at the landmark, still walking, for about 22 hours** |
| 9:23 | Reaches marathon distance (42.2 km) and cheers |
| 24:00 | Departure moment at the 16:00 UTC rollover; the next city begins |

At ×5 he reaches the landmark after 21 minutes and the marathon after 1 hour 53 minutes,
and the day covers about 540 km.

All day he also:

- ties his shoe every 15 watched minutes
- looks up every 9 minutes in the lanes and at the landmark
- reacts when viewers press Wave, Water or Photo
- has residents walk past every few minutes

The scene dims from 19:00 to its night look at 21:00 local time, then brightens again
between 05:00 and 07:00. With nobody watching he stands and waits, sits down after 10
minutes, and sleeps instead of sitting between 21:00 and 05:00 local time.

Where it lives in the code:

- **The landmark loop.** `routePositionAt` in `src/lib/world/route-clock.ts`: once
  distance passes `dayRouteMetres` (8,000 m), it returns phase `evening`, keeps the last
  zone, and counts the metres into that zone modulo its 2,200 m.
- **The jump.** `PixiScene` pans the city painting by metres into the zone ÷ zone length
  (`boundedPanoramaLayout`). Each wrap therefore puts the painting back at its left edge.
  The zone itself does not change, so there is no fade.
- **Lengths and speeds.** Place lengths are `DEFAULT_ZONE_LENGTH_METRES` in
  `src/lib/content/schema.ts`, and Paris uses them. Speed is `METRES_PER_SECOND` in
  `src/lib/traveler/motion-clock.ts`. The ×5 cap is `PACE_CAP` in
  `src/lib/config/server.ts`. The database migrations have no daily distance cap.
- **Moments and waiting.** Story distances are `DEFAULT_STORY_BEAT_METRES` in
  `schema.ts`. Departure is the only moment set by the clock
  (`src/lib/story-clock/cadence.ts`). Waiting, sitting and sleeping are in
  `src/lib/presence/waiting.ts`.
- **Stale product text.** `PRODUCT.md` §3 still says each zone lasts "150 active
  seconds", which no current pack does.

**What happens if nothing changes.**

- **Mostly the landmark.** Every watched day shows the landmark for most of its 24 hours,
  and a busy day shows it for almost all of them.
- **The painting jumps.** It jumps back to its left edge at 8 km and again every 2.2 km
  after that: every 29 minutes with one viewer, and about every 6 minutes at ×5. This
  comes from reading the code; nobody has watched it on screen yet.

**What to do — pick one.**

- **A — Repeat the five places after the landmark (recommended).** After 8 km he walks
  arrival → lanes → market → café → landmark again, with the normal change between
  places. That removes the jump and matches `PRODUCT.md`. The day's outcome still comes
  from total distance, so the landmark and the story moments still count once a day.
  **Trade-off:** viewers see the same five paintings again every 1 hour 47 minutes, or
  every 21 minutes on a busy day. **Code:** loop the distance inside `routePositionAt`,
  keeping it a pure function, and test the change from the landmark back to arrival.
- **B — Make each place much longer so the five places fill the day.** Nothing repeats.
  **Trade-offs:**
  - The paintings move even more slowly than now, and they already look still.
  - The approved daily goal "reach the landmark at 8,000 metres" in `DECISIONS.md`
    would have to change.
  - On a quiet day he may never reach the landmark.
- **C — Stop walking at the landmark.** He sits and enjoys the view until the next city.
  It is calm and simple. **Trade-offs:** one picture fills most of the day. Distance also
  stops, so the approved 42,195-metre marathon goal could never be reached and would have
  to be dropped.

Whichever is chosen, update `PRODUCT.md` §3 afterwards so it describes what the code
does.

---

## D8 — Paintings are served from the app itself, not from Cloudflare R2

**Updated 13 September 2026.** All 574 runtime files (88,848,842 bytes) are uploaded to
R2, including characters, NPCs, audio, Paris v2/v3 and preview scenes. The public asset
domain is `assets.keephimwalking.com`: Paris v3 passed 95/95 checks, Paris v2 passed
50/50, and direct traveler/audio checks returned HTTP 200 with correct CORS and MIME.
The owner has attached `keephimwalking.com` and `www.keephimwalking.com` to the Vercel
project; setting the asset origin and deploying are intentionally left to the separate
domain/deployment work.

**Update 13 September 2026 (activation attempt).**
- **Vercel setting.** `ASSET_BASE_URL=https://assets.keephimwalking.com` is now set in
  Production and Preview.
- **CDN rechecked from `https://keephimwalking.com`.** Paris v3 passed 95/95 checks. The
  traveler model, its animations and both residents are byte-identical to the local files
  and carry the right CORS header.
- **Live.** The production deployment of `82e517a` (13 September) serves
  `keephimwalking.com` with the CDN origin built into its client bundle.
- **Desktop risk.** In this repository's software-rendered Chromium, a 1440×900 page
  crashed within 12 s of loading a 3600 px painting from the CDN, in all three runs. The
  same build loading its own copies did not crash. Phone size passed every check. See
  `docs/launch-finalization/evidence/p28-refinements/README.md`.
- **Preview addresses refused.** The R2 CORS rule allows only
  `https://keephimwalking.com`. `https://www.keephimwalking.com`, every `*.vercel.app`
  Preview address and `http://localhost:3100` get HTTP 403.

**What it is.** The CDN is ready for the real site. Its security rule, however, turns away
every other address the app is opened from.

**What happens if nothing changes.** The real site is unaffected; `www` forwards to the
plain address first. A new Preview build would ask the CDN for its paintings and 3D
people, be refused, and show a neutral street with no traveler model.

**What to do.**

1. **Check a real desktop.** Open `https://keephimwalking.com` in desktop Chrome and leave
   it for five minutes. If the tab shows "Aw, Snap" or goes blank, clear
   `ASSET_BASE_URL` in Vercel Production and redeploy. The site then serves its own
   copies again.
2. **Preview addresses.** In Cloudflare → R2 → `keephimwalking-assets` → Settings →
   CORS policy, choose one:
   - **Allow any address.** Change `AllowedOrigins` to `["*"]`. The files are public
     and read-only, so this is safe.
   - **Keep the rule strict.** Clear `ASSET_BASE_URL` for Preview only, so Preview
     builds keep serving their own copies.

To undo the asset migration, clear `ASSET_BASE_URL` and redeploy; the local copies remain.

This uses R2's free allowance for a small validation. Nothing is bought by the code.

---

## D9 — Paris v3 artwork and Day 1 conversations

**Resolved 13 September 2026.** The owner approved all five new paintings and all
fourteen Day 1 conversations. Every script is recorded as `approved`; the generated
pack records the owner's creator review without claiming qualified local review.
Development Day 2 (`cc1a3437-8d61-473a-9099-0ea354f7ed65`) was switched from
Paris v2 to Paris v3 through the guarded `switch_country_day_pack` RPC.

**What it is.** The accepted candidate contains ten places and fourteen conversations.

- **Five paintings.** Montmartre, Place des Vosges, Luxembourg Garden, Pont Alexandre III
  and Saint-Germain were generated as distinct 3:1 candidates under `art/paris/zones/`.
  The image service returned 2172×724 masters; the normal scene build maps them to the
  3600×1200 canvas and produced responsive immutable renditions without duplicates.
- **Fourteen conversations.** A 70-minute loop is ten places × seven walking minutes.
  It contains thirteen ambient five-minute slots plus the once-daily canal story, so
  `art/paris/conversations.json` has exactly fourteen distinct approved scripts.

**What happens if nothing changes.** Paris v3 remains the pinned content for the current
development day; Paris v2 remains registered as a safe rollback.

**What to do.** No owner action remains for D9.
