# P28 refinements — evidence

Recorded on 12–13 September 2026 against a local **production build** (`pnpm build`, `next start --port 3100`), opened as `http://localhost:3100` in headless Chromium with `deviceScaleFactor` 1.5. Frame timings come from software GL in a 7.6 GiB WSL machine. They are useful for detecting retention and continuity failures, not as physical-device performance, and no physical phone was available.

All browser specs except the live probe mock the authority endpoints (`tests/e2e/helpers/journey-api.ts`). The live probe was a real watcher on the shared development journey.

| File | What it shows | Produced by |
|---|---|---|
| `journey-modal-<w>x<h>.png` | The Journey modal at 320×568, 390×844, 667×375, 768×1024 and 1440×900, with the scene behind it unchanged | `modal-continuity.spec.ts` |
| `modal-<w>x<h>.json` | Frame intervals while the modal opens, world mount count and presence sessions (always 1) | `modal-continuity.spec.ts` |
| `vote-modal-390x844.png` | The ballot as a modal | `modal-continuity.spec.ts` |
| `place-dot-popover-<w>.png`, `goal-info-<w>.png` | A ten-place manifest, tapped dot and marathon note at 320, 390 and 1440 px; tapping does not move the shared traveler | `modal-continuity.spec.ts` |
| `scene-loading-<w>.json` | Rendition requests, transfer bytes per place, textures held and decoded bytes at each place change over three loops, and frame intervals through the first change | `scene-loading.spec.ts` |
| `painting-retry-keeps-last.png` | A place whose paintings fail: the last good painting stays, he keeps walking, and the status line names what is drawn | `scene-loading.spec.ts` |
| `painting-neutral-fallback-390.png` | No painting has ever loaded: neutral street, traveler still walking | `scene-loading.spec.ts` |
| `settled-<w>x<h>.png`, `desktop-1440-cold.png` | Cold and settled layouts at the target sizes | `launch-candidate.spec.ts` |
| `desktop-place-change.png`, `frames-desktop-1440.json` | A 7-minute place change, plus frame intervals for modal open/close, the place change and steady walking | `launch-candidate.spec.ts` |
| `conversation-resident-speaks-390.png`, `conversation-traveler-speaks-390.png`, `mobile-motion-review.webm` | Current reciprocal dialogue: the resident approaches from the right, each person waves/speaks alone, the other listens, the named bubble remains at left and the traveler stays centred | `launch-candidate.spec.ts` |
| `greeting-390.png` | Historical wordless-greeting capture from before the reciprocal choreography | Earlier `launch-candidate.spec.ts` run |
| `conversation-390.png` | Historical rejected capture from before pending dialogue was filtered; retained only to show the bug that was removed | Earlier `launch-candidate.spec.ts` run |
| `live-dev-probe*.json`, `.png` | Historical pre-repair probe retained as diagnosis: it exposed startup heartbeat flaws and that pending dialogue plus unintended solo actions could be scheduled. It is not current acceptance evidence | `live-probe.mjs` |
| `live-recovery.json` | Current dev recovery: expired Day 1 preserved, Day 2 created through the locked RPC, local rehearsal enabled, bootstrap 200/live and focused live/503 checks passing | `dev:prepare`, local production bootstrap and `review-repairs.spec.ts` |
| `measurements.json` | The numbers above in one place | Assembled from the files above |

The current core browser candidate is 19 passing cases across `launch-candidate`,
`modal-continuity` and `scene-loading`, plus two focused live/unavailable-state checks.
They were run in focused invocations because software rendering makes the two
three-loop cases take several minutes each.

The 13 September Paris v3 update reran the 15 `launch-candidate` and
`modal-continuity` cases. Fourteen passed in the combined run; the 320×568 Sponsor
case exposed the Next development indicator intercepting the button. After disabling
that indicator, the same case passed. The reciprocal dialogue case and all three real
ten-place dot cases passed. This is software-GL evidence, not a physical-phone result.

The four compatibility files Claude left unrun (`phase1`, `phase2-smoke`,
`waiting-first-watcher` and `traveler-correction`) were updated to the overlay-modal
and current renderer contract and run together: 10/10 passed. The no-WebGL case also
confirmed that a GPU failure selects the static painting while presence still counts
the online viewer; it no longer becomes a false internet/offline state.

On 13 September the owner accepted all Paris v3 paintings and dialogue. The source
review states were changed to approved, the generated pack records creator review, and
the live development Day 2 pack pointer was changed from Paris v2 to Paris v3 through
the guarded database RPC. CDN activation remains separate from this content approval.
