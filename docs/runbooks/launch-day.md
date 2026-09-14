# Season 1 launch day

Production remains launch-disabled until both prompts are reviewed. The canonical site is
`https://keephimwalking.com`, Day 1 uses the reviewed `paris-v3` pack, and the day boundary
remains 16:00 UTC. The one scheduler is the existing cron-job.org minute job calling
`POST /api/cron/reconcile`; do not add another scheduler.

## Prepare the clean Production project

Create `.env.production.local` locally (it is ignored) with these exact names:

```dotenv
PRODUCTION_SUPABASE_PROJECT_REF=<new-production-project-ref>
NEXT_PUBLIC_SUPABASE_URL=<new-production-project-url>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<new-production-publishable-key>
SUPABASE_SECRET_KEY=<new-production-secret-key>
SUPABASE_DB_URL=<new-production-direct-or-pooler-url>
```

The guarded commands refuse the known Development and Preview project references and
require the public URL, database URL and explicit reference to agree. They print a project
reference, never a credential.

```sh
pnpm production:db:plan
pnpm production:db:apply
pnpm production:db:test
pnpm production:db:lint
pnpm production:seed --launch-at <YYYY-MM-DDT16:00:00Z>
pnpm production:seed --launch-at <YYYY-MM-DDT16:00:00Z> --apply
```

Run the seed first without `--apply`. Confirm it names `paris-v3`, the intended timestamp,
30 days, four name choices and seven founding slots. Before applying, inspect Production
for genuine customer data. The seed must begin with zero distance, viewers, votes and
sponsors; never copy rehearsal rows.

Map the same Production project into Vercel Production only: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` and `SUPABASE_DB_URL`.
Keep `LAUNCH_ENABLED` and `PHASE2_ENABLED` absent or false. They are read by the deployed
server process, so changing either Vercel environment variable requires a redeploy.

## Verify prelaunch

1. Deploy the reviewed commit with launch flags disabled.
2. Confirm `/api/health` names the intended release, clean database, `paris-v3` content,
   asset origin and disabled launch.
3. Confirm `/api/bootstrap` answers 200 with `"mode": "prelaunch"` and
   `"prelaunch": {"startsAt": null, "seasonNumber": 1}`, and exposes no rehearsal counts,
   votes or sponsors. The page reads "Paris · Preview" and "Season 1 is preparing to begin.";
   the traveler faces the viewer and says his first line about five seconds after he loads.
   A 503 here is a real fault, never the prelaunch state.
4. In cron-job.org, confirm the only enabled minute job targets
   `https://keephimwalking.com/api/cron/reconcile`, sends the bearer secret, and recent
   authenticated runs are 200. Before launch its response must be a safe no-op; a 200 by
   itself does not prove the database identity.
5. Check Terms, Privacy and refund/cancellation text. Add a real monitored contact route
   before offering paid sponsorship.

## Activate and roll back

At 15:30 UTC confirm the intended deployment and two physical phones. At 15:40 confirm
health and the stored 16:00 UTC timestamp. At 15:55 confirm reconcile is healthy and
weather is fresh if enabled. Set both launch flags true in Vercel Production and redeploy
before 16:00. At 16:00 verify Paris Day 1, one confirmed visible watcher, natural walking,
the name vote and no rehearsal totals before publishing.

Stop for a false live count, prelaunch progress, wrong pack/database, payment security
issue, error rate above 1%, p95 above 800 ms for five minutes, or a critical phone or
accessibility regression. To roll back, set both Production launch flags false and
redeploy the last known-good commit. Do not delete or reseed the database.

## Owner-only prerequisites

### Production database mapping

**WHAT:** `tkntxptfhmjnqaaveddx` is Development/local rehearsal and
`pqtfhkiftiubwuwxnuzd` is Production for `keephimwalking.com`.

**WHAT HAPPENS:** If Vercel Production points to `tknt…`, the public site can expose or
advance local rehearsal data; if local tools point to `pqtf…`, local testing can mutate
Production.

**WHAT TO DO:** Keep `.env.local` on `tknt…` and `.env.production.local` on `pqtf…`.
Scope the four Supabase variables in Vercel Production to `pqtf…`; use `tknt…` for local
rehearsal. Never copy a completed rehearsal journey into Production.

### Monitored contact route

**WHAT:** No public support contact is configured, and the repository must not invent one.

**WHAT HAPPENS:** If nothing changes, paid sponsorship must stay off because visitors
cannot reliably ask about privacy, refunds or sponsorship.

**WHAT TO DO:** Choose an inbox you actively monitor and configure it as the public contact
before enabling paid sponsorship; the free viewing launch can proceed without payments.

### Physical-phone acceptance

**WHAT:** Real phone smoothness and touch behavior cannot be established by emulation.

**WHAT HAPPENS:** If nothing changes, the candidate must not be declared phone-approved.

**WHAT TO DO:** Before activation, use iPhone/Safari and Android/Chrome for five minutes
each; open every modal, watch an encounter and reject launch if controls overlap or motion
stutters.
