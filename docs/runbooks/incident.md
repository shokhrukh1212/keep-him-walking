# Incident runbook

Severity is based on user harm, not traffic volume: critical means false shared state, payment/security exposure or total journey failure; error means a major feature is unavailable; warning means degraded fallback is working.

1. Capture UTC time, deployment SHA, affected route/country pack and a generated correlation ID. Never paste secrets, cookies, visitor hashes or raw webhook bodies into chat/logs.
2. Confirm `/api/health`, Vercel function status, Supabase status, Sentry issue and Better Stack request/error trend.
3. Prefer the built-in truthful fallback: stale labels, static scene, unsponsored card or disabled checkout.
4. For critical impact, restore the previous immutable deployment and pack version. Database migrations are additive; do not destructively roll schema back during an incident.
5. Resolve with a tested forward fix, document detection/root cause/impact, and close the operational incident record.

Alert thresholds: error rate >1% for five minutes, bootstrap/presence p95 >800 ms for five minutes, health unavailable twice, database connections >80% pool, webhook failures >0, or sponsor creative unexpectedly missing while live.
