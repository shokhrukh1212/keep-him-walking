# Keep Him Walking — Technical & Character Brief

> Companion to `PRODUCT.md`. Read that first for what the product is. This file covers
> how it is built, with the character system as its centre, plus the image/scene
> pipeline and the two rendering defects found in it — §8.3, fixed in `98e1c77`, and
> §8.4, repaired with shared stage calibration on 2026-09-08. Post-P22 launch
> refinements through migration 0034 are recorded inline below and in
> `docs/plan/08-LAUNCH-READINESS.md`.
>
> Runtime numbers come from the repository. Stage calibration values are explicitly
> identified visual estimates; historical measurements are labelled by their original version.

---

## 1. Stack and repository layout

| Concern | Technology |
|---|---|
| App framework | Next.js **16.3.3**, App Router, React **19.2**, TypeScript 5.9 |
| Data & auth | Supabase — Postgres, row-level security, `security definer` RPCs, Storage, Realtime presence |
| World rendering | **Pixi.js 8** (WebGL) — panorama, ground, weather, diagnostics |
| Character rendering | **Three.js 0.180** — skinned GLB actors, own transparent canvas |
| Interface | React + plain CSS (`globals.css`), Tailwind v4 available but the journey UI is hand-written CSS |
| Audio | Web Audio via a `useJourneyAudio` hook, per-zone `.wav` ambience |
| Validation | Zod 4 for every content pack and every API body |
| Payments | Lemon Squeezy (hosted checkout + signed webhooks), plus a deterministic no-money fixture adapter for rehearsals |
| Observability | Sentry (client/server/edge), Vemetric product analytics, Better Stack structured logs, Web Vitals endpoint |
| Testing | Vitest (85 test files, 393 tests) + Playwright (32 spec files across 8 config profiles) + pgTAP (368 assertions) |
| Hosting | Vercel; functions in `syd1` adjacent to the Supabase project in `ap-southeast-2` |
| Package manager | pnpm 11, Node ≥ 22 |

```
src/
  app/                    24 pages, 34 route handlers, sitemap/robots/manifest
  components/
    journey/JourneyExperience.tsx   the one orchestrating client component
    scene/                PixiScene, SceneStage, StaticScene
    traveler/             ProductCharacterStage3D, CharacterActor host, review UI
    hud/ dialogue/ vote/ sponsor/ tickets/ postcard/ archive/ debug/
  content/countries/      16 registered country packs + two factories
  lib/
    content/schema.ts     the Zod source of truth for all pack shapes
    characters/           GLB manifest, clip table, timelines, prop windows, actor
    traveler/             motion clock, presentation clock, types, action preview
    world/                route clock, motion machine, quality tiers, sequencer
    presence/ steps/ story-clock/   the walking rule and its accounting
    payments/ postcards/ security/ observability/ identity/ i18n/
art/                      editable sources: .blend character files, master art PNGs
public/
  characters/v1|v2/       traveler.glb, almaty-host.glb, CREDITS.md
  scenes/<city>/<ver>/    per-zone webp derivatives (Tashkent v2/v3/v4, others v1)
  npcs/<city>/<ver>/      neutral | talk | react webp
  traveler/production/v2/ 24 sprite frames (only idle + walk-1 still fetched)
  audio/<city>/<ver>/     per-zone ambience
scripts/
  characters/             Blender/MPFB build pipeline (Python) + browser checks (mjs)
  process-phase*-art.mjs  sharp-based image derivation
  phase2/ phase3/         preflight, seeding, scheduling, rehearsal, reporting
supabase/migrations/      34 forward migrations, 380 pgTAP assertions
```

---

## 2. Layer ownership and the composite stack

Strict ownership. No layer reaches into another's pixels.

| Owner | Responsibility |
|---|---|
| Postgres | Authority. Presence, active seconds, votes, sponsor state, postcards. |
| Pixi canvas | The world: sky, panorama, ground-life, character contact shadows, weather motes; owns the shared visual grade. |
| Three canvas | The characters only: traveler and resident. |
| React DOM | HUD, dialogue, sponsor card, controls, vote, diagnostics. |
| Web Audio | Per-zone ambience. |

`SceneStage` and `JourneyExperience` stack these absolutely-positioned, viewport-filling
layers, back to front:

```
z-index -2   .scene-stage            clipping container
z-index auto .static-scene           <img> of the zone fallback painting
                                     (opacity → 0 once Pixi reports ready)
z-index  1   .pixi-scene canvas      the live world (opacity 0 → 1 over 800 ms)
z-index  2   .product-character-stage canvas   the Three.js characters
z-index  3   .scene-grade            two CSS gradients for colour grading
z-index  4   .scene-vignette         inset box-shadow
z-index  7   .traveler-wrap          static idle <img>, only until the GLB loads
z-index 15   .journey-hud            day marker + live status
z-index 24   .compact-dock           sponsor card, vote, details buttons
z-index 25   .journey-details        the expandable panel
```

Note that `.scene-stage` sits at `z-index: -2`, i.e. *behind* the page background flow,
with the HUD painted in normal document order on top of it.

Because the character lives in a **separate canvas above** the world canvas, nothing in
the Pixi scene graph can occlude him. The two canvases now share a measured stage frame
through a ref (§8.4), so their scale and ground plane agree without merging renderers.

---

## 3. Authority and the clock chain

This is the most important mechanism in the codebase. Two authority tracks flow from
Postgres to every animated frame: watched seconds for animation and metres for route
progress.

```
presence_leases (per browser session, 50 s TTL, requires visible && scene_ready)
      │  record_presence_heartbeat_v4 → v3   (security definer, SELECT … FOR UPDATE)
      ▼
journey_runtime { global_active_seconds, global_distance_metres, pace_rate,
                  waiting_since, last_watcher_left_at }
      │  /api/bootstrap  (full snapshot)  +  /api/presence/heartbeat (~20 s)
      ▼
RouteRuntime { globalActiveSeconds, globalDistanceMetres, paceRate, authoritativeAt, walking }
      │
      ▼
PresentationClock        two monotonic client tracks, drift-corrected
      │
      ▼
travelerMotionAt(pack, rawSeconds, distanceMetres) → TravelerMotionSnapshot
      │
      ├──► routePositionAt(pack, distanceMetres)   route/evening position
      ├──► PixiScene                  panorama offset, ground scroll
      ├──► productCharacterSceneAt()  which clip, at which second
      └──► HUD                        status label, step counts
```

### The server side

`record_presence_heartbeat` runs inside a row lock on `journey_runtime` and:

1. Computes `v_active_until` as the latest live lease expiry among visible, scene-ready
   leases.
2. Accrues `v_delta_seconds = least(now, active_until) − last_accounted_at`, clamped at
   zero. **If no lease is alive, the delta is zero** — that is the walking rule.
3. Upserts the caller's own lease, adding its own visible time capped at the TTL.
4. Counts `count(distinct visitor_hash)` of live leases → the watcher number.
5. Writes `global_active_seconds`, `global_steps`, and a per-minute `step_buckets` row.

`_v2` additionally returns `global_active_seconds` to the client. `_v3` additionally
records a durable per-visitor contribution as `max(active_seconds)` across that
visitor's leases — never the sum, so multiple tabs cannot inflate a contribution.
`_v4` keeps the v3 contract intact and takes the same authority-row lock. Before it
mutates the caller's lease, it accrues the interval owned by the previously persisted
pace. The interval is split at every lease expiry, so an expired visitor stops affecting
distance exactly at the TTL boundary. It then delegates the lease/contribution mutation
to v3 and computes the post-mutation pace from its confirmed watcher count:

```
n = count(distinct visitor_hash) of live visible + scene-ready leases
pace = min(1 + log2(max(n, 1)), PACE_CAP)
distance += interval_seconds × 1.25 m/s × interval_pace
```

An active caller is therefore included in `n`, but its new pace is never applied
retroactively to time before it arrived. The new pace is persisted to
`journey_runtime.pace_rate`; the response carries both `out_active_viewers` and
`out_pace_rate`. The read-only v4 projection uses the same expiry splitting without
mutating authority, and bootstrap v5 returns that projected distance, watcher count and
pace in one admitted bundle. The old v4/v5 signatures remain as 5×-cap rollback
wrappers; server routes pass the configured cap explicitly. `_v3` remains callable for
rollback.

`_v5` wraps v4 to credit watch time by country. It reads the caller's own lease
`active_seconds` before delegating and again after, so only that visitor's confirmed
visible delta (capped at the TTL) is added to its `country_day_watch` row, and
`peak_watchers` rises to the live distinct count for that country. v4 already holds the
authority row lock for the rest of the transaction, so the aggregate write is
serialized with every other heartbeat for the day. The country itself comes from the
`x-vercel-ip-country` edge header, normalized to `^[A-Z]{2}$` or the explicit unknown
code `ZZ`; the request IP is never read.

`walking` is returned to the client as simply `activeViewers > 0`.

P6 adds a configured v4 overload under the same authority-row lock. It counts the live
crowd before mutating the caller and compares that to the post-mutation v3 result. An
explicit final inactive heartbeat starts `waiting_since` at that heartbeat. When leases
silently expire, the next read or heartbeat derives the zero-watcher boundary from the
last lease expiry rather than from the later request time. The first serialized arrival
receives that ended wait as `out_waiting_since`; the stored live wait is cleared and its
origin is retained in `last_watcher_left_at`. `out_woke_him` is true only when the ended
gap is at least `FIRST_WATCHER_GAP_SECONDS` (600 seconds by default). Because the row is
locked, simultaneous arrivals cannot both receive the award. Bootstrap uses the
read-only v5 runtime projection so the public waiting timestamp is available before a
new lease exists; wake-card eligibility is never present in bootstrap.

### The client side

`PresentationClock` is the only clock the scene and rig share:

- `accept(runtime, ttlMs)` ignores any update whose `authoritativeAt` is not newer than
  the newest already seen, so out-of-order responses cannot rewind the world.
- Network updates change the clock's **target**, never its origin.
- `sample()` exposes `rawSeconds` and `distanceMetres`. Seconds ease at up to 1.05× real
  time; distance eases at `1.25 × paceRate`, with the equivalent two-second snap
  threshold. Both snap to their target when authority expires.
- It reports `traveling` only while `walking && now < leaseExpiry`.

Both extrapolation helpers and the presentation clock cap invention at 60 seconds,
even if a future lease TTL is longer.

The page's confirmed walking lease comes from heartbeats and from `/api/bootstrap`
refreshes. A refresh replaces it only when its `route.authoritativeAt` is at least as new as
the newest heartbeat (`presenceReadIsCurrent`). Bootstrap is slow on a dev server and cached
for up to 13 s in production. A read that counted nobody used to arrive after the heartbeat
that counted this visitor and stop him until the next beat.

During a rolling deployment, an older heartbeat response can briefly omit presentation-only
fields added by a newer page bundle. `useJourneyPresence` retains the bootstrap-confirmed
reaction counts, weather and country in that case while accepting only the heartbeat's
authoritative presence and progress. Missing presentation fields therefore cannot crash or
invent a newer public state.

### The locomotion constants

```
STEP_DURATION_SECONDS = 0.6     one footfall
GAIT_CYCLE_SECONDS    = 1.2     two steps
METRES_PER_STEP       = 0.75
METRES_PER_SECOND     = 1.25
zone.lengthMetres     = 1200 / 1600 / 1600 / 1400 / 2200
dayRouteMetres        = 8000
marathonMetres        = 42195
```

`durationActiveSeconds` remains in the Zod pack schema only for compatibility and is
ignored by route progress.

### Why actions do not break determinism

`travelerMotionAt` separates **raw watched seconds**, authoritative distance and
**locomotion seconds**. Route actions are selected by `atMetres`; each metre trigger is
rounded to the distance corresponding to a 0.6 s planted-foot boundary. Crowd actions
carry an authoritative `atActiveSecond`, `endsAtActiveSecond` and
`frozenDistanceMetres`; heartbeat v12 and runtime read v6 accrue watched time but remove
the action overlap from distance. The gait and street therefore hold together. Because
the whole computation is pure in its explicit inputs:

- Two viewers on different devices compute the identical frame.
- Reload recomputes the same position instead of restarting.
- Seeking backwards (in review tooling) is exact.
- `plantIndex`, `plantedFoot` and `cyclePhase` remain deterministic while route distance
  comes only from the confirmed/extrapolated distance authority.

At `paceRate >= 3`, `productCharacterSceneAt` makes only the visual walk clip brisk:
it samples that clip at 1.25× within each canonical 0.6 s step and clamps just before the
next plant, holding there until the authoritative step boundary. `CharacterActor` also
sets the active walk action's effective time scale to 1.25, while deterministic
`cue.seconds` seeking remains the pose authority. The traveler leans 2° forward. The
underlying `travelerMotionAt` sample is untouched, so `plantIndex`, `plantedFoot`, HUD
footfalls, route actions and distance all retain their original derivation.

Crowd actions are the fourth authoritative input to `travelerMotionAt`. They are
scheduled by the server on the raw watched-second clock and snapped to the same 0.6 s
planted-foot grid the route beats use, so every viewer performs them on the same
footfall. A route beat always wins: a crowd action never interrupts an encounter.
Rather than dropping a swallowed action, its elapsed time is
`min(seconds since it was scheduled, seconds since the last route beat ended)` — the
second term is derived from distance, so it needs no history and stays pure, and a
wave scheduled mid-encounter starts cleanly the moment the goodbye ends. Crowd actions
feed both renderers and the bounded browser distance projection as explicit inputs.
Realtime broadcast is only an invalidation hint: a client always follows it with
`GET /api/reactions`, which projects the authoritative rows server-side.

**One divergence worth knowing:** the database's `global_steps` uses the configurable
`STEPS_PER_ACTIVE_SECOND` (default **1.8**/s), while every displayed step count uses
`plantIndex` from the 0.6 s gait (**1.667**/s). The UI reads the gait-derived number, so
what a visitor sees is internally consistent; the database column is the one that drifts
from it.

---

## 4. The traveler state machine

`TravelerState` (26 values, defined in `src/lib/content/schema.ts`) is the semantic
contract every renderer must satisfy:

```
loading  idle  start_walk  walk  slow_walk  stop  rest
notice   approach  greet  talk  listen  react  wave
phone    drink  photo  sit  goodbye  resume_walk
wait  sleep  look_up  tie_shoe  cheer  stumble
```

Three layers produce it:

1. **`motion-machine.ts` — locomotion phase.** From the desired walking flag and how
   long ago it changed: `start_walk` / `resume_walk` for the first 650 ms,
   then `walk`; on stopping `slow_walk` (650 ms) → `stop` (to 1.1 s) → `rest`. Speed
   factors 0.62 / 1 / 0.38 / 0.
2. **`motion-clock.ts` — scheduled actions.** Story beats map to action kinds:
   arrival → `wave` (2.5 s), encounter → the full exchange, food → `drink` (5.5 s),
   landmark → `photo` (4 s). Departure remains a wall-clock event beginning at rollover;
   it is not placed on the distance motion track. Non-encounter actions get a
   0.45 s `stop` entry and a 0.65 s `resume_walk` exit around the held pose.
3. **Encounter sequencing.** Fixed prologue `notice` 0.6 s → `slow_walk` 0.6 s →
   `approach` 1.2 s → `greet` 2.5 s, then one segment per dialogue line using that
   line's real `durationMs` (default 4.5 s) with `talk`/`listen` assigned by speaker and
   the line index published for the HUD, then `react` 2.5 s → `goodbye` 2.5 s →
   `resume_walk`. Total duration is `11.1 s + Σ line durations`.

`worldCommandForEncounter` separately drives the world: camera zoom 1.08, a small pan,
and background life dropped to 0.22 during the focused phases.

While the traveler is waiting, `waitingBehaviorAt(waitedSeconds, isLocalNight)` selects,
deterministically, the pockets/look-up cycle for the first minute and then the
pockets/watch/pockets/stretch/yawn/look-up cycle.

- **Cycle length.** Each take plays once, whole and at its own `CLIP_SPECS` length, before the next begins, so the cycle lengths follow the installed takes.
- **Ten minutes.** At 600 seconds it plays `sit_down` for its length, then loops `sitting` on its own length. From 21:00–05:00 local time it loops `sleep` instead.
- **Missing takes.** They resolve through the manifest to the closest v2 pose.
- **Inputs.** The waited duration and local hour are explicit inputs; authoritative route seconds remain unchanged.
- **Arrival.** During the three-second first-arrival beat, a traveler still on his feet looks up. One whose wait reached the seated phase holds `sitting` for 0.8 s, then plays `stand_up` before locomotion resumes.

P11 also derives look-up, shoe-tying, one daily stumble and the marathon cheer from the
pack id plus authoritative seconds/metres. Route beats win over crowd actions, which win
over these system actions. No timer or module state participates.

---

## 5. The character system — how the characters are built

### 5.1 The identity target

The authoritative likeness reference is `public/traveler/temporary/v1/idle.webp` (with
`walk`, `wave`, `drink`, `phone`, `photo` variants alongside it). The brief:

> Youthful adult, slim relaxed shoulders and torso. Large expressive dark eyes, dark
> eyebrows, gentle cheeks, narrow chin, warm closed-mouth smile. Asymmetrical swept dark
> waves with a raised front quiff and visibly separated curls. Teal open cotton
> overshirt, fitted collar, rolled sleeves, real pockets and buttons. White crew-neck tee
> underneath. Tan fitted trousers with constructed turn-up cuffs. Illustrated sneakers, a
> watch, and a fitted mustard backpack with real straps and a sponsor patch.

Target standing height **1.78 m**. The Almaty resident is a separate character at
**1.68 m**, with her own identity, clips and expressions.

### 5.2 The build pipeline

Everything is reproducible from checked-in code. Asset acquisition cost is **$0**.

Tools: **Blender 4.5.4 LTS** + **MPFB 2.0.17** (MakeHuman's Blender plugin), driven
headless by `scripts/characters/build_models.py`. Blender and MPFB are extracted under
`.cache/character-authoring/tools/` and verified against SHA-256 values in
`scripts/characters/sources.lock.json`.

```sh
blender --background --factory-startup --python scripts/characters/build_models.py -- traveler --v2
blender --background --factory-startup --python scripts/characters/build_models.py -- almaty-host --v2
node scripts/characters/optimize-glb.mjs public/characters/v2/traveler.glb public/characters/v2/almaty-host.glb
node scripts/characters/report.mjs
```

`-- resident-b` builds the male local resident through the same steps, with his own
fixed body sliders (gender 1, age 0.6, muscle and weight 0.5, proportions 0.6) and none
of the traveler's identity work: no face targets, swept hair, backpack, watch, belt,
softened overshirt or cuffs. `wardrobe.tailor` takes a `traveler` flag for that
tailoring. Every v2 build gets the garment repairs first made for him: detached buttons
removed, one continuous opening from hem to neckline, a 7 mm rather than 11 mm jacket
clearance and a reduced hidden undershirt. The two residents also keep only the strip
of undershirt their open jacket shows, because under the closer fit their contrasting
inner shirts surfaced through the jacket beside the lapels. None of it moves a joint:
both rebuilt residents match the skeletons they were uploaded to Mixamo with, joint for
joint.
`scripts/characters/export_mixamo_upload.py` writes the copy of any character that is
uploaded to Mixamo (full outfit, leaf bones, no actions) and re-imports it to check the
52-bone rig.

The residents ship from `import_mixamo.py`, not from this script. Run on each staged
`.blend` with a runtime name and `--model`, it bakes that resident's six Mixamo takes into
`public/characters/v3/resident-{a,b}-animations.glb` and exports `resident-{a,b}.glb` from
the same rig carrying no clips, so a take a resident lacks plays its declared fallback
rather than a V2 procedural clip. `optimize-glb.mjs` and `compress-glb.mjs` then run on
all four files; the commands are in `scripts/characters/README.md`.

Step by step, in the order the script performs it:

1. **Macro body shape.** A MakeHuman macro dictionary: `gender` 0/1, `age` 0.46,
   `muscle` 0.23, `weight` 0.28, `proportions` 0.58, `height` 0.48, plus a
   shape-space blend. These are morph-space sliders, not statements about the
   character's identity — the code says so in a comment.
2. **Identity morph targets.** For the traveler, **~28 named MakeHuman targets** are
   loaded at small weights to move the generic base toward the reference: `head-age-decr`
   0.32, `head-invertedtriangular` 0.24, `chin-width-decr` 0.20, `l/r-eye-scale-incr`
   0.24, `l/r-cheek-bones-incr` 0.11, `eyebrows-angle-up` 0.07, `nose-scale-horiz-decr`
   0.11, `mouth-angles-up` 0.16, `torso-vshape-decr` 0.16,
   `measure-shoulder-dist-decr` 0.13, and so on. Then `TargetService.bake_targets`
   freezes them into the mesh.
3. **Skeleton.** MPFB's built-in **Mixamo rig — 52 joints**, `mixamorig:` prefixed. Chosen
   because it is a well-known naming convention, which makes hand sockets and any future
   retargeting predictable.
4. **Face and body assets.** MakeHuman system assets (all CC0): young skin texture,
   `high-poly` eyes, `eyebrow001`, `eyelashes01`, `teeth_base`.
5. **Garments**, added as MHCLO assets and then re-dyed to solid exportable materials:

   | Garment | Source asset | License |
   |---|---|---|
   | Trousers | `cortu_cargo_pants` (Pants 01) | CC0 |
   | Overshirt | `elvs_male_shirt_untucked_bd1` (Shirts 02) | CC-BY |
   | Inner tee | `punkduck_deathnote_t-shirt` | CC BY 3.0 |
   | Sneakers | `shoes05` | CC0 |
   | Hair (resident) | `braid01` | CC0 |
   | Hair (traveler, base) | `elvs_grump_hair` (Hair 02) | CC-BY |

   Colours: teal `(0.018, 0.23, 0.29)`, tan `(0.54, 0.40, 0.26)`, ivory
   `(0.88, 0.85, 0.77)`.
6. **Tailoring** (`wardrobe.py`). Skin mask groups are edited so real skin remains under
   rolled sleeves and shortened hems. The overshirt is opened by first deleting every
   disconnected component except the largest shell (removing stock buttons that
   otherwise floated as debris), then **bisecting exact placket edges** at ±0.045 units
   before deleting faces — the earlier centre-threshold deletion produced the
   stair-stepped opening visible in older screenshots. Sleeves are cut 30 % down the
   forearm. A subdivision pass softens the low-resolution trouser pattern *before* it is
   deformed.
7. **Hair.** The stock asset's combed silhouette was rejected, so `add_swept_hair` authors
   the reference's shape as head-bound geometry: a trimmed UV-sphere scalp cap plus
   **eight bezier strand tubes** (radius 0.014 / 0.012) laid out as layered arcs to build
   the high left quiff and the lower sweep over the right temple. Material
   `(0.105, 0.032, 0.012)`.
8. **Project-authored props**, all skinned to the rig rather than parented as rigid
   children: backpack shell, front pocket, two shoulder straps as bezier tubes with
   buckles and seams, a carry handle, a watch band (torus, oriented to the forearm axis)
   and dial, and a `SponsorPatch` plane on the pack's front pocket.
9. **Expression morphs.** Six MakeHuman expression units loaded at weight 0 so they
   export as GLB morph targets: `blinkLeft`, `blinkRight`, `speak`, `smile`, `browLeft`,
   `browRight`.
10. **Opacity fix.** MPFB's game material template defaults everything to alpha blend,
    which drew teeth and eyes through skin. Body, shoes and teeth materials are forced
    to `Alpha = 1` with their alpha links removed.
11. **Mask bake.** `bake_modifiers_remove_helpers(bake_masks=True)` applies delete groups
    so hidden skin cannot poke through garments.
12. **Animation bake** (§5.3), then bone world coordinates are dumped to JSON for
    animation authoring.
13. **Export.** Textures over 2048 px are downscaled, `pack_all` embeds them, the
    `.blend` is saved to `art/characters/v2/`, and glTF is exported with
    `export_animation_mode='ACTIONS'`, `export_morph=True`, `export_skins=True`,
    `export_yup=True` (Blender is Z-up, glTF is Y-up), JPEG quality 82.
14. **Optimize.** `optimize-glb.mjs` resamples **textures only** — mesh and animation
    buffers are byte-preserved, alpha stays alpha. No runtime decoder. Next serves
    the `.glb` directly by default; optional asset hosting added 2026-09-08 is described in §11.

The active manifest is v3-ready without making an unfinished asset a release blocker.
At runtime it first requests `public/characters/v3/traveler.glb` and, when present,
optionally merges clips from `traveler-animations.glb` by bone name. Until that owner-
approved replacement is installed, the loader falls back atomically to the reviewed v2
GLB and does not mix v3 tracks into the older rig. Dropping those two v3 files into the
documented paths therefore needs no source edit; the character review labels which
candidate strategy is active and continues to expose missing-clip fallbacks.

`PresentationClock` treats a repeated authoritative route timestamp as a lease renewal,
not as a new route anchor. This matters when the route values have not changed between
presence heartbeats: the HUD and 3D actor retain the same confirmed walking window, while
the animation clock continues monotonically and remains bounded to 60 seconds of
extrapolation. Older timestamps are still ignored.

During ordinary locomotion the GLB actor follows a bounded eight-second camera drift of
±3.2% of the viewport, clamped to the stage's declared `walkableX`. The panorama still
carries route distance, while this local displacement makes the walk visibly spatial
instead of pinning the actor to one screen coordinate. Waiting and scripted actions do
not receive the drift, and the shared contact point follows the displaced actor.

### 5.3 Animation authoring

`scripts/characters/animation.py` — **analytic two-bone IK** with constant segment
lengths, trigonometric gait phase, smoothstep envelopes, sampled and baked at **30 Hz**.

For the seven contact-critical clips (`greet`, `goodbye`, `talk`, `react`, `drink`,
`phone`, `photo`) `interaction.py` re-authors the pose using **evaluated** parent
transforms, arm IK, explicit palm frames and joint-specific finger flexion.

> **These are not motion-capture recordings.** They are procedurally authored curves.
> A CC0 retarget experiment against
> [Mesh2Motion assets](https://github.com/Mesh2Motion/mesh2motion-assets) (revision
> `9ba8216…`, takes `Walk_Female`, `Greeting`, `Idle Listening`, `Idle_Subtle`) is
> recorded in `scripts/characters/motions/*.json` with source file, rest axes, native
> duration and sampled rotations — but it **failed visual inspection** (arms folded
> through the torso from missing rest-axis alignment) and is **not present in the served
> GLBs**. The V2 GLBs contain no Mixamo animation.

**V3 Mixamo animation (in use since 2026-09-10 by owner decision; clips still to review are `docs/plan/AFTER-P22.md` D6).**

- **What it builds.** `scripts/characters/import_mixamo.py` bakes the owner's Mixamo takes onto this rig and writes `public/characters/v3/traveler-animations.glb`. It holds 22 runtime clips from 20 downloads: Waving serves `greet` and `goodbye`, and Start Walking serves `walk_start` and `resume`. The takes were downloaded for the traveler's own uploaded skeleton; `public/characters/v3/CREDITS.md` lists which take became which clip.
- **What loads.** `v3/traveler.glb` is a byte copy of the V2 model. Animation-file clips replace V2 clips of the same name, so `listen`, `notice`, `stop`, `turn` and `photo` are still V2 procedural motion.
- **Rest-pose alignment.** Every take returns the skeleton re-rested with level arms, 48.8° from this rig's A-pose. Each bone is posed onto that rest, parent first, before its world rotation delta is copied. That is the alignment the Mesh2Motion experiment lacked.
- **Takes keep their own length.** Nothing is trimmed, mirrored or retimed except the walk, as the owner approved. `CLIP_SPECS` durations record each installed take's length, for example `phone` 23.57 s and `react` 9.77 s. `CharacterActor.sample` maps nominal cue seconds onto the length of the take a character actually carries (§6.1), so the V2 resident and any fallback still play their whole take over the scheduled interval. Scheduled actions keep their `ACTION_DURATIONS` windows, so a long take plays faster than it was recorded inside one.
- **Placement.** Each take is placed by where its feet start, so Stand To Sit, Sitting Idle and Sit To Stand meet where the previous take left off. Start Walking travels 1.91 m and Tripping 2.38 m, so their hips are held in place, because horizontal travel belongs to the scene clock. Male Laying Pose is a single frame, held for one second.
- **Walk timing.** The 1.03 s source cycle is cut at left-foot placement and resampled piecewise to 1.2 s, with the right foot at 0.6 s. The planted foot travels at 1.48 m/s against the 1.25 m/s route speed.
- **Waiting and arrival.** The waiting cycle plays each take whole at its own speed (§4). The first-arrival beat stands the traveler up only if his wait had reached the seated phase, because Sit To Stand starts seated.
- **Props.** The `props.ts` drink and phone windows follow Drinking and Texting While Standing, and a V2 fallback uses the same windows. Drinking holds the bottle in the left hand while the runtime bottle sits in the right hand; `docs/plan/AFTER-P22.md` D6 lists this with the other clips to review.
- **Size.** The animation file is 1.88 MiB compressed (3.18 MiB raw), so a first visit now fetches 2.48 + 1.88 MiB of traveler.
- **Where the raw files live.** Raw downloads and the baked `.blend` stay in the ignored cache, because of Mixamo's terms and the public repository.
- **Going live.** Files in `public/characters/v3/` become the live character on the next deploy.

The clip table (`src/lib/characters/manifest.ts` must stay in sync with
`animation.py`):

| Clip | Duration (s) | Authored behaviour |
|---|---:|---|
| `idle` | 4 | Standing feet, scripted head motion |
| `walk` | 1.2 | Analytic stance/swing goals, opposing arms |
| `greet` | 4.8 | Right wrist rise/wave envelope |
| `talk` | 4 | Scripted hand targets; runtime speaking morph |
| `listen` | 4 | Standing with head motion |
| `react` | 3 | Conversational hand targets |
| `goodbye` | 3 | Same gesture construction as greet |
| `drink` | 5.5 | Wrist target near face; runtime bottle placement |
| `phone` | 4.5 | Two wrist targets in front of torso |
| `photo` | 4 | Higher two-hand targets; landscape device |
| `rest` | 5 | Lowered pelvis, forward feet, thigh-level hands |
| `notice` `stop` `turn` `resume` | 1.0 / 1.2 / 1.2 / 1.2 | Transition placeholders |

### 5.4 What actually ships

Measured directly from the GLB headers:

| | `traveler.glb` | `almaty-host.glb` |
|---|---:|---:|
| Bytes | 4,648,768 | 3,718,728 |
| Triangles | 75,526 | 65,052 |
| Skin joints | 52 | 52 |
| Meshes | 31 | — |
| Materials | 20 | — |
| Embedded images | 7 | — |
| Animation clips | 15 | 11 |
| Morph targets | 6 (on `base.001`) | 6 |

Combined **7.98 MiB** against the 8 MiB `combinedBudgetBytes` in the manifest — inside
budget by ~21 KB, i.e. there is no headroom left.

The resident has no `notice` / `stop` / `turn` / `resume`; the runtime falls back for her
(`notice → walk`, `stop → idle`, `turn → idle`, `resume → walk`).

---

## 6. The character system — runtime

Both `ProductCharacterStage3D` and `CharacterStage3D` resolve their manifest URLs
through `publicAssetUrl` at the GLB loading boundary. Canonical manifest paths and
revision queries are unchanged. The review route and both candidates remain available.
This hosting change does not change the skeleton, artwork, clips or motion clocks.

### 6.1 `CharacterActor` (`src/lib/characters/actor.ts`)

One mesh and one skeleton for **every** action. Only skeletal clips and face weights
change.

- **Height calibration happens once**, using the *idle* clip's evaluated bounds rather
  than the wider bind pose — the skeleton is stepped to idle frame 0, skeletons updated,
  and the root is uniformly scaled to the manifest height and shifted so its lowest
  vertex sits at y = 0 and it is centred in x. Bounds are never renormalized during an
  action, which would make the character breathe in size.
- **Every clip is `play()`ed once and then weight-gated.** Switching action sets a
  0.28 s smoothstep crossfade between exactly two actions; the rest sit at weight 0.
- **Seeking is deterministic:** `action.time = min(cue.seconds / CLIP_SPECS duration ×
  takeDuration, takeDuration − ε)` and then `mixer.update(0)`. Cue seconds are nominal
  manifest time, so a character carrying a take of a different length plays its whole take
  over the same scheduled interval. That covers the V2 resident and any V2 fallback. There
  is no accumulated delta, so the same input second always produces the same pose — this is
  what lets two viewers, a reload, and a scrubbed review timeline all agree.
- **Pace is an explicit cue input.** The active action receives its cue time scale via
  `setEffectiveTimeScale`; the brisk walk still seeks the pure, step-bounded sampled
  second described in §3 rather than accumulating frame delta.
- **Face is driven procedurally**, not baked (no clip carries morph tracks): a 3.7 s
  blink cycle with a 0.28 s sine closure, a 0.17 smile bias with `react`/`greet`
  accents, a `sin²(9t)` speaking envelope active only on `talk`, and small brow accents.
- **Material corrections at load:** transparent hair cards and lashes are converted to
  alpha-cutout (`alphaTest 0.4`, `depthWrite true`) so they stop sorting through the
  head; the `high-poly` eye material keeps blending but stops writing depth; the stock
  hair map is tinted dark brown at runtime.
- **P3 toon treatment (2026-09-09):** after those corrections, GLB standard materials
  (skin, cloth, hair, shoes, backpack and patch) become `MeshToonMaterial`, preserving
  colours, colour/normal/bump/alpha maps and other supported texture inputs. Eyes keep
  their original material. Each actor owns one code-generated 3×1 red-channel
  `DataTexture` with values 128/199/255, nearest filtering and no mipmaps. Every
  directional light adds at least the lowest band everywhere; the original 72 left the
  side away from the key at 28% and read as dirt on the face (raised 2026-09-11).
  The shader multiplies exposure/tint **after sRGB encoding**, matching Pixi's
  `ColorMatrixFilter` display-space operation without modifying texture colours.
- **Outline:** cloned mesh siblings use BackSide, `stage.palette[2]`, alpha 0.7 and
  depth writing. Their transforms and bind matrices match the source. After skinning
  and morphing, the vertex shader expands the silhouette along its projected normal by
  1.5 CSS pixels. This replaces the origin-based 1.018 scale that displaced the grey
  hull above the head and shoulders. Hair hulls retain texture alpha cutouts. Brows,
  lashes and teeth get no hull (`FACE_DETAIL`): they are a few pixels wide at live size,
  and a 1.5 px hull painted dark smudges over the eyes. Low quality hides all hulls;
  medium/high show them. Geometry and skeletons are shared, not duplicated.
- **Props.** A capsule water bottle and a boxed phone are built in code (no asset).
  `sampleProp()` returns a deterministic `{visible, contact, progress}` from
  retrieve/contact/release/stow windows per clip — e.g. `drink` retrieves at 0.28 s,
  contacts lips 1.2–3.85 s, stows at 5.18 s. Deterministic windows mean seeking,
  cancelling and replaying can never leave a prop stuck in a hand.
- **Grip resolution, in priority order:** authored grip transforms read from Blender
  `userData` (`drinkGripPosition/Rotation`, etc.) if present; otherwise hand-space
  sockets computed from `mixamorig:RightHand` with `Left|RightHandMiddle1` knuckles, the
  device placed at the two-knuckle midpoint pushed 5.2 cm forward and rotated 180° so its
  screen faces the actor (a previously confirmed bug had it facing away), and the bottle
  offset and given a sip rotation scaled by the gesture envelope.
- **Sponsor patch.** The `SponsorPatch` material is cloned at load, then `setSponsor(url)`
  loads a texture with an incrementing revision guard so a slow response cannot overwrite
  a newer one. On failure the sewn patch stays visible in its base colour — the character
  never shows a hole where a logo failed to load.
- **`dispose()`** stops all actions, uncaches the root, disposes the sponsor texture,
  removes/disposes hulls and toon materials plus their gradient, then leaves the
  original materials attached for the host to dispose all original GLB resources.

### 6.2 `ProductCharacterStage3D` (`src/components/traveler/ProductCharacterStage3D.tsx`)

The live host component. Mounted once with an empty dependency array; all changing props
are read through a ref so the renderer is never torn down mid-journey.

- Own `WebGLRenderer` with `alpha: true` over the world canvas. Antialias, pixel ratio
  (1.5 / 1.25 cap), outlines and the frame cap (30 vs 60 fps) come from the quality tier.
- `SRGBColorSpace` output, `NoToneMapping`, exposure 1.0. No shadow maps or shadow floor.
- Shared `CharacterLights` in live and review stages: hemisphere palette[0]/palette[2]
  at 1.1, key palette[0] at 1.6 from `(−3,5,4)`, `(3,5,4)` or `(0,5,4)` for
  left/right/top, fill palette[2] at 0.4 from the opposite side. Lights and outline
  colour follow the actually rendered zone's stage frame.
  Pack palettes are a painting's dominant colours (Paris arrival: sky blue and grey), so
  a light keeps only 15% of its palette colour's hue, at full brightness; the hemisphere
  ground colour is that ×0.55. three divides diffuse light by π, and the earlier
  palette-coloured 1.55/0.9 left a Paris face at 30–50% of its texture, tinted blue.
  Now a camera-facing face shows about 90% of its own colour in daylight and the side
  away from the key about 65%; `toon.test.ts` pins both for grey, sky-blue and default
  palettes. Below daylight exposure, a warm front lamp (up to 0.5) and back rim (up to
  1.0) increase gradually so the face and silhouette remain readable while both
  renderers retain the same night grade.
- **Orthographic camera**, updated from the current stage frame: 1.78 m maps to
  `stageLayout().personHeightPx` and world y=0 projects to `stageLayout().groundY`.
  `actorLayout(viewportHeight, layout)` adapts these to height/bottom (§8.4).
- Traveler and resident GLBs load in parallel; each reports availability upward so the
  React tree can swap away the static idle image and hide the 2D NPC picture.
- Per frame: accept the runtime into the shared `PresentationClock`, sample it, run
  `travelerMotionAt`, run `productCharacterSceneAt`, then push cues into both actors —
  with `snap = true` on the first frame and on every conversation boundary so a cut is a
  cut, not a 0.28 s smear. The resident is sampled with a 1.8 s face offset so the two
  characters do not blink in unison.
- The locomotion phase and its elapsed presentation time are explicit timeline inputs.
  The live GLB therefore plays `walk_start`, `stop` / `walk_stop`, and `resume` across
  the same 650 ms / 450 ms state-machine windows instead of jumping directly between
  walking and the first waiting take after the retired sprite renderer was removed.
- The confirmed/projected `routeRuntime.paceRate` is passed into that pure timeline.
  At 3× and above the host applies its returned 2° forward lean; actions and encounters
  are not retimed or leaned.
- Staging: in conversation the traveler moves to viewport anchor 0.43 (0.34 on mobile)
  and both actors yaw ±π/2 to face each other; otherwise the traveler sits at the pack's
  `travelerViewportAnchor` (0.61) with a slight ±0.68 rad turn toward travel.
- Pauses on `document.hidden`, handles `webglcontextlost` / `restored` by hiding the
  canvas and re-reporting availability, and on unmount walks the whole scene disposing
  geometries, materials, textures and skeletons. Contact publications are cleared on
  context loss, invalid layout and unmount so Pixi cannot retain an orphan shadow.
- Writes `data-character-state`, `data-walk-time-scale`, `data-forward-lean-degrees`,
  `data-resident-visible`, `data-character-ready` to the host element — these are what
  the Playwright suites assert against.

`CharacterStage3D` uses the same toon and lighting implementation on
`/preview/characters`. Setting includes the studio, Almaty promenade and all five
Tbilisi zones, using their real fallback paintings, metadata and the same Pixi renderer.
The studio retains its close inspection camera; painted settings use the product's
calibrated camera and foot plane. View, timeline, both candidates, resident and reload
controls remain available; Quality makes the low-tier outline difference reviewable.
The studio adds Daylight, Dusk and Night lighting presets. Controls and manifest badges
are constrained to one vertical scroll area without a horizontal scrollbar.

### 6.3 `product-timeline.ts` — journey → skeleton

`productCharacterSceneAt(pack, motion, traveling, review, now, paceRate, waitedSeconds,
localHour, raining, wakeElapsedSeconds)` returns
`{ traveler, resident, showResident, conversation, travelerLeanRadians }`:

- `clipForState` maps all semantic states onto manifest clip names. `CharacterActor`
  resolves absent names through the declared per-clip fallback chain.
- `scaledCue` **retimes** a clip to fit an action's scheduled duration, so a 4.5 s
  `phone` beat and a 4.0 s `phone` clip stay in step.
- `oppositeCue` gives the resident the complementary role: traveler `talk` → resident
  `listen`, and vice versa; `greet`/`goodbye` are mirrored; everything else is `idle`.
- The encounter path walks the same fixed prologue and per-line segmentation as the
  motion clock, so dialogue text and character pose are driven from one source.
- The ordinary walking path applies the 3× brisk threshold described in §3. Pace is an
  explicit argument; no runtime singleton or module state participates.
- The non-traveling path accepts explicit waited seconds, deterministically selects the
  idle/look-around/rest fallback described in §4, and never reads wall-clock module
  state.
- `reviewCue` handles the Preview-only local action rehearsal (see §11) and is the only
  path that can override the server-derived pose. It never touches presence, route
  authority or accounting.

### 6.6 P11 animation extension and gaze

The manifest accepts an optional skeleton-only `animationUrl` beside each mesh GLB.
`loadCharacterGltf` loads the mesh first, appends animation tracks when that optional
file succeeds, and keeps the embedded v2 actions when it does not. Source animation
names are matched through normalized aliases. Only `idle` and `walk` are mandatory;
every extended take has an acyclic fallback ending at one of those core clips.

The live manifest remains v2 and visual-review-pending. `/preview/characters` lists all
extended clips and marks direct availability versus the fallback it will use, so adding
a review-only v3 candidate is a manifest change rather than a runtime rewrite.

After each deterministic mixer seek, the actor may apply a bounded head rotation. It
looks toward the resident during talk/listen, the phone during `phone`, and the camera
for the first 0.8 seconds of a crowd wave. The world-space turn is clamped to 35 degrees
and blended at 0.6; the next mixer sample restores the authored pose before recomputing
gaze. A code-authored umbrella is visible only for confirmed rain when a direct
`umbrella_walk` take exists; a fallback walk never displays the prop.

### 6.4 The resident and other characters

- **3D residents** — two base characters in `CHARACTER_MANIFEST.residents`. `resident-a`
  (`v3/resident-a.glb`, 1.68 m) is the woman first built as the Almaty host: `braid01`
  hair, ochre jacket and charcoal trousers, with the reviewed V2 `almaty-host.glb` as her
  fallback. `resident-b` (`v3/resident-b.glb`, 1.75 m, a little shorter than the
  traveler) is the man: `short02` hair, navy jacket and stone trousers. Each carries only
  the six Mixamo takes downloaded for its own skeleton (`idle`, `walk`, `greet`, `talk`,
  `listen`, `react`, in its `-animations.glb`); `goodbye` plays `greet` and every other
  clip plays `idle`. The conversation partner is the resident the pack names
  (`packResidentType`, from `npcSystem.baseType`). It appears only during a conversation
  (`showResident`), at anchor 0.72 (0.76 mobile). If the day's pack changes while the
  stage is mounted, the previous partner leaves at once and the next appears when its
  model has loaded; `onResidentAvailability` reports both edges, so the 2D portrait
  covers the gap. `/preview/characters` has a Resident selector, and in single-take
  review the resident plays the same take, with talk and listen answering each other.
- **2D NPCs** — every city ships `npcs/<city>/<version>/{neutral,talk,react}.webp`
  (~55 KB each), used for the dialogue portrait when the 3D resident is unavailable.
  Provenance differs by phase (see §8.1): Phase 2 cities split a per-city
  `art/phase2/<city>/npc/sheet.png` into three columns, one per expression; Phase 3
  cities take a column each from one shared `art/phase3/npc-lineup.png` contact sheet.
  The Phase 3 cutout is the more interesting one — background is removed by
  flood-filling neutral bright pixels **inward from the crop edge** (so pale clothing
  inside the figure survives), then only the largest connected opaque component is kept
  (so a sliver of the neighbouring character in the tightly spaced sheet is discarded).
- **NPC base systems** — `npcSystem.baseType` is `resident-a` or `resident-b`, and it
  decides which 3D resident a city's conversation uses; the per-city `variantId` and the
  six named states are still descriptive only. Of the registered packs, Dushanbe, Almaty
  and Tbilisi name `resident-b` and every other city names `resident-a`.

### 6.5 The parallel paths, and their removal in P18

Everything below used to ship alongside the 3D character without ever drawing a
pixel. All of it is gone as of P18; the table is kept so a reader of the git
history knows what was there and why it went.

| Path | Removed in P18 |
|---|---|
| `SpriteTravelerRenderer.tsx` (+ test) | Not imported by anything. Deleted. |
| `RiveTravelerRenderer.tsx` and the `JourneyCharacter` / `JourneyMachine` / `JourneyCharacterVM` contract | Reachable only if a pack set `driver: "rive"`. No pack ever did and no `.riv` file was ever commissioned. Deleted with the schema fields. |
| `Traveler.tsx` | Existed only to choose between those two. Its one surviving job — a single idle frame while the GLB downloads — is now six lines inline in `JourneyExperience`. |
| `pixi-puppet.ts`, `puppet.ts` (+ test), `limb-skin.ts` | The procedural 2D puppet with continuous joint skinning. Unreachable since `af8dd03`. Deleted. |
| `rig-contract.ts` (+ test), `sprite-manifest.test.ts` | Validated a manifest nothing read. Deleted. |
| `spriteManifest`, `walkCycle`, `riveUrl`, `artboard`, `stateMachine`, `viewModel`, `requiredInputs` in the pack schema | Deleted. `traveler` is now one field: `fallbackSprites`, holding the loading frame. |
| `public/traveler/production/v1/` (24 frames) and all of `v2/` except `actions/idle.webp` | Deleted. |
| Packs `tashkent-v2` and `tashkent-v3` and `public/scenes/tashkent/v2`, `v3` | The schema-v2 rollback targets. Deleted; `tashkent-v4` is the live pack and is untouched. With no schema-v2 pack registered, the `coherentPanorama` branch and the `paceEnabled` fork each collapse to one path. |

**Kept deliberately:**

- `public/characters/v1/` and its "Rejected baseline v1" entry in
  `CHARACTER_CANDIDATES` — the review page's comparison baseline until the V3
  traveler is accepted.
- The prop cutout assets (`zone.props[].assetUrl`). P15 hangs the cafe sign near
  them and the awning-flutter option (P17) stays open.
- `public/scenes/tashkent/v1/`, `public/traveler/temporary/` and
  `public/npcs/tashkent-chef/` — referenced by `tashkent.v1.ts`, the schema-v1
  pack that is not registered but is still the Phase-1 rollback record. Roughly
  2.3 MiB, and outside the scope the owner approved.

The only character code on the live path is: a single static
`fallbackSprites.idle` `<img>` while the GLB downloads, then
`ProductCharacterStage3D` + `CharacterActor` for everything after that.

---

## 7. Character status and open gates

**The character is not accepted.** `CHARACTER_MANIFEST.approval` is literally
`"visual-review-pending"` and the candidate label is `"V2 — work in progress"`. V1 was
rejected outright.

Passing the automated checks does **not** approve anatomy or naturalness. Confirmed
outstanding items, from `docs/traveler-finalization-audit.md` and
`docs/traveler-asset-brief.md`:

- **Face and hair do not match the reference.** The generic MakeHuman base and the stock
  quiff survive export. Morph adjustment has been shown to be insufficient — bespoke
  likeness and swept-wave work are still required.
- **Clothing reads as plain surfaces.** Assembly replaces source cloth materials with
  solid dyes; tailored folds and finish are missing. Lighting cannot create garment
  construction that was never authored.
- **Shoulder penetration** between the overshirt and the body remains a visual concern.
- **Support-aware locomotion is incomplete.** `notice` / `stop` / `turn` / `resume` are
  procedural placeholders; the named `turn` is not yet a correct stepping turn.
- **No gaze.** Eyes do not look at props or at the conversation partner. Eyelid and
  eyelash agreement needs more work.
- **Skinning truncation.** glTF export warns that skin influences beyond four per vertex
  are truncated and normalized; identical deformation for those vertices has not been
  established.
- **Prop metadata proves windows, not physics.** It defines when a prop is visible and
  nominally in contact; it does not prove the bottle reaches the lips or eliminate pops.
- **No physical-device evidence.** All browser checks are headless Chromium with emulated
  mobile. No 30 fps phone or 60 fps desktop claim is made.
- **Integration is partial.** The characters now render on the live journey, but the
  combined Pixi + Three scene has not been validated as a production composition — §8 is
  the direct evidence of that.

Historical note: earlier confirmed-and-fixed defects included arms folded through the
torso (missing rest-axis alignment on the CC0 retarget), vertical drift during a
supposedly in-place loop (hips moving from z 0.391 to 1.030 because cached pose heads
were read before the dependency graph was re-evaluated), a jagged shirt opening, a phone
screen pointing away from the character, and cropped shoes in the mobile encounter
layout. These are fixed; the list above is what is still open.

---

## 8. The image / scene system and stage calibration

### 8.1 Where country imagery comes from

Every scene begins as an AI-generated master PNG under `art/`, and is derived into
runtime WebP by a `sharp` script. **There are two different pipelines**, and confusing
them is easy:

| | Phase 2 cities | Phase 3 cities |
|---|---|---|
| Cities | Tashkent (`v4`), Dushanbe, Bishkek, Almaty, Baku, **Tbilisi**, Istanbul (`v1`) | Sofia, Belgrade, Zagreb, Ljubljana, Vienna, Bratislava, Prague (`v1`) |
| Script | `scripts/process-phase2-art.mjs` | `scripts/process-phase3-art.mjs` |
| Masters | **Five separate masters per city**, one per zone: `art/phase2/<city>/zones/<zone>/master.png`, each normalized to 2400×900 cover | **One master per city**: `art/phase3/<city>/master.png` |
| Zones | Five genuinely distinct paintings | Five overlapping crops of the same picture |
| Props | Three cutouts from a shared `props/sheet.png` (3 × 512×1024 columns, alpha-trimmed), reused across all five zones. Tashkent instead copies three prop files forward from its `v3` set. | Three 420×560 crops of the master at `top: 350`, masked with a rounded-rect alpha ramp |
| NPC | `art/phase2/<city>/npc/sheet.png` split into three columns → neutral / talk / react | A column of the shared `art/phase3/npc-lineup.png` contact sheet |

The Phase 3 shortcut is worth calling out, since it is where the "five zones look like
one street" impression comes from:

```js
const cropWidth = Math.floor(width * 0.64);
const left = Math.round((width - cropWidth) * index / 4);
source.extract({ left, top: 0, width: cropWidth, height }).resize(2400, 900, { fit: "fill" })
```

Both pipelines then derive the **same six files per zone**. Measured on
`public/scenes/tbilisi/v1/zones/rustaveli-arrival/` (a Phase 2 city):

| File | Phase 2 derivation | Dimensions | Size |
|---|---|---|---|
| `fallback.webp` | full master at width 1600, offset and edge-blended for horizontal tiling | 1600×1067 for Rustaveli | see current asset report |
| `distant.webp` | rows 0–450, stretched to 900, blur 0.35 | 2400×900 | 158 KB |
| `architecture.webp` | rows 162–684 | 2400×522 | 186 KB |
| `ground-1.webp` | rows 684–900, x 0–1200 | 1200×216 | 31 KB |
| `ground-2.webp` | rows 684–900, x 600–1800 | 1200×216 | 36 KB |
| `ground-3.webp` | rows 684–900, x 1200–2400 | 1200×216 | 30 KB |

(Phase 3 retains its old fallback pipeline and uses rows 0–500 blur 0.4 for `distant`
and rows 150–710 for `architecture`.)

The Phase 2 fallback pipeline preserves the full original composition, offsets the
original edge to the middle, and uses Sharp raw pixels to cross-fade the final 8% into
the first 8%. The output therefore wraps horizontally. Tbilisi and Tashkent's ten
fallbacks were regenerated with this step; other checked-in Phase 2 fallbacks retain
their earlier output until rebuilt. Legacy layer crops are unchanged.
See `docs/stage-calibration.md` for master dimensions and calibration estimates.

Plus a per-zone `.wav` ambience and a postcard background.

### 8.2 How the live renderer uses them

`PixiScene` branches on `coherentPanorama = (pack.schemaVersion === 3)`.

All 15 registered packs are schema v3 and take this branch: the launch registration
`tashkent-v5`, its byte-identical calibrated `tashkent-v4` rollback target, the six
other Phase 2 cities, and the seven Phase 3 cities. No schema-v2 pack remains registered.

On the v3 scene branch:

- Existing packs use one bounded, non-wrapping `zone.fallbackUrl` sprite, scaled from the stable
  viewport-relative character target:
  ```
  targetCharacterPx = viewportHeight * (width <= 600 ? 0.28 : 0.30)
  requiredImageScale = targetCharacterPx / (stage.personHeightFrac * imageHeight)
  imageScale = min(requiredImageScale, 1.6)
  imageX = (viewportWidth - imageWidth * imageScale) / 2
  imageY = groundY - zone.stage.groundLineY * imageHeight * imageScale
  ```
  There is no vertical centering and no modulo wrap: `boundedPanoramaLayout` pans from
  the painting's left edge to its right edge once, then stops. Identifiable buildings
  cannot repeat.
- New packs may provide default-compatible `continuousScene` with `skyUrl`, `cityUrl`,
  `groundUrl`, optional `foregroundUrl`, and `groundHeightFrac` (default 0.22). Sky and
  city are bounded; only the edge-audited ground texture tiles. `content:validate`
  rejects a ground whose four-pixel edge strips differ by more than 8% mean RGB.
- **Props are disabled entirely** (`props = []`).
- `groundLifeRoot`: 7 (low tier) or 12 translucent ellipses/rounded-rects below the shared
  ground line, scrolled by `distanceMetres * layout.pxPerMetre` (the 1× near track).
- P3 adds two pooled contact-shadow sprites under this root, one per visible actor,
  sharing one generated 128×128 radial-alpha texture. Three publishes `{footX, footY,
  scale}` every rendered frame through `SceneStage` refs; coordinates are screen pixels,
  scale is pixels/metre (resident adjusted to its 1.68 m height). Ellipse horizontal
  radius is `0.55 * personHeightPx * 0.5`, vertical radius is 24% of that, alpha 0.28.
  Ground-local x adds current scroll while the parent subtracts it, so the shadow
  stays under the moving actor anchor as the ground stream passes. It remains on low
  quality and reduced motion, and hides when the corresponding actor is unavailable.
- Pixi owns `{exposure: 1, tint: {r: 1, g: 1, b: 1}}` and applies its RGB multipliers
  through a world `ColorMatrixFilter`; the character shader reads the same object.
  Alpha is unchanged. This is constant in P3; hourly grading/weather and a dusk rim
  are deferred to the time-of-day work. Existing composite CSS grade/vignette remain.
- `weatherRoot`: 0/14/22 drifting motes by tier.
- A sky `Graphics` fill behind everything, next-zone preload beginning in the final
  200 m, and a roughly one-second dissolve at the zone boundary. `nightUrl`, when
  present, is aligned to the day painting and cross-faded on the local-time night ramp. A
  once-per-second diagnostics snapshot reports fps, p95 frame ms, live and
  pooled object counts, estimated decoded texture bytes, and a `data-scene-textures`
  inventory of every texture the stage holds).

The historical reason for the panorama branch is recorded in the code: earlier versions
stacked opaque horizontal crops as parallax layers, and their offsets diverged into hard
visible seams. Collapsing to one coherent painting fixed that — but until `98e1c77` it
left a "contact" ground strip compositing over the painting. §8.3 is the record.

### 8.3 The ghosted second copy of the city — fixed in `98e1c77`

**Status: fixed in `98e1c77` (branch `traveler-finalization-v2`).** The diagnosis below
is kept as the record, because the assets it describes are still on disk and the two
pipelines in §8.1 still produce them.

#### What the defect was

In the live Tbilisi scene a translucent duplicate of the street sat across the lower
middle of the frame, with vertical seams, a repeating doorway-and-hedge motif, sliding at
a different speed than the background. Below it a third band of the original painting
showed through again.

`buildZone` built it on *every* branch, panorama included:

```js
const groundUrl = zone.layers.find(l => l.id === "ground")?.segments[0]?.url;  // ground-1.webp
// draw to canvas, then:
//   destination-in vertical gradient: transparent at top → white from 45% down
//   destination-in horizontal gradient: transparent at 0 and 1, white 0.12–0.88
contactSprites = Array.from({ length: 5 }, () => new Sprite(nextContact));
```

and per frame:

```js
const stripHeight = Math.max(100, height * 0.19);
const stripScale  = stripHeight / contactTexture.height;
const span        = contactTexture.width * stripScale;
const pitch       = span * 0.86;                     // 14% self-overlap
const offset      = reducedMotion ? 0 : groundPixels;
sprite.x = (first + index) * pitch - offset;
sprite.y = baseline - stripHeight * 0.7;
```

Four things went wrong at once:

1. **`ground-1.webp` is not pavement.** It is rows 684–900 of a 900-px-tall photograph.
   At Tbilisi's framing that band contains building facades with barred doorways, tree
   trunks, planters, hedges and lamp bases. I rendered the asset to confirm this
   directly. The layer is named "ground" but contains a whole streetscape.
2. **It was scaled up, not down.** At a 1213 px viewport,
   `stripHeight = 1213 × 0.19 ≈ 231 px` against a 216 px source, so `stripScale ≈ 1.07`.
   The duplicated buildings therefore appeared at roughly the same apparent size as the
   panorama's own — which is exactly what made it read as a ghost rather than as
   texture.
3. **It tiled into itself.** `pitch = span × 0.86` overlapped each tile with its
   neighbour by 14 %, and the horizontal 12 %/88 % alpha feather made those overlaps
   visible as soft vertical seams. With `span ≈ 1281 px` and `pitch ≈ 1101 px` on a
   2000 px-wide window, roughly two full copies of the same doorway-and-hedge run were
   on screen.
4. **It moved at the wrong speed.** The strip scrolled by
   `groundPixels = motion.distanceMetres × (layout.height / 1.78)` — the character's
   walking rate, ≈373 px/s at 1440×900 — while the panorama behind it slid by
   `zoneProgress` over 150 seconds, ≈2.13 px/s. A 175× difference, so the ghost visibly
   drifted across the background.

`sprite.y = baseline − stripHeight × 0.7` put the strip's top edge ≈161 px above the
character's foot line and its bottom edge ≈69 px below it, which matched the soft
horizontal transition measurable in the screenshots at y ≈ 962 px.

**Why it existed.** Commit `af8dd03` *"feat: use finalized 3d characters in journey"*
deleted the Pixi 2D puppet and moved the character into its own Three.js canvas, but did
not delete the contact strip. The strip's only purpose had been to give that 2D puppet a
moving pavement to plant its feet on, in the same scene graph and the same coordinate
space. With the puppet gone — and the character now in a canvas *above* the world that
knows nothing about it — the strip was a decorative duplicate serving no one.

The Pixi draw order inside the camera container was:

```
sky  →  layerRoot (the panorama)  →  propRoot  →  groundLifeRoot  →  groundRoot  →  weatherRoot
                                                                     ^^^^^^^^^^
                                          the contact strip, drawn ON TOP of the painting
```

`groundRoot` was inserted at `weatherRoot`'s index, so it painted over the panorama *and*
over the ground-life blobs. That is why the ghost occluded rather than blended.

So the three bands a viewer perceived, from top to bottom, were:

| Band | Approx. y at 1213 px | What it actually was |
|---|---|---|
| Sharp background | 0 → 962 | The single `fallback.webp` panorama, cover-scaled ×1.1, sliding on zone progress |
| Ghosted overlay | 962 → 1192 | The 5 tiled, alpha-masked, up-scaled copies of `ground-1.webp`, fading in from transparent at its top edge |
| Bottom band | 1192 → 1213 | The panorama showing through again below the strip, under the `scene-grade` and `scene-vignette` CSS gradients |

(The 12 ground-life blobs sat at y ≈ 1025–1069 — i.e. *behind* the ghost band, not in the
bottom band.)

#### What changed in `98e1c77`

- `PixiScene` no longer has a `groundRoot`, contact sprites, the canvas alpha masking, or
  the `stripHeight`/`stripScale`/`span`/`pitch`/`offset` maths. `Texture` is no longer
  imported, because nothing in the world is built in the browser any more.
- Draw order is now, back to front:

  ```
  sky  →  layerRoot (the panorama)  →  propRoot  →  groundLifeRoot  →  weatherRoot
  ```

  `propRoot` stays in place and stays empty on the v3 branch; it still carries the
  illustrated props of the two schema-v2 rollback packs, whose render is unchanged.
  `groundLifeRoot` and `weatherRoot` are unchanged and still scroll on `groundPixels`,
  which is still published as `data-ground-pixels`.
- `phase2-factory` no longer lists the `ground-*` crops in `preload` or in any
  `preloadGroups` entry, since the v3 renderer never draws them. Prop URLs were never in
  those lists. `distant.webp` and `architecture.webp` **are** still listed even though
  the v3 branch does not draw them either — see §8.5; that removal was left for the same
  pass that retires the files.
- The zone `layers` array itself is untouched: it is what the schema-v2 packs render
  from, and it is what `process-phase{2,3}-art.mjs` writes. Only the strip and the
  preload hints are gone.
- `PixiScene` now publishes `data-scene-textures` on `.pixi-scene`: the sorted, unique
  set of texture identities for every `Sprite` reachable from `app.stage`, refreshed with
  the once-per-second diagnostics snapshot. Textures loaded through `Assets` carry their
  resolved URL as `texture.label`; textures built in the browser have none, and are
  recorded as `generated:<width>x<height>`. On the v3 branch this attribute should read
  the zone's `fallback.webp`. P3 also adds the explicitly named
  `character-contact-shadow` texture; arbitrary generated strips remain forbidden.

#### How the fix is verified

`tests/e2e/scene-ground-strip.spec.ts`, pinned to 1440×900, drives Tbilisi's
`rustaveli-arrival` zone with a mocked bootstrap/heartbeat pair and asserts two
independent renderer contracts.

**1. Texture inventory.** `data-scene-textures` must contain the zone panorama and the
named `character-contact-shadow` texture, with no URL containing `ground-` and no
unnamed `generated:` strip. This keeps the P3 ground-strip regression covered without
depending on timing-sensitive screenshot pixels.

**2. Distance motion and wrapping.** The test reads `data-ground-pixels`,
`data-panorama-offset` and `data-panorama-span` from the Pixi stage, waits for the
presentation clock to advance, and verifies that both offsets move. The panorama offset
must remain in `[0, span)` before and after the sample, which directly covers the P4
horizontal tile wrap while the near ground continues to move at its separate parallax
rate.


### 8.4 Shared ground and person scale — repaired 2026-09-08

Previously the traveler occupied 59% of viewport height and stood 90 px above its
bottom, independently of the pavement in a vertically centered panorama. Both renderers
now use `src/lib/world/stage-layout.ts`, a pure function of viewport dimensions, decoded
image dimensions and the current zone's `stage` block.

`src/lib/content/schema.ts` supplies backward-compatible defaults for all 16 packs:

```ts
stage: {
  groundLineY: 0.82, horizonY: 0.55, personHeightFrac: 0.28,
  walkableX: [0.15, 0.85], palette: ["#b9a27a", "#6f7a5a", "#2e3a4f"],
  lightDir: "left", parallax: { far: 0.35, mid: 0.7, near: 1.25 }
}
```

Image-space fractions remain fractions of the full served image height. The character
target comes from `TARGET_CHARACTER_HEIGHT_FRAC` (default 0.30 desktop) or
`TARGET_CHARACTER_HEIGHT_FRAC_MOBILE` (default 0.28 at widths ≤600 px). The image then
scales to that character:

```ts
targetCharacterPx = targetFraction * viewportH
requiredImageScale = targetCharacterPx / (personHeightFrac * imageH)
imageScale = Math.min(requiredImageScale, 1.6)
```

Ground remains exactly `0.86 * viewportH`, or `0.80 * viewportH` on mobile. The actor
stays at `targetCharacterPx`; `pxPerMetre = targetCharacterPx / 1.78`. A master requiring
more than 1.6 is still rendered at the clamp and logs the pack/zone warning once. This
keeps the person readable while identifying artwork whose perspective must be repaired.
Sky fills space above a short painting; the first palette colour fills below the ground
behind the image. Horizon, light direction and parallax metadata are preserved for later
grading/parallax work; they do not move the fixed foot plane.

Pixi publishes the actual loaded zone's stage frame through `SceneStage`'s ref. Three
reads that ref in its existing frame loop, updates the orthographic camera, and clamps
actor anchors to `walkableX`. Height and ground values blend with smoothstep over 400 ms
at zone changes. Resize recalculates immediately.

Three draws only from a frame that describes its own host. The comparison is
`frameFitsViewport`, with a tolerance of two CSS pixels, because Pixi snaps its screen to
whole device pixels: at 150 % display scaling a 1333 × 811 page publishes 1333.33 × 811.33,
and half a device pixel is two CSS pixels at the browser's 25 % minimum zoom. The comparison
was exact until 2026-09-10. On scaled screens (most Windows laptops) Three therefore stopped
drawing as soon as Pixi took over: the traveler and the walkers froze in their last pose
under a "Walking" status, and a zoom or reload left them invisible. Pixi's `resizeTo` listens
only for window resizes, so `PixiScene`'s own `ResizeObserver` now also calls `app.resize()`;
a host that changes size without a window resize no longer leaves Three waiting for a frame
that never matches. `tests/e2e/stage-device-scaling.spec.ts` covers 1333 × 811 at scale 1.5;
the other layout specs pin scale 1, where the rounding never shows.

CSS variables give loading traveler and
fallback NPC images the same height and bottom; the no-WebGL static scene publishes the
same layout after decoding its image. No journey progress or authoritative inputs change.

The Three host publishes `data-foot-y` (projection of y=0), `data-person-height`
(projected 1.78 m standing reference), `data-character-image-scale` (required image
scale relative to width fit), and `data-zone-id`. These measure the camera's foot plane,
not each animated shoe vertex. Unit tests cover 320×568, 390×844, 1440×900 and
2560×1080, target fractions, clamping, warning text and environment validation.
`pnpm content:audit-scale` measures every registered zone at five widths, prints the
unclamped 1440×900 requirement sorted worst-first by city, flags requirements above 1.6,
and exits nonzero when the clamped artwork reference falls outside 1/1.6×…1.6× of its
viewport target. The geometry-only Playwright spec checks every Tbilisi/Tashkent zone at
390×844 and 1440×900: foot plane within 2 px, exact target height, shared image-scale
publication, and resize. No screenshots or recordings are needed for these assertions.

The private Preview-only calibration entry is `/api/admin/preview/<packId>`. Signed
browser requests redirect to `/preview/<packId>?calibrate=1`; API clients retain JSON
responses, now including stage metadata. Unauthenticated API requests and Production
requests return 404. The existing HttpOnly preview session now has Path=/ so it also
reaches the API entry; sign in again at `/preview` after upgrading an old session.
The editor keeps the complete panorama, draggable ground/horizon lines and draggable
1.78 m figure for raw-image calibration. It also shows a desktop/mobile rendered viewport,
the actor target outline, live `personHeightFrac`, `imageScale` and character-pixel
readouts, plus the same regeneration warning used at runtime. Keyboard adjustments and
copy-stage-JSON remain local: drafts are never persisted or submitted. Paste the block
into the pack.

Tbilisi and Tashkent's ten zones are calibrated from pavement and doorway estimates in
their original masters (`docs/stage-calibration.md`). Other packs use defaults. This fixes
the independent scale/ground contract; character anatomy and animation quality remain
separate review work; P4 now owns the distance-driven panorama wrapping described above.

### 8.5 Shipped-but-never-drawn assets — removed in P18

Every scheduled pack takes the `coherentPanorama` branch, so only **one of the six
files per zone** ever reached the screen: `fallback.webp`, the painting. The other
five were generated, shipped, and in two cases preloaded, for nothing.

They are deleted. Measured across the fourteen registered packs:

| Category | Removed |
|---|---:|
| `distant.webp`, `architecture.webp` (2 per zone) | 140 files |
| `ground-1/2/3.webp` (3 per zone) | 210 files |
| `public/traveler/production/v1` + `v2` sprite frames | 46 files |
| `public/scenes/tashkent/v2` + `v3` | 5.6 MiB |
| **`public/` total** | **73 MiB → 51 MiB** |

`content:validate` went from *16 packs / 717 uniquely owned scene assets* to
*14 packs / 280*. P21 adds the byte-identical `tashkent-v5` launch registration, so
validation now reports *15 packs / 280 uniquely owned scene assets*.

Two pack-level rules changed with the files, because they described a renderer
that no longer exists:

- `zone.layers` used to be `distant` + `architecture` + three `ground` variants.
  A schema-v3 zone now declares two layers, both naming its painting, because the
  schema requires a minimum of two and the renderer reads the painting.
- `validate-country-packs.ts` used to demand twelve segment families per route
  and a `distant`/`architecture`/`ground` triple per zone. It now demands that
  every zone has its own painting and a `ground` layer — the things that are
  actually true of what ships.

The prop cutouts (1.36 MiB per city) are **not** deleted: see §6.5.

### 8.6 Zone clock, budgets and quality tiers

- `routePositionAt(pack, distanceMetres)` → `{ phase, zoneIndex, zoneProgress,
  metresIntoZone, remainingToLandmark, marathonProgress }`. The first 8,000 m traverse
  the five zones once; later distance returns `phase: "evening"` and loops the 2,200 m
  landmark zone while marathon progress continues to 42,195 m.
- `deterministicVariant(seed, index, count)` is an FNV-1a hash used for every "random"
  placement so that jitter and variant selection are identical for all viewers;
  `segmentVariant` / `composedSegmentSignature` build a reproducible signature the soak
  test asserts against to prove the world does not repeat inside a bounded window.
- `QUALITY_LIMITS`: low `{res 1, props 10, motes 0, 30 fps}`, medium
  `{1.25, 16, 14, 50}`, high `{1.6, 24, 22, 60}`. Tier is chosen from viewport width,
  device pixel ratio, `hardwareConcurrency`, `deviceMemory` and the reduced-motion
  preference.
- Recorded budgets: shared traveler transfer 0.69 MiB; per-country transfer 2.70–5.22
  MiB; largest decoded zone 24.5–25.7 MiB; low-tier renderer reports 15.8 MiB active
  textures against a 96 MiB cap.

---

## 9. Data model and API surface

### Tables (34 forward migrations)

**Phase 1 — core:** `journeys`, `country_days` (with a GiST exclusion constraint so two
days can never overlap), `story_events`, `votes`, `vote_options`, `ballots` (unique per
vote + voter hash), `step_buckets` (per-minute rollup), `journey_runtime` (the authority
row), `presence_leases`, `mutation_rate_limits`.

**Phase 2:** `visitor_day_contributions`, `postcards`, `sponsor_slots`, `sponsorships`
(with a partial unique index enforcing one active sponsorship per slot and a trigger
enforcing legal state transitions), `payment_webhook_events`, `sponsor_metric_events`,
`sponsor_daily_metrics`, `operation_ledger`. Season 1 adds `sponsor_pricing` and gives
`journeys` a `season_number`.

**Phase 3:** `country_notification_opt_ins`, `experiment_exposures`,
`operational_incidents`, `webhook_replay_audit`.

**Season 1 migration 0027, corrections:** `corrections` is the only visitor-written
text store. It keeps a validated pack/optional zone, closed category enum, body up to
280 characters, anonymous visitor hash, trusted two-letter country code and moderation
state. RLS and grants keep every row service-only. Accepted contributor credit is
`count(distinct visitor_hash)`, so accepting several notes from one person never inflates
the public acknowledgement.

**Season 1 migrations 0028-0029, launch:** `journeys.launch_at` is the real launch
boundary and `rollover_utc_hour` stores 16 for Season 1. `seed_season1_launch` creates
the 30-day journey, its selected Day-1 pack, the name vote and seven founding
prices/slots in one retry-safe transaction. Heartbeat v11 rejects prelaunch advancement
in Postgres; bootstrap v14 carries the stored rollover hour and the action-aware runtime.
`switch_country_day_pack`
is an expected-current guarded pointer rollback. Migration 0029 removes the
loop-variable shadowing caught after 0028 was applied.

**Post-P22 migrations 0031-0034:** 0031 lets exactly one confirmed watcher satisfy a
reaction while an empty room still cannot. 0032 adds `train` to the authoritative
arrival mode. 0033 removes Tashkent from the database seed invariant; the CLI requires
a registered reviewed v3 `--pack` and defaults to the launch target `london-v1`. 0034
gives scheduled actions server-owned end seconds and planted distance, adds action-aware
heartbeat/runtime/bootstrap v12/v6/v14, and serializes overlapping reaction windows.
All four migrations were applied to development project `tkntxptfhmjnqaaveddx` on
11 September 2026. The resulting 19 pgTAP suites passed all 380 assertions and the
remote database lint result was `{"results":[]}`.

**Season 1 migration 0030, Tickets:** `tickets` links one future date, one Standard
sponsorship and one curated versioned pack. `reserve_ticket` locks the date-keyed slot,
requires journey Day 8+, enforces D+3 through the configured horizon, and snapshots
`max(24900, 3 * P(day))`; payment alone leaves the route unchanged. `approve_ticket`
requires a paid purchase and private creative, enforces the 24-hour cutoff, and activates
the future-day lock under the journey row lock. `create_next_country_day` re-checks that
lock while holding the same journey lock, overrides a displaced winner, records
`arrival_mode='flight'` plus `ticket_id`, and omits the ballot that would select an
already-fixed next day. The following ballot is generated from the Ticket pack, so the
route continues from the country actually visited. Pending creative rejection/refund
releases the slot; because only approval suppresses a ballot, the normal vote never left.

**Season 1 migration 0011, part 1:** `journey_runtime` adds non-negative
`global_distance_metres` and positive `pace_rate`; `day_outcomes` stores the immutable
distance/landmark/marathon and audience summary contract for the later rollover work.

**Season 1 migration 0012, pace:** overloads heartbeat v4, runtime read v4 and bootstrap
v5 with the configured pace cap; persists logarithmic distinct-watcher pace and accrues
distance across exact lease-expiry segments.

**Season 1 migration 0013, waiting:** adds `waiting_since` and
`last_watcher_left_at`, the configured first-watcher heartbeat overload, and read-only
runtime v5 waiting projection. The heartbeat returns both the wait origin and the
recipient-only `woke_him` result.

**Season 1 migration 0014, countries:** `presence_leases` gains a validated
`country_code char(2)`; `country_day_watch` aggregates confirmed watch seconds and the
per-country peak per day. The heartbeat v5 overload credits only the caller's own
visible delta to its own country row, and bootstrap v6 carries the live/leaderboard
projection. **No IP is read, stored or logged anywhere on this path** — the two-letter
edge header is the whole of the location signal.

**Season 1 migration 0015, reactions:** the `reaction_kind` enum plus
`reaction_windows` (30-second buckets), `scheduled_actions` (unique per active second
per day) and `day_photos` (unique per active second). `submit_reaction` rate-limits one
reaction per kind per visitor per minute through `consume_mutation_rate_limit`,
increments the live bucket, and — at one for a solo watcher, otherwise
`greatest(2, ceil(0.3 × live watchers))`, with no
same-kind action inside the last 120 active seconds — schedules the action at
`global_active_seconds + 2` and resets the bucket. Heartbeat v6 and bootstrap v7 carry
the bucket counts, the recent/next scheduled actions and the day's last six photographs.

**Season 1 migration 0016, vote 2.0:** `votes.kind` ('destination' | 'name'),
`vote_options.pack_id` and `journeys.traveler_name`. `close_and_pick_vote_winner`
closes the ballot past its close time and names the winner — most ballots, then fewest
previous visits for that pack, then alphabetical pack id — and writes the winning label
to `journeys.traveler_name` when the ballot was the name vote.
`create_next_country_day` writes tomorrow and its ballot, idempotent on
`(journey_id, day_number)`. Bootstrap v8 adds the ballot's kind, its pack ids, the live
tally and his name.

**Season 1 migration 0018, vote clock:** redefines `create_next_country_day` to stamp
the rows it writes from the `p_real_now` it is given rather than the database clock,
matching every other write in the schema and clearing a `db lint` warning.

**Season 1 migrations 0021-0023, sponsor pricing:** inventory becomes date-keyed.
`sponsor_slots.country_day_id` was `not null unique`, but D+2..D+7 cannot have a
country-day: the destination is only known once that day's vote closes. Slots now carry
`(journey_id, slot_date)` and `bind_sponsor_slot_day` attaches the country-day at
rollover. `sponsor_pricing` stores one row per open date with the price and the
`basis_uniques` that set it; `open_sponsor_pricing_window` inserts `on conflict do
nothing`, so **a day already on sale keeps the price it opened at** however the formula
moves. `sponsorships` gains `tier` and a `price_basis` provenance snapshot.
`reserve_sponsor_slot_v2` refuses any date outside D+1..D+window and prices the tier
server-side. `read_bootstrap_bundle_v10` carries the live sponsorship's tier so the
premium placements can be drawn only for a purchase that bought them. Migration 0022
corrects 0021's shadowed loop variable, which `db lint` reported. `reserve_sponsor_slot`
(v1) and bundle v9 remain rollback contracts.

**Season 1 migration 0017, weather:** `journey_runtime.weather` caches one
Open-Meteo reading per city. `write_journey_weather` refuses a reading older than the
one already stored, so a slow request cannot overwrite a fresher one. Heartbeat v7 and
bootstrap v9 carry it.

### Key RPCs

`record_presence_heartbeat` → `_v2` → `_v3` → `_v4` (the walking rule, distinct-watcher
pace and pace-weighted distance) → `_v5` (per-country watch aggregation) → `_v6`
(reaction buckets and scheduled crowd actions) → `_v7` (weather) → `_v8` (exact daily
peak) → `_v9` (the hundred-watcher moment) → `_v10` (the adaptive interval and lease)
→ `_v11` (the launch boundary) → `_v12` (authoritative action holds),
`normalize_country_code`, `read_country_day_watch`, `reaction_threshold`,
`close_and_pick_vote_winner`, `create_next_country_day`, `read_traveler_name`,
`write_journey_weather`, `read_journey_weather`,
`submit_reaction`, `read_day_reactions`, `record_day_photo`,
`submit_phase1_ballot`, `consume_mutation_rate_limit`, `reserve_sponsor_slot` / `_v2`,
`sponsor_price_cents`, `sponsor_tier_price_cents`, `journey_slot_date`,
`open_sponsor_pricing_window`, `bind_sponsor_slot_day`,
`reserve_ticket`, `cancel_ticket_reservation`, `approve_ticket`, `mark_ticket_refunded`,
`aggregate_sponsor_metrics`, `enforce_sponsorship_transition`, `claim_operation`,
`reconcile_phase2_state`, `reconcile_phase2_state_v2`, `finalize_day_outcome`,
`cleanup_phase2_retention`, `journey_story_now`,
`read_journey_runtime_v3` / `_v4` / `_v5` / `_v6`,
`read_visitor_passport`, `presence_heartbeat_seconds`, `presence_lease_ttl_seconds`,
`seed_season1_launch`, `switch_country_day_pack`,
`read_bootstrap_bundle_v3` / `_v4` / `_v5` / `_v6` / `_v7` / `_v8` / `_v9` / `_v10` / `_v11` / `_v12` / `_v13` / `_v14`
(one-call bootstrap with atomic admission control, the distance projection, the
country aggregate, the reaction board, the ballot, the weather, the passport streak and
the hundred-watcher moment),
`set_country_notification_opt_in`.

All of them are `security definer`, revoked from `anon` and `authenticated`, and granted
only to `service_role`. The browser never talks to these directly.

### Route handlers (35)

```
GET  /api/bootstrap                 the world only: day, event, vote, presence, steps,
                                    route runtime, sponsor, asset pack. Identical for
                                    everyone; public, s-maxage=3, no Set-Cookie.
GET  /api/me                        the visitor only: first visit, their ballot, their
                                    postcard, their passport. private, no-store, and
                                    the route that issues the visitor cookie.
POST /api/presence/heartbeat        the walking rule
POST /api/votes                     one ballot per visitor, server-enforced
POST /api/postcards                 render + upload + public token (idempotent)
POST /api/sponsor/checkout          reserve a dated slot at its tier → provider checkout
POST /api/tickets/checkout          reserve D+3+ Ticket + Standard slot at server price
GET  /api/sponsor/status
POST /api/sponsor/metrics           impression / engaged_view
GET  /r/sponsor/<publicId>          disclosed click redirect + click metric
POST /api/webhooks/lemonsqueezy     signed, replay-audited
POST /api/sponsor/fixture/complete  no-money rehearsal adapter (multi-gated)
GET  /api/calendar                  .ics for tomorrow
POST /api/notifications/country     revocable, provider-gated opt-in
GET  /api/cron/prewarm              15:55 asset, OG and weather warm-up (authorized)
GET  /api/cron/rollover             16:00 daily reconciliation (authorized)
GET  /api/health                    DB/content/provider/weather/asset/launch readiness
POST /api/reactions                 enum reaction, per-kind cooldown, crowd threshold
GET  /api/reactions                 authoritative counts/action projection after a Realtime hint
POST /api/day-photos                the crowd's photograph for a scheduled moment
POST /api/corrections               private correction, three per visitor per hour
POST /api/observability/vitals
GET  /api/admin/preview/[packId]    protected non-production pack preview
POST /api/admin/preview/session     expiring signed HTTP-only preview session
POST /api/admin/session             rate-limited 12-hour production admin session
GET  /api/admin/postkit/[n]         private finalized copy and image URLs
GET  /api/admin/corrections         private status-filtered correction queue
PATCH /api/admin/corrections/[id]   locked, idempotent accept/reject decision
POST /api/share/steps               signed card claims from confirmed contribution rows
GET  /api/og/day                    current city, count bucket and leading flags (PNG)
GET  /api/og/steps?token=           signed personal contribution card (PNG)
GET  /api/og/first?token=           recipient-only first-watcher card (PNG)
GET  /api/og/country/[cc]           today's confirmed country contribution (PNG)
GET  /api/og/recap/[n]              finalized day outcome card (PNG; populated by P13)
GET  /api/map                       cached season route and current ballot geometry
```

Public pages added in Season 1: `/tickets` exposes the owner-enabled, week-two Ticket
offer, while `/country/<cc>` renders a watching country's rank and carried time for
today, its confirmed season total, and the days it hosted the walk.
Every number on it is a stored aggregate; nothing is extrapolated.

### Landing HUD and sharing (P12)

The scene HUD is marked as the explicit `where-when`, `who`, `status`, `goal`,
`reactions`, `vote`, `dock`, and `sponsor` regions from the product specification.
The desktop presentation keeps those regions around the scene; the ≤600 px rules stack
the goal and thumb-sized reactions above the compact dock. The old season-day total is
not rendered. `firstVisit` comes only from creation of the existing HTTP-only visitor
cookie, so the four-second onboarding line is neither local-storage authority nor a
repeat tutorial.

Reaction controls are absolutely anchored above the compact dock at every viewport.
They do not participate in the page's top flow, where their higher stacking layer would
otherwise cover the audience-country button even though both controls looked visible.

`src/lib/share/token.ts` signs compact, purpose-bound HMAC claims. Personal cards contain
only a day number, expiry, and confirmed numbers: steps cards are issued after reading
`visitor_day_contributions`; first-watcher cards are issued only to the heartbeat that
received `out_woke_him`. Tokens live at most 24 hours and invalid claims fail closed.
All `next/og` responses are 1200×630 PNGs cached at the edge for 60 seconds. The browser
tries native file sharing, then native text sharing, then the clipboard; it never derives
a personal count for a card. `/api/og/recap/[n]` returns 404 until P13 has written that
day's immutable outcome.

### Final outcomes, recaps, and post kit (P13)

Migration `202609090020` adds `journey_runtime.peak_active_viewers`, updates it only in
heartbeat v8 while the runtime row lock is held, and preserves each day's final top-five
country ranking in `day_outcomes.top_countries`. `reconcile_phase2_state_v2` locks the
journey, calls `finalize_day_outcome` for every newly ended day, then delegates status and
sponsor transitions to the original reconciliation contract. Finalization projects only
the last bounded presence lease up to the country-day boundary, freezes distance and
audience aggregates with `ON CONFLICT DO NOTHING`, and returns any outcome still missing
its stored card. Re-running it cannot replace an outcome.

The rollover renderer writes each 1200×630 PNG to the public `khw-recaps` bucket at
`<journey-id>/day-<n>.png`, then records that path. A failed upload leaves the ledger
operation retryable and the missing path causes the next reconciliation to request the
same deterministic object again. `/day/<n>` reads this immutable row plus its saved
country ranking, phrase from the versioned pack, crowd photographs, permanent sponsor,
closed vote, and next day. It is revalidated hourly; missing outcomes are honest 404s.

Production admin access is separate from preview auth. A 48+-character
`ADMIN_ACCESS_SECRET` is constant-time compared only by `POST /api/admin/session`; all
attempts consume the protected `admin_access` limit (five/hour) under an immediately
HMAC-hashed forwarding-address key. The raw address and credential are never stored or
logged. Success creates a signed, strict, HTTP-only 12-hour `khw_admin` session.
The narrow `/admin/:path*` request proxy rejects missing or invalid sessions before React
streaming begins, while each page repeats the check as defense in depth. Unauthenticated
post-kit API and HTML routes therefore return a real HTTP 404. Post text is generated by
the pure templates in `src/lib/postkit/templates.ts`; it contains only finalized or
currently stored vote/price facts.
`/admin-login` supplies the browser sign-in form; GET `/api/admin/session` redirects to
it, while the credential exchange remains POST-only. The credential is never written to
a URL or browser storage. Vote-result country labels resolve `vote_options.pack_id`
through the content registry; the database has no `vote_options.country_code` column.

### Journey map (P14)

`/map` and the compact Journey-details embed share `JourneyMap` and the read-only
`JourneyMapData` contract. The full page reads directly on the server and revalidates
each minute; the compact client fetches the same contract from `/api/map`. Cities come
only from completed/live `country_days`, completed stamp colours come only from immutable
`day_outcomes`, current distance is labelled as confirmed data, and candidate percentages
come from stored ballots. A transition is shown as a walk only when the preceding
versioned pack names the next pack in `neighbours`; fallback transfers and candidates use
a distinct dashed flight treatment.

Approved future Tickets are also server-confirmed map data. They render as labelled
dashed flight branches from the latest confirmed city; a materialized Ticket day keeps
that same explicit flight mode even if the two packs otherwise appear as neighbours.
The bootstrap announces the nearest approved future Ticket and returns `vote: null`
when that Ticket fixes tomorrow, so the HUD never offers a ballot whose outcome cannot
be used.

`projectEquirectangular({lat, lon})` is a pure fixed projection into a 1000×500 viewBox.
The committed `public/map/world.svg` is 58,611 bytes and was derived from Natural Earth
1:110m public-domain land GeoJSON by applying that same projection and rounding geometry
to one decimal place. There is no map runtime or map dependency. The SVG draws the
season polyline, linkable completed-day stamps, a pulsing current city, and dashed live
candidate branches; reduced-motion rules suppress the pulse through the global policy.
The document permits vertical scrolling; viewport-sized scene and character-review
containers continue to constrain their own overflow. Long map, recap and post-kit pages
therefore remain reachable.

### Passport, streaks and the season sheet (P16)

"Collected" is now a server fact. `read_visitor_passport(journey, visitor_hash,
collect_seconds)` returns one row per published day of the journey plus a streak, and
`PASSPORT_COLLECT_SECONDS` (30) is the threshold — deliberately lower than the 60-second
postcard unlock, because a stamp records that he was watched and a postcard records that
someone stayed. The old `localStorage` passport is gone: it survived nothing and proved
nothing, and `JourneyExperience` no longer writes a stamp.

Streaks run on `day_number` inside one journey, never on calendar dates, so a rollover
that lands late cannot break a streak the visitor actually kept. The walk is newest-first
and stops at the first gap.

`stampFor()` in `src/lib/outcomes/stamp.ts` is the single decision behind every stamp:
gold for a marathon, colour for a landmark reached, grey for a day that fell short,
`current` for the live day, and **null** for a day `day_outcomes` has not finalized — the
passport draws an empty dashed frame rather than guessing a colour. Three ad-hoc ternaries
in the recap card, the day page and the map used to make this call independently, each in
its own vocabulary. `/api/map` keeps its published `landmark|marathon|unfinished` words
through one explicit mapping table, because that contract shipped in P14.

`src/lib/season/data.ts` owns `latestJourney()` — the "newest journey" query that four
modules used to carry their own copy of — and `loadSeasonSheet(n)`, which totals only
finalized days so a season total never shrinks after a rollover.

`/archive` is now cacheable (60-second revalidate) because the sheet is identical for
every visitor; which days *this* visitor collected arrives after paint from **`GET
/api/me`**, which is `private, no-store` and carries the visitor cookie. That split is
what P18 needs in order to make `/api/bootstrap` shared-cacheable at all.

`/season/[n]` is the poster page: stamp sheet, confirmed totals, the P14 map rendered
server-side (the page is cached, so there is no reason to make every visitor fetch
`/api/map` again) and `/api/og/season/[n]`.

**Known limitation — the soft 404.** An unrun season renders the not-found page but
answers **200**, not 404. The root `src/app/loading.tsx` wraps every route in a Suspense
boundary, so the shell has already begun streaming by the time `notFound()` throws, and
Next cannot change the status afterwards; `next/dist/docs/.../not-found.md` documents
exactly this trade-off and points at a `proxy` check as the only real fix. Next injects
`<meta name="robots" content="noindex">`, so the page stays out of search. `/day/[n]`
has behaved this way since P13. Moving the check into `proxy` would mean a database read
on every request in the edge path, so it was not done here.

### The living world (P17)

`src/lib/world/ambient.ts` is the whole schedule and it is pure: `birdFlights`,
`walkerPopulation`, `steamPuffs`, `tramPass`, `buntingVisible`,
`windowLightAlpha` and `wavingWalker` are functions of the authoritative second and a
seed, through the existing `deterministicVariant`. Nothing calls `Math.random`, so two
people watching at the same second see the same bird in the same place — which is what
makes "you are watching the same thing" true rather than decorative.

Birds cross in a loose skein every 40-90 s and wind carries them faster, using the same
`effect.windScale` the rain and the motes already use. Steam rises in the `cafe` zone;
a tram crosses `arrival` for cities that opt in through `pack.ambient.tram`. The
procedural cat was removed because the primitive silhouette did not read as credible
art. Any future animal requires a reviewed asset and licence.

Draw order gained two containers. `lifeRoot` sits between `propRoot` and
`groundLifeRoot`; it is a **sibling of `weatherStaticRoot`, never a child of
`weatherRoot`**, because `weatherRoot` is emptied and destroyed on every zone rebuild and
would take the birds with it. `lightsRoot` sits directly above `layerRoot`
with an additive blend, drawing a zone's optional `lightsUrl` on the same dusk ramp as
the night grade — lit windows add light to the painting rather than covering it.

**Honest gap:** no pack ships a `lightsUrl` yet, so the window-light path is code with no
art behind it. That is the owner's to paint. `nightUrl` is now rendered when supplied;
otherwise the fallback remains colour grading.

Quality tiers use `walkers 0/1/2` and `birds 0/2/4`. Reduced motion already forces the
low tier, so a reduced-motion viewer gets neither — the same rule the storm flash follows.

Background walkers are the two residents, never two of the same model.
`walkerResidentType` picks the first walker of an appearance by the shared active-seconds
block, so every viewer sees the same person, and makes a second walker the other
resident; the stage never creates more walkers than there are residents. Each is a
`SkeletonUtils.clone` of an untouched copy of that resident's model, which the stage keeps
for the purpose: cloning the conversation partner's converted scene, as walkers once did,
copied its outline meshes and then outlined them again. `CharacterActor` mutates the scene
it is given, so each walker needs its own rig. The pack's own resident downloads at mount
and the other the first time a walker needs it, so a low-tier device, which shows no
walkers, never fetches it; a walker whose model is still loading waits rather than
borrowing the other resident's. They are
built **one per frame**: cloning a rig and constructing an actor is the most expensive
thing the draw loop can do, and three at once reads as a stutter. Their count follows the
city's hour and is adjusted inside the loop, not at mount — that effect has an empty
dependency list and the tier it captured is not the live one. They compute their own
anchors and never inherit artificial traveler viewport drift, sit at negative `z`
so the sort is unambiguous, and walk the other way at `rotation.y = -0.68`. When a crowd
wave fires, `wavingWalker` picks the one who waves back, so every viewer sees the same
person answer.

**Not shipped: awning flutter.** `props = coherentPanorama ? [] : …` disables foreground
cutouts for every live pack; they were removed in Phase 3 because they rendered as a
repeated pasted tree/lamp/planter strip (see §8.2 and `docs/phase-3-results.md`). There is
no cutout surface to flutter, and reintroducing the pool would risk that exact regression.
The prop assets are deliberately still on disk, so the option stays open.

The bunting is the only part of this that touches the database. `journey_runtime` gained
`hundred_watchers_at`, and `record_presence_heartbeat_v9` stamps it under the row lock the
heartbeat already holds, `where hundred_watchers_at is null` — so it records the *first*
time a hundred people watched at once and no later heartbeat can move it. It is never
inferred from a client-side count.

**The scene texture inventory now ignores hidden sprites.** `data-scene-textures` walks
every Sprite reachable from the stage; a sprite waiting for a texture it may never get —
the cafe sign with no premium sponsor, the window lights before dusk — was being reported
as `generated:1x1`, a texture nobody can see. The walk now stops at an invisible node.

### Compression, cost protection and deletions (P18)

**The models.** `scripts/characters/compress-glb.mjs` (`pnpm characters:compress`)
quantises the skinning and UV streams, then meshopt-encodes every geometry and
animation stream as `EXT_meshopt_compression`. Nothing is taken on trust: each encoded
stream is decoded again with the same decoder the browser uses and compared before the
file is written, and each lossy step is checked against a stated bound. A file that
fails the round trip is never written.

| File | Before | After |
|---|---:|---:|
| `public/characters/v2/traveler.glb` | 4.43 MiB | **2.48 MiB** |
| `public/characters/v2/almaty-host.glb` | 3.55 MiB | **1.77 MiB** |
| `public/characters/v3/resident-a.glb` (no clips, 2026-09-11) | 2.48 MiB | **1.23 MiB** |
| `public/characters/v3/resident-a-animations.glb` | 0.84 MiB | **0.52 MiB** |
| `public/characters/v3/resident-b.glb` (no clips) | 2.88 MiB | **1.74 MiB** |
| `public/characters/v3/resident-b-animations.glb` | 0.96 MiB | **0.56 MiB** |

Measured worst-case error, printed by the script on every run: skin weights
≤ 5.6 × 10⁻³ (three quantisation steps, and they are renormalised to sum to exactly
one); UVs ≤ 7.6 × 10⁻⁶; normals turned by ≤ 1.9 × 10⁻² rad, about 1.1°; every other
float ≤ 6.1 × 10⁻⁵ relative to the largest component beside it, which is under two
millimetres on a 1.78 m character.

`loadCharacterGltf` attaches `MeshoptDecoder` through the exported
`withMeshoptDecoder`, so both stages and the CPU-side `actor-motion` test inherit it.
The extension is declared **required**, so a loader without the decoder throws instead
of silently drawing nothing — `loader.test.ts` asserts the decoder is attached.

**The ≤ 1.8 MB target in the prompt was not reached, and here is what is left.** The
traveler's remaining 2.48 MiB is 0.90 MiB of textures, 0.68 MiB of glTF JSON and
0.86 MiB of compressed streams. The JSON grew by ~0.28 MiB because meshopt adds an
extension object to each of 1,587 bufferViews — a real cost of the win, not waste. The
two levers that would close the gap are both visible or structural decisions for the
owner rather than a compression setting: dropping the texture cap in
`optimize-glb.mjs` from 1536 px to 1024 px (~0.45 MiB), and merging the 31 mesh
primitives, which would shrink the accessor table the JSON is made of. Splitting the
animations into `traveler-anim.glb` was considered and rejected: `loadCharacterGltf`
fetches `animationUrl` immediately, so it would move bytes between two requests
without removing any from a first visit.

**The heartbeat adapts to the crowd.** `presence_heartbeat_seconds` returns 20 s, 30 s
above 300 watchers and 40 s above 1,000, chosen from the same distinct count taken
under the row lock the pace already holds, so the interval and the crowd it was chosen
for can never disagree. The lease follows it: `max(50, 2 × heartbeat + 10)`, which is
always more than two beats.

The trap this could have walked into: `PresentationClock` extrapolates towards the
lease expiry, so a 90-second lease must not license a 90-second guess. It does not —
`leaseMs = Math.min(60_000, ttlMs)` keeps presentation authority at sixty seconds
whatever the lease says, and `presentation-clock.test.ts` asserts that at 70 s and 90 s
TTLs specifically.

**`/api/bootstrap` is now the world, and only the world.** It is read under one shared
key (`PUBLIC_BOOTSTRAP_KEY`), so the ballot comes back unselected, the postcard locked
and the passport empty — the public view. It carries
`Cache-Control: public, s-maxage=3, stale-while-revalidate=10` and **no `Set-Cookie`**,
so an edge cache can absorb a viral minute that would otherwise be one database read
per arrival. Everything about a particular visitor — first visit, their ballot, their
postcard, their passport — moved to **`GET /api/me`**, which is `private, no-store` and
issues the visitor cookie. `tests/e2e/cache-split.spec.ts` asserts both halves,
including that no private key ever reappears in the public body.

Rate limiting followed: the public read shares one 600-per-minute bucket, about thirty
times what a three-second cache should let through, and still a ceiling if the cache is
bypassed.

**Asset origin.** Confirmed rather than rebuilt — `publicAssetUrl` was shipped early by
owner decision Q13. Packs, GLBs and audio all route through it, and every element that
reads pixels back sets `crossOrigin="anonymous"`, so a tainted canvas cannot silently
break day photos when `ASSET_BASE_URL` is set. One honest gap: `ASSET_ROOTS` is
`characters`, `scenes`, `audio`, `npcs` — the four trees `upload-assets.mjs` mirrors —
so `/traveler/production/v2/actions/idle.webp` (53 KB, the GLB loading frame) is still
served from the origin.

**The load gate is open.** See `docs/phase-3-results.md`: the recorded numbers predate
this commit, the harness now models reactions and the `/api/me` call, and only the dry
run was executed here.

### Pack authoring pipeline (P19)

`pnpm pack:new <slug>` scaffolds an immutable v1 module in
`src/content/countries/` and an `art/<slug>/` authoring directory. It accepts an
interactive questionnaire or `--from <json>`; JSON is deliberate because no YAML
dependency is installed or approved. The strict authoring schema admits only the
country, geography, five zone descriptions, landmark, phrase, resident, six dialogue
lines, eight notebook lines, vote blurb and postcard copy. `pnpm pack:lint <slug>`
checks those fields against the owner-editable
`docs/plan/content-banned-words.txt`. A keyword match is a review stop, not proof that
an unflagged pack is culturally safe.

`pnpm pack:build <slug>` requires five distinct `master.png` files and the landmark's
`night.png`. Sharp normalizes each source to a bounded 3600×1200 city WebP, derives a
soft 1600×900 sky plate, and extracts the lower 18% into a 3600×216 pavement texture
whose outer eight percent is blended for the seam audit. The factory emits these as a
`continuousScene`: the city never wraps and only the pavement moves as a tile. The
builder also writes day/night/lights assets, derives the postcard, samples three palette
colours and writes `art/<slug>/build.json` with exact transfer bytes against the existing
5.5 MiB pack ceiling. It then regenerates the module and adds it to the small authored
registry. Generated packs start with `culturalReview.status = pending`: they work in the
private pack preview but `isVoteReadyPack` keeps them out of ballots until the owner
records review evidence. Missing NPC fallback art and ambient audio degrade to the 3D
resident and silence rather than borrowing another culture's assets.

Paris `v1` is the first pack produced by this layered authoring path. Its five day
masters and matching landmark night master live under `art/paris/`; its derived runtime
transfer is 4,220,300 bytes. It is registered for private preview with cultural review
still pending. The reversible development seed accepts `--preview --pack <registered-v3-pack>`;
for example, `pnpm seed:phase1 --preview --pack paris-v1 --starts-at <ISO timestamp>`.

The v3 schema now rejects unknown top-level, dialogue, phrase, story-beat, review,
postcard, resident, NPC-system and editorial fields. `resident` and `notebookLines` have
defaults, so the existing fourteen packs retain their parsed shape. Sofia remains on its
existing one-master pack until the owner supplies the six separate paintings; the exact
handoff is D4 in `docs/plan/AFTER-P22.md`.

### Private corrections loop (P20)

`CorrectionForm` appears in the live dock and on a hosted country's page. It sends the
pack, optional zone, category enum and at most 280 characters to `POST /api/corrections`.
The route checks the Origin and registered pack/zone, hashes the HttpOnly visitor id,
normalizes only the edge-provided country code and calls `submit_correction`. That RPC
applies the shared distributed limit at three submissions per visitor per UTC hour and
stores the text behind RLS. Responses, analytics and logs never echo the body.

The existing 12-hour signed admin session protects `/admin/corrections` and both admin
routes; unauthenticated requests receive 404 and authenticated responses are private,
`no-store`. `moderate_correction` locks the row and makes repeated accept/reject calls
idempotent. Public country pages call the scalar contributor projection and render the
owner-approved wording only when the confirmed count is positive: “Improved with help
from N contributors”. Acceptance credits the anonymous contributor but never edits a
pack automatically.

Migration `202609100027_season1_corrections.sql` was applied on 2026-09-10 to dev project
`tkntxptfhmjnqaaveddx`. All 316 remote pgTAP assertions passed, including P20's 24, and
remote database lint returned `{"results":[]}`.

### Production launch configuration (P21)

Production enters the Season 1 path only when both `PHASE2_ENABLED=true` and
`LAUNCH_ENABLED=true`. With the switch armed but before the journey's stored
`launch_at`, `/api/bootstrap` returns the real Day 1 pack in `prelaunch` mode: the scene
is idle, both visible status lines say “Starts …”, and presence, reactions, progress,
postcards and visitor-private refreshes do not run. At the database boundary heartbeat
v12 delegates to the launch guard and refuses an instant before
`coalesce(launch_at, starts_at)`.

`pnpm seed:season1 --launch-at <...> --pack <reviewed-pack>` is a no-write plan. `--apply`
calls the atomic seed RPC; a same-data retry returns `exists`, while drift is rejected.
The default is `london-v1`, which intentionally fails until the owner-approved pack is
registered. The actual production date and launch switch remain unset. The Day-1 name
winner resolves to `paris-v1`; rollover records that transfer as `train`, then returns
to reviewed neighbour-first destination voting.

Vercel declares prewarm at 15:55 UTC and rollover at 16:00 UTC. Prewarm fetches the
upcoming pack before Day 1, all possible vote-owned packs thereafter, the day OG image,
and a current weather reading. `/api/health` now reports database/content state, weather
and payment provider configuration, confirmed weather age, representative asset-origin
reachability, and the stored launch state. The minute-accuracy limitation of free Vercel
cron is recorded as launch-blocking D5, with the operational checklist and rollback in
`docs/runbooks/launch-day.md`.

Migrations `202609100028_season1_launch.sql` and
`202609100029_fix_launch_seed_lint.sql` were applied on 2026-09-10 to dev project
`tkntxptfhmjnqaaveddx`. All 346 remote pgTAP assertions passed, including P21's 30, and
remote database lint returned `{"results":[]}`.

### Sponsor pricing and placements (P15)

`P(day) = clamp(yesterday_unique_watchers x SPONSOR_CENTS_PER_UNIQUE, floor, cap)`, with
the owner-approved floor 4,900, cap 299,900 and premium multiplier 1.5 (DECISIONS Q11).
`src/lib/sponsors/pricing.ts` mirrors the two SQL functions so `/sponsors` can render and
explain a price without a round trip; the database still prices every reservation, and a
client never sends an amount. Premium is rounded to a whole dollar, so the published pair
is Standard $49 / Premium $74.

`/sponsors` is the public price board: the rolling window, sold days by sponsor name, open
days by price, and the sentence naming the audience that set it. It reads the **stored**
`basis_uniques`, never a recomputed number, and a founding or floor-priced day says so
instead of claiming an audience it did not have. `/sponsor` permanently redirects there.
The dock shows the cheapest genuinely open day and, when nothing is for sale, no number at
all. The landing page stays statically rendered with a 60-second revalidate: the price is
one indexed read, and nothing visitor-specific was added to it.

Only a *paid* purchase counts as sold on the board; an abandoned checkout is not social
proof. `/sponsor/<publicId>/report` renders that sponsorship's stored daily aggregates,
reached through the unguessable public id exactly like the disclosure redirect.

**Payment.** The purchase snapshot (`expected_price_cents`) remains the payment authority,
and `validateLemonOrder` is unchanged. The webhook additionally recomputes what the day is
published at now; a difference is recorded as `price_basis.mismatch` with a
`sponsor_price_mismatch` log and blocks `approve-sponsor.ts` until someone passes
`--accept-price-mismatch`. It never re-prices, auto-approves or auto-refunds: a sponsor who
paid what they were quoted has bought the day.

**Premium placements** are drawn only for `tier = 'premium'` on a sponsorship that is
`live`, so an unapproved creative can never reach the screen. `CharacterActor.setBottle`
mirrors `setSponsor` (same texture settings, generation guard and disposal) to label the
bottle he drinks from; PixiScene draws the cafe sign in a `signRoot` between the props and
the ground life, shown only where `zone.kind === "cafe"`. `zone.kind` is a new schema field
defaulted by ordinal position, because zone ids are city-specific slugs (`plov-cafe`,
`chaikhana`) and only the position is canonical.

The sales-DM preview `?demoSponsorLogo=<https url>` paints a prospect's own logo on the
patch. It is hard-denied on Production and accepts only an absolute `https` URL. It is
gated on the deployment rather than on a preview-session cookie deliberately: reading a
cookie would make the landing page uncacheable for every real visitor, and the capability
is only "draw an image on the patch" - it stores nothing and reads nothing.

### Identity, security, limits

- Anonymous opaque visitor cookie, **hashed with `VISITOR_HASH_SECRET` before it reaches
  the database**. Neither the cookie value nor the secret is ever exposed to browser code.
- Every mutating route checks a trusted `Origin`.
- Distributed rate limits with correct `Retry-After`: bootstrap 90/min, presence 45/min,
  vote 10/min, postcard 4/5 min, sponsor metric 60/5 min, sponsor click 20/5 min,
  notification 8/5 min.
- Correlation IDs and redaction in structured logs; missing vendor credentials are an
  intentional no-op rather than a crash.
- The pack-preview route hard-denies Production regardless of any other flag.

### Time of day and weather

`localHourFraction(instant, timeZone)` reads the city's own clock and
`gradeForHour` interpolates the 02 §6 keyframes into the `VisualGrade` that Pixi's
world filter and the character's material already share, so the man and the painting
change together. `nightMix` ramps 0→1 across dusk (19–21) and back across dawn (05–07);
zones that ship a `nightUrl` master cross-fade to it, and zones that do not are graded
to night instead.

`weatherEffect(code, windKmh)` is the WMO table from 02 §7: overcast dims contrast, fog
paints a band on the zone's `horizonY`, rain and snow drive the particle field, wind
above 30 km/h scales particle velocity up to 2×, and thunderstorms add an 80 ms white
flash derived from the authoritative watched second — so every viewer sees the same
lightning, and nobody with `prefers-reduced-motion` sees any. When
`WEATHER_ENABLED=true`, the reading is fetched server-side from Open-Meteo at most once
per city per ten minutes: the bootstrap route claims the window in `operation_ledger`
and refreshes inside `after()`. The launch default is `false`; in that state refresh
returns before any provider request and bootstrap, heartbeat, health readiness and HUD
expose no weather.

### The destination vote

Candidates come from `buildDestinationCandidates` (`src/lib/vote/candidates.ts`), a pure
function over the pack registry: the current pack's `neighbours` — real land borders,
listed in `src/content/countries/geography.ts` — intersected with packs whose
`culturalReview.status` is `approved` or `creator_reviewed`, minus every country already
visited this season, capped at three and at one pack per country. If fewer than two
survive, the nearest unvisited ready packs by great-circle distance fill the ballot and
the rollover logs `vote_candidates_fallback`; that is an explicit transfer, never a
pretended border. The whole ballot then passes the Season-1 pair policy from
DECISIONS Q16 (AM–AZ, AM–TR, RS–XK, GR–TR, and any pair involving IL or RU).

### Daily rollover

`GET /api/cron/rollover` claims an idempotent `rollover:<YYYY-MM-DD>` operation in
`operation_ledger`, then calls `close_and_pick_vote_winner`, builds tomorrow's day and
ballot from the registry (`planNextDay`) and writes them through
`create_next_country_day`, then runs `reconcile_phase2_state` (advance the country-day, close
and publish the vote, move sponsorships through `scheduled → live → completed`),
`cleanup_phase2_retention`, and `aggregate_sponsor_metrics` for the previous day. A
duplicate invocation returns `duplicate: true` and changes nothing.
New country-days begin at the preceding row's exact `ends_at`, even if cron runs late;
using the next rollover after invocation would otherwise leave a 24-hour schedule gap.

For local manual review, `pnpm dev:prepare` is a dry run over the single reversible seed
in dev project `tkntxptfhmjnqaaveddx`. `--apply` enables its Season 1 path, finalizes
ended rows through the locked RPC, and extends the fixed private itinerary only until a
current day exists. It preserves existing days and contributions. Passing `--base-url`
also renders and stores any missing immutable recap cards through the running app.

---

## 10. Verification and evidence

```
pnpm verify              lint + typecheck + unit tests + production build
pnpm verify:phase15      + hosted DB lint/tests, content, asset budgets, e2e
pnpm verify:phase1.5     + the real-time ten-minute soak
pnpm verify:phase2       + isolated-project preflight, phase-2 pgTAP, full e2e
pnpm verify:phase3       the current full gate
```

Recorded results (`docs/phase-3-results.md`, 2026-09-06):

- **61 pgTAP assertions** pass (Phase 1: 10, Phase 1.5: 4, Phase 2: 24, Phase 3: 23),
  covering RLS, grants and storage policies.
- **Unit tests:** 27 files / 66 tests were recorded at the Phase 3 gate with 84.1 %
  statements, 71.7 % branches and 93.9 % functions on the scoped coverage set. The
  current suite is **47 files / 185 tests**.
- P4 adds 15 pgTAP assertions for columns, RLS/grants, v4 accrual/persistence and the
  v5 bootstrap projection. They require a migrated Postgres instance; this workspace
  has no Docker/Podman runtime, so they were not executed locally in this change.
- P5 adds 17 pgTAP assertions, including the `n = 1, 2, 4, 8, 16, 40` pace table,
  multi-tab visitor deduplication, non-retroactive arrivals, 2× accrual and lease-expiry
  projection. The two-context Playwright flow asserts that both browsers render the
  confirmed `The internet is keeping him moving · ×2` HUD line.
- P6 adds 26 pgTAP assertions for explicit departure, silent expiry, the 600-second
  boundary, exactly-once serialized arrival, wait clearing/preservation, grants and the
  bootstrap projection. They require a migrated Postgres instance and were not executed
  locally because this workspace has no Docker/Podman runtime. The focused Chromium
  two-context scenario passed: context A closed, the fixture clock crossed TTL plus the
  qualifying gap, and context B saw both the three-second first-watcher headline and its
  private details card.
- Production build emits 31 routes on Next 16.3.3.
- `content:validate`: 16 registered packs, 717 uniquely owned scene assets.
- Playwright: 30 active desktop/320 px tests plus opt-in rehearsal/soak/recording specs.
  Coverage includes shared presence across two browser contexts, accessibility, the
  no-WebGL fallback, stop/resume, the encounter, full and reduced motion, 320 px bounds,
  closed vote results, bootstrap reconnect, and same-page postcard rollover.
- `tests/e2e/scene-ground-strip.spec.ts` (added with `98e1c77`) is the world-compositing
  guard: it pins 1440×900, drives Tbilisi's `rustaveli-arrival` zone, and asserts both
  that the Pixi stage holds only the zone panorama and that two sample rows move as one
  rigid translation of it. Derivation, measured pre/post-fix figures and thresholds are
  in §8.3. It was confirmed to fail on the pre-fix renderer on each assertion
  independently, so it is not a vacuous test.
- A **1,000-viewer load gate** passes: 30 s arrival ramp + 60 s sustained, 7,188
  requests, zero errors, 560 ms overall p95. A deliberately unrealistic zero-ramp
  100-viewer cold burst also produced zero errors but 2,849 ms p95 — documented as an
  open capacity caveat rather than hidden behind the passing sustained test.
- A 4,040,358 ms (≈67 min) uninterrupted canonical observation traversed all seven
  cities in order with 14 traveler states, encounter and action cadence, seven votes,
  sponsor disclosure and redirect, offline recovery and the reduced-motion fallback.

Explicitly **not** claimed: physical-device Core Web Vitals, real-provider payment
evidence, or visual acceptance of the character. Development-server Web Vitals are not
representative field data.

---

## 11. Configuration and gating

Season 1 additions (all optional, all with safe defaults):

```
ROLLOVER_UTC_HOUR=16                     # when the day ends and the ballot closes
SUPABASE_DAY_PHOTOS_BUCKET=khw-day-photos # public bucket for crowd photographs
SUPABASE_RECAPS_BUCKET=khw-recaps          # public immutable day-recap PNGs
ADMIN_ACCESS_SECRET=...                    # 48+ chars; exchanged for a 12-hour session
WEATHER_ENABLED=false                      # provider and presentation disabled for launch
TARGET_CHARACTER_HEIGHT_FRAC=0.30          # desktop viewport target
TARGET_CHARACTER_HEIGHT_FRAC_MOBILE=0.28   # mobile viewport target
```

`ROLLOVER_UTC_HOUR` is clamped to 0–23. Sponsor inventory is fixed in code at seven
dates. The day-photo bucket must exist and be public before `/api/day-photos` can store
anything; until then the route fails closed and the rest of the photo reaction works.


`phase2DeploymentAllowed()` is the master switch. It returns false unless
`PHASE2_ENABLED === "true"`, **always** returns false when `VERCEL_ENV === "production"`,
and on Preview only allows an explicit branch allowlist:

```
phase-2-seven-day-mvp
phase-3-launch-hardening
traveler-finalization-v2      ← the current branch
```

Off Vercel it additionally requires `PHASE2_REHEARSAL_MODE === "true"`.

`fixturePaymentsAllowed()` stacks four more conditions on top — provider must be
`fixture`, rehearsal mode on, not production, and a `SPONSOR_FIXTURE_SECRET` of at least
32 characters. The fixture adapter labels itself **"TEST PAYMENT — NO MONEY"** in the UI.

The Preview-only action-review dropdown (`demoSponsorAllowed`) is gated on
`VERCEL_ENV === "preview"` and a specific branch. It changes local presentation only —
authority, presence, contribution and world progress are untouched, and "Automatic
journey" returns to live behaviour.

Runtime configuration (`serverRuntimeConfig()`):

| Variable | Default | Meaning |
|---|---|---|
| `PRESENCE_TTL_SECONDS` | 50 | Lease lifetime |
| `STEPS_PER_ACTIVE_SECOND` | 1.8 | Database step rate (see §3) |
| `PACE_CAP` | 5 | Maximum logarithmic watcher pace (clamped to 1…5) |
| `FIRST_WATCHER_GAP_SECONDS` | 600 | Minimum zero-watcher gap that earns the wake card |
| `POSTCARD_UNLOCK_SECONDS` | 60 | Contribution needed for a postcard |
| `POSTCARD_RETENTION_DAYS` | 365 | Postcard expiry |
| `SPONSOR_RESERVATION_MINUTES` | 30 | Slot hold during checkout |
| `SPONSOR_PAYMENT_PROVIDER` | `lemonsqueezy` | Or `fixture` |
| `PHASE2_REHEARSAL_SCALE` | 144 | Story-clock multiplier, rehearsal only |

### Optional asset origin and upload command (2026-09-08)

`src/lib/assets/url.ts` provides pure `assetUrl(path, baseUrl)` and a small
`publicAssetUrl(path)` build-configuration wrapper. `next.config.ts` validates
`ASSET_BASE_URL` as an HTTPS origin with no credentials, path, query or fragment,
then embeds only that non-secret origin as `NEXT_PUBLIC_ASSET_BASE_URL`. Empty or
unset means same-origin. Changes require rebuilding the application.

The mirrored trees are `/characters/`, `/scenes/`, `/audio/` and `/npcs/`.
Pack/schema values stay root-relative so content validation, file budgets and
server-local file readers keep working. URLs are resolved at the GLB, Pixi
load/preload, panorama, NPC image and audio boundaries, including character/pack
review and next-country preloads. Image-to-canvas paths set anonymous CORS before
loading. CDN images in pack preview bypass Next's image proxy. Absolute external
URLs and other trees (including original `/traveler/` fallback artwork) are unchanged.

`pnpm assets:upload` runs `scripts/upload-assets.mjs` through the already-installed
tsx loader; typed implementation is `scripts/assets/upload.ts`. It defaults to a
credential-free dry run. Only `--upload` sends S3 Signature V4 PUTs using private
`ASSET_S3_ENDPOINT`, `ASSET_S3_BUCKET`, `ASSET_S3_ACCESS_KEY_ID`,
`ASSET_S3_SECRET_ACCESS_KEY` and optional `ASSET_S3_REGION` (default `auto`). These
credentials are never included in Next configuration or browser code. The command
preflights public runtime file types, rejects symlinks and files above 100 MiB,
preserves relative object keys and credits, sets MIME types and a one-hour public
cache TTL, rejects redirects and stops on errors without printing remote bodies or
signed headers. Upload replaces matching remote keys and never deletes objects.

Local assets remain checked in. Same-origin fallback means clearing the origin and
rebuilding; no automatic CDN-failure retry is added. R2 provisioning, live upload and
CORS acceptance await the owner's bucket. See [asset hosting runbook](docs/runbooks/asset-hosting.md).

Hard rules stated in the repository and worth repeating: never use the analytics
provider as the live presence source, and never expose `SUPABASE_SECRET_KEY` or
`VISITOR_HASH_SECRET` to browser code.

---

## Appendix — the ten-second orientation

- **Two authority tracks** (`global_active_seconds`, `global_distance_metres`) only grow
  while someone is watching. Seconds animate; metres select route progress.
- **Pure functions** (`travelerMotionAt`, `routePositionAt`) turn explicit authority
  inputs into a pose and route position, so every viewer agrees and reloads are free.
- **One skeleton** (`traveler.glb`, 52 joints, 15 clips, 6 face morphs) performs every
  action; only clip weights, face weights and hand-socket props change.
- **Two art pipelines.** Phase 2 cities (including Tbilisi) have five separate master
  paintings; Phase 3 cities have one master cropped five ways. Either way only one of the
  six derived files per zone is actually drawn (§8.5).
- **The character is a work-in-progress candidate.** The duplicated ground layer is gone
  (§8.3, `98e1c77`), and both canvases now share the painted
  pavement and person scale (§8.4). Calibration and character quality still need owner review.
