# Seven-day seasons and the season sponsor

What ships in Prompt 2, the switches that control it, and the owner's steps to turn
each part on. Everything below is off or request-only until you do it.

## What the code does now

- **Seasons.** A season is seven days, one city per day, starting exactly at 16:00 UTC.
  You configure it once; its seven days are written together and never grow an eighth.
  The season clock is wall-clock time. Walking distance still grows only while someone
  watches.
- **One sponsor per season, USD 499.00, one time.** The sponsor sends material, you
  review it, and only approved material can be paid for. The database admits one paid
  sponsor per season. The placement starts and ends with the season on its own.
- **Until checkout is approved,** the Sponsor button and `/sponsors` say
  "Request this season". A request takes no payment and reserves nothing.
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
| `DODO_SEASON_PRODUCT_ID` | — | The one-time USD 499.00 product |
| `SEASON_SPONSOR_PRICE_INCLUDES_TAX` | `false` | `true` only if the Dodo price already includes tax |
| `SEASON_SPONSOR_CUTOFF_HOURS` | `24` | Material and booking close this long before a start |
| `SPONSOR_RESERVATION_MINUTES` | `30` | How long a checkout holds the season |
| `SEASON_SPONSOR_HOLD_GRACE_MINUTES` | `30` | Extra time before another sponsor may take a lapsed hold |
| `NEXT_PUBLIC_CONTACT_EMAIL` | — | The monitored address shown on `/contact` |

`GET /api/health` reports `sponsorshipMode` and `seasonCheckout`
(`request_only` or `configured_unverified`).

## Activation checklist

Do these in order. Stop at any step you are not ready for; the site stays honest.

1. **Production database.** `pnpm production:db:plan`, then
   `pnpm production:db:apply`, then `pnpm production:db:test` and
   `pnpm production:db:lint`. Production is at migration 0037; this applies 0038–0041.
   Do this before deploying this code to Production.
2. **Contact.** Set `NEXT_PUBLIC_CONTACT_EMAIL` in Vercel to an inbox you read.
3. **Wording.** Read `/sponsors`, `/refund-policy` and `/sponsor-terms`. Change anything
   you do not accept before a sponsor or a payment reviewer reads it.
4. **Season 1.** `pnpm production:season:configure --starts-at 2026-09-23T16:00:00Z`
   prints the plan without writing. Check the seven cities and the date, then repeat with
   `--apply`. Pass `--itinerary a-v1,b-v1,…` (seven pack ids) to choose the cities
   yourself.
5. **Launch.** Your existing `PHASE2_ENABLED` / `LAUNCH_ENABLED` switches still decide
   when the public site is live. The cron-job.org minute job needs no change: it now
   also starts and ends seasons and releases lapsed checkout holds.
6. **Payments, only after Dodo approves this model** (see `AFTER-P22.md` D11):
   1. In Dodo, create a one-time product at USD 499.00 with adaptive currency off.
   2. Add the webhook `https://keephimwalking.com/api/webhooks/dodo` for
      `payment.succeeded`, `refund.succeeded`, `dispute.opened`, `dispute.won` and
      `dispute.lost`.
   3. Put the test-mode key, secret and product id in Vercel **Preview** and run the test
      walkthrough below.
   4. Put the live-mode values in **Production**, set `SPONSOR_PAYMENT_PROVIDER=dodo`,
      `SPONSOR_BOOKING_ENABLED=true` and `SPONSOR_PROVIDER_APPROVED=true`, and redeploy.

## Test payment walkthrough (Preview, Dodo test mode)

1. On the Preview, open `/sponsors`, send a request with a test logo, and keep the
   private link it shows.
2. Sign in at `/admin-login`, open **Review season sponsors** and approve it.
3. Open the private link and pay with a Dodo test card.
4. The link shows "Paid · scheduled" only after the signed webhook arrives. Returning
   from checkout alone never changes it.
5. Pay a second time from the same link: that payment is refunded automatically and
   listed with `duplicate_payment` in the admin page.
6. Refund the first payment in Dodo: the booking becomes "Refunded" and the season is
   offered again.

Without Dodo credentials, a non-production rehearsal can use
`SPONSOR_PAYMENT_PROVIDER=fixture` with the existing fixture switches; it takes no
money and follows the same database path.

## Operating it

- **Review.** Approving copies the logo to public storage and clears the material for
  payment. It is a content check, not payment approval. Email the sponsor their link.
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
