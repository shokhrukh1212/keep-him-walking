# Keep Him Walking — Product Description

> This file and its companion `TECHNICAL.md` are written to be self-contained. If you
> are an AI assistant reading only these two documents, you should be able to reason
> about this product without opening the repository.

---

## 1. The premise

One man walks. He crosses one country per day. **He only moves while at least one person
on the internet is watching him.**

That single rule is the whole product. There is no game to win, no level to beat, no
account to create. You open the page and a real-time scene appears: a city street, a
young traveler with a mustard backpack, ambient street sound. If you are there, he
walks. If everybody closes the tab, he stops walking and waits.

The three sentences the interface actually says to visitors are:

- **"He only walks while someone is watching."** — the headline on arrival.
- **"The internet is keeping him moving"** — shown next to the live watcher count while
  he is walking.
- **"He's waiting for a watcher"** — shown when nobody is present.

Each day of the journey has one sponsor, disclosed on screen, whose logo can appear as a
patch on his backpack.

---

## 2. The core rule, and why it is the product

Presence is the fuel. Nothing else moves him.

- Every open, visible tab sends a heartbeat to the server roughly every 20 seconds.
- The server keeps a short-lived *presence lease* per browser session (50 seconds by
  default). A lease only counts if the tab is visible **and** the scene has finished
  loading.
- While at least one lease is alive, the server accrues **global active seconds** for the
  current country-day. While no lease is alive, it accrues nothing.
- Distance, step count, which zone of the city he is in, and which action he is
  performing are all derived from server-confirmed runtime and action windows.

Three consequences make this feel real rather than decorative:

1. **It is server-owned.** The count lives in Postgres, advanced inside a locked
   transaction. A client cannot invent progress by editing anything locally. If your
   connection drops, your extrapolation is capped and then corrected.
2. **Everybody sees the same moment.** Two people in different countries, on different
   devices, watching at the same second see the same street, the same footfall, the same
   line of dialogue. Reloading does not restart anything — the page recomputes where he
   should be from the shared number.
3. **Your contribution is separable and honest.** The interface can tell you how many
   seconds *you* were present and how many steps *you personally* caused, distinct from
   the global total. Contribution is measured as the most advanced lease per visitor,
   never the sum of your tabs, so opening five tabs does not multiply your credit.

The rule also disciplines the visuals. The walking status line must never claim he is
walking while the character is standing still, and the step counter must never show a
number the server has not confirmed. When something is unknown, the interface says so —
"Live count reconnecting", "last confirmed" — rather than guessing.

---

## 3. The shape of a journey

**Journey → country-days → route zones → story beats.**

- A **journey** is a fixed-length run of consecutive country-days with a launch
  timestamp. Season 1 is a 30-day journey. The approved launch route begins in
  **London**; the Day-1 ballot names him Milo, Nur, Sami or Bek, and the reviewed
  Day-2 fallback is **Paris by train**. Belgium and Germany are the first later route
  priorities. A country is public only when its versioned art and cultural review are
  ready—the older Central Asia and southeast-Europe packs remain rehearsal/rollback
  content, not the current launch order.

- A **country-day** is a 24-hour window with its own city, timezone, local clock
  display, content pack, sponsor slot, daily vote and postcard. Days cannot overlap —
  the database physically forbids it.

- Each country-day walks an ordered list of **places** from its city's pinned
  manifest, in order and then looped. The target is ten distinct places per city;
  Paris has five real paintings today — the station, the canal, a market street, a
  Left Bank café and the Seine with the tower — and more are coming. A day never
  repeats a painting to pretend it has more.

  Each place lasts **seven minutes of active walking**. That clock runs only while he
  walks, so it pauses while he stops or waits, and more viewers never shorten a visit.
  The painting stays where it is; only the pavement moves under his feet. Day and night
  are the same place in different light.

- Places carry **tags** (station, canal, market, café, landmark…), and the story uses
  them: he arrives at the first place, meets a resident by the canal, pauses for food
  at the café and takes in the landmark view, each on his first visit there. The
  departure still happens at the day's end.

---

## 4. What he actually does

He has a vocabulary of twenty behaviours: `idle`, `start_walk`, `walk`, `slow_walk`,
`stop`, `rest`, `notice`, `approach`, `greet`, `wave`, `talk`, `listen`, `react`,
`phone`, `drink`, `photo`, `sit`, `goodbye`, `resume_walk`, plus `loading`.

These are driven at three different cadences, which is what keeps a long day alive
without needing hundreds of unique animations:

| Cadence | What happens |
|---|---|
| Continuous | Walking, with proper start / slow / stop / resume transitions rather than snapping between poses. |
| Every 2–3 walking minutes | A passer-by walks along his pavement, in at one edge and out at the other. They never stop him. |
| About every 5 walking minutes | A short conversation with a local resident, or a wordless hello. Exchanges rotate and never repeat back to back. |
| Every 4–6 walking minutes, between conversations | Something of his own: a drink, a photo, a look at his phone, a look around, an arm stretch, tying a shoe, a yawn, leaning for a breather, laughing to himself. All nine come round before any repeats. |
| Whenever viewers react | Wave, Water or Photo. Viewers go first: a planned stop that has not begun gives way. |

Every clip plays at its natural speed, and only one thing happens at a time.

Two design rules matter here:

- **Every stop pauses the walk and the distance.** Each stop is a shared window the
  server commits to in advance, so every viewer sees the same stop at the same moment
  and a late arrival walks into the middle of it. While he stops, the road and the
  collective distance stand still, then resume from exactly there. With nobody watching,
  nothing is scheduled at all.
- **He is never in an impossible pose.** The state a viewer sees is always the state the
  status line names.

---

## 5. What a conversation is

The encounter is the emotional centre of a day. It is a scripted sequence, not a popup:

```
walking → notices someone → slows → approaches → greets
        → alternating speak / listen lines, each with a mood
        → reacts → says goodbye → resumes walking
```

Both characters act. When he talks, she listens; when she talks, he listens. She answers
his greeting slightly after he offers it, and his goodbye slightly before hers, so the
exchange has timing rather than being simultaneous.

Dialogue is **content, not animation**. Each line is stored as
`{ speaker, text, mood, durationMs }` where mood is one of neutral, curious, surprised,
amused or thoughtful. That means the same animation set carries every conversation in
every city, translations are a data change, and nothing culturally sensitive is ever
improvised at runtime.

Each city has a small **pool of exchanges**, each tied to the places where it makes sense
and to a named resident. Paris has nine: the reviewed six-line welcome is split into
three two-line exchanges, and six new short ones (by the market, the café, a footbridge,
the book stalls and the tower lights) are marked **pending cultural review**. Every
third slot is a wordless hello instead, so the rotation never runs out of words to
repeat. The last few exchanges a visitor saw are listed in Journey, each collapsed until
opened.

Each city also carries a **local phrase** with its original script, transliteration,
plain-English gloss and pronunciation — for example Tbilisi's
*"კეთილი იყოს თქვენი მობრძანება" / "Ketili iqos tkveni mobrdzaneba" / "Welcome"*.

Dialogue is presented as bubbles anchored near the speakers on desktop and as a compact
top panel on narrow phones. There is no centred modal, because that would feel like a
web app rather than a place.

---

## 6. What a visitor sees and does

Everything is anonymous. No sign-up, no email, no password. Identity is an opaque cookie
that is hashed before it ever reaches the database.

**Always visible**

- **Day marker and city** — for example “DAY 1 · LONDON” with country and time in the city's own
  local time.
- **Audience control** — one top-right control combines the country summary, confirmed
  watcher count and pace with the honest movement status.
- **Reactions** — Wave, Water and Photo sit at top centre. One confirmed watcher can
  trigger one; Realtime is only an update hint and every viewer then reads the action
  window from the server.
- **Walking rule status** — a small pill reading "→ Walking · Canal Saint-Martin", or the
  current stop's label ("Taking a photo", "Talking with Camille", "Tying a shoe"). It
  names a place only once that place's painting is actually on screen. "Reconnecting…"
  means this browser has lost touch with the server; "Waiting for the internet" appears
  only when the server confirms nobody is watching.
- **Progress row** — one dot per place with "Stop 2 of 5" and "Next ~4 walking min".
  Tapping a dot describes that place without moving him there. Beside it,
  "4.3 / 8 km together · 54%", labelled extrapolated, last confirmed or reconnecting,
  with an ⓘ explaining that a 42.2 km marathon is the next goal after the 8 km day.
- **Footer** — the disclosed Sponsor/invitation, a short Vote chip with its countdown,
  and Journey. Sound is its own toggle in the bottom-right corner.

**On demand** — each opens as a modal over the scene. He keeps walking underneath,
nothing behind it moves or reloads, and the close button, Escape or the browser's Back
button close it.

- **Daily vote** — one question per country-day, one ballot per visitor, enforced
  server-side. Changing your mind is refused rather than silently counted twice. Results
  publish after the vote closes and are meant to influence the next part of the story.
- **Journey** — grouped from "where is he" to "what's next":
  - today's walk: the places, this stop and the next
  - together: shared distance and the two goals
  - your part: your contribution, streak, share and postcard
  - recent encounters, collapsed
  - the day's photographs
  - a route map that loads when opened
  - tomorrow
  - Sponsor a day and Privacy

  The Passport link and the locals corrections form are no longer in Journey. Old
  Passport links open Journey at "Your part", and submitted corrections are kept.
- **Postcard** — after **60 seconds** of contributed watching you can generate a
  postcard of the day: a rendered image with the day's art and safe copy, an Open Graph
  variant, and a permanent public link at `/p/<token>` so it can be shared with people
  who were not there. It is idempotent — asking twice returns the same card.
- **Passport / archive** — every finished day as a stamp coloured by how it ended: gold
  for a marathon, colour for a landmark reached, grey for a day that fell short. A day
  is *collected* when you watched it for at least thirty seconds; the server counts those
  seconds, so a stamp follows you rather than the browser you earned it in. Consecutive
  collected days read as "4 days in a row".
- **Season sheet** — `/season/1` is the whole passport as one shareable poster: the stamp
  sheet, the confirmed totals, the route map and a share card.
- **A city that lives** — subtle birds, café steam and an optional tram share the
  authoritative clock. Every couple of minutes one or two rigged residents walk past on
  his pavement, a little smaller than him, just behind him or just in front; each walks
  in at one edge of the screen and out at the other. The unconvincing procedural cat was
  removed. When a hundred people are watching at once, bunting goes up for the rest of
  the day.
- **Tomorrow** — only a committed next `country_days` row may name the next city, start
  time and walk/train/flight transfer. Registry order is never presented as a result.
- **Sound** — per-place ambient street audio from the bottom-right toggle. It always
  starts muted; if you turned it on last time, it comes back on your first tap.

Weather rendering and its cache remain implemented, but weather is disabled for launch
by default. While disabled there is no provider request and no temperature, icon,
precipitation or freshness claim in the interface.

**Degradation is a feature, not an afterthought**

- No live services configured → an explicitly labelled offline preview that still shows
  the scene but disables counts, voting and steps.
- Connection lost → "reconnecting" state, capped extrapolation, automatic recovery
  without a blank screen.
- No WebGL → the complete illustrated static scene instead of a broken canvas.
- Operating-system "reduce motion" enabled → the full environment stays, motion stops,
  and the character holds a **grounded standing pose** rather than freezing mid-stride.
  This is an accessibility fallback that follows the OS; it is not a toggle in the UI.

---

## 7. The sponsor model

One sponsor per country-day. That scarcity is the offer.

What a sponsor gets:

- One clearly disclosed placement on that day's journey page.
- Optionally, a reviewed logo patch on the traveler's backpack, worn all day.
- Aggregate first-party reporting — impressions, engaged views (10 s+), clicks — with
  no third-party ad tech and no cross-site tracking, at `/sponsor/<id>/report`.
- Premium additionally labels the water bottle he drinks from and the café sign in the
  café zone. Both appear only after the creative is approved and the day is live.

**The price is public and so is the formula.** A day costs one cent per unique watcher
the day before, with a floor of $49 and a cap of $2,999; `/sponsors` publishes the seven
days currently on sale, each price, and the number of watchers that set it. Prices only
change for days that are not yet open — buying early locks the lower price in. The first
seven days of a season are a flat founding price. A sponsor buys a *day*, not a country:
the country is decided one day ahead by the vote, which is why inventory is keyed by date
and only attached to a country-day once that vote closes.

The lifecycle, enforced by a database state machine so it cannot be skipped:

```
available slot → reserved (30 min) → checkout_pending → paid_pending_review
               → approved → scheduled → live → completed
                     ↘ rejected / refunded / cancelled
```

The important rule: **payment never bypasses creative review.** Paying moves a
sponsorship to `paid_pending_review`, not to `live`. Approval is a separate human step,
and there is a documented emergency-removal path that can pull a live sponsor within a
day. Only `https` click destinations are accepted. Refund and creative policies are
published pages, not fine print.

Sponsor creative is stored privately on upload and only copied to a public bucket once
approved.

---

## 8. Content and cultural integrity

Each country-day is powered by a versioned, immutable **country pack** containing its
five zones, artwork, ambience, NPC variant, encounter script, local phrase, story beats,
postcard copy, preload groups and asset budget.

Two deliberate constraints:

1. **No live AI generation of dialogue or culture.** Everything a visitor reads was
   written and reviewed in advance. One strange or insensitive improvised line would
   damage the project more than any amount of variety would help it.
2. **Every pack carries its own review record**, with a status that the product respects:

   | Status | Meaning |
   |---|---|
   | `approved` | Reviewed by a qualified local. Currently only **Tashkent**. |
   | `provisional_preview` | Desk research against official tourism / city / museum sources, with citations and a stated public-launch requirement. All other cities. |
   | `pending` / `changes_requested` | Not usable. |

   A `provisional_preview` pack is allowed in a private preview and is **blocked from
   public launch** until a qualified local review exists. The schema itself refuses to
   accept a provisional pack that lacks citations and a stated launch requirement.

Packs are additive and rollback-safe: older versions stay registered so a day can be
reverted without a deploy.

---

## 9. Where the product stands today

**Built and technically verified:** the shared walking rule, the synchronised clock,
the five-zone continuous world, the character system, encounters, ambient actions, the
daily vote, postcards and public share pages, the passport, the sponsor inventory and
review workflow, first-party sponsor metrics, the tomorrow preview and calendar, the
daily rollover job, rate limits, structured logging and error reporting, and operational
runbooks for launch, incidents, rollback, sponsor removal and webhook replay.

**Not launched.** The application runs on a protected Vercel Preview against an isolated
database. No production launch date has been seeded. No real money has moved.

**Open gates before a public launch:**

- Product-owner visual acceptance of the traveler. The character is explicitly a
  work-in-progress candidate — see `TECHNICAL.md` §7.
- Real physical-device performance evidence on low- and mid-range phones. Emulated
  browser results are not accepted as a substitute.
- The real payment lifecycle end to end: test checkout, signed webhook delivery,
  duplicate delivery, refund, live-mode configuration.
- Qualified local cultural review for the thirteen non-Tashkent cities.
- External comprehension testing — can 10–20 strangers explain the walking rule after
  watching, without being told?

---

## 10. Known rough edges a visitor sees right now

These are worth stating plainly, because they are the difference between "a place" and
"a web page with a picture on it":

1. **A ghosted second copy of the street across the lower middle of the frame — fixed.**
   A leftover ground layer was being tiled on top of the background painting — with a
   14 % overlap between tiles, so building doorways and hedges repeated — and it slid at
   a different speed than the scene behind it. It was a rendering leftover, not artwork,
   and it has been removed. Each country-day now shows exactly one painting per route
   zone. Full record in `TECHNICAL.md` §8.3.

2. **Independent traveler scale and pavement placement — repaired in P2.** Each zone
   now declares its painted ground and person scale, shared by the world and character
   renderers. Tbilisi and Tashkent are calibrated from the original paintings; other
   packs retain defaults. A private Preview editor supports later adjustments. Tall
   mobile screens show sky above the width-fit painting. Owner review of calibration
   and character quality remains necessary. Details in `TECHNICAL.md` §8.4.

Neither affects the shared clock, the walking rule, presence accounting, votes, postcards
or sponsor state. They are presentation defects in the scene compositor.
