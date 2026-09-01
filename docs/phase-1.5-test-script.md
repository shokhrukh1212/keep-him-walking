# Phase 1.5 Visual-Motion Test Script

Run this after `pnpm verify:phase1.5`. A static screenshot is not acceptance evidence.

## Automated evidence

1. Run `pnpm test:motion` for route, locomotion, encounter, intro, fallback and 320px coverage.
2. Run `pnpm test:motion:soak` and leave the browser unobstructed for the full ten minutes.
3. Run `pnpm motion:record`; retain both desktop and mobile `.webm` files from `artifacts/phase15-motion-v3/`. The recording fixture compresses each route zone to 20 active seconds so three or more transitions can be witnessed in 68 seconds; runtime code and production content stay at 120 active seconds per zone.
4. Run `REVIEW_PHASE15_VIDEO=1 pnpm exec playwright test tests/e2e/phase15-video-review.spec.ts --project=chromium` to extract actual WebM checkpoints under `artifacts/phase15-video-review-v3/` for review.
5. Record the commit, browser version, device tier, maximum object count, median FPS, p95 frame duration, decoded texture estimate and post-warm-up heap change in `docs/phase-1.5-results.md`.

## Manual desktop session

Open `/?debug=world` in a clean browser profile. Confirm the following without reloading:

1. The headline is prominent at entry, then becomes compact after seven seconds or the first walk transition.
2. The traveler follows `idle → start_walk → walk`; legs and arms alternate, feet meet the street, the body rises/falls, the backpack/hair follow through and the shadow changes with the gait.
3. Distant scenery, architecture and ground/foreground travel at visibly different speeds. New modules enter from the right and old modules leave on the left.
4. Observe arrival boulevard, mahalla street and Chorsu market connect without navigation, a blank frame or a loading message.
5. During the chef event, confirm notice, deceleration, approach, camera focus, greeting, talk/listen/react, goodbye, camera restoration and resumed walking. Dialogue remains selectable semantic HTML.
6. Background the final active tab. After the configured presence TTL, confirm slow walk, stop and rest without route progress. Return to the tab and confirm resume walk before the normal gait.
7. Enable reduced motion. Confirm continuous camera travel stops and the current zone, rule, event and dialogue remain understandable.

## Physical-phone evidence

Repeat on at least one low-range and one mid-range phone. Record device, OS/browser, viewport, connection, quality tier, median FPS, p95 frame duration, peak objects, decoded texture estimate, heap change, orientation/safe-area defects and whether audio starts only after opt-in.

## Passing gate

- Three or more connected Tashkent zones are observed and no obvious short loop appears in ten minutes.
- Low tier meets 30 FPS median/p95 ≤50 ms and ≤80 objects; mid tier meets 50 FPS median/p95 ≤33 ms and ≤140 objects.
- Heap growth after warm-up is ≤25 MiB and no object count grows monotonically.
- Watcher stop/resume and the entire encounter sequence pass.
- No critical truthfulness, synchronization, accessibility, mobile or visual-motion defect remains.
- Product owner approves the video/manual proof before Phase 2.
