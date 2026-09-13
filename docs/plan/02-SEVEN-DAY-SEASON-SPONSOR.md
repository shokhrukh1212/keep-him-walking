# Prompt 2 — Seven-day seasons with one $499 sponsor

Implement this after Prompt 1 in the existing Keep Him Walking repository. Preserve its polished UI, accepted characters, animation, current scene system, dialogs and working scheduler. Deliver the smallest complete implementation. Do not rewrite the application or return only a plan.

## Product decision

Each season lasts exactly seven calendar days, with one city per day. Season 1 begins in Paris. Reuse the next six approved, asset-ready cities from the existing itinerary. Cities may be in different countries; do not promise seven distinct countries unless the actual itinerary has them. Do not block launch to generate 140 new paintings: support variable manifest lengths, use available approved scenes, and permit adding more through R2 later.

There is one exclusive paid sponsor for the whole season, at a one-time price of USD 499.00. No automatic renewal. The package covers the site's own advertising placement, not physical travel, paid game access, donations or resale of the sponsor's product. USD 499 is a launch price to validate, not guaranteed revenue or guaranteed value to a sponsor. Preserve free viewing and free existing actions.

## 1. Keep legacy behavior recoverable

Use a single explicit server-side mode/feature flag, e.g. `SPONSORSHIP_MODE=season`, with the existing daily mode retained. Reuse current domain services through a small adapter where needed. Hide the old daily calendar, daily pricing, escalating-price displays and daily checkout entry points when season mode is selected.

The owner requested “comment it out” to minimize work and preserve code. Implement that intent with a feature gate plus brief comments rather than large commented-out blocks. Do not delete historical data, migrations, receipts, refund handlers, old paid entitlements or provider webhooks still needed to service existing transactions. Inspect for genuine bookings before switching modes. Prevent legacy purchase endpoints from remaining publicly purchasable through direct requests in season mode.

Avoid a generic campaign platform, CMS, new authentication system, ad marketplace or sponsor dashboard. Reuse existing protected administration and payment abstractions.

## 2. Season clock and ending

Store authoritative season ID, ordinal, title, starts_at, ends_at, status and ordered day/city mapping. Reuse existing tables where possible; migrations must be additive and safe. Store UTC timestamps. Use the established 16:00 UTC boundary for configured starts, with ends_at exactly seven days later. An actual launch date must be explicitly configured; never guess it from a rehearsal date.

- Season/day countdown uses wall-clock time, synchronized to server time. It continues when no one watches.
- Walking distance, animation scheduling and scene advancement retain their existing watched-time rules. The season's elapsed time must never fabricate walking distance.
- “Season 1 · Day 3 of 7” and “Ends in 4d 6h” describe the actual shared season, not a per-user countdown. Before it starts show “Starts in…”, and after it ends show “Season complete.” No resetting urgency.
- Rollover is idempotent and concurrency-safe. Reuse cron-job.org and the existing rollover entry point, with appropriate locking/unique constraints. It must not create two days on retries, start before launch, or run Day 8 in a seven-day season. Handle delayed/missed scheduler invocations deliberately.
- At the end, settle the authoritative season boundary, stop accruing old-season progress and show a small completion state with actual total distance, cities visited and sponsor acknowledgment. Preserve recap/history. Close pending old-season action/vote requests cleanly.
- Offer next-season voting and a return date only when configured. A configured, ready next season may begin at its scheduled timestamp; otherwise remain in the honest completed state. Do not generate an empty season or erase global/lifetime history.
- Preserve current daily votes and apply their results only to their intended scope; do not let next-season voting overwrite today's route. Reuse any existing voting mechanism without creating a second unrelated system.

## 3. Sponsor placement and exact offer

Main scene: a discreet fixed-position line, “Season supported by [logo] [Name] ↗”. Use one consistent slot on every day, outside the character/caption region. On mobile reserve one compact footer line, with truncation and a readable accessible label; do not overlay it on the route or captions. Sponsor links open a new tab with appropriate link attributes so the experience continues.

Journey: one clean sponsor row with logo, name, one short factual description and “Visit website.” Completion recap: a sponsor acknowledgment. Do not put ads inside conversation captions, alter the character's clothes/backpack or add a large banner. No promise of external social posts, impressions, leads or sales unless separately agreed and implemented.

Change the current “Sponsor a day” entry point to “Sponsor a season.” Its existing modal presents:

> Sponsor the next journey.
>
> One sponsor. Seven days. $499.
>
> Your product appears beside the journey throughout the season, in Journey, and in the season recap. Includes your logo, name and website link. One-time payment; no renewal. Audience size and results are not guaranteed.

Display exact start/end dates and timezone before any purchase. Reflect how applicable tax is handled by the approved processor; never claim $499 includes every tax unless configured accordingly. Keep the offer factual. Publish these details where a payment reviewer can reach them without signing in, even while checkout is disabled.

Sell only explicitly configured future seasons with the full seven-day placement available. For the minimal launch offer, expose the earliest eligible unbooked season rather than building a large calendar. If the current season started unsponsored, let it run unsponsored; offer the next eligible season instead of selling a partial week as seven days. Require submitted material sufficiently before the start for the existing manual review, using a clear 24-hour cutoff as the launch default.

When unsponsored, keep the slot unobtrusive; the Sponsor button is enough. When booked, show the approved sponsor and offer the next eligible season if one exists. No duplicate CTAs or fake scarcity; the one-sponsor limit must be enforced in the database.

## 4. Booking, payment and delivery

Build a compact submission flow: product name, website, short description, logo and purchaser contact. Validate URL scheme, text limits, file type/size and safe image rendering using existing upload infrastructure. Ask the sponsor to confirm rights to supplied assets. Keep contact details private.

Use a minimal lifecycle: submitted → approved → payment_pending → paid/scheduled → active → completed, with rejected, expired, cancelled and refunded outcomes. Use existing state structures if equivalent. Admin approval is an operational content check, not evidence a payment provider approves this business model.

Approve material before requesting payment. Create checkout server-side at the fixed 49900 USD minor-unit price. Reserve the eligible season atomically with a bounded expiry and enforce one paid booking per season in the database. Align hold expiry with checkout availability; a late successful payment must trigger reconciliation/refund handling rather than activating a second sponsor. Never rely on disabled buttons to prevent overselling.

Verify signed payment webhooks, idempotency and authoritative paid amount/currency/product/season references. A browser success redirect is not proof of payment. Handle duplicate/out-of-order events, cancellation, refunds and disputes using the existing provider abstraction. Reconcile ambiguous payments before releasing inventory. Keep test credentials, test orders and test webhooks out of the real booking path.

Scheduling automatically activates only the approved, confirmed-paid booking at starts_at, and ends its live placement at ends_at. Preserve historical acknowledgment in the recap, clearly labeled as that season's sponsor. Record delivered interval and genuine aggregate clicks/views if the existing analytics supports them; do not invent numbers or build an expensive real-time analytics subsystem.

Define and publish a simple refund policy before charging: full refund if the season/placement is cancelled before delivery; failed material review is resolved before payment; material nondelivery is handled according to the published policy and applicable rights. Do not fabricate a processor-specific refund promise or waive statutory rights. Explain that the purchase buys a dated placement, not guaranteed traffic. Use a real monitored contact route.

## 5. Dodo approval is unresolved — implement accordingly

Dodo's current policy excludes online games and certain manual/prelaunch offerings. This interactive product needs explicit eligibility review for its actual sponsorship model; do not relabel it as SaaS, a download or a donation. This concern is not resolved by successful identity/bank verification.

Keep provider choice behind the existing small payment adapter. Prepare/test the intended Dodo API/SDK checkout path only with truthful offer details; do not spend time migrating unrelated payment systems. Enable real checkout only after this model and scheduled fulfillment are approved and the public site, pricing and policy disclosures match the application.

While approval is pending, display “Request this season” and accept a genuine sponsorship inquiry through the existing protected submission flow, or show a configured contact route. Do not collect a deposit or pretend an inquiry is a paid reservation. The free product and seven-day scheduler can launch without a paid sponsor. If Dodo declines, leave the placement feature usable for a future approved payment arrangement; no covert workaround or automatic switch to another provider.

## 6. Asset count and performance invariants

Season length does not change browser texture residency. Support each city's actual manifest length rather than a fixed five- or ten-scene assumption. Keep only the current and next required painting prepared, release outgoing resources, and retain a local fallback. Leave the current approved scene interval intact unless the current config contradicts the owner's 5–7 active-walking-minute target. Repeating scenery must not repeatedly award the same one-time milestone.

Adding cities/paintings to R2 should increase available content, not the initial JavaScript bundle or simultaneous GPU workload. Do not preload the entire season or fetch large sponsor assets on every heartbeat. Keep sponsor data small and appropriately cached.

## 7. Verify and deliver

Test the meaningful boundaries: before/start/end season, Day 7, no viewers, clock resync, duplicate cron, missed rollover, no next season, manifest length variations, mode disabled/enabled, legacy transaction preservation, double booking, payment hold expiry, duplicate/late webhooks, refunds and checkout disabled pending approval. Use the existing test setup.

Inspect desktop and mobile with no sponsor, a long sponsor name, an active encounter and every modal. Character placement and audio must not reset. Confirm sponsor exposure dates, season countdown and daily distance use the correct clocks.

Return the implemented diff and any additive migrations; environment/mode values; a screenshot of the main sponsor slot and sponsor modal on desktop/mobile; a test payment walkthrough where supported; actual checks run; and exact external setup still needed. Keep the existing launch switches off during implementation and hand over one concise activation checklist. Do not claim revenue, payment approval or real-device performance that has not been observed.

## Sources checked for this brief

- [Dodo merchant acceptance policy](https://docs.dodopayments.com/miscellaneous/merchant-acceptance)
- [Dodo account and website verification](https://docs.dodopayments.com/miscellaneous/verification-process)
- [Dodo documentation and integration entry points](https://docs.dodopayments.com/introduction)

Recheck current provider documentation before implementing its API. This prompt specifies product behavior; it does not assert approval of the sponsorship business.
