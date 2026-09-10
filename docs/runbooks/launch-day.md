# Season 1 launch day

The production switch and the Season 1 timestamp are intentionally unset in this
commit. Do not improvise a date: complete `docs/plan/AFTER-P22.md`, then replace every
`<...>` below with the reviewed production value.

## Before launch day

1. Confirm every precondition in `docs/runbooks/launch.md`, including the current
   1,000-viewer gate and a real test-mode payment/refund rehearsal.
2. Confirm the production scheduler is minute-accurate; D5 in
   `docs/plan/AFTER-P22.md` is a launch blocker until that is true.
3. Print the exact database write without applying it:

   ```sh
   pnpm seed:season1 --launch-at <YYYY-MM-DDT16:00:00Z>
   ```

4. Check that it says 30 days, `tashkent-v5`, 16:00 UTC, four name choices, and seven
   $29 founding slots. Then apply that same plan once:

   ```sh
   pnpm seed:season1 --launch-at <YYYY-MM-DDT16:00:00Z> --apply
   ```

5. Keep Production `LAUNCH_ENABLED=false`. Deploy the immutable launch commit and
   confirm `/api/health` reports the stored launch time, registered pack, providers,
   weather age and asset origin. A missing prelaunch weather reading becomes fresh
   after the 15:55 prewarm.

## 15:30–16:10 UTC

| UTC | Check |
|---|---|
| 15:30 | Confirm the production domain serves the intended commit. Set both `PHASE2_ENABLED=true` and `LAUNCH_ENABLED=true` in Production, redeploy, and confirm two phones show `Starts …`; neither phone may appear in a live count or move him. |
| 15:40 | Open `/api/health`. Database, content, payment/weather providers and the asset base must be ready. Confirm the stored launch time is today at 16:00 UTC. |
| 15:50 | Confirm `vercel.json` has `/api/cron/prewarm` at `55 15 * * *` and `/api/cron/rollover` at `0 16 * * *`. Confirm both jobs are enabled in the production scheduler. |
| 15:55 | Watch the prewarm invocation finish with HTTP 200. It must name `tashkent-v5` and report every requested asset and OG image ready. Recheck `/api/health`; weather must now be fresh. |
| 16:00 | Refresh both phones. The countdown must become Day 1 live in Tashkent with the name vote; the first ready, visible phone becomes one confirmed watcher and only then may he move. Publish the launch post from `docs/plan/06-LAUNCH-AND-GROWTH.md` §3. |
| 16:05 | Publish Show HN. On the phones, cast two different name votes and confirm each visitor keeps one vote, the public total is server-confirmed, and hiding one tab removes its lease after the server TTL. |
| 16:10 | Publish the five separate Reddit posts. Recheck `/api/health`, error rate, p95 latency, database connections, live leases and scene loading on both phones. Continue the launch-day schedule in §3. |

Stop immediately for a false live count, any prelaunch progress, a missing/wrong pack,
a payment security issue, error rate above 1%, p95 above 800 ms for five minutes, or a
critical phone/accessibility regression.

## Rollback

Disable the live runtime first, then redeploy Production:

```sh
printf 'false\n' | pnpm exec vercel env add LAUNCH_ENABLED production --force --yes
pnpm exec vercel deploy --prod
```

This leaves the database intact and returns Production to the non-live preview. Record
the incident and the deployment URL before changing anything else.

If only Tashkent v5 is wrong, keep the launch disabled and validate the guarded v4
switch without writing:

```sh
pnpm launch:switch-pack --day-id <country-day-uuid> --from tashkent-v5 --to tashkent-v4
```

After confirming that both registered versions are Uzbekistan, apply it and redeploy:

```sh
pnpm launch:switch-pack --day-id <country-day-uuid> --from tashkent-v5 --to tashkent-v4 --apply
pnpm exec vercel deploy --prod
```

Do not turn `LAUNCH_ENABLED` back on until `/api/health` and the two-phone prelaunch
check are green again.
