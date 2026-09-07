# Character authoring and preview

Run the app with `pnpm dev` and visit `/preview/characters`. This route is
available in local development and Vercel Preview, and returns 404 in Production.
Country packs and the published journey continue using their existing renderer.

## Rebuild

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

## Verification

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
