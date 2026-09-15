# Supporter acknowledgments

Payments stay entirely on Buy Me a Coffee. Keep Him Walking loads no Buy Me a Coffee
widget or payment script; the footer is one ordinary external link.

## Configure the coffee link

Set the exact owner profile URL, including `https://`, then rebuild/redeploy:

```sh
BUY_ME_A_COFFEE_URL=https://buymeacoffee.com/<owner-profile>
```

Only a one-segment profile on `buymeacoffee.com` is accepted. When the value is absent
or invalid, the label remains visible but disabled so the application never invents a
payment destination.

## Import the first real export

1. In Buy Me a Coffee, export the support transactions as CSV. Do not edit the original
   file; it is the source evidence for counts and transaction IDs.
2. Sign in at `/admin-login`, then open **Import and publish supporter acknowledgments**.
3. Choose the CSV. The browser shows its real headers and the first three rows. Nothing
   has been uploaded yet.
4. Map the unique transaction ID and contribution date. Map display name, anonymous
   flag, email, payment ID and private message only when those columns actually exist.
   Map **Actual coffee count** only if the export has a direct coffee-count field; never
   map an amount or derive cups from a price.
5. Select **Import private drafts**. A repeated transaction ID is skipped, so importing
   the same export again is safe.
6. Review each draft. Confirm the payment is genuine/not refunded, respect the anonymous
   choice, and record the supporter’s separate permission to be acknowledged on this
   website. Verify an X or startup link before checking its verification box.
7. Save, then publish. Editing a published acknowledgment returns it to draft. Unpublish
   corrects it temporarily; Remove takes it out of the public feed.

Imports never publish automatically. Email, provider/payment IDs and supporter messages
remain in the RLS-protected table and are not selected by the public feed.

## Manual entry

Use **Manual contribution** on the same page when no export is available. An exact coffee
count may be entered only when independently confirmed; otherwise leave it blank and the
public sentence will say that the person “supported the journey.” Manual rows pass through
the same verification, permission and publication checks as imports.
