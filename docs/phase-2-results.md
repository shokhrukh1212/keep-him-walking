# Phase 2 implementation evidence

Updated: 2026-09-02. Branch: `phase-2-seven-day-mvp`.

## Implemented technical surface

- Additive migrations `004`–`006`: rehearsal/story clock, cross-tab contribution, postcards, sponsor/payment state, webhook and metric ledgers, operation claims, reconciliation, retention, and scoped storage.
- Seven schema-v3 packs in the approved route, each with five zones, five major beats, local-phrase metadata, explicit pending cultural review, unique runtime ownership, next-zone/next-country preload data, postcard data, NPCs, ambience, and production Rive manifest contract.
- 35 final environment masters and runtime derivatives. Asset report: 4.13–5.22 MiB transfer per pack; largest decoded zone 25.7 MiB, below the 96 MiB low-tier cap.
- Server-verified opaque postcards, public metadata/download page, archive, local anonymous passport stamps, hosted Lemon checkout, signed raw-body webhook, review-only activation, refunds/removal, sponsor redirect metrics, daily reconciliation, and guarded operational scripts.
- Stable Lemon provider-event identities reject checksum conflicts; failed/stale processing can be reclaimed, and paid status, sponsorship ID, slot ID, price, currency, and test/live mode are all revalidated server-side.

## Recorded local verification

| Command | Result |
|---|---|
| `pnpm verify:phase2:code` plus final bounded-body tests | Pass: lint and typecheck clean; 16 files/41 tests pass; covered Phase 2 domain scope reports 82.6% statements, 67.19% branches, 93.47% functions and 85.78% lines; production build emits 19 routes; all content and asset checks pass. |
| `pnpm content:validate` | Pass with seven explicit open-review notices: 9 rollback/current packs and 402 uniquely owned scene assets validate. |
| `pnpm assets:report:phase2` | Pass: 4.13–5.22 MiB transfer per Phase 2 pack and 25.2–25.7 MiB largest decoded zone, below the 5.5 MiB transfer and 96 MiB low-tier texture limits. |
| `pnpm test:e2e` | Pass: 12 active cases passed and 10 intentional opt-in/mobile duplicates skipped. Coverage includes shared presence, no-WebGL fallback, route/stop/resume, NPC encounter, full/reduced scenes, 320px layout and distinct complete reduced-motion environments for all seven Phase 2 packs. |
| `pnpm exec playwright test tests/e2e/phase2-smoke.spec.ts` | Pass: 4 desktop/mobile cases, including distinct complete reduced-motion environments for all seven packs. |
| `git diff --check` | Pass: no whitespace errors. |

The generated-art contact sheet is `artifacts/phase2/seven-pack-contact-sheet.webp`. It was visually reviewed for country/zone distinction and progression; it is not a substitute for the named cultural reviewers.

## Gates still open (must not be marked passed by automation)

- The named external cultural reviewer and approved disposition for all seven packs.
- Production traveler and two NPC `.riv` files plus recorded rig/ground-contact/mobile evidence.
- Lemon Squeezy $1 test checkout, duplicate webhook, approval, live placement, refund, and cancellation against a configured test account.
- Hosted migration/pgTAP execution against the isolated preview database.
- Full 70-minute accelerated rehearsal, low/mid-range physical-device budgets, Phase 1 comprehension evidence, and product-owner approval of the final motion proof.

`pnpm verify:phase2` and `pnpm rehearse:phase2` are therefore correctly still open. The local code gate passing does not imply provider, hosted-database, cultural, Rive, device or human acceptance.

No Phase 2 production launch date or production seed has been created.
