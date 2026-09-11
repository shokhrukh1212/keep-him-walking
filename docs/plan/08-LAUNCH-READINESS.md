# Launch readiness — product finish after P22

This is the implementation handoff after all 22 prompts. It supersedes the old visual
and route assumptions where they conflict, but it does not erase the evidence in
`01`–`07`, `AFTER-P22.md`, `PRODUCT.md` or `TECHNICAL.md`.

The product is functionally broad and technically healthy. The launch risk is now
focus: the scene does not yet feel like one continuous illustrated street, the traveler
does not dominate the frame, the interface competes with him, and the seeded route is
not the route the owner wants to launch.

## Decisions locked on 11 September 2026

| Area | Launch decision |
|---|---|
| Visual direction | One premium **illustrated street**, built from separate sky, distant city and seamless pavement layers. Identifiable buildings never tile. |
| Traveler | Keep the approved Mixamo traveler motions. Target roughly 30% of desktop viewport height and 28% on mobile, with feet near the painted ground and the whole body visible. |
| Residents | Use the new Mixamo male/female residents only as occasional life. Never clone a crowd from one model. |
| Decorative animals | Remove the procedural cat. Do not ship any decorative animal that does not read immediately as that animal. |
| Interface | Three reactions at top centre; one audience control at top right; status low centre; progress above the footer; only Vote, Journey and Sponsor in the footer. One panel may be open at a time. |
| Solo visitors | One confirmed watcher can trigger reactions. |
| Prelaunch | Show a waiting scene and exact public start time. Do not simulate public walking or progress. |
| Launch route | London on Day 1. Day 1 first votes on Milo / Nur / Sami / Bek, then on Day 2. Paris is the announced fallback and the transfer is a train. |
| Initial art buffer | London, Paris, Brussels and Berlin: five route paintings plus one night landmark painting per city (24 paintings). The owner produces the paintings. |
| Weather | Hidden for launch behind a reversible server flag. Keep the implementation; make no provider request while disabled. |

## Current result

### What is right

- The authority chain, walking rule, contribution accounting, votes, sponsor workflow,
  content validation, observability and operational runbooks are implemented.
- The traveler is a real rigged GLB and the owner has replaced the important motions
  with Mixamo clips. The motion system should be preserved while presentation changes.
- Five-zone packs, transition infrastructure, journey details, postcards, voting and
  sponsorship already exist; this is a refinement and launch-content pass, not a
  product rewrite.
- The repository starts this pass with lint, typecheck, unit tests, build/content
  validation and the scale audit green.

### What is wrong

- A full city painting is repeated to fake an endless road, so buildings repeat and
  the seam returns roughly every thirteen seconds at ordinary pace.
- Zone changes dissolve between two unrelated complete pictures for too long, so two
  places remain visibly superimposed instead of reading as an occlusion or a cut.
- The character is too small and dark, while the top of the viewport is mostly an
  empty colour field. His vertical and horizontal placement does not consistently
  preserve his feet and full silhouette.
- The procedural cat is a collection of dark primitives rather than credible art.
  Background residents are too frequent and are cloned from one model.
- The HUD is a set of independent fixed islands. Controls obscure the progress line,
  the globe and audience card overlap, and secondary information is always visible.
- A solo viewer cannot trigger a reaction under the current threshold. A reaction can
  also expire between normal heartbeats for other viewers.
- Some encounter/action timing still derives from travelled distance. Higher crowd
  pace therefore shortens an action, even though actions are meant to consume watched
  time while distance is held.
- Tomorrow's journey panel follows a static pack order instead of the authoritative
  scheduled/voted next day. Sponsor inventory can expose more dates than the promised
  seven-day purchase window.
- The current seed and route validation still name the old Central Asia launch.

## Work packages

Implementation status was audited on 11 September 2026. Checked items are in the
repository now; unchecked items require owner-supplied art, owner acceptance or a
deployed production-like environment.

Every package has two independent completion marks:

- **Verified** means automated checks and, for database work, the remote pgTAP/lint
  sequence passed.
- **Accepted** means the owner has looked at the relevant real output. Code cannot mark
  a visual or commercial choice accepted on the owner's behalf.

### R0 — make this handoff authoritative

- [x] Verified: update `DECISIONS.md`, `PRODUCT.md`, `TECHNICAL.md` and `AGENTS.md` when
  the corresponding implementation changes land.
- [ ] Accepted: none required.

### R1 — one London visual pilot

- [ ] Owner supplies a London arrival painting in the new layered style.
- [x] Implement the shared 30% desktop / 28% mobile traveler scale, planted-foot
  placement and restrained lighting against that painting.
- [x] Remove the periodic artificial horizontal wander from the traveler.
- [ ] Verify at 390×844, 768×1024, 1440×900 and 1920×1080, including panel-open states.
- [ ] Accepted: owner approves this single frame before the other 23 paintings are made.

### R2 — continuous layered street

- [x] Extend the pack schema with optional, defaulted scene layers so all existing
  packs continue to validate.
- [x] Render one non-repeating sky, one bounded non-repeating city layer and only a
  seamless pavement/foreground texture as a horizontal tile.
- [x] Replace long full-frame dissolves with a short, foreground-covered transition.
- [x] Use a real night texture when a pack provides `nightUrl`; retain colour grading
  as fallback.
- [x] Add a content audit that rejects a supposedly seamless layer whose two edges do
  not match within tolerance.
- [ ] Accepted: no repeated landmark is visible during a five-minute watch at 1× or 5×.

### R3 — one calm HUD

- [x] Put Wave, Water and Photo at top centre, each at least 44×44 CSS pixels.
- [x] Merge globe, watching-country summary, confirmed watcher count and pace into one
  top-right audience control.
- [x] Keep the current named action in a compact lower-centre status pill.
- [x] Give progress a dedicated full-width row above the footer.
- [x] Restrict the footer to Vote, Journey and Sponsor. Move contribution, map, share,
  sound and tomorrow into the Journey panel.
- [x] Permit only one open panel. Fit the map inside its panel without an internal
  vertical scrollbar at 1440×900.
- [ ] Accepted: the traveler and city remain the first things a new viewer notices.

### R4 — believable supporting life

- [x] Import and validate the owner-provided Mixamo resident clips; keep resident A and
  B as distinct male/female characters.
- [x] Show one resident encounter roughly every 90–150 watched seconds, lasting
  12–18 seconds; never show more than two and show none in low-quality, prelaunch or
  scripted encounter states.
- [x] Remove the procedural cat. Birds may remain subtle; any future animal must be a
  reviewed sprite/model with source and licence.

### R5 — honest actions and reactions

- [x] Make action windows authoritative in Postgres: a queued action has start/end
  watched seconds and a frozen distance. Authority accrues watched time through the
  action but advances distance only outside it.
- [x] Keep `travelerMotionAt` and `routePositionAt` pure by passing the authoritative
  action timeline explicitly.
- [x] Select route events by `zone.kind`, never by text embedded in an id.
- [x] Allow one watcher to meet the reaction threshold. A confirmed reaction must be
  visible to every connected viewer before it ends, using an invalidation hint followed
  by a server read; reconnecting during an action reconstructs the same state.

### R6 — London-first route and truthful tomorrow

- [x] Add `train` beside walk/flight in database checks, contracts, maps and copy.
- [x] Parameterise seed/reset tools; remove the Tashkent/Dushanbe assumptions from
  current launch validation without editing applied migrations.
- [ ] Seed London Day 1 and announce Paris Day 2 as the reviewed fallback. Preserve the
  two-stage Day-1 name/destination vote and blocked-pair safety policy.
- [x] Read tomorrow from the scheduled `country_days` row or the committed vote result;
  never from registry order.
- [ ] Use the UK/Europe ready route for later ballots: France, Belgium, Germany, then
  other reviewed neighbouring packs. Audience geography informs outreach, not an
  invented geographic jump.

### R7 — build the 24-painting launch buffer

- [ ] After R1 acceptance, owner creates six assets for each of London, Paris, Brussels
  and Berlin: five day zones plus one night landmark.
- Paris pilot progress (11 September 2026): five distinct day masters and one
  composition-matched landmark night master are generated, built as `paris-v1`, and
  available in the guarded local preview. This does not close the item: owner visual
  acceptance and cultural review are still required, and London remains the launch pilot.
- [ ] Run pack scaffold/build/validate/scale-audit, cultural review and visual review for
  each immutable version. Each pack needs real notebook lines and reviewed citations.
- [ ] Preload today plus tomorrow only. Keep later days on the asset origin.
- [ ] After launch, add five to ten reviewed paintings per day instead of making fifty
  or one hundred speculative paintings before launch.

### R8 — sell and launch honestly

- [x] Bound the sponsor calendar to exactly seven eligible dates and show each date's
  lock/source clearly.
- [ ] Complete the real Lemon Squeezy checkout, signed webhook, duplicate delivery and
  refund rehearsal after the owner supplies private credentials.
- [ ] Set the production launch timestamp only after gates pass. Before then the public
  page shows the exact start time and zero simulated progress.
- [ ] Record 10–20 stranger comprehension sessions and physical low/mid phone evidence.
  The 1,000-viewer Preview load run is deferred to after launch by owner decision
  (11 September 2026); see `AFTER-P22.md` D2.
- [ ] Record the launch and fallback screen video only after the visual pilot and HUD
  are accepted.

### R9 — hide weather for launch

- [x] Add `WEATHER_ENABLED=false` by default. While false, do not request Open-Meteo and
  do not show weather temperature, icon, rain/snow or weather freshness.
- [x] Keep the existing provider/cache/rendering code so a later reviewed commercial
  provider or agreement can re-enable it with one flag.

## Launch gate

Launch is allowed only when every **Verified** item that affects the London/Paris path
is complete, R1/R3/R7 are owner-accepted, the payment and scheduler gates are resolved,
all public launch packs are culturally approved, physical-phone evidence is recorded,
and the seed is rehearsed against a protected Preview. The 1,000-viewer test is deferred
to after launch by owner decision (`AFTER-P22.md` D2). Anything else remains in
`AFTER-P22.md` in its three-part owner form.
