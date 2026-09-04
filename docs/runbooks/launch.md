# Launch runbook

Public Production launch is a separate, explicit product-owner operation. A passing Preview does not authorize it.

## Preconditions

- `pnpm verify:phase3` and the guarded Preview load test pass.
- Physical mid-/low-range phone checks record LCP, INP, CLS, memory and visible motion quality.
- Sentry and Better Stack test alerts reach the named operator.
- Lemon Squeezy test checkout, signed delivery, duplicate delivery and refund lifecycle pass using real test-mode webhooks.
- Every published country pack has qualified local review; provisional research review is insufficient.
- Privacy, sponsor terms, refund policy and contact mailbox are accepted and reachable.
- Production secrets exist only in Production scope and the fixture provider is absent/rejected.

## Launch sequence

1. Record current Production deployment, Supabase migration list, active journey ID and current pack version.
2. Run `pnpm content:validate`, `pnpm assets:report:phase2`, `pnpm verify:phase3:code`.
3. Apply additive migrations with a Production-specific command only after a second explicit product-owner confirmation. Never reuse `.env.phase2-preview.local`.
4. Deploy immutable commit; call `/api/health`; exercise bootstrap, presence, vote and sponsor redirect with one test browser.
5. Watch error rate, p95 API latency, database connections, presence leases and animation quality for 30 minutes.

Stop and roll back on a false live count/step result, checkout security issue, content mismatch, error rate above 1%, p95 above 800 ms for five minutes, or a critical accessibility/mobile regression.
