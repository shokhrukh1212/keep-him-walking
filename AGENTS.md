<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

HOUSE RULES for this repository (Keep Him Walking):
- Read docs/plan/*.md, PRODUCT.md and TECHNICAL.md before changing anything. TECHNICAL.md
  describes the code accurately as of 2026-09-06; trust it over assumptions.
- Authority stays in Postgres: journey_runtime is advanced only inside security definer
  RPCs under a row lock. The browser never calls RPCs. Never compute progress client-side
  except bounded extrapolation (≤ 60 s).
- travelerMotionAt / routePositionAt stay pure functions of authoritative inputs. New
  inputs are parameters, never side channels or module state.
- Never render a state the status line does not name. Never show a count or distance
  the server has not confirmed without labelling it "extrapolated" / "last confirmed".
- No free text from visitors is stored or displayed (the only exception is the private
  corrections queue in P20). Reactions are enums.
- Zod schemas in src/lib/content/schema.ts are the source of truth for packs; add
  defaults so existing packs keep validating.
- Keep pnpm verify green: lint, typecheck, unit tests, build. Add tests for every new
  pure function and every new RPC (pgTAP). Update TECHNICAL.md sections you change.
- THE DATABASE IS REMOTE. There is no local Docker, Supabase CLI stack or Postgres in
  this environment, so `pnpm db:reset` / `db:test` / `db:lint` cannot run and a
  migration is UNVERIFIED until it has been pushed to a real project. Finishing work
  that touches `supabase/migrations/` means, in this order:
    1. `pnpm db:push:remote` — lists local vs remote; confirm only your files are pending.
    2. `pnpm db:push:remote --apply` — applies them to the dev project (`.env.local`,
       ref `tkntxptfhmjnqaaveddx`). Never push to the preview project with `.env.local`;
       the preview project (`pqtfhkiftiubwuwxnuzd`) has its own env file and its own
       `phase2:db:apply` / `phase3` scripts, which refuse to run against `.env.local`.
    3. `pnpm db:test:remote` — every pgTAP suite must pass.
    4. `pnpm db:lint:remote` — must report `{"results":[]}`. An unused parameter or a
       shadowed name is a real finding, not noise.
  Report the migration numbers you applied and to which project ref.
- An applied migration is immutable. Never edit a file that has been pushed: fix it with
  the next numbered migration and say in its header what it corrects and why.
- Every pgTAP file's `plan(N)` must equal the number of assertions it runs. pgTAP reports
  a plan mismatch as a diagnostic, not a failure, so a wrong plan silently stops the
  suite from detecting a run that dies halfway. `pnpm db:test:remote` fails on it.
- Seed data expires. When `/api/bootstrap` returns 503 and the HUD falls back to
  "Offline preview", the usual cause is that the seeded `country_days` row has ended,
  not a code fault. Re-seed with `reset:phase15:preview` then `seed-phase1.ts --preview
  --starts-at <most recent 16:00Z>`; check before assuming a regression.
- Do not add dependencies unless the prompt names them. Do not add paid services.
- Small commits with clear messages. At the end, print: files changed, how to test
  manually, and anything you could not finish.
