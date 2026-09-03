# Phase 2 implementation evidence

Updated: 2026-09-04. Branch: `phase-2-seven-day-mvp`. Public launch and Phase 3 remain out of scope.

## Delivered preview surface

- Migrations `004`–`006` are applied only to isolated Supabase project `pqtfhkiftiubwuwxnuzd`. The guarded environment preflight confirms all four project identities differ from `.env.local` without printing values.
- Seven schema-v3 packs provide five independently illustrated zones each, five canonical story beats, unique scene ownership, country NPC variants, ambience, postcards, preload groups and explicit cultural-review metadata.
- The current production path is the versioned sprite manifest. It provides every required action, planted-foot metadata, shadows, fallbacks, two reusable NPC base systems and a separately transformed sponsor patch. The valid Rive adapter remains optional; no placeholder `.riv` files exist.
- Postcards, opaque public share routes, Open Graph metadata, archive/passport, sponsor inventory, review/scheduling/removal, first-party sponsor metrics and the deterministic **TEST PAYMENT — NO MONEY** adapter are implemented.
- Preview reset enumerates and deletes only the guarded journey's exact postcard and sponsor object paths before deleting that preview journey. It cannot select a Production journey.

## Recorded verification

| Command | Result |
|---|---|
| `pnpm phase2:preflight` | Pass: isolated project ref `pqtfhkiftiubwuwxnuzd`, fingerprint `4af19e174f99`; no secret values printed. |
| `pnpm phase2:db:apply` | Pass: baseline `001`–`003` and Phase 2 `004`–`006` applied to the initially empty isolated preview only. |
| `pnpm verify:phase2` | Pass on 2026-09-04: the exact command completed lint, typecheck, 21/21 test files (56 tests), production build, content/assets, isolated preflight, remote schema lint, 38 pgTAP assertions and the combined desktop/mobile E2E suite. |
| `pnpm db:lint:phase2` | Pass: hosted schema lint reports no findings. |
| `pnpm db:test:phase2` | Pass: Phase 1 10/10, Phase 1.5 4/4 and Phase 2 24/24 pgTAP assertions, including RLS, grants and storage policy coverage. |
| `pnpm verify:phase2:code` | Pass: lint/typecheck clean; 21 files and 56 tests pass; 84.11% statements, 71.69% branches, 93.87% functions and 86.93% lines; production build emits 22 routes. |
| `pnpm content:validate` | Pass: 9 registered rollback/current packs and 402 uniquely owned scene assets; six packs are truthfully labeled private-preview only. |
| `pnpm assets:report:phase2` | Pass: shared traveler transfer 0.69 MiB; country transfers 4.13–5.22 MiB; largest decoded zone 25.2–25.7 MiB, below repository limits. |
| `pnpm test:e2e` | Pass: the combined desktop/mobile suite covers shared presence, accessibility, no-WebGL, stop/resume, encounter, full/reduced scenes, 320px bounds, seven distinct static packs, closed vote results, bootstrap reconnect and same-page postcard rollover. |
| `pnpm motion:record:phase2` | Pass: two 72-second production-sprite proofs plus seven checkpoints per device. Frame review caught and fixed an oversized sponsor-layer selector; rerun proves a patch width below 25% of traveler width. |
| `pnpm rehearse:phase2:staged` | Pass post-fix in 2.9 minutes: the self-restoring guarded runner traversed Tashkent → Dushanbe → Bishkek → Almaty → Baku → Tbilisi → Istanbul; submitted seven votes, created seven distinct postcards, verified six completed/stamped archive cards, public metadata, sponsor disclosure/redirect, offline recovery and full/reduced motion. Exact functional summary: `docs/phase-2-staged-rehearsal.json`. |
| `pnpm phase2:smoke-rollover -- --apply` | Pass: reconciliation reached the completed state after staged Day 7 and changed the final country-day state exactly once. |
| Preview rollback and stable reseed | Pass: every canonical/staged attempt removed only its exact guarded journey and scoped objects. The post-fix staged pass removed 16 scoped objects and restored a fresh reversible seven-day seed at 1× from `2026-09-03T09:11:00Z`. No Production row or final launch date was changed. |
| Long canonical observation | Route/motion/event evidence pass: 4,040,358 ms uninterrupted, all seven cities in order, 505–612 observed seconds and 4–5 zones per city, 14 traveler states, encounter/action cadence, seven votes, sponsor disclosure/redirect, offline recovery and both motion modes. The run exposed the same-page postcard state defect after all those assertions passed. `docs/phase-2-canonical-rehearsal.json` records the exact evidence; the fix then passed a dedicated same-page regression and the guarded seven-country postcard rehearsal. |
| `pnpm phase2:configure-vercel` | Pass: 23 values configured only for the `phase-2-seven-day-mvp` Preview branch; `productionVariablesModified:false` and no values printed. |
| Deterministic sponsor fixture | Pass before final reseed: presentation `live`, cancellation `cancelled`, refund `refunded`, emergency removal `cancelled`, one metric aggregate row and zero Lemon webhook-ledger writes. It is not real-provider evidence. |

## Motion evidence

| Target | Video | Bytes | SHA-256 |
|---|---|---:|---|
| Desktop 1440×900 | `artifacts/phase2-motion-v1/phase2-record-Phase-2-production-sprite-motion-proof-desktop-proof/video.webm` | 10,962,109 | `9cf3da65d0bb4a3bbc6f2a5a256cae94267711446eb7c2c89c7e27941fd8db73` |
| Emulated iPhone 13 | `artifacts/phase2-motion-v1/phase2-record-Phase-2-production-sprite-motion-proof-mobile-proof/video.webm` | 11,084,197 | `9ab6ef552c54d53f3f48ed543a69407f6e9a6360bbab2f77005789eeac7fee2f` |

The checkpoint review covers five Tashkent zones, planted and airborne stride poses, stop/resume, encounter dialogue and NPC composition, ambient phone/photo/drink/wave actions, ground shadow, character/environment scale and the small runtime sponsor patch. The debug overlay during development-mode emulated-mobile video capture is not physical-device performance evidence; low- and mid-range phone budgets remain a product-owner device gate.

## Remaining Phase 2 gates

- Run the five-minute desktop and ten-minute physical-phone product-owner checks. Do not claim physical-device/Core Web Vitals acceptance from browser emulation.
- Product-owner approval remains open. Phase 3 must not begin before that approval.

The deployment also exposed and verified a live-data regression fix: `src/lib/bootstrap/server.ts` now names `sponsorships_slot_id_fkey` explicitly. Without it, PostgREST's second slot/sponsorship relationship made valid live fixtures appear unsponsored. The corrected protected Preview deployment passed the staged sponsor disclosure and redirect checks.

The long observer exposed and drove two production fixes: bootstrap refresh now retries continuously after transient failures, and postcard UI state resets when `countryDayId` changes without navigation. Rehearsal-only seeds scale event durations so encounters remain observable at 144× and install only the disclosed no-money sponsor fixture. The canonical/staged wrapper always restores the original stable preview clock in `finally`.

## Deferred launch blockers

- Lemon Squeezy test checkout.
- Webhook signature verification against real test-mode deliveries.
- Duplicate webhook delivery against Lemon Squeezy.
- Refund lifecycle against Lemon Squeezy.
- Live-mode configuration.
- Qualified local reviews for Dushanbe, Bishkek, Almaty, Baku, Tbilisi and Istanbul.

No real Lemon payment lifecycle is claimed. No Production environment variable, database, journey or launch date has been modified.
