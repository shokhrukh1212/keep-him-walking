# Phase 2 implementation evidence

Updated: 2026-09-02. Branch: `phase-2-seven-day-mvp`. Public launch and Phase 3 remain out of scope.

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
| `pnpm db:lint:phase2` | Pass: hosted schema lint reports no findings. |
| `pnpm db:test:phase2` | Pass: Phase 1 10/10, Phase 1.5 4/4 and Phase 2 24/24 pgTAP assertions, including RLS, grants and storage policy coverage. |
| `pnpm verify:phase2:code` | Pass: lint/typecheck clean; 20 files and 55 tests pass; 84.11% statements, 71.69% branches, 93.87% functions and 86.93% lines; production build emits 22 routes. |
| `pnpm content:validate` | Pass: 9 registered rollback/current packs and 402 uniquely owned scene assets; six packs are truthfully labeled private-preview only. |
| `pnpm assets:report:phase2` | Pass: shared traveler transfer 0.69 MiB; country transfers 4.13–5.22 MiB; largest decoded zone 25.2–25.7 MiB, below repository limits. |
| `pnpm test:e2e` | Pass: 14 active desktop/mobile cases and 10 intentional opt-in/device duplicates skipped. Includes shared presence, accessibility, no-WebGL, stop/resume, encounter, full/reduced scenes, 320px bounds, seven distinct static packs and closed vote results. |
| `pnpm motion:record:phase2` | Pass: two 72-second production-sprite proofs plus seven checkpoints per device. Frame review caught and fixed an oversized sponsor-layer selector; rerun proves a patch width below 25% of traveler width. |
| Deterministic sponsor fixture | Pass before final reseed: approval/presentation, aggregation, cancellation, refund and emergency removal; zero Lemon webhook-ledger writes. It is not real-provider evidence. |

## Motion evidence

| Target | Video | Bytes | SHA-256 |
|---|---|---:|---|
| Desktop 1440×900 | `artifacts/phase2-motion-v1/phase2-record-Phase-2-production-sprite-motion-proof-desktop-proof/video.webm` | 10,962,109 | `9cf3da65d0bb4a3bbc6f2a5a256cae94267711446eb7c2c89c7e27941fd8db73` |
| Emulated iPhone 13 | `artifacts/phase2-motion-v1/phase2-record-Phase-2-production-sprite-motion-proof-mobile-proof/video.webm` | 11,084,197 | `9ab6ef552c54d53f3f48ed543a69407f6e9a6360bbab2f77005789eeac7fee2f` |

The checkpoint review covers five Tashkent zones, planted and airborne stride poses, stop/resume, encounter dialogue and NPC composition, ambient phone/photo/drink/wave actions, ground shadow, character/environment scale and the small runtime sponsor patch. The debug overlay during development-mode emulated-mobile video capture is not physical-device performance evidence; low- and mid-range phone budgets remain a product-owner device gate.

## Remaining Phase 2 gate work

- Deploy the corrected branch with its already configured branch-only Vercel Preview variables.
- Reseed a fresh reversible 144× seven-day run, rerun the fixture lifecycle, run `pnpm verify:phase2`, and complete `pnpm rehearse:phase2`.
- Record the final hosted transition/postcard/archive/vote/sponsor evidence, exercise reset, then restore a stable 1× private-preview seed.
- Run the five-minute desktop and ten-minute physical-phone product-owner checks. Do not claim physical-device/Core Web Vitals acceptance from browser emulation.

## Deferred launch blockers

- Lemon Squeezy test checkout.
- Webhook signature verification against real test-mode deliveries.
- Duplicate webhook delivery against Lemon Squeezy.
- Refund lifecycle against Lemon Squeezy.
- Live-mode configuration.
- Qualified local reviews for Dushanbe, Bishkek, Almaty, Baku, Tbilisi and Istanbul.

No real Lemon payment lifecycle is claimed. No Production environment variable, database, journey or launch date has been modified.
