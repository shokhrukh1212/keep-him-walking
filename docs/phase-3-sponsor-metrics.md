# Phase 3 sponsor report definitions

All reporting boundaries are UTC and aggregates are first-party database records. `pnpm sponsors:export -- --from YYYY-MM-DD --to YYYY-MM-DD` reads the isolated configured project and writes CSV to stdout.

- `impressions`: unique accepted sponsor presentations under the database dedupe key.
- `engaged_views`: unique accepted presentations after the documented engagement threshold.
- `clicks`: unique accepted CTA redirects in the five-minute visitor/day window.
- `metric_date`: UTC date used by `aggregate_sponsor_metrics`.
- `updated_at`: last aggregate calculation time; it is not an impression time.

Reports do not contain cookies, IP addresses, email addresses, visitor hashes or raw webhook payloads. Vemetric mirrors are diagnostic only and are never the invoice/report source of truth.
