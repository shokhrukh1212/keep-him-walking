# Keep Him Walking

A synchronized premium 2D internet journey: one traveler, one shared country-day, and walking that advances only while at least one visitor is actively watching.

Only the Phase 1 Tashkent vertical slice is implemented in this repository. Phase 2 remains gated by the external-test criteria recorded in `implementation-plan.md`.

## Local setup

1. Install Node.js 22 and pnpm 11.
2. Copy `.env.example` to `.env.local` and add Supabase/Vemetric values. The visual experience still runs in an explicitly labeled offline preview when services are absent.
3. Install packages with `pnpm install`.
4. Start Supabase with `pnpm db:start`, then run `pnpm db:reset`.
5. Seed an explicit global day with `pnpm seed:phase1 -- --starts-at 2026-09-01T00:00:00Z`.
6. Start the app with `pnpm dev`.

## Verification

Run `pnpm verify` for lint, type checking, unit tests and production build. With local Supabase and Playwright Chromium installed, run `pnpm verify:phase1` for the database and browser acceptance suite as well.

Never use Vemetric as the live presence source, and never expose `SUPABASE_SECRET_KEY` or `VISITOR_HASH_SECRET` to browser code.
