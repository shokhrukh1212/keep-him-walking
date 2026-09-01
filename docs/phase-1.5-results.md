# Phase 1.5 Visual-Motion Results

Status: **Automated implementation, coherent-scene visual review, real-time soak and recorded video review are complete and approved for promotion to `main`. Physical-device, external-comprehension and product-owner gates remain open, so Phase 2 feature work is blocked.**

Preview deployment: `https://keep-him-walking-49iiwola2-shokhrukh-karimovs-projects.vercel.app` (Vercel deployment `dpl_D5ALsmPChNvj9Cs8EwFQjxBRVdX7`, Preview scope). Promotion does not seed a production launch date and does not convert this preview seed into production data.

## Automated results

| Evidence | Result |
|---|---|
| Versioned country pack | Live `tashkent-v3` pack with five distinct coherent panoramas, feathered moving ground, illustrated prop depth tracks, zone audio/event stages and postcard art; v2 remains rollback-only |
| Route/motion unit tests | Complete repository suite passes 10 files and 23 tests |
| Remote database | Supabase schema lint passed; Phase 1 (10) and Phase 1.5 (4) pgTAP assertions passed on 2026-09-01 |
| Browser matrix | Eight active cases pass with eight intentional duplicate-project/opt-in skips: desktop and 320px layout/accessibility, shared presence, no-WebGL fallback, full/reduced-motion scene checks, stop/rest/resume and the NPC encounter |
| Asset budgets | 4.38 MiB total v3 route transfer; 24.1 MiB complete decoded manifest per zone; low-tier renderer reports 15.8 MiB active textures, below its 96 MiB cap |
| Ten-minute soak | Pass: final promotion run had an 11.4-minute Playwright test body; ≥590 authoritative route seconds, five-zone cycle, <5 s rendered divergence, ≤80 live objects, no repeat inside the actual 12-segment window and ≤25 MiB post-warm-up heap growth |
| Desktop/mobile video | Two 68-second accelerated proof recordings passed; actual WebM frames were extracted and visually inspected at seven checkpoints per device |
| Reduced motion | Desktop and 320px captures retain the complete current Chorsu scene, correct route label, grounded static travel pose and semantic HUD/dialogue |

## Visual correction evidence

The final v3 renderer replaces v2's opaque horizontal architecture crops with one coherent non-looping 2,400×900 panorama per zone. Only feathered pavement tracks and transparent illustrated props move above it. The three motion-depth families are panorama, depth-scaled prop tracks and ground; props spawn to the right and are culled left from bounded pools.

Automated browser captures:

- `artifacts/phase15-visual-v3/desktop-arrival-full-motion.png`
- `artifacts/phase15-visual-v3/desktop-mahalla-full-motion.png`
- `artifacts/phase15-visual-v3/desktop-chorsu-full-motion.png`
- `artifacts/phase15-visual-v3/desktop-chorsu-reduced-motion.png`
- `artifacts/phase15-visual-v3/mobile-320-arrival-full-motion.png`
- `artifacts/phase15-visual-v3/mobile-320-mahalla-full-motion.png`
- `artifacts/phase15-visual-v3/mobile-320-chorsu-full-motion.png`
- `artifacts/phase15-visual-v3/mobile-320-chorsu-reduced-motion.png`

The inspected frames show the walk rig sharing the environment's painterly style. The character container no longer applies a whole-body lift; normalized frame baselines and the lowered scene anchor keep the planted foot on the pavement while the alternate foot swings. Reduced motion uses the grounded `stop` pose rather than freezing an airborne walk frame.

## Device and soak log

| Device/browser | Tier | Duration | Frame evidence | Objects | Texture/heap | Zones and events | Result |
|---|---|---:|---:|---:|---:|---|---|
| Headless Chromium (CI diagnostic only) | low | 11.4 min | Software-renderer liveness guard passed; not a physical-device FPS claim | ≤80 asserted | 15.8 MiB active / ≤25 MiB heap growth asserted | Full five-zone route cycle, rolling ground/prop signature guard | Pass; not a physical-device substitute |
| Playwright Desktop Chrome video | high | 68 s | Seven extracted WebM checkpoints visually reviewed | Bounded pool shown in diagnostics | 15.8 MiB active in recording | Mahalla, Chorsu and Plov; stop/rest/resume; chef encounter | Pass as visual proof; human approval pending |
| Chromium emulating iPhone 13 video | low | 68 s | Seven extracted WebM checkpoints visually reviewed | Bounded pool shown in diagnostics | 15.8 MiB active in recording | Mahalla, Chorsu and Plov; stop/rest/resume; chef encounter | Pass as emulation proof; physical device pending |
| Low-range physical phone | low | Pending | Pending | Pending | Pending | Pending | Pending |
| Mid-range physical phone | medium | Pending | Pending | Pending | Pending | Pending | Pending |

## Video evidence

Generated on 2026-09-01 with Playwright Chromium. The fixture shortens route zones to 20 active seconds so connected transitions can be observed in 68 seconds; production `tashkent-v3` remains at 120 active seconds per zone. These recordings demonstrate motion and composition but do not replace physical-phone measurements or product-owner approval.

| Proof | Path | Bytes | SHA-256 |
|---|---|---:|---|
| Desktop Chrome, 1440×900 | `artifacts/phase15-motion-v3/phase15-record-Phase-1-5-visual-motion-proof-desktop-proof/video.webm` | 7,829,457 | `923d8fc775007facbb16e1508046815c54a653c07d92f305ec8153629e99f236` |
| Chromium emulating iPhone 13 | `artifacts/phase15-motion-v3/phase15-record-Phase-1-5-visual-motion-proof-mobile-proof/video.webm` | 7,572,431 | `e8b673f8110abaf3b5e71a620b95344af4dbda8bb2a666901c0fdbe38e0ee67d` |

Actual video checkpoints are under `artifacts/phase15-video-review-v3/`. They were generated by the opt-in `phase15-video-review.spec.ts`, which loads each WebM directly, seeks to the evidence timestamps and draws decoded frames to canvas to avoid browser video-overlay screenshot limitations.

## Reversible preview seed

The preview was seeded at the user-approved `2026-09-01T10:00:00+05:00` (`2026-09-01T05:00:00.000Z`) and ends 24 hours later. It uses the guarded slug `keep-him-walking-phase15-preview`; the seed refuses to replace a journey with a different slug.

- Reapply/edit: set `PHASE15_PREVIEW_START_AT` locally or run `pnpm seed:phase15:preview -- --starts-at <ISO timestamp with offset>`.
- Remove: `pnpm reset:phase15:preview` verifies the preview slug before deleting the preview journey and cascading dependent preview rows.
- No final production launch date has been seeded.

## Gate decision

- [x] Coherent full-motion scenes and complete reduced-motion scenes pass automated desktop/320px visual checks.
- [x] Ten-minute visual/loop/object/heap soak passed.
- [x] Desktop and emulated-mobile recordings were generated and technically reviewed.
- [ ] Low-range physical-phone budget passed.
- [ ] Mid-range physical-phone budget passed.
- [ ] Full-motion video or witnessed manual session approved by the product owner.
- [ ] Original Phase 1 external comprehension gate (10–20 testers) passed.
- [ ] No critical defect remains after human/device testing.
- [ ] Product owner authorizes Phase 2.
