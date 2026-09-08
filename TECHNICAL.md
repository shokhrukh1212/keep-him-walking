# Keep Him Walking — Technical & Character Brief

> Companion to `PRODUCT.md`. Read that first for what the product is. This file covers
> how it is built, with the character system as its centre, plus the image/scene
> pipeline and a confirmed rendering defect.
>
> Every number below was measured from the repository, not estimated.

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
| Testing | Vitest (37 test files, 103 tests) + Playwright (14 spec files across 8 config profiles) + pgTAP (61 assertions) |
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
supabase/migrations/      10 forward migrations, 61 pgTAP assertions
```

---

## 2. Layer ownership and the composite stack

Strict ownership. No layer reaches into another's pixels.

| Owner | Responsibility |
|---|---|
| Postgres | Authority. Presence, active seconds, votes, sponsor state, postcards. |
| Pixi canvas | The world: sky, panorama, ground strip, ground-life, weather motes. |
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
the Pixi scene graph can occlude him and nothing in the world knows his position. This
is the structural cause of the defect in §8.

---

## 3. Authority and the clock chain

This is the most important mechanism in the codebase. One number flows from Postgres to
every animated frame.

```
presence_leases (per browser session, 50 s TTL, requires visible && scene_ready)
      │  record_presence_heartbeat  → v2 → v3   (security definer, SELECT … FOR UPDATE)
      ▼
journey_runtime.global_active_seconds     ← the single source of truth
      │  /api/bootstrap  (full snapshot)  +  /api/presence/heartbeat (~20 s)
      ▼
RouteRuntime { globalActiveSeconds, authoritativeAt, walking }
      │
      ▼
PresentationClock        one monotonic client clock, drift-corrected
      │
      ▼
travelerMotionAt(pack, rawSeconds)   pure function → TravelerMotionSnapshot
      │
      ├──► routePositionAt()          which zone, how far into it
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

`walking` is returned to the client as simply `activeViewers > 0`.

### The client side

`PresentationClock` (`src/lib/traveler/presentation-clock.ts`, 33 lines) is deliberately
tiny and is the only clock the scene and rig share:

- `accept(runtime, ttlMs)` ignores any update whose `authoritativeAt` is not newer than
  the newest already seen, so out-of-order responses cannot rewind the world.
- Network updates change the clock's **target**, never its origin.
- `sample()` eases toward the target at up to 1.05× real time, and hard-snaps only when
  divergence exceeds 2 seconds or the presence lease has expired. Result: no visible
  jump on every heartbeat, and no invented progress after a disconnect.
- It reports `traveling` only while `walking && now < leaseExpiry`.

`extrapolatedRouteSeconds` caps client-side extrapolation at 60 seconds, so a
disconnected tab cannot manufacture progress indefinitely.

### The locomotion constants

```
STEP_DURATION_SECONDS = 0.6     one footfall
GAIT_CYCLE_SECONDS    = 1.2     two steps
METRES_PER_STEP       = 0.75
METRES_PER_SECOND     = 1.25
worldUnitsPerSecond   = 92      per pack
durationActiveSeconds = 150     per zone (5 zones = 750 s per city loop)
```

### Why actions do not break determinism

`travelerMotionAt` separates **raw watched seconds** from **locomotion seconds**. A
scheduled action consumes raw seconds while locomotion is held at a planted-foot
boundary (`alignedStep` rounds every action's trigger to a multiple of 0.6 s). It then
adds a small fixed `actionTravel` contribution for the entry/exit weight shift. Because
the whole thing is a pure function of one number:

- Two viewers on different devices compute the identical frame.
- Reload recomputes the same position instead of restarting.
- Seeking backwards (in review tooling) is exact.
- `plantIndex`, `plantedFoot`, `cyclePhase` and `distanceMetres` are all derived, so the
  public step count and the visible foot can never disagree.

**One divergence worth knowing:** the database's `global_steps` uses the configurable
`STEPS_PER_ACTIVE_SECOND` (default **1.8**/s), while every displayed step count uses
`plantIndex` from the 0.6 s gait (**1.667**/s). The UI reads the gait-derived number, so
what a visitor sees is internally consistent; the database column is the one that drifts
from it.

---

## 4. The traveler state machine

`TravelerState` (20 values, defined in `src/lib/content/schema.ts`) is the semantic
contract every renderer must satisfy:

```
loading  idle  start_walk  walk  slow_walk  stop  rest
notice   approach  greet  talk  listen  react  wave
phone    drink  photo  sit  goodbye  resume_walk
```

Three layers produce it:

1. **`motion-machine.ts` — locomotion phase.** From the desired walking flag and how
   long ago it changed: `start_walk` / `resume_walk` for the first 650 ms,
   then `walk`; on stopping `slow_walk` (650 ms) → `stop` (to 1.1 s) → `rest`. Speed
   factors 0.62 / 1 / 0.38 / 0.
2. **`motion-clock.ts` — scheduled actions.** Story beats map to action kinds:
   arrival → `wave` (2.5 s), encounter → the full exchange, food → `drink` (5.5 s),
   landmark → `photo` (4 s), departure → `phone` (4.5 s). Non-encounter actions get a
   0.45 s `stop` entry and a 0.65 s `resume_walk` exit around the held pose.
3. **Encounter sequencing.** Fixed prologue `notice` 0.6 s → `slow_walk` 0.6 s →
   `approach` 1.2 s → `greet` 2.5 s, then one segment per dialogue line using that
   line's real `durationMs` (default 4.5 s) with `talk`/`listen` assigned by speaker and
   the line index published for the HUD, then `react` 2.5 s → `goodbye` 2.5 s →
   `resume_walk`. Total duration is `11.1 s + Σ line durations`.

`worldCommandForEncounter` separately drives the world: camera zoom 1.08, a small pan,
and background life dropped to 0.22 during the focused phases.

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
    buffers are byte-preserved, alpha stays alpha. No runtime decoder, no CDN: Next
    serves the `.glb` directly.

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
- **Face is driven procedurally**, not baked (no clip carries morph tracks): a 3.7 s
  blink cycle with a 0.28 s sine closure, a 0.17 smile bias with `react`/`greet`
  accents, a `sin²(9t)` speaking envelope active only on `talk`, and small brow accents.
- **Material corrections at load:** transparent hair cards and lashes are converted to
  alpha-cutout (`alphaTest 0.4`, `depthWrite true`) so they stop sorting through the
  head; the `high-poly` eye material keeps blending but stops writing depth; the stock
  hair map is tinted dark brown at runtime.
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
- **`dispose()`** stops all actions, uncaches the root, and disposes the sponsor texture.

### 6.2 `ProductCharacterStage3D` (`src/components/traveler/ProductCharacterStage3D.tsx`)

The live host component. Mounted once with an empty dependency array; all changing props
are read through a ref so the renderer is never torn down mid-journey.

- Own `WebGLRenderer` with `alpha: true` over the world canvas. Antialias, pixel ratio
  (1.5 / 1.25 cap), shadow map (1024 / 512, off on low tier) and the frame cap (30 vs
  60 fps) all come from the quality tier.
- `SRGBColorSpace` output, `ACESFilmicToneMapping`, exposure 1.05.
- Lighting: hemisphere `0xe8f3ff / 0x6f6046` at 1.55, a shadow-casting key
  `0xffead5` at 2.35 from `(−3, 5, 4)`, a cool fill `0x9bc8dc` at 0.8 from `(4, 2, 3)`,
  and a 20×20 `ShadowMaterial` floor at opacity 0.2.
- **Orthographic camera**, sized each resize so that 1.78 m maps to exactly
  `actorLayout().height` pixels and the world origin lands at
  `height − actorLayout().bottom`. (This is the source of the scale/float problem in §8.)
- Traveler and resident GLBs load in parallel; each reports availability upward so the
  React tree can swap away the static idle image and hide the 2D NPC picture.
- Per frame: accept the runtime into the shared `PresentationClock`, sample it, run
  `travelerMotionAt`, run `productCharacterSceneAt`, then push cues into both actors —
  with `snap = true` on the first frame and on every conversation boundary so a cut is a
  cut, not a 0.28 s smear. The resident is sampled with a 1.8 s face offset so the two
  characters do not blink in unison.
- Staging: in conversation the traveler moves to viewport anchor 0.43 (0.34 on mobile)
  and both actors yaw ±π/2 to face each other; otherwise the traveler sits at the pack's
  `travelerViewportAnchor` (0.61) with a slight ±0.68 rad turn toward travel.
- Pauses on `document.hidden`, handles `webglcontextlost` / `restored` by hiding the
  canvas and re-reporting availability, and on unmount walks the whole scene disposing
  geometries, materials, textures, skeletons and the shadow map.
- Writes `data-character-state`, `data-resident-visible`, `data-character-ready` to the
  host element — these are what the Playwright suites assert against.

### 6.3 `product-timeline.ts` — journey → skeleton

`productCharacterSceneAt(pack, motion, traveling, review, now)` returns
`{ traveler, resident, showResident, conversation }`:

- `clipForState` maps all 20 semantic states onto the 15 available clips
  (`wave → greet`, `sit → rest`, `approach → walk`, `slow_walk → stop`, …).
- `scaledCue` **retimes** a clip to fit an action's scheduled duration, so a 4.5 s
  `phone` beat and a 4.0 s `phone` clip stay in step.
- `oppositeCue` gives the resident the complementary role: traveler `talk` → resident
  `listen`, and vice versa; `greet`/`goodbye` are mirrored; everything else is `idle`.
- The encounter path walks the same fixed prologue and per-line segmentation as the
  motion clock, so dialogue text and character pose are driven from one source.
- `reviewCue` handles the Preview-only local action rehearsal (see §11) and is the only
  path that can override the server-derived pose. It never touches presence, route
  authority or accounting.

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

## 8. The image / scene system, and a confirmed rendering defect

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
| `fallback.webp` | whole normalized master → 1600×900 cover | 1600×900 | 235 KB |
| `distant.webp` | rows 0–450, stretched to 900, blur 0.35 | 2400×900 | 158 KB |
| `architecture.webp` | rows 162–684 | 2400×522 | 186 KB |
| `ground-1.webp` | rows 684–900, x 0–1200 | 1200×216 | 31 KB |
| `ground-2.webp` | rows 684–900, x 600–1800 | 1200×216 | 36 KB |
| `ground-3.webp` | rows 684–900, x 1200–2400 | 1200×216 | 30 KB |

(Phase 3 uses rows 0–500 blur 0.4 for `distant` and rows 150–710 for `architecture`;
`fallback` and the three `ground` windows are identical.)

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

- **One** panorama sprite, textured with `zone.fallbackUrl`:
  ```
  coverScale = max(width / texW, height / texH);  scale = coverScale * 1.1
  x = -(renderedWidth - width) * zoneProgress     // slides across the zone's 150 s
  y = (height - renderedHeight) / 2               // vertically centred
  ```
  Reduced motion pins `progress` to 0.5.
- **Props are disabled entirely** (`props = []`).
- `groundLifeRoot`: 7 (low tier) or 12 translucent ellipses/rounded-rects at
  `y = height × (0.845 … 0.881)`, scrolled by the character's ground offset.
- `weatherRoot`: 0/14/22 drifting motes by tier.
- A sky `Graphics` fill behind everything, per-zone 0.4 s fade-in, background preload of
  the next zone, and a once-per-second diagnostics snapshot (fps, p95 frame ms, live and
  pooled object counts, estimated decoded texture bytes).
- **Plus a "contact" ground strip**, which is the defect.

The historical reason for the panorama branch is recorded in the code: earlier versions
stacked opaque horizontal crops as parallax layers, and their offsets diverged into hard
visible seams. Collapsing to one coherent painting fixed that — but left the ground strip
behind.

### 8.3 The defect: a ghosted, self-overlapping second copy of the city

**Symptom.** In the live Tbilisi scene a translucent duplicate of the street sits across
the lower middle of the frame, with vertical seams, a repeating doorway-and-hedge motif,
and it slides at a different speed than the background. Below it, a third band of the
original painting shows through again.

**Cause.** In `buildZone`, regardless of the panorama branch:

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

Four things go wrong at once:

1. **`ground-1.webp` is not pavement.** It is rows 684–900 of a 900-px-tall photograph.
   At Tbilisi's framing that band contains building facades with barred doorways, tree
   trunks, planters, hedges and lamp bases. I rendered the asset to confirm this
   directly. The layer is named "ground" but contains a whole streetscape.
2. **It is scaled up, not down.** At a 1213 px viewport,
   `stripHeight = 1213 × 0.19 ≈ 231 px` against a 216 px source, so `stripScale ≈ 1.07`.
   The duplicated buildings therefore appear at roughly the same apparent size as the
   panorama's own — which is exactly what makes it read as a ghost rather than as
   texture.
3. **It tiles into itself.** `pitch = span × 0.86` overlaps each tile with its neighbour
   by 14 %, and the horizontal 12 %/88 % alpha feather makes those overlaps visible as
   soft vertical seams. With `span ≈ 1281 px` and `pitch ≈ 1101 px` on a 2000 px-wide
   window, roughly two full copies of the same doorway-and-hedge run are on screen.
4. **It moves at the wrong speed.** The strip scrolls by
   `groundPixels = motion.distanceMetres × (layout.height / 1.78)` — the character's
   walking rate — while the panorama behind it slides by `zoneProgress` over 150 seconds.
   Two unrelated rates, so the ghost visibly drifts across the background.

`sprite.y = baseline − stripHeight × 0.7` puts the strip's top edge ≈161 px above the
character's foot line and its bottom edge ≈69 px below it, which matches the soft
horizontal transition measurable in the screenshots at y ≈ 962 px.

**Why it exists.** Commit `af8dd03` *"feat: use finalized 3d characters in journey"*
deleted the Pixi 2D puppet and moved the character into its own Three.js canvas, but did
not delete the contact strip. The strip's only purpose had been to give that 2D puppet a
moving pavement to plant its feet on, in the same scene graph and the same coordinate
space. With the puppet gone — and the character now in a canvas *above* the world that
knows nothing about it — the strip is a decorative duplicate serving no one.

The Pixi draw order inside the camera container is:

```
sky  →  layerRoot (the panorama)  →  propRoot  →  groundLifeRoot  →  groundRoot  →  weatherRoot
                                                                     ^^^^^^^^^^
                                          the contact strip, drawn ON TOP of the painting
```

`groundRoot` is inserted at `weatherRoot`'s index, so it paints over the panorama *and*
over the ground-life blobs. That is why the ghost occludes rather than blends.

So the three bands a viewer perceives, from top to bottom, are:

| Band | Approx. y at 1213 px | What it actually is |
|---|---|---|
| Sharp background | 0 → 962 | The single `fallback.webp` panorama, cover-scaled ×1.1, sliding on zone progress |
| Ghosted overlay | 962 → 1192 | The 5 tiled, alpha-masked, up-scaled copies of `ground-1.webp`, fading in from transparent at its top edge |
| Bottom band | 1192 → 1213 | The panorama showing through again below the strip, under the `scene-grade` and `scene-vignette` CSS gradients |

(The 12 ground-life blobs sit at y ≈ 1025–1069 — i.e. *behind* the ghost band, not in the
bottom band.)

### 8.4 The related defect: the floating, oversized traveler

Independent of the strip, and visible in the same screenshots.

```ts
// src/lib/traveler/actor-layout.ts — 5 lines, and the entire spatial contract
export function actorLayout(width, height) {
  const mobile = width <= 600;
  return {
    height: mobile ? Math.min(height * 0.44, 360)
                   : Math.min(Math.max(height * 0.59, 304), 608),
    bottom: mobile ? 92 : 90,
  };
}
```

- **Foot plane** is `height − bottom`, i.e. a hardcoded 90 px (desktop) or 92 px (mobile)
  from the bottom of the window.
- **Height** is 1.78 m mapped to `layout.height` px — on a 1213 px viewport that is
  608 px, **about 50 % of the screen height**, on a boulevard whose buildings are four
  or five storeys tall.
- Nothing connects either number to where a given city's pavement is actually painted.
  Worse, the panorama is cover-scaled ×1.1 and *vertically centred*, so its horizon and
  pavement line drift with the viewport's aspect ratio while the character's foot plane
  stays put.

Net effect: the character is far too large for the perspective and his shoes land in the
middle of the ghost band rather than on the painted ground of either image. The contact
shadow does not rescue it either — the catcher is a 0.2-opacity `ShadowMaterial` lit from
`(−3, 5, 4)`, so the shadow falls behind and to the left, inside a transparent canvas
floating over a photograph.

A correct fix needs the pack to declare, per zone, where the walkable ground line sits in
the panorama and what a 1.78 m person should measure there — then both canvases can be
derived from the same ground truth. That is a content-schema change plus a compositor
change, not a constant tweak, which is why it is scoped separately.

### 8.5 Shipped-but-never-drawn assets

Because every *scheduled* pack takes the `coherentPanorama` branch, only **two of the six files per
zone** ever reach the screen: `fallback.webp` (the panorama) and `ground-1.webp` (the
strip from §8.3). Everything else is generated, shipped, and in most cases actively
downloaded — because the `preload` and `preloadGroups` lists still name the old layer
URLs — but never drawn.

Measured on Tbilisi (`public/scenes/tbilisi/v1/`):

| Category | Size | Status |
|---|---:|---|
| `fallback.webp` + `ground-1.webp` × 5 zones | **1.14 MiB** | rendered |
| `distant.webp`, `architecture.webp`, `ground-2/3.webp` × 5 zones | 1.74 MiB | never drawn, listed in preload groups |
| 15 prop WebP files | 1.36 MiB | never drawn (props are disabled on this branch) |
| **Unrendered total per city** | **3.10 MiB** | |

Separately, `public/traveler/production/v2/` ships **1.51 MiB** of sprite frames
(8 walk + 16 action). Of those, only `actions/idle.webp` is actually used — as the
placeholder shown while the GLB downloads — plus `walk/walk-1.webp`, which the critical
preload list still fetches. The other 22 frames are deployed but unreachable.

So roughly **3 MiB per city plus 1.4 MiB of sprites** is currently dead weight. Cleaning
it up is a straightforward win, but it should happen *after* the render path in §8.3–8.4
is settled, since some of those layers may be wanted again.

### 8.6 Zone clock, budgets and quality tiers

- `routePositionAt(pack, seconds)` → `{ zoneIndex, zoneId, zoneElapsedSeconds,
  zoneProgress, distance }`, looping over the summed zone durations.
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

### Tables (10 forward migrations)

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

### Key RPCs

`record_presence_heartbeat` → `_v2` → `_v3` (the walking rule),
`submit_phase1_ballot`, `consume_mutation_rate_limit`, `reserve_sponsor_slot`,
`aggregate_sponsor_metrics`, `enforce_sponsorship_transition`, `claim_operation`,
`reconcile_phase2_state`, `cleanup_phase2_retention`, `journey_story_now`,
`read_journey_runtime_v3`, `read_bootstrap_bundle_v3` / `_v4` (one-call bootstrap with
atomic admission control), `set_country_notification_opt_in`.

All of them are `security definer`, revoked from `anon` and `authenticated`, and granted
only to `service_role`. The browser never talks to these directly.

### Route handlers (17)

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
POST /api/observability/vitals
GET  /api/admin/preview/[packId]    protected non-production pack preview
POST /api/admin/preview/session     expiring signed HTTP-only preview session
```

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

### Daily rollover

`GET /api/cron/rollover` claims an idempotent `rollover:<YYYY-MM-DD>` operation in
`operation_ledger`, then runs `reconcile_phase2_state` (advance the country-day, close
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
  statements, 71.7 % branches and 93.9 % functions on the scoped coverage set. On the
  current `traveler-finalization-v2` branch the suite has grown to **37 files / 103
  tests, all passing** (verified by running `pnpm test`).
- Production build emits 31 routes on Next 16.3.3.
- `content:validate`: 16 registered packs, 717 uniquely owned scene assets.
- Playwright: 30 active desktop/320 px tests plus opt-in rehearsal/soak/recording specs.
  Coverage includes shared presence across two browser contexts, accessibility, the
  no-WebGL fallback, stop/resume, the encounter, full and reduced motion, 320 px bounds,
  closed vote results, bootstrap reconnect, and same-page postcard rollover.
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
| `POSTCARD_UNLOCK_SECONDS` | 60 | Contribution needed for a postcard |
| `POSTCARD_RETENTION_DAYS` | 365 | Postcard expiry |
| `SPONSOR_RESERVATION_MINUTES` | 30 | Slot hold during checkout |
| `SPONSOR_PAYMENT_PROVIDER` | `lemonsqueezy` | Or `fixture` |
| `PHASE2_REHEARSAL_SCALE` | 144 | Story-clock multiplier, rehearsal only |

Hard rules stated in the repository and worth repeating: never use the analytics
provider as the live presence source, and never expose `SUPABASE_SECRET_KEY` or
`VISITOR_HASH_SECRET` to browser code.

---

## Appendix — the ten-second orientation

- **One number** (`journey_runtime.global_active_seconds`) drives everything, and it only
  grows while someone is watching.
- **One pure function** (`travelerMotionAt`) turns that number into a pose, a distance
  and a zone — which is why every viewer sees the same frame and reloads are free.
- **One skeleton** (`traveler.glb`, 52 joints, 15 clips, 6 face morphs) performs every
  action; only clip weights, face weights and hand-socket props change.
- **Two art pipelines.** Phase 2 cities (including Tbilisi) have five separate master
  paintings; Phase 3 cities have one master cropped five ways. Either way only two of the
  six derived files per zone are actually drawn.
- **The character is a work-in-progress candidate**, and the world compositor still has a
  duplicated ground layer and no shared ground truth between the painted pavement and the
  character's feet.
