# P28 refinements — evidence

Recorded on 12 September 2026 against a local **production build** (`pnpm build`, `next start --port 3100`), opened as `http://localhost:3100` in headless Chromium with `deviceScaleFactor` 1.5. Frame timings come from software GL in a 7.6 GiB WSL machine. They are useful for comparing scenarios with each other, not as physical-device performance, and no physical phone was available.

All browser specs except the live probe mock the authority endpoints (`tests/e2e/helpers/journey-api.ts`). The live probe was a real watcher on the shared development journey.

| File | What it shows | Produced by |
|---|---|---|
| `journey-modal-<w>x<h>.png` | The Journey modal at 320×568, 390×844, 667×375, 768×1024 and 1440×900, with the scene behind it unchanged | `modal-continuity.spec.ts` |
| `modal-<w>x<h>.json` | Frame intervals while the modal opens, world mount count and presence sessions (always 1) | `modal-continuity.spec.ts` |
| `vote-modal-390x844.png` | The ballot as a modal | `modal-continuity.spec.ts` |
| `place-dot-popover-<w>.png`, `goal-info-<w>.png` | A tapped place dot and the marathon note, at 390 and 1440 px | `modal-continuity.spec.ts` |
| `scene-loading-<w>.json` | Rendition requests, transfer bytes per place, textures held and decoded bytes at each place change over three loops, and frame intervals through the first change | `scene-loading.spec.ts` |
| `painting-retry-keeps-last.png` | A place whose paintings fail: the last good painting stays, he keeps walking, and the status line names what is drawn | `scene-loading.spec.ts` |
| `painting-neutral-fallback-390.png` | No painting has ever loaded: neutral street, traveler still walking | `scene-loading.spec.ts` |
| `settled-<w>x<h>.png`, `desktop-1440-cold.png` | Cold and settled layouts at the target sizes | `launch-candidate.spec.ts` |
| `desktop-place-change.png`, `frames-desktop-1440.json` | A 7-minute place change, plus frame intervals for modal open/close, the place change and steady walking | `launch-candidate.spec.ts` |
| `conversation-390.png`, `mobile-motion-review.webm` | Short motion review: a modal, a place change and a conversation with Camille | `launch-candidate.spec.ts` |
| `live-dev-probe.json`, `live-dev-probe.png` | Six minutes on the real development journey, right after it was switched to `paris-v2`: heartbeats, server-scheduled stops (a greeting, a lean, the café conversation), status lines, painting loads and steady frames. It found two startup flaws: "You're offline" before the first heartbeat, and a first place loaded from the placeholder snapshot and then replaced | `live-probe.mjs` (scratch script, see the handoff) |
| `live-dev-probe-after-startup-fix.json`, `.png` | Three more minutes on the same journey after commit `a6752fe`, checking "Joining the walk…" and a single place download | `live-probe.mjs` |
| `measurements.json` | The numbers above in one place | Assembled from the files above |
