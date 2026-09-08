# Realistic character implementation

## Approved delivery

Preview-only Almaty proof: one realistic 3D traveler and one matching local
resident, using the existing scenery and journey semantics. The authoritative
traveler likeness is `public/traveler/temporary/v1/idle.webp`; the NPC reference
is `public/npcs/almaty/v1/neutral.webp`. Keep the traveler's face, dark curls,
teal overshirt, white T-shirt, tan cuffed trousers, shoes, watch and yellow pack.

Use one editable character model across actions and locations. Initial asset
spend is $0; show any proposed purchase and license before spending, with a
$5–$10 ceiling (superseded by the finalization master prompt). No additional NPC library before the two-person proof.

## Acceptance gates

1. Exported model likeness and deformation, inspected in the browser.
2. Full Almaty interaction and walk, stop, greet, talk, listen, react, goodbye,
   drink, phone, photo and rest actions, inspected at normal and quarter speed.
3. Shared timing, contact/attachment checks, reload/interruption/reduced motion,
   asset budgets, resource cleanup and code verification.

Passing automated checks does not approve anatomy or naturalness. Do not enable
the new model on the main journey or describe it as finished before the actual
exported model passes visual review. Do not substitute a primitive mannequin,
an unrelated stock face, or separately generated 2D action images.

## Implementation status

**Incomplete: v1 was rejected and v2 has not met the visual target.** It is
inspectable at `/preview/characters` in local development and Vercel Preview.
It is blocked from Production by the route's server-side gate, as required.
No country pack, shared journey state, payment data or deployed app was changed.

Implemented:

- Three.js GLB renderer, PBR lighting, shadows and a common standing scale.
- One skinned traveler and one skinned Almaty resident, with packed editable
  Blender sources. All actions use those same meshes and skeletons.
- Eleven authored, baked 30 Hz clips: idle, walk, greet, talk, listen, react,
  goodbye, drink, phone, photo and rest. These are not motion-capture clips.
- A local two-person encounter timeline, complementary speaker/listener roles,
  facial morph controls, deterministic seeking and short clip crossfades.
- Hand/finger prop sockets, traveler backpack and watch, and a physical stool.
- Action/view selection, pause/play, quarter speed, timeline scrub, studio and
  existing Almaty backgrounds, resident toggle and original identity reference.
- Reduced-motion selections stay paused. The original reference is shown while
  loading or unavailable. Hidden tabs stop local review time; reload disposes
  the previous renderer. Context loss/restoration has explicit handling.
- Asset optimization, binary/clip/budget checks, source checksums, and shipped
  component credits. Acquisition cost remains **$0**.

The following v1 inspection notes are historical. The user's subsequent
screenshots rejected the claimed visual improvements; they must not be read as
evidence that likeness, deformation, or prop contact passed.

Visual checks and remaining work:

- Inspected actual browser frames of standing, walking, greeting, the paired
  encounter, drinking, phone/photo, sitting and emulated mobile layout.
- Corrected transparent-skin depth sorting, support-leg crouching, finger-axis
  assumptions, undershirt/outerwear intersections, exposed skin at garment
  seams, and a prop socket lookup that accidentally stripped digit suffixes.
- Replaced the fragmented copied-shirt construction with a complete skinned
  inner garment, added physical layer clearance, cleaned the waistline, reduced
  the stride, and calibrated a slimmer young-adult body and backpack.
- Verified visible two-hand phone/photo grip, bottle contact, greeting hand,
  balanced conversation stance and seated hand/foot placement in browser frames.
- The model is a realistic interpretation of the illustrated identity. Final
  likeness and motion acceptance still belongs to the visual reviewer; passing
  the technical checks below does not make that decision automatically.
- The two-person proof is a local review scene. It has **not** been integrated
  with Pixi environment movement or the existing shared `PresentationClock`.
  Published country manifests still select the existing renderer. Integration,
  broad rollout and Preview deployment remain undone behind the visual gate.
- No representative physical-phone 30 FPS or desktop 60 FPS claim is made.
  Browser checks run in headless Chromium and include emulated mobile only.
- No paid asset, external account dependency or Production deployment was added.

Verification is recorded below after the final checks. The reproducible workflow
is in `scripts/characters/README.md`; the asset license record is
`public/characters/v1/CREDITS.md`.

## Verification record

Verified on 2026-09-07 against the checked-in candidate assets:

- `pnpm lint`, `pnpm typecheck` and `pnpm build` passed with Next 16.3.3.
- Four focused test files passed: 12 tests covering timeline roles and duration,
  preview gating, motion timing and presentation timing.
- Both `.blend` files reopened in Blender 4.5.4 LTS with packed file textures and
  all 11 named actions.
- Both GLBs passed binary bounds, skeleton joint, face-control and clip-duration
  validation. Traveler: 4.03 MiB / 74,302 triangles. Resident: 3.39 MiB /
  65,052 triangles. Combined: 7.42 MiB of the 8 MiB budget.
- Headless browser checks passed for every action, deterministic seeking, the
  Almaty setting, paired encounter, mobile layout, reduced motion, reload,
  WebGL context loss/restoration, missing asset and unavailable WebGL fallback.
- Browser inspection images were reviewed for standing, the walk cycle, greeting,
  paired conversation, drinking, phone, photography and sitting. This records
  inspection coverage; visual acceptance remains the reviewer's decision.

## Research references

- https://static.makehumancommunity.org/about/license.html
- https://static.makehumancommunity.org/mpfb/docs/getting_started.html
- https://static.makehumancommunity.org/mpfb/docs/exporting.html
- https://static.makehumancommunity.org/mpfb/docs/exporting/export_copy.html
- https://static.makehumancommunity.org/mpfb/docs/rigging_posing/mixamo.html
- https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html
- https://github.com/Mesh2Motion/mesh2motion-assets
- https://threejs.org/manual/en/animation-system.html
