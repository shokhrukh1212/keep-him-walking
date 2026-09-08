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
  performing are all derived from that one number.

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
  timestamp. The built and rehearsed configuration is **7 days**:

  | Day | City | Country |
  |---|---|---|
  | 1 | Tashkent | Uzbekistan |
  | 2 | Dushanbe | Tajikistan |
  | 3 | Bishkek | Kyrgyzstan |
  | 4 | Almaty | Kazakhstan |
  | 5 | Baku | Azerbaijan |
  | 6 | Tbilisi | Georgia |
  | 7 | Istanbul | Türkiye |

  Seven further cities exist as an unpublished editorial buffer, ready but deliberately
  not scheduled: Sofia, Belgrade, Zagreb, Ljubljana, Vienna, Bratislava, Prague.

- A **country-day** is a 24-hour window with its own city, timezone, local clock
  display, content pack, sponsor slot, daily vote and postcard. Days cannot overlap —
  the database physically forbids it.

- Each country-day contains **five route zones**, walked in order and then looped. The
  shape is the same everywhere, so the day reads as a journey rather than a slideshow:

  1. **Arrival** — a boulevard or square, first steps.
  2. **Neighbourhood lanes** — quieter residential character.
  3. **Market** — the busiest, most textured stretch.
  4. **Café / food** — a pause for the local ritual (plov, tea, banitsa, simit…).
  5. **Evening landmark** — the defining view, warmer light, the day closing.

  A zone advances only on watched time — 150 active seconds each in the current packs —
  so an unwatched day genuinely does not progress.

- Each country-day also carries **five story beats** pinned to fractions of the day, so
  the same narrative rhythm lands for everyone: arrival (2 %), a local encounter (23 %),
  food (48 %), landmark (72 %), departure (94 %).

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
| Every few minutes | A short ambient action from the day's pack — waves to a passerby, saves a photo, checks the route on his phone, takes a tea break. Each has an entry, a hold, and a recovery back into the walk. |
| Once per country-day, at a fixed beat | A real conversation with a local resident. |

Two design rules matter here:

- **Actions consume watched time but not distance.** When he stops to drink, the clock
  keeps running for the world, but his locomotion is held at a planted-foot boundary and
  resumes from exactly there. This is why a reload mid-action does not teleport him.
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

- **Day marker and city** — "DAY 6 / 7 · Tbilisi · Georgia · 13:43" in the city's own
  local time.
- **Live watcher count** — "1 person watching" with a status dot, plus the honest
  sub-line about whether that is keeping him moving.
- **Walking rule status** — a small pill reading "→ Walking · Rustaveli Avenue", or the
  current action's label ("Taking a photograph", "Talking · A carved balcony"), or
  "Waiting for the internet".
- **Sponsor card** — the day's sponsor with its disclosure label and call to action, or,
  if the day is unsold, an invitation to sponsor.

**On demand**

- **Daily vote** — one question per country-day, one ballot per visitor, enforced
  server-side. Changing your mind is refused rather than silently counted twice. Results
  publish after the vote closes and are meant to influence the next part of the story.
- **Journey details panel** — your contribution meter (active seconds, your steps, the
  global step total, flagged "last confirmed" when stale), share, postcard, sound
  toggle, tomorrow's preview, and links to passport / sponsor / privacy.
- **Postcard** — after **60 seconds** of contributed watching you can generate a
  postcard of the day: a rendered image with the day's art and safe copy, an Open Graph
  variant, and a permanent public link at `/p/<token>` so it can be shared with people
  who were not there. It is idempotent — asking twice returns the same card.
- **Passport / archive** — completed days as collectible stamps, with the ones you were
  personally present for marked as collected in that browser.
- **Tomorrow** — the next city's name and start time, plus a downloadable `.ics`
  calendar file so you can come back for it.
- **Sound** — per-zone ambient street audio, off until you ask for it.

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
  no third-party ad tech and no cross-site tracking.

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

Two are visible in the current Tbilisi build and are worth stating plainly, because they
are the difference between "a place" and "a web page with a picture on it":

1. **A ghosted second copy of the street sits across the lower middle of the frame.**
   A leftover ground layer is being tiled on top of the background painting — with a
   14 % overlap between tiles, so building doorways and hedges repeat — and it slides at
   a different speed than the scene behind it. It is a rendering leftover, not artwork.
   Full diagnosis in `TECHNICAL.md` §8.

2. **The traveler floats and is too large.** His foot plane and his height are pinned to
   fixed fractions of the browser window, with nothing connecting either to where each
   city's pavement is actually painted. The result is a person roughly as tall as a
   building storey whose shoes hover above the ground. Full diagnosis in
   `TECHNICAL.md` §8.

Neither affects the shared clock, the walking rule, presence accounting, votes, postcards
or sponsor state. They are presentation defects in the scene compositor.
