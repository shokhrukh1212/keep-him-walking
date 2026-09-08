# 01 — The Product

> Read with `PRODUCT.md` (current state). This file replaces its "shape of a journey"
> and "what a visitor sees" sections with what we are building next.

## 0. Four decisions only you can make (decide before Prompt 4)

| Decision | My recommendation | Why |
|---|---|---|
| Product name + domain | **Keep Him Walking** — `keephimwalking.lol` if free (fallback `.com`, then `.live`) | The name is the instruction. The `.lol` TLD reads "internet experiment", which is exactly what got outbid.lol shared in August; it lowers expectations and raises curiosity. |
| Character name | **Let Day 1's vote name him.** Shortlist: Milo, Nur, Sami, Bek. My pick if you skip the vote: **Milo** | A crowd that named him feels ownership. All four are two syllables, pronounceable in every language he will visit, and free of historical baggage (do not use Timur — he sacked half the cities on this route). |
| Season length | **30 days** for Season 1 | 195 consecutive days of solo content production is a burnout plan, not a product plan. A finale is a marketing event. |
| Rollover time | **16:00 UTC** every day | 09:00 San Francisco, 12:00 New York, 17:00 London, 21:00 Tashkent. The maximum overlap of the people who share things. |

Other name options, ranked, in case the first is taken:

| Product | Domain to try | Note |
|---|---|---|
| Keep Him Walking | keephimwalking.lol / .com | Current brand; imperative; the CTA is the name. |
| He Only Walks | heonlywalks.com / .lol | The rule as a sentence. |
| Is Anyone Watching | isanyonewatching.com | The question people ask themselves at 3 a.m. Great for the waiting state. |
| Watched | watched.lol | Short, slightly eerie, memorable. |
| Onward | onward.lol | Aspirational; weaker link to the rule. |

X handle: `@keephimwalking` (fallback `@heonlywalks`). Bluesky and Threads: same handle,
registered the same day even if unused.

---

## 1. One sentence, three lines, one number

**One sentence (for anyone who asks):** "A guy is walking across the world, one country
a day, and he only moves while someone on the internet is watching him."

**Three lines (the landing page):**
- He only walks while someone is watching.
- Right now, **13 people** are keeping him walking through Tbilisi.
- Tomorrow, the internet decides where he goes.

**One number (the thing people screenshot):** the live watcher count with flags —
`🇬🇪 🇺🇿 🇩🇪 🇺🇸 · 13 watching · ×4 pace`.

---

## 2. The loop that makes people come back

The current product has one loop: open tab → he walks → close tab. Everything below
adds loops that run on different clocks.

| Clock | Loop | Why it works |
|---|---|---|
| Seconds | **Pace.** More watchers = faster. You can see the pace tick up when you share the link. | Sharing has an immediate, visible effect. |
| Minutes | **Reactions.** Wave, offer water, ask for a photo. When enough people do it together, he does it. | Agency without chat. Reuses actions already built. |
| Hours | **The goal bar.** "3.4 km to the landmark. Marathon: 21%." Will we make it today? | A collective goal you can fail creates stakes. |
| Daily (16:00 UTC) | **The border crossing.** Vote closes, recap card publishes, new country loads, sponsor changes. | An appointment. Same time every day. |
| Daily | **The home team.** Your country's flag, watch-time, rank. "Georgia carried him 3h 12m — #1 today." | National pride is the strongest free distribution channel on earth. |
| Multi-day | **Passport & streak.** Stamps for days you were present; grey stamps for days the internet failed him. | Collection + loss aversion. |
| Season | **Season 1 finale.** Day 30. A recap of every country, every stamp, every sponsor. | A finish line makes the middle matter. |
| Emotional (any time) | **He is waiting.** "Nobody has watched for 2h 41m. You're the first." | The 3 a.m. loop: the one that gets screenshotted and posted. |

---

## 3. What a day is now

```
Journey (Season 1, 30 days)
 └── Country-day (24 h, rollover 16:00 UTC)
      ├── Route: 5 zones measured in metres, walked in order        ← was: 150 s each, looping
      │     arrival 1,200 m · lanes 1,600 m · market 1,600 m · café 1,400 m · landmark 2,200 m
      │     = 8,000 m to "reach the landmark"                        ← the day's goal
      │     then: evening wander in the landmark zone, counting toward 42,195 m ← the marathon
      ├── Story beats pinned to route metres, not to time of day     ← unwatched = no beat
      │     wave 150 m · encounter 1,900 m · food 4,800 m · photo 7,900 m
      │     departure = rollover (time-based, always happens)
      ├── Local time drives light and crowd density; real weather drives sky and particles
      ├── One vote (closes at rollover) between 2–3 neighbouring countries with ready packs
      ├── One sponsor (patch on the backpack, disclosure chip, optional bottle skin)
      └── One recap (published at rollover: km, watchers by country, top country, stamp colour)
```

**Distance is the authority now, not seconds.** The server accrues
`global_distance_metres = Σ (1.25 m/s × pace(watchers)) dt`. Raw watched seconds still
exist and still drive the animation at 1×; distance is what the route consumes. Both are
server-owned, both are in the bootstrap, both extrapolate for at most 60 s on the client.

**Pace:** `pace(n) = min(1 + log2(n), 5)` → 1 watcher 1×, 2 → 2×, 4 → 3×, 8 → 4×, 16+ → 5×.
Copy: "1 watcher: walking. 4: brisk. 16: the internet is carrying him."

**Day outcomes**

| Outcome | Condition | Stamp |
|---|---|---|
| Landmark reached | ≥ 8,000 m by rollover | Colour stamp |
| Marathon | ≥ 42,195 m by rollover | Gold stamp + "MARATHON" ribbon; announced on X |
| Unfinished | < 8,000 m | Grey stamp with the km he managed, forever |

---

## 4. Add / cut / delay

### Add (before launch — these are the Codex prompts P1–P16)

1. Ghost strip removed; per-zone ground line and person height; he stands *on* the pavement at the right size.
2. Toon-shaded character with outline, contact shadow, and scene colour-grading so the 3D man and the painted city look like one image.
3. Distance-based route, day goals, progress bar, grey/colour/gold stamps.
4. Pace multiplier (server-side) + pace label + "bring a friend" copy.
5. Waiting state with `waiting_since`, "You're the first" card, first-watcher badge, share card.
6. Watchers by country: flags in the HUD, country leaderboard per day, `/country/<code>` pages.
7. Reactions (wave / water / photo), aggregated server-side, deterministic triggers.
8. Vote 2.0: neighbour candidates, closes at rollover, Day-1 name vote, countdown, "Tomorrow" reveal.
9. Local time-of-day lighting (day / golden / night) and real weather (Open-Meteo, free, no key).
10. Landing/HUD rewrite with the copy in §6, dynamic OG image per day.
11. Recap page per day + "post kit" for you (text + image ready to paste into X).
12. Sponsor pricing engine: public price, 7-day rolling window, founding price, tiers, real payment test.
13. Journey map page (`/map`): his path so far, the current city pulsing, tomorrow's candidates.
14. Performance: GLB compression, dead-asset removal, adaptive heartbeat, static assets on a free-egress CDN.
15. Pack generator CLI so a new city is a 2-hour job, not a 2-day job.

### Add (week 1–2 after launch)

- Background walkers (the resident rig at 40–60 % scale, various outfits), birds, a cat.
- Locals' corrections ("Are you from here? Tell us what's wrong") → private moderation queue → "Reviewed by 14 locals" badge.
- Personal postcard text ("He wrote to you from Baku…") using the pack's pre-written lines.
- The traveler's notebook: 8–12 pre-written lines per city that unlock per zone.
- Premium sponsor placements (bottle skin, café sign).
- "Buy him a ticket": a sponsor pays a fixed price to set a future day's country (see 05).

### Delay (Season 2 or never)

- Video timelapses, TikTok automation, multi-language UI, companion animals with their own rigs, merch, accounts/logins, free-text chat (never — moderation cost kills solo projects), live AI dialogue (never — it's in the constitution of this product).

### Cut / delete

- **"Day 1 / 195" in the UI.** Replace with `DAY 1 · SEASON 1`. Keep 195 in the About page as the dream.
- **The 150 s zone loop.** Replaced by distance.
- **Story beats pinned to wall-clock fractions.** Replaced by route metres (departure stays time-based).
- **The contact ground strip** (`groundRoot`) and the entire 2D puppet / sprite / Rive code paths and their assets (~3 MiB per city + 1.4 MiB sprites) — after P1–P2 land.
- **The `provisional_preview` hard block on launch.** You cannot get a qualified local reviewer for every city in 24 hours. Replace with the content-safety policy in §7 plus the locals' corrections loop. Keep the human (you) review step per pack.
- **The centred hero headline after the first 6 seconds.** It should only persist in the waiting state.

---

## 5. What a visitor sees (the screen, region by region)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ DAY 6 · SEASON 1                              🇬🇪🇺🇿🇩🇪🇺🇸 +9 · 13 watching  │
│ Tbilisi, Georgia · 13:52 · 21° ☀            The internet is keeping him  │
│                                              moving · ×4 pace            │
│                                                                          │
│                      [ the city, him on the pavement ]                   │
│                                                                          │
│   ┌ TRAVELER ─────────────────┐                                          │
│   │ Every balcony seems to    │        (dialogue bubbles near speakers)  │
│   │ be telling a story.       │                                          │
│   └───────────────────────────┘                                          │
│                                                                          │
│        → Walking · Rustaveli Avenue                                      │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━●────────────────  4.6 km · landmark at 8 km   │
│                                            marathon 11%                  │
│  [👋 Wave 3/5] [💧 Water] [📷 Photo]      [Vote: 🇦🇲 Armenia vs 🇹🇷 Türkiye · 4h 12m] │
│  Sponsor a day · $49  ·  Journey  ·  🔊                                   │
│  Sponsored today by Acme — acme.com                                       │
└──────────────────────────────────────────────────────────────────────────┘
```

**Top-left — where and when.** Day, season, city, country, local time, temperature and
weather icon (real). Tapping opens the map.

**Top-right — who.** Flags of the watchers' countries (up to 4, then "+9"), the count,
the honest sub-line, the pace. Tapping opens today's country leaderboard.

**Status pill.** Unchanged in spirit: never claims walking when he isn't.
States: `→ Walking · <zone label>` · `Taking a photograph` · `Talking · <resident>` ·
`Resting at the landmark` · `Waiting for the internet · since 03:12`.

**Goal bar.** One bar, two markers. Fills by distance. Turns gold past 42.2 km.

**Reactions.** Three buttons. Each shows the aggregate ("3/5"). When the threshold is hit
he does the action within 2 seconds, for everyone. Cooldown 60 s per visitor per button.
No free text anywhere in the product.

**Vote chip.** Candidates with flags, live percentages, countdown to close. One ballot per
visitor, enforced server-side, as today.

**Dock.** Sponsor a day (with the live price), Journey (details panel), sound.

**Sponsor line.** Disclosure chip; tapping goes through `/r/sponsor/<id>` as today.

**Waiting state** (nobody watching when you arrive):

```
        He's been waiting since 03:12 (2h 41m).
        You're the first person here.
        [ Keep watching · he starts walking in 3… ]
```
He starts walking after a 3-second beat (the `start_walk` transition already exists),
and the visitor gets the **"You woke him up"** card in the details panel with a share
button. This is the most shareable moment in the product; do not bury it.

**First visit onboarding.** A 4-second overlay, not a modal: *"You're watching. He's
walking. That's the whole idea."* Then it fades. The rule is explained by the sub-line
under the count, forever, so nobody needs a tutorial.

**Mobile.** Same regions, stacked: HUD top, scene middle, goal bar + reactions above the
dock. Dialogue as the compact top panel (already built). Reactions are the primary
touch targets — thumb-sized, bottom third.

---

## 6. Landing page copy (final)

Eyebrow: `ONE JOURNEY · LIVE ON THE INTERNET`

Headline (waiting state): **He only walks while someone is watching.**

Headline (live state, replaces the above after 6 s): none — the scene is the headline.

Sub-line under the watcher count (only one is ever shown):
- `The internet is keeping him moving · ×3 pace`
- `Nobody's watching. He's been waiting 2h 41m.`
- `Live count reconnecting · last confirmed 13`

Three-line explainer (About panel and OG description):
> One traveler. One country a day. He only moves while someone is watching — and the
> more people watch, the faster he goes. Tomorrow, the internet votes where he walks next.

CTAs (in order of visual weight):
1. *(none — watching is the action)*
2. `Vote for tomorrow` — with the live candidates
3. `Bring a friend → he walks faster` — share sheet (link + the personal steps card)
4. `Sponsor a day · $49` — with "price rises with the audience" microcopy
5. `Your passport` — stamps

Share card text (auto-generated):
- Steps card: "I kept him walking for 14 min in Tbilisi. 1,240 steps were mine. He only walks while someone is watching → keephimwalking.lol"
- First-watcher card: "I found him waiting alone in Baku at 04:12. He'd been standing there 2h 41m. → keephimwalking.lol"
- Country card: "🇬🇪 Georgia carried him 3h 12m today — #1 in the world. → keephimwalking.lol/country/ge"
- Recap card: "Day 6 · Tbilisi ✅ landmark reached · 31.4 km · 4,120 watchers from 61 countries · tomorrow: 🇦🇲 Armenia (52%)"

Footer: `Map · Passport · Sponsors · Locals: tell us what we got wrong · Privacy · Built by one person in Tashkent`

---

## 7. Content and cultural safety (replaces the hard review gate)

What every pack may contain: architecture, streets, parks, food, drinks, greetings, weather,
markets, music *names*, public landmarks, transport, animals, a friendly local resident.

What no pack may contain: religion in dialogue, politics, borders, flags of other states,
ethnic humour, stereotypes, alcohol as a joke, poverty as scenery, military, anything a
resident would be embarrassed to see a foreigner say about their city.

Every line a visitor reads is written in advance and reviewed by you against that list.
Add the "Locals: tell us what we got wrong" link; route corrections to a private queue;
fix within 24 h; show "Reviewed with help from N locals" on the country page. This is
both your review mechanism and a distribution mechanic.

---

## 8. Honesty rules (keep every one — they are the brand)

1. The count is live and server-derived. Never inflate it, never "round up".
2. The pace label is computed from the same count.
3. He never appears to walk while `walking = false`.
4. Distance and steps shown are server-confirmed or explicitly "extrapolated" / "last confirmed".
5. Sponsors are disclosed on screen and never influence dialogue.
6. A day that failed is shown as failed. Grey stamps are permanent.
7. Prices are public and the formula is public.
