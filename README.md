# Keep Him Walking

A synchronized premium 2D internet journey: one traveler, one shared country-day, and walking that advances only while at least one visitor is actively watching.

The Phase 1 truthful shared-state slice and Phase 1.5 Tashkent continuous-world proof are the completed technical baseline. Phase 2 is planned but remains gated by the external-test, physical-device and product-owner criteria in `implementation-plan.md`; no Phase 2 feature code has started.

## Local setup

1. Install Node.js 22 and pnpm 11.
2. Copy `.env.example` to `.env.local` and add Supabase/Vemetric values. The visual experience still runs in an explicitly labeled offline preview when services are absent.
3. Install packages with `pnpm install`.
4. Choose one database workflow:

   - Hosted Supabase (no Docker): run `pnpm db:lint:remote` and `pnpm db:test:remote` against `SUPABASE_DB_URL` after migrations are applied.
   - Local Supabase: install Docker-compatible container tooling, then run `pnpm db:start` and `pnpm db:reset`.

5. For a reversible preview, use `pnpm seed:phase15:preview -- --starts-at 2026-09-01T10:00:00+05:00`; remove only that guarded preview seed with `pnpm reset:phase15:preview`. Use `pnpm seed:phase1 -- --starts-at <timestamp>` only for a separately approved production launch.
6. Start the app with `pnpm dev`.

## Verification

Run `pnpm verify` for lint, type checking, unit tests and production build. `pnpm verify:phase15` adds hosted-database, browser, country-pack and asset-budget checks. `pnpm verify:phase1.5` additionally runs the real-time ten-minute soak. Generate the desktop/mobile motion evidence with `pnpm motion:record`; its evidence-only fixture compresses zone duration while the production pack remains at 120 active seconds per zone.

Docker is optional for this repository. The configured hosted Supabase project plus the direct `pg` verification scripts covers the current database gate. Podman or a native PostgreSQL installation can also host a local database, but neither is required for the hosted workflow.

Never use Vemetric as the live presence source, and never expose `SUPABASE_SECRET_KEY` or `VISITOR_HASH_SECRET` to browser code.
