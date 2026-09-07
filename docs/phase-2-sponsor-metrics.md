# Phase 2 sponsor metric definitions

- **Impression:** one per anonymous visitor hash and sponsored country-day after the disclosed sponsor UI and scene are ready. Retries and tabs deduplicate.
- **Engaged view:** one per anonymous visitor hash and sponsored country-day after at least 10 contributed active seconds.
- **Watch seconds:** derived from server contribution records, never from a client timer. It is aggregated operationally and is not inflated by multiple tabs.
- **CTA click:** one redirect event per anonymous visitor-day per five-minute window. Only the server redirect can count it.
- **Postcard created/shared:** one first-party event per visitor-day and action type for the live sponsorship.
- **Session:** one per visitor-day. Reconnects do not create additional sessions.

The database ledger is authoritative. Vemetric receives non-blocking mirrors and cannot change live product behavior, payment state, sponsor state, or counts.
