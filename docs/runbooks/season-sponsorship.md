# Featured sponsor checkout

What ships in Prompt 2, the switches that control it, and the owner's steps to turn
each part on. Everything below is off or request-only until you do it.

## What the code does now

- **Seasons.** A season is seven days, one city per day, starting exactly at 16:00 UTC.
  You configure it once; its seven days are written together and never grow an eighth.
  The season clock is wall-clock time. Walking distance still grows only while someone
  watches.
- **Featured placement.** The first approved sponsor is USD 50.00. A replacement is quoted
  twice the current sponsor's server-confirmed price. After verified payment the replacement
  receives the remaining journey period and the displaced sponsor's full payment enters the
  Dodo refund ledger. Material is **not** reviewed before payment: a sponsor fills in the
  form on `/sponsors` and goes straight to the Dodo checkout. The logo is published to its
  public path and the request approved by the server in the same call, but nothing shows
  beside the journey until Dodo confirms the payment. The private admin list still has
  `remove` and `require_refund` for anything that breaks the moderation policy.
- **Until checkout is approved,** the Sponsor button and `/sponsors` say
  "Request this season". A request takes no payment and reserves nothing. Approval leaves
  it approved and awaiting checkout; the same private link continues once checkout opens.
- **The old day offer** stays in the code and the database. `SPONSORSHIP_MODE=daily`
  brings it back. In season mode its purchase endpoints answer 404.

## Switches

All are Vercel environment variables. A change needs a redeploy.

| Variable | Default | Meaning |
|---|---|---|
| `SPONSORSHIP_MODE` | `season` | `daily` restores the per-day offer |
| `SPONSOR_BOOKING_ENABLED` | off | First of two switches for real checkout |
| `SPONSOR_PROVIDER_APPROVED` | off | Say the provider approved this exact offer |
| `SPONSOR_PAYMENT_PROVIDER` | `lemonsqueezy` | `dodo` for seasons; `fixture` only in a non-production rehearsal |
| `DODO_PAYMENTS_ENVIRONMENT` | `test_mode` | `live_mode` in Production; test mode is refused there |
| `DODO_PAYMENTS_API_KEY` | — | Server only |
| `DODO_PAYMENTS_WEBHOOK_SECRET` | — | The endpoint's signing secret |
| `DODO_SPONSOR_PRODUCT_ID` | — | One-time USD dynamic-price product; Dodo PWYW enabled and the server supplies the amount |
| `SEASON_SPONSOR_PRICE_INCLUDES_TAX` | `false` | `true` only if the Dodo price already includes tax |
| `SEASON_SPONSOR_CUTOFF_HOURS` | `24` | Material and booking close this long before a start |
| `SPONSOR_RESERVATION_MINUTES` | `30` | How long a checkout holds the season |
| `SEASON_SPONSOR_HOLD_GRACE_MINUTES` | `30` | Extra time before another sponsor may take a lapsed hold |
| `NEXT_PUBLIC_CONTACT_EMAIL` | — | The monitored address shown on `/contact` |
| `NEXT_PUBLIC_SPONSOR_X_URL` | — | Optional x.com URL shown in the modal only while checkout is unavailable |

`GET /api/health` reports `sponsorshipMode` and `seasonCheckout`
(`request_only` or `configured_unverified`).

## Activation checklist

Do these in order. Stop at any step you are not ready for; the site stays honest.

1. **Production database.** `pnpm production:db:plan`, then
   `pnpm production:db:apply`, then `pnpm production:db:test` and
   `pnpm production:db:lint`. Done on 15 September 2026: 0038–0042 were missing after this
   code had already been deployed, which made the Sponsor window say "The season dates
   could not be loaded here". Production is now at 0044. Apply any newer migration before
   deploying the code that needs it.
2. **Contact.** The configured `NEXT_PUBLIC_SPONSOR_X_URL` is the current public support
   route. Set `NEXT_PUBLIC_CONTACT_EMAIL` in Vercel only after choosing an inbox you read;
   when present, `/contact` shows both methods.
3. **Wording.** Read `/terms`, `/privacy`, `/refund-policy`, `/sponsor-terms`,
   `/content-moderation`, `/contact` and `/sponsors`. Confirm the operator identity,
   governing law/forum, contact method and every refund rule before a sponsor or payment
   reviewer reads it.
4. **Season 1.** Configured on Production on 15 September 2026 and moved to
   **18 September 2026 16:00 UTC – 25 September 2026 16:00 UTC** (Paris, Prague,
   Bratislava, Vienna, Ljubljana, Zagreb, Belgrade). To configure a new season,
   `pnpm production:season:configure --starts-at <YYYY-MM-DDT16:00:00Z>` prints the plan
   without writing; repeat with `--apply`. Pass `--itinerary a-v1,b-v1,…` (seven pack ids)
   to choose the cities yourself.

   **Change the launch date** (only before the season starts, and only while no sponsor
   has started paying):

   ```bash
   pnpm production:season:reschedule --season 1 --starts-at 2026-09-20T16:00:00Z
   pnpm production:season:reschedule --season 1 --starts-at 2026-09-20T16:00:00Z --apply
   ```

   The first line shows the old and new dates and any sponsor requests; the second moves
   the whole week. The time must be 16:00 UTC. Sponsor bookings close 24 hours before the
   start. A request sent before the move can no longer pay, so ask that sponsor to send a
   new request. No redeploy is needed.
5. **Launch.** Your existing `PHASE2_ENABLED` / `LAUNCH_ENABLED` switches still decide
   when the public site is live: set both to `true` in Vercel Production and redeploy
   before the season's start, or the week runs with nobody able to watch and ends at 0 m.
   The cron-job.org minute job needs no change: it now also starts and ends seasons and
   releases lapsed checkout holds.
6. **Payments, only after paid terms are complete:**
   1. In Dodo, create one one-time USD product with Pay What You Want enabled and a
      USD 50.00 minimum. The application passes the exact server-owned amount. Keep
      adaptive currency **off**: a payment in any other currency fails the amount check
      and is refunded automatically.
   2. Add the webhook `https://keephimwalking.com/api/webhooks/dodo` for
      `payment.succeeded`, `payment.failed`, `payment.cancelled`, `refund.succeeded`,
      `refund.failed`, `dispute.opened`, `dispute.won` and `dispute.lost`.
   3. Put the test-mode key, secret and product id in Vercel **Preview** and run the test
      walkthrough below.
   4. Put the live-mode values in **Production**, set `DODO_PAYMENTS_ENVIRONMENT=live_mode`,
      `DODO_PAYMENTS_API_KEY`, `DODO_PAYMENTS_WEBHOOK_SECRET`, `DODO_SPONSOR_PRODUCT_ID`,
      `SPONSOR_PAYMENT_PROVIDER=dodo`,
      `SPONSOR_BOOKING_ENABLED=true` and `SPONSOR_PROVIDER_APPROVED=true`, and redeploy.
      Until every value for the season on offer exists, checkout stays request-only.

## Test payment walkthrough (Preview, Dodo test mode)

1. On the Preview, open `/sponsors`, send a request with a test logo, and keep the
   private link it shows.
2. Sign in at `/admin-login`, open **Review season sponsors** and approve it.
3. Open the private link and pay with a Dodo test card.
4. The link shows "Paid · scheduled" only after the signed webhook arrives. Returning
   from checkout alone never changes it. If the configured dates changed after checkout
   began, the payment is not scheduled and follows the automatic refund path.
5. Pay a second time from the same link: that payment is refunded automatically and
   listed with `duplicate_payment` in the admin page.
6. Refund the first payment in Dodo: the booking becomes "Refunded" and the season is
   offered again.

Without Dodo credentials, a non-production rehearsal can use
`SPONSOR_PAYMENT_PROVIDER=fixture` with the existing fixture switches; it takes no
money and follows the same database path.

## Operating it

- **Review.** Approving copies the logo to public storage and clears the material for
  payment. It is a content check, not payment approval, booking or reservation. Copy the
  continuation link shown in admin and send it to the submitted contact email; the app does
  not claim mail delivery because no email delivery provider is configured.
- **Late or double payments** are refunded automatically through Dodo and stay visible
  as `refund_required` until the refund event confirms them.
- **Removal.** On a live placement, "Remove, no refund" or "Remove and refund". Refunds
  follow the published refund policy.
- **Disputes.** A lost dispute ends the placement as refunded.
- **Reporting.** The admin page shows the delivered interval and first-party view and
  click counts. Nothing else is promised.

## Rollback

Set `SPONSORSHIP_MODE=daily` and redeploy. The day offer's own switches still keep
its checkout off. Season rows, payments and receipts are kept; a paid season sponsor
is still shown during its season and serviced through the admin page and webhook.
