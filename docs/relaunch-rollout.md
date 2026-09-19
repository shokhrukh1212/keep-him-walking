# Paris relaunch rollout

This change is prepared but does not deploy production or archive a journey by itself.

## Database and legacy reconciliation

Dev project `tkntxptfhmjnqaaveddx` has migrations `202609190049` and `202609190050`.
The pre-change entitlement audit found zero daily sponsorship rows, zero season sponsorship
rows and zero placement-payment rows in the inspected production database; all 14 legacy
day slots were available. The old tables and webhook paths remain intact because a buyer may
still hold an off-database promise or an outstanding provider transaction. Before enabling
sales, compare any owner-held receipt or correspondence with the original promise. Do not
move it into the new 10 + 1 inventory without an explicit written reconciliation.

## Required settings

Set no secrets in source control. Production already carries the approved Dodo settings
under the existing names below, and placement checkout reuses them:

```text
SPONSOR_BOOKING_ENABLED=true
SPONSOR_PROVIDER_APPROVED=true
SPONSOR_PAYMENT_PROVIDER=dodo
DODO_PAYMENTS_API_KEY=<secret>
DODO_PAYMENTS_WEBHOOK_SECRET=<secret>
DODO_SPONSOR_PRODUCT_ID=<approved one-time Pay What You Want product>
DODO_PAYMENTS_ENVIRONMENT=test_mode|live_mode
NEXT_PUBLIC_APP_URL=<canonical origin>
NEXT_PUBLIC_CONTACT_EMAIL=<monitored support address>
```

The server supplies USD 50 for a regular placement and USD 100 for featured. The optional
placement-specific gate and product names override these compatibility aliases when set.

Production refuses Dodo test mode. The no-money fixture is non-production only and also
requires `SPONSOR_FIXTURE_SECRET`.

## Prepare and control the journey

Review the exact undated plan first:

```bash
pnpm relaunch:prepare
```

Create it only after the current live/scheduled journey is safe to archive. The first command
will refuse to proceed if one exists; the second form makes that archive decision explicit:

```bash
pnpm relaunch:prepare --apply
pnpm relaunch:prepare --apply --archive-current
```

The created journey is `waiting`, begins visually in Paris, has no start timestamp and has
zero route progress. Sign in at `/admin`, open `/admin/journeys`, and use:

- **Waiting** to clear a future schedule before launch.
- **Schedule launch** to enter an explicit Asia/Tashkent (UTC+5) wall time and review the
  resolved UTC instant.
- **Cancel schedule** to disarm it.
- **Start now** to launch once at the server-confirmed current instant.

The admin page also lists flagged placements for approval or removal/refund. Reaching any
sponsor count never starts the journey.

## Payment-provider status

Dodo approval is owner-confirmed. The production project has the API key, webhook secret,
live environment, approved dynamic-price product, provider selection, booking switch and
approval switch. Checkout sends the server-owned placement amount and retains the existing
signed webhook verification and payment read-back before fulfillment.

## Launch-video rehearsal

Run the local app and open `/recording`. It displays ten temporary sample products and
“Sponsored by Postis”, starts the traveler and scenery immediately, and stops after ten
minutes. Refresh to restart. Nothing is written to sponsor inventory or journey progress;
the route is unavailable in production, and `/` stays in the real waiting state.
