# Phase 3 implementation evidence

Status on 2026-09-04: implementation branch in progress; automated code/content/database/browser gates pass individually. Production is untouched. The public-launch human gate remains open.

## Implemented

- Additive migration 007 applied only to isolated Supabase project `pqtfhkiftiubwuwxnuzd`.
- Central distributed API limits and `Retry-After` semantics for high-risk/public endpoints.
- Sentry client/server/edge setup, Better Stack structured-log transport, correlation IDs, redaction, Web Vitals and `/api/health`. Missing vendor credentials remain no-op.
- Protected non-Production country-pack preview with expiring HTTP-only signed sessions.
- Content/budget CLI, guarded 1,000-watcher load harness and aggregate sponsor CSV export.
- English-first dictionary contract, allowlisted deterministic experiments, tomorrow preview, UTC `.ics` download and provider-gated revocable notification preferences.
- Seven unpublished editorial-buffer packs: Sofia, Belgrade, Zagreb, Ljubljana, Vienna, Bratislava and Prague. See `docs/phase-3-cultural-review.md`.
- Launch/incident/rollback/sponsor-removal/webhook-replay runbooks and launch metadata/error surfaces.

## Recorded verification

| Check | Result |
|---|---|
| `pnpm db:lint:phase3` | Pass; no schema findings on the isolated preview database. |
| `pnpm db:test:phase3` | Pass; 50 total pgTAP assertions: Phase 1 10, Phase 1.5 4, Phase 2 24, Phase 3 12. |
| `pnpm test:coverage` | Pass; 27 files and 65 tests. Scoped coverage remains 84.11% statements, 71.69% branches, 93.87% functions and 86.93% lines. |
| `pnpm lint` / `pnpm typecheck` | Pass without findings. |
| `pnpm build` | Pass; Next.js 16.3.3 emitted 31 static/dynamic routes. |
| `pnpm content:validate` | Pass; 16 registered packs and 717 uniquely owned scene assets. |
| `pnpm assets:report:phase2` | Pass; new packs are 2.70–4.00 MiB transfer and 24.5 MiB maximum decoded zone. |
| `pnpm test:e2e` | Pass; 28 active desktop/320px tests, 12 intentional opt-in skips, 7.2 minutes. |
| `pnpm load:phase3` | Dry-run guard pass; resolves 1,000 watchers, five scenarios, p95 <=800 ms and error-rate <=1% budgets without network mutation. Real Preview load evidence pending deployment. |

Development-server Web Vitals observed during the full browser suite are not representative production lab or field evidence and are not claimed as passing the mobile launch budget.

## Open before public launch

- Real guarded Preview load run and alert-delivery rehearsal.
- Named Sentry and Better Stack projects/recipients and their credentials.
- Physical low-/mid-range phone performance and motion evidence.
- Real Lemon Squeezy test-mode checkout, signed webhook, duplicate delivery, refund and live-mode configuration.
- Qualified local cultural review for the six Phase 2 provisional packs and all seven Phase 3 buffer packs before those packs publish.
- Product-owner acceptance of legal/contact copy and a separate explicit Production launch authorization.
