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

## CDN activation (13 September 2026)

Files are in `cdn-activation/`. `pnpm assets:verify --pack paris-v3 --base
https://assets.keephimwalking.com --origin https://keephimwalking.com` passed 95/95.
The traveler model, its animations and both residents on the CDN match the local files
(MD5 equals the R2 ETag).

**Pre-deploy run.** A local production build of `b16cad9` was built with
`ASSET_BASE_URL=https://assets.keephimwalking.com` and opened in Chromium as
`https://keephimwalking.com`. Setup:
- **Local.** Documents, bundles and `/api/*` were routed to the local build, using the
  development Day 2 authority.
- **Real CDN.** Every `assets.keephimwalking.com` request went to the real CDN, so CORS
  was tested against the real R2 rule.
- **Real watcher.** The browser was a real watcher and advanced the shared development
  journey.

| File | What it shows | Produced by |
|---|---|---|
| `cdn-live-probe-390.json` | 390×844 at scale 1.5, 16/16 checks. Live bootstrap is Day 2 Paris `paris-v3`: 14 conversations, pixi renderer, traveler ready and the painting `ready` from the CDN. Ten place dots show. The Journey, Sponsor, Vote and Watchers modals opened and closed with the world mount count unchanged. A 7.5-minute watch covered a place change from `paris-lanes` to `paris-market`, and only those two places were requested, with at most 2 places and 6 textures held. It also covered a scheduled conversation with Inès, 21 heartbeats (all 200) and 12 CDN responses (all 200, `Access-Control-Allow-Origin: https://keephimwalking.com`). No same-origin asset requests, failed requests or CORS/CSP errors occurred | `cdn-probe.mjs` |
| `cdn-live-settled-390.png`, `cdn-live-conversation-390.png`, `cdn-live-journey-modal-390.png` | The same run: walking at Canal Saint-Martin, Inès speaking, and the ten-place Journey modal | `cdn-probe.mjs` |
| `cdn-live-probe-1440-crash.json` | 1440×900 at scale 1. The CDN checks passed until the renderer process crashed 11.3 s after loading `paris-market/city-full-3600` | `cdn-probe.mjs` |
| `sameorigin-probe-1440.json` | The same commit rebuilt with `ASSET_BASE_URL` empty, 1440×900 at scale 1. The renderer did not crash in roughly 40 s. The run ended on the probe's own sound-button selector, since fixed, so modals and sound were not reached. Same-origin and CDN checks fail by design here | `cdn-probe.mjs` |

Desktop is **not verified** with the CDN. With CDN assets, the renderer crashed in all
three 1440×900 runs, within 12 s of the 3600 px painting:
- the headless shell at scale 1.5
- full Chromium at scale 1.5
- full Chromium at scale 1.0

Same-origin assets did not crash in one run. The evidence is SwiftShader on a 7.6 GiB
WSL machine, not a physical desktop, so it points to a risk rather than proving a
defect. The sound toggle was not exercised in the pre-deploy runs; see the deployed-site
run below.

**Deployed site (commit `82e517a`).** Production deployment
`dpl_vDHQz11iCJR6A5Kc8oG47vaAG89y` is aliased to `keephimwalking.com` and `www`.
- **Health.** `/api/health` returns `ready` with 18 registered packs.
- **Bootstrap.** `/api/bootstrap` returns 503 `NO_ACTIVE_DAY`, because Production has
  neither `PHASE2_ENABLED` nor `LAUNCH_ENABLED` set.
- **Cron.** `/api/cron/reconcile` returns 403 without `CRON_SECRET` and 200 with it; the
  200 run reported a duplicate rollover for `2026-09-12T16:00Z`.
- **Bundle.** The client bundle contains `https://assets.keephimwalking.com`.

These runs opened the deployed site directly, with no routing (`DIRECT=1`):

| File | What it shows | Produced by |
|---|---|---|
| `deployed-probe-390.json`, `deployed-settled-390.png`, `deployed-journey-modal-390.png` | 390×844 at scale 1.5, the Preview-only fallback (Paris v2 arrival). Pixi renderer, traveler ready, painting ready. The traveler, its animations and the painting all came from the CDN; every response was 200 with `Access-Control-Allow-Origin: https://keephimwalking.com`. No same-origin asset requests, failed requests or CORS/CSP errors. Journey and Sponsor modals opened and closed with the world mount count unchanged. Expected failures: the Preview-only banner, not ten place dots (the fallback is Paris v2), and no vote chip (no ballot) | `cdn-probe.mjs` |
| `deployed-probe-1440.json`, `deployed-settled-1440.png`, `deployed-journey-modal-1440.png` | 1440×900 at scale 1: the same checks, plus the sound toggle turning on. The renderer did not crash with the Paris v2 fallback painting; the crashes above were seen only with Paris v3 3600 px paintings | `cdn-probe.mjs` |

One 404 appeared in the browser console during these runs, without a recorded URL. A
separate 25-second pass on the live site saw only the expected `/api/bootstrap` 503.
