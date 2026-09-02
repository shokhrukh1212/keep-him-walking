# Phase 2 preview operations

Phase 2 is preview-only until every exit gate passes. `PHASE2_ENABLED` defaults to `false`. Do not seed or enable a production journey as part of these commands.

## Reversible preview

1. Set `PHASE2_PREVIEW_START_AT` directly in the deployment environment as an ISO timestamp with offset and retain `PHASE2_REHEARSAL_SCALE=144`.
2. Inspect: `pnpm seed:phase2:preview`
3. Complete and record all seven cultural reviews in the pack metadata; the apply path refuses pending packs.
4. Apply explicitly: `pnpm seed:phase2:preview -- --apply`
5. Inspect reset: `pnpm reset:phase2:preview`
6. Apply reset: `pnpm reset:phase2:preview -- --apply`

The seed uses only slug `phase2-seven-day-preview`, refuses mismatched replacement, creates seven contiguous story-time days, and gives each day a $1 slot while Lemon test mode is enabled. Ten real minutes equal one story day. Presence TTL and route walking remain real-time.

## Sponsor workflow

- Upload private creative: `pnpm phase2:upload-creative -- --id UUID --file /absolute/path/image.webp` then repeat with `--apply`.
- Approve and copy to immutable public storage: `pnpm phase2:approve-sponsor -- --id UUID --reviewer "Name"` then repeat with `--apply`.
- Emergency removal: `pnpm phase2:remove-sponsor -- --id UUID --reason "Reason"` then repeat with `--apply`.
- Aggregate a UTC date: `pnpm phase2:aggregate-metrics -- --date YYYY-MM-DD` then repeat with `--apply`.
- Replay a captured Lemon payload: `pnpm phase2:replay-webhook -- --file /path/event.json --endpoint https://preview.example/api/webhooks/lemonsqueezy` then repeat with `--apply`.

Every mutating script needs exact identifiers and an explicit `--apply`. Creative remains private until approval. A refund transitions any placement to `refunded` and removes it from bootstrap immediately.

## Scheduled maintenance

Vercel calls `/api/cron/rollover` daily at 00:05 UTC using `Authorization: Bearer $CRON_SECRET`. This job reconciles already timestamp-derived state, expires stale reservations, aggregates yesterday’s metrics, and applies retention. The page and bootstrap do not rely on the cron firing at a country boundary.
