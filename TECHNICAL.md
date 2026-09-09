# Keep Him Walking — Technical & Character Brief

> Companion to `PRODUCT.md`. Read that first for what the product is. This file covers
> how it is built, with the character system as its centre, plus the image/scene
> pipeline and the two rendering defects found in it — §8.3, fixed in `98e1c77`, and
> §8.4, repaired with shared stage calibration on 2026-09-08.
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
| Testing | Vitest (50 test files, 192 tests) + Playwright (18 spec files across 8 config profiles) + pgTAP (61 baseline + 15 P4 + 17 P5 + 26 P6 assertions) |
| Hosting | Vercel; functions in `syd1` adjacent to the Supabase project in `ap-southeast-2` |
| Package manager | pnpm 11, Node ≥ 22 |

```
src/
  app/                    13 pages, 17 route handlers, sitemap/robots/manifest
  components/
    journey/JourneyExperience.tsx   the one orchestrating client component
    scene/                PixiScene, SceneStage, StaticScene
    traveler/             ProductCharacterStage3D, CharacterActor host, review UI
    hud/ dialogue/ vote/ sponsor/ postcard/ archive/ debug/
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
supabase/migrations/      13 forward migrations, 61 baseline pgTAP assertions
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
rounded to the distance corresponding to a 0.6 s planted-foot boundary. The gait holds
for the action while the independently authoritative distance track continues. Because
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
deliberately do **not** feed the locomotion clock, so `plantIndex`, step counts and the
gait are byte-identical with and without them.

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

While the traveler is waiting, `waitingBehaviorAt(waitedSeconds, isLocalNight)` selects
the pockets/watch/stretch/yawn/look-up cycle deterministically. At 600 seconds it uses
`sit_down` then `sitting`; from 21:00–05:00 local time it uses `sleep`. Missing retargeted
takes resolve through the manifest to the closest v2 pose. The waited duration and local
hour are explicit inputs; authoritative route seconds remain unchanged. During the
three-second first-arrival beat he looks up and stands before locomotion resumes.

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
> GLBs**. No Mixamo animation is included.

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
- **Seeking is deterministic:** `action.time = min(cue.seconds, clipDuration − ε)` and
  then `mixer.update(0)`. There is no accumulated delta, so the same input second always
  produces the same pose — this is what lets two viewers, a reload, and a scrubbed review
  timeline all agree.
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
  `DataTexture` with values 72/160/255, nearest filtering and no mipmaps.
  The shader multiplies exposure/tint **after sRGB encoding**, matching Pixi's
  `ColorMatrixFilter` display-space operation without modifying texture colours.
- **Outline:** cloned mesh siblings use BackSide, 1.018 scale, `stage.palette[2]`,
  alpha 0.7 and depth writing. Skinned clones share bones and facial morph weights;
  their bind inverse follows the unexpanded source so attached skinning cannot cancel
  the scale. Hair/lash hulls retain texture alpha cutouts. Low quality hides all hulls;
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
  at 1.55, key palette[0] at 0.9 from `(−3,5,4)`, `(3,5,4)` or `(0,5,4)` for
  left/right/top, fill palette[2] at 0.35 from the opposite side. Lights and outline
  colour follow the actually rendered zone's stage frame.
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

- **3D resident** — `almaty-host.glb`, 1.68 m, female base, `braid01` hair, ochre jacket
  and charcoal trousers, her own 11 clips. She appears only during a conversation
  (`showResident`), positioned at anchor 0.72 (0.76 mobile).
- **2D NPCs** — every city ships `npcs/<city>/<version>/{neutral,talk,react}.webp`
  (~55 KB each), used for the dialogue portrait when the 3D resident is unavailable.
  Provenance differs by phase (see §8.1): Phase 2 cities split a per-city
  `art/phase2/<city>/npc/sheet.png` into three columns, one per expression; Phase 3
  cities take a column each from one shared `art/phase3/npc-lineup.png` contact sheet.
  The Phase 3 cutout is the more interesting one — background is removed by
  flood-filling neutral bright pixels **inward from the crop edge** (so pale clothing
  inside the figure survives), then only the largest connected opaque component is kept
  (so a sliver of the neighbouring character in the tightly spaced sheet is discarded).
- **NPC base systems** — `npcSystem.baseType` is `resident-a` or `resident-b`, with a
  per-city `variantId` and six named states, so many people can be described from two
  reusable rigs.

### 6.5 Parallel paths that are no longer rendered

Naming these explicitly, because reading the code without this list is misleading:

| Path | Status |
|---|---|
| `spriteManifest` in every pack + `public/traveler/production/v2/` (8 walk + 16 action WebP frames at 540×960, with per-frame planted-foot, root offset, shadow scale and sponsor-anchor metadata) | Still generated, validated by `rig-contract.ts`, and shipped — but **nothing renders it** since the 3D swap. |
| `SpriteTravelerRenderer.tsx` | Not imported anywhere. |
| `pixi-puppet.ts`, `puppet.ts`, `limb-skin.ts` (the procedural 2D puppet with continuous joint skinning) | Removed from `PixiScene` in commit `af8dd03`; `pixi-puppet` is now unreachable. |
| Rive adapter — `RiveTravelerRenderer.tsx` and the `JourneyCharacter` / `JourneyMachine` / `JourneyCharacterVM` contract | Intact and reachable only if a pack sets `driver: "rive"`. **No pack does, and no `.riv` file has ever been commissioned.** |
| `public/characters/v1/` | The rejected first character candidate, kept for comparison. |

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

Of the 16 registered packs, **14 are schema v3** and take this branch: `tashkent-v4`,
the six other Phase 2 cities, and the seven Phase 3 cities. The remaining two —
`tashkent-v2` and `tashkent-v3` — are schema **v2** and still take the older multi-layer
parallax path (distant + architecture + three ground variants, six pooled sprites per
layer, illustrated props with depth-scaled tracks). They are kept registered purely as
rollback targets; nothing schedules them. So the legacy renderer is live code but is not
what any visitor currently sees.

On the v3 panorama branch:

- A six-sprite bounded panorama pool, all textured with `zone.fallbackUrl`, scaled from the stable
  viewport-relative character target:
  ```
  targetCharacterPx = viewportHeight * (width <= 600 ? 0.20 : 0.24)
  requiredImageScale = targetCharacterPx / (stage.personHeightFrac * imageHeight)
  imageScale = min(requiredImageScale, 1.6)
  imageX = (viewportWidth - imageWidth * imageScale) / 2
  imageY = groundY - zone.stage.groundLineY * imageHeight * imageScale
  ```
  There is no vertical centering. The repeated painting scrolls by
  `metresIntoZone × pxPerMetre × 0.7`. Its horizontal position is reduced modulo one
  scaled texture width. The legacy distant layer uses 0.35×, architecture uses 0.7×,
  and ground/foreground use the 1× near track.
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
  200 m, and a cross-dissolve between complete panoramas over the final 60 m. A
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
target comes from `TARGET_CHARACTER_HEIGHT_FRAC` (default 0.24 desktop) or
`TARGET_CHARACTER_HEIGHT_FRAC_MOBILE` (default 0.20 at widths ≤600 px). The image then
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
at zone changes. Resize recalculates immediately. CSS variables give loading traveler and
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

### 8.5 Shipped-but-never-drawn assets

Because every *scheduled* pack takes the `coherentPanorama` branch, since `98e1c77` only
**one of the six files per zone** reaches the screen: `fallback.webp`, the panorama.
Everything else is still generated and shipped but never drawn.

Measured on Tbilisi (`public/scenes/tbilisi/v1/`), five zones:

| Category | Size | Status |
|---|---:|---|
| `fallback.webp` × 5 | **1.33 MiB** | rendered |
| `distant.webp`, `architecture.webp` × 5 | 1.45 MiB | never drawn, **still listed in `preload` / `preloadGroups`** |
| `ground-1/2/3.webp` × 5 | 0.43 MiB | never drawn, no longer preloaded |
| 15 prop WebP files | 1.36 MiB | never drawn (props are disabled on this branch), never preloaded |
| **Unrendered total per city** | **3.24 MiB** | |

`98e1c77` stopped fetching the `ground-*` crops. The `distant`/`architecture` pair is
deliberately still fetched: it is the same 1.45 MiB per city that the two schema-v2
rollback packs genuinely render from, and dropping it from the v3 preload hints belongs
with the pass that retires the files (P18) rather than with the strip removal.

Separately, `public/traveler/production/v2/` ships **1.51 MiB** of sprite frames
(8 walk + 16 action). Of those, only `actions/idle.webp` is actually used — as the
placeholder shown while the GLB downloads — plus `walk/walk-1.webp`, which the critical
preload list still fetches. The other 22 frames are deployed but unreachable.

So roughly **3.2 MiB per city plus 1.4 MiB of sprites** is dead weight on disk. Deleting
the files is a straightforward win now that §8.3 is settled, but it is gated on §8.4:
whichever way the panorama/ground/character-scale relationship is resolved may want the
`architecture` band back as a separate layer.

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

### Tables (18 forward migrations)

**Phase 1 — core:** `journeys`, `country_days` (with a GiST exclusion constraint so two
days can never overlap), `story_events`, `votes`, `vote_options`, `ballots` (unique per
vote + voter hash), `step_buckets` (per-minute rollup), `journey_runtime` (the authority
row), `presence_leases`, `mutation_rate_limits`.

**Phase 2:** `visitor_day_contributions`, `postcards`, `sponsor_slots`, `sponsorships`
(with a partial unique index enforcing one active sponsorship per slot and a trigger
enforcing legal state transitions), `payment_webhook_events`, `sponsor_metric_events`,
`sponsor_daily_metrics`, `operation_ledger`.

**Phase 3:** `country_notification_opt_ins`, `experiment_exposures`,
`operational_incidents`, `webhook_replay_audit`.

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
increments the live bucket, and — at `greatest(2, ceil(0.3 × live watchers))`, with no
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

**Season 1 migration 0017, weather:** `journey_runtime.weather` caches one
Open-Meteo reading per city. `write_journey_weather` refuses a reading older than the
one already stored, so a slow request cannot overwrite a fresher one. Heartbeat v7 and
bootstrap v9 carry it.

### Key RPCs

`record_presence_heartbeat` → `_v2` → `_v3` → `_v4` (the walking rule, distinct-watcher
pace and pace-weighted distance) → `_v5` (per-country watch aggregation) → `_v6`
(reaction buckets and scheduled crowd actions) → `_v7` (weather),
`normalize_country_code`, `read_country_day_watch`, `reaction_threshold`,
`close_and_pick_vote_winner`, `create_next_country_day`, `read_traveler_name`,
`write_journey_weather`, `read_journey_weather`,
`submit_reaction`, `read_day_reactions`, `record_day_photo`,
`submit_phase1_ballot`, `consume_mutation_rate_limit`, `reserve_sponsor_slot`,
`aggregate_sponsor_metrics`, `enforce_sponsorship_transition`, `claim_operation`,
`reconcile_phase2_state`, `cleanup_phase2_retention`, `journey_story_now`,
`read_journey_runtime_v3` / `_v4` / `_v5`,
`read_bootstrap_bundle_v3` / `_v4` / `_v5` / `_v6` / `_v7` / `_v8` / `_v9`
(one-call bootstrap with atomic admission control, the distance projection, the
country aggregate, the reaction board, the ballot and the weather),
`set_country_notification_opt_in`.

All of them are `security definer`, revoked from `anon` and `authenticated`, and granted
only to `service_role`. The browser never talks to these directly.

### Route handlers (19)

```
GET  /api/bootstrap                 full snapshot: day, event, vote, presence, steps,
                                    route runtime, sponsor, postcard state, asset pack
POST /api/presence/heartbeat        the walking rule
POST /api/votes                     one ballot per visitor, server-enforced
POST /api/postcards                 render + upload + public token (idempotent)
POST /api/sponsor/checkout          reserve slot → provider checkout
GET  /api/sponsor/status
POST /api/sponsor/metrics           impression / engaged_view
GET  /r/sponsor/<publicId>          disclosed click redirect + click metric
POST /api/webhooks/lemonsqueezy     signed, replay-audited
POST /api/sponsor/fixture/complete  no-money rehearsal adapter (multi-gated)
GET  /api/calendar                  .ics for tomorrow
POST /api/notifications/country     revocable, provider-gated opt-in
GET  /api/cron/rollover             daily reconciliation (authorized)
GET  /api/health                    database + registered-pack readiness
POST /api/reactions                 enum reaction, per-kind cooldown, crowd threshold
POST /api/day-photos                the crowd's photograph for a scheduled moment
POST /api/observability/vitals
GET  /api/admin/preview/[packId]    protected non-production pack preview
POST /api/admin/preview/session     expiring signed HTTP-only preview session
```

Public pages added in Season 1: `/country/<cc>` renders a watching country's rank and
carried time for today, its confirmed season total, and the days it hosted the walk.
Every number on it is a stored aggregate; nothing is extrapolated.

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
lightning, and nobody with `prefers-reduced-motion` sees any. The reading itself is
fetched server-side from Open-Meteo (no key, no paid service) at most once per city per
ten minutes: the bootstrap route claims the ten-minute window in `operation_ledger` and
refreshes inside `after()`, so no visitor ever waits on the request.

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
```

`ROLLOVER_UTC_HOUR` is clamped to 0–23. The day-photo bucket must exist and be public
before `/api/day-photos` can store anything; until then the route fails closed and the
rest of the photo reaction still works. Open-Meteo needs no key and no configuration.


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
