# 05 — Sponsors and Pricing

> How the money works, what a sponsor buys, what it costs on which day, and how you
> sell the first seven without an audience.

## 1. What outbid.lol taught us (and what not to copy)

Lessons worth stealing: a price that is **public and moving** is content; founders pay to
be *seen paying*; the leaderboard/price screenshot is the share unit; a $1 entry point
got thousands of people to try. What not to copy: an auction with refunds — every
refund costs you processing fees and support time, and this product has a creative
review step that an auction fights against. So: **fixed, public, formula-driven prices
that only go up when people show up**, plus one scarce object (tomorrow) that everyone
can see the price of.

## 2. The products

| Product | What they get | Price |
|---|---|---|
| **Day sponsor — Standard** | The disclosure chip on the journey page all day ("Sponsored today by X"), the logo patch on the backpack all day, the click-through link, a permanent line on that day's recap page, a mention in the recap post on X, first-party metrics (impressions, engaged views ≥ 10 s, clicks) | `P(day)` — see §3 |
| **Day sponsor — Premium** | Standard + the water-bottle skin (he drinks from your bottle at the café beat and every crowd "water" reaction) + your logo on the café sign in the café zone | `1.5 × P(day)` |
| **Founding sponsor** (Days 1–7 only, pre-sold before launch) | Standard, plus a permanent "Founding sponsor" listing on `/sponsors` and the passport page | **$29 flat** |
| **Ticket** (P1, after week 1) | Sets the country for a chosen future day ≥ 3 days out from your list of ready-or-buildable countries; announced as "Someone bought him a ticket to Lisbon". Includes Standard for that day. | `max($249, 3 × P(day))` |
| **Cheer** (experiment, week 2) | Your name/handle in that day's "carried by" list on the recap page and a tiny marker on the map | $3 (only if the provider's fixed fee makes it viable; Lemon Squeezy's does not — skip unless you move providers) |

No free-text sponsor copy on the journey page: name, logo, one URL. The creative review
stays. `https` only. Payment never bypasses review (already enforced).

## 3. The price formula (public, on `/sponsors`)

```
P(day) = clamp( yesterday_unique_watchers × $0.01 , floor $49 , cap $2,999 )
```

- "Yesterday" = the last completed country-day's `unique_watchers` from `day_outcomes`.
- Computed at rollover; written to `sponsor_pricing` for `D+7`, which opens at that moment.
- Days already open keep the price they opened at. **Prices only change for new days.**
  Early buyers lock in a lower price — say so: "Buy early. The price only goes up if the
  internet keeps showing up."
- Floor $49 means the slot is never "worthless". Cap $2,999 keeps it a founder purchase,
  not an agency negotiation. (At 100k unique watchers a day the maths says $1,000, which
  is a $10 CPM for a full-day placement worn by the character — that is a fair deal
  for them and it is not your ceiling: raise `$0.01` to `$0.02` after Season 1 if slots sell out.)

Example ladder:

| Yesterday's uniques | Price |
|---|---|
| 0–4,900 | $49 |
| 12,000 | $120 |
| 40,000 | $400 |
| 150,000 | $1,500 |

Show the number that set the price next to it: **"$400 · set by 40,120 watchers yesterday"**.
That sentence does more marketing than any ad.

## 4. The rolling window

- Exactly **7 days** are ever open for sale: `D+1 … D+7`.
- At each rollover, `D+7` opens at the new price; nothing beyond it is purchasable.
- Sold-out days show the sponsor name (social proof); unsold days show the price.
- A sponsor buys a *day*, not a country. The country is known one day ahead (the vote).
  The `/sponsors` page shows the current city and tomorrow's candidates so buyers know
  the region. If a founder wants a specific country: that is the Ticket product.
- Reservation hold 30 min during checkout (already built).

## 5. The `/sponsors` page (copy)

> **Sponsor a day of the walk.**
> One sponsor per day. Your logo on his backpack, on screen all day, in the recap, on X.
> Tomorrow: Tbilisi → **$49** · set by 3,120 watchers yesterday.
>
> | Wed 16 | Thu 17 | Fri 18 | Sat 19 | Sun 20 | Mon 21 | Tue 22 |
> | Acme ✓ | $49 | $49 | $49 | — | — | — |
>
> Standard $49 · Premium $74 (he drinks from your bottle).
> Creative is reviewed within 12 h. Prices rise with the audience and never change
> for a day you already bought. Refund policy · Creative policy · Metrics you'll receive.

## 6. Selling the first seven (before launch, no audience needed)

You are pre-selling seven $29 days to founders who already post daily. Their money is
almost irrelevant; their **post on launch day** is the point.

Targets (pick 25, close 7): indie founders on X who launched in the last 60 days and
post their MRR; the people who bought spots on outbid.lol and its clones (they have
demonstrated they pay for attention); makers with 3k–30k followers in the "build in
public" cluster; two or three founders from the first three countries on the route
(Uzbek, Tajik, Kyrgyz startups — local pride sells).

DM script (short, no pitch deck):

> Hey — I built a site where a guy walks across the world, one country a day, and he
> only moves while someone's watching. Launching next week from Tashkent.
> One sponsor per day: your logo on his backpack + on screen all day + the recap post.
> I'm pre-selling the first 7 days at $29 as "founding sponsors" (it'll be $49+ after
> and rise with traffic). Want Day 3 (Bishkek)? Here's the preview: <link>

Give them the preview link with the sponsor patch already showing *their* logo (the
`setSponsor(url)` path exists — make an admin route that renders any logo on the
preview). Nobody says no to seeing their logo on a walking man.

After they pay: send the "Your day" kit — the date and rollover time, the recap post
template they can quote, and a screenshot of the chip. Ask for one thing: "post when
your day starts".

## 7. After launch: the sponsor flywheel

- The recap post every day thanks the sponsor by handle → the sponsor reposts → their
  followers see the product → some of them buy a day.
- `/sponsors` is linked from the dock with the live price. The price itself is a story
  on X every few days: "Day 12 price: $412. Day 1 was $29."
- When the 7-day window sells out two days running, raise `$0.01` → `$0.015`. Announce it.
- Send every sponsor their metrics at rollover +1 h automatically (email via the
  provider's receipt email is enough; a `/sponsor/<id>/report` page linked from it).

## 8. Payment provider check (launch blocker — do this today)

Lemon Squeezy is integrated. Two things to verify with a **real $1 product** on your
live store before you sell anything:

1. Your store is approved and your payout method (bank payout to Uzbekistan appears on
   their supported list; PayPal is not usable for receiving in Uzbekistan) is verified.
   Lemon Squeezy has been moving merchants onto Stripe-managed payments, which supports a
   narrower list of countries — confirm which regime your store is on and that payouts
   are enabled.
2. The signed webhook lands on `/api/webhooks/lemonsqueezy` in Preview, moves the
   sponsorship to `paid_pending_review`, survives a duplicate delivery, and a refund
   moves it to `refunded`.

If (1) fails, fallbacks in order: Paddle (merchant of record, wide payout coverage),
Freemius (lists Uzbekistan for payouts), Gumroad with Payoneer. The checkout adapter
boundary already exists (`payments/`), so swapping is a bounded job.

## 9. Money expectations (so you plan, not hope)

| Scenario | Days 1–7 | Days 8–30 | Season 1 total |
|---|---|---|---|
| Quiet launch (2–5k uniques/day) | 7 × $29 = $203 | ~50 % sell-through at $49 → ~$560 | ~$760 |
| Good launch (20–40k/day peak, decaying) | $203 | prices $100–$400, 70 % sell-through → ~$3,500 | ~$3,700 |
| Viral (100k+ peak) | $203 | $500–$1,500 early, tickets sell → $10k–$25k | $10k+ |

Costs: domain ~$10, Vercel Pro $20/mo from the first payment, Supabase Pro $25/mo only if
egress demands it. Everything else is free tier. The quiet scenario still pays the bills;
the good scenario pays you.
