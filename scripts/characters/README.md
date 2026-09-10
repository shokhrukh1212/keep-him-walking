# Character authoring and preview

Run the app with `pnpm dev` and visit `/preview/characters`. This route is
available in local development and Vercel Preview, and returns 404 in Production.
Country packs and the published journey continue using their existing renderer.

## Rebuild

V2 is **work in progress**, not an accepted replacement. The served V2 currently
uses the project-authored procedural clips after the first CC0 retarget failed
visual inspection. Source takes remain available for isolated experiments.

Build experiments without altering the user's active preview:

```sh
.cache/character-authoring/tools/blender-4.5.4-linux-x64/blender --background --threads 4 --factory-startup --python scripts/characters/build_models.py -- traveler --v2 --staged --experimental-sources
node scripts/characters/check-actions.mjs --staged
```

Staged output stays under `.cache/character-authoring/staged/v2`. The browser
script substitutes that GLB only within its own isolated page. A build with
`--experimental-sources` requires `--staged`. Do not promote it because the
script reports no JavaScript errors: inspect all the images and playback.

`rebake_staged.py` reuses staged geometry for animation iterations and checks
that repeated pose sampling cannot accumulate translation. The first retarget
had both missing T/A rest-pose alignment and stale evaluated pose positions.

The checked-in `art/characters/v1/*.blend` files contain the model, skeleton,
packed textures and eleven editable actions. They can be edited without MPFB.
The following scripts reproduce their assembly from upstream source assets:

1. Use Blender 4.5.4 LTS, the MPFB 2.0.17 source archive, MakeHuman system assets,
   Pants 01, Shirts 02 and Hair 02 from the official sources in `sources.lock.json`.
   Verify archive SHA-256 values against that file.
2. Extract Blender under `.cache/character-authoring/tools/blender-4.5.4-linux-x64`
   and MPFB under `.cache/character-authoring/tools/mpfb2-2.0.17`. Extract the
   asset packs into `.cache/character-authoring/assets`, preserving their
   `clothes`, `hair`, `skins`, `eyes`, etc. directories.
3. Run these commands from the project root:

```sh
.cache/character-authoring/tools/blender-4.5.4-linux-x64/blender --background --threads 4 --factory-startup --python scripts/characters/build_models.py -- traveler
.cache/character-authoring/tools/blender-4.5.4-linux-x64/blender --background --threads 4 --factory-startup --python scripts/characters/build_models.py -- almaty-host
node scripts/characters/optimize-glb.mjs public/characters/v1/traveler.glb public/characters/v1/almaty-host.glb
node scripts/characters/report.mjs
```

The GLB optimizer preserves mesh and animation buffers and only resamples
textures. Alpha remains alpha. Geometry and skeletal clips require no external
runtime decoder or CDN. The optimized files can be served directly by Next.
All source acquisition and candidate authoring has cost $0.

## Mixamo takes (V3 candidate)

The traveler was uploaded to Mixamo from this rig, so takes are downloaded for
his own skeleton (FBX Binary, Without Skin, 30 fps, no keyframe reduction) into
`.cache/character-authoring/mixamo/downloads/traveler/`. A file is named after its
runtime clip (`walk.fbx`) or keeps a Mixamo name listed in `TAKES` in
`import_mixamo.py`. Raw downloads and the baked `.blend` stay in that ignored cache,
because Mixamo's terms forbid redistributing the files and this repository is public.

```sh
.cache/character-authoring/tools/blender-4.5.4-linux-x64/blender --background --factory-startup art/characters/v2/traveler.blend --python scripts/characters/import_mixamo.py -- traveler .cache/character-authoring/mixamo/downloads/traveler
node scripts/characters/compress-glb.mjs public/characters/v3/traveler-animations.glb
```

Mixamo returns the skeleton re-rested with level arms, while this rig rests with its
arms 49° down. The importer poses each bone onto the source rest before copying
motion, which avoids the arms-through-torso failure of the first retarget. Takes keep
their own length. Walk-type loops are resampled so the left foot lands at 0 s and the
right at 0.6 s. Travelling takes are held in place, and a single-frame pose is held
for one second. When a replacement take changes length, update its `CLIP_SPECS`
duration, and for `drink` or `phone` the windows in `props.ts`.

`public/characters/v3/traveler.glb` is a copy of the V2 model. **Files in
`public/characters/v3/` are the live character on the next deploy**, so review
them at `/preview/characters` before committing.

## Verification

The scoped interaction repair preserves checkpoint geometry and untouched clips.
To rebake its seven traveler actions and four resident actions, run Blender on
`art/characters/v2/traveler.blend` with `--python scripts/characters/rebake_interactions.py`,
and on `art/characters/v2/almaty-host.blend` with the same script plus `-- --resident`.
Outputs go to `.cache/character-authoring/action-review/v2`; optimize those two
GLBs with `optimize-glb.mjs`, then run `check-actions.mjs --interactions`.
After visual inspection, copy the two GLBs to `public/characters/v2` and the
editable sources to `art/characters/v2`. V1 assets remain the rejected comparison.

```sh
pnpm exec vitest run src/lib/characters
pnpm lint
pnpm typecheck
pnpm build
```

With the local server running on port 3114:

```sh
node scripts/characters/check-browser.mjs
node scripts/characters/check-actions.mjs
node scripts/characters/check-recovery.mjs
```

The browser scripts write individual temporary inspection images under `/tmp`.
They do not record videos or produce screenshot sheets. Their assertions check
loading, seeking, errors and layout; they do not establish visual acceptance.
Read `docs/realistic-character-implementation.md` for outstanding visual gates.

## Authoring boundaries

`animation.py` authors curves with analytic two-bone IK and exports baked
30 Hz clips. These are **not motion capture**. Fingers and expressive motion
need visual review. Mesh2Motion/Mixamo recordings were researched but are not
included. The runtime uses deterministic clip sampling, brief crossfades,
separate resident speech/listening roles, face morphs and hand-space prop sockets.

The scene clock is local review time. It is deliberately not wired into the
shared server journey while these candidate assets await acceptance. The existing
`PresentationClock` and route semantics must remain authoritative when integrating
the accepted models. Do not turn this local preview clock into a second journey
clock or enable these models by changing the country manifest prematurely.

License and attribution details are shipped with the models in
`public/characters/v1/CREDITS.md` and linked from the review controls.
