# 06 — Launch and Growth

> You have no audience. That is the constraint every clone of outbid.lol died on. This
> plan is built so the product borrows other people's audiences — countries', founders',
> and the 3 a.m. lonely-watcher's — until it has its own.

## 1. The thesis

People share three things about this product:

1. **A number they caused.** "I'm one of 13 people keeping him walking." → share cards.
2. **A country they belong to.** "Georgia is #1. Germany, wake up." → the home team.
3. **A moment they were alone for.** "Found him asleep on a bench in Baku at 4 a.m." → the waiting state.

Everything in the calendar below exists to produce one of those three.

## 2. Pre-launch (the 10 days while Codex works)

| Day | You do |
|---|---|
| T-10 | Buy the domain. Create `@keephimwalking` on X (also Bluesky, Threads, TikTok — reserve). Avatar: the backpack. Bio: "He only walks while someone is watching. One country a day. Live." Pin nothing yet. |
| T-10 | Do the Lemon Squeezy $1 test (05 §8). This is the only thing that can silently kill the plan. |
| T-9 → T-3 | DM 25 founders, close 7 founding sponsors (05 §6). Ask each for one post on their day. |
| T-8 | Set up a Telegram channel (Uzbekistan lives on Telegram) and post the same daily content there in Uzbek/Russian — your unfair advantage on Day 1 is that Day 1 is Tashkent. |
| T-7 | Record three 15-second screen clips on your phone: (a) him walking with the count going 1→2→4 and the pace label rising, (b) the waiting state → "You're the first" → he stands up, (c) the encounter. These are the launch assets; re-cut them, never re-shoot. |
| T-6 | Write the local-press email (§7) and send to 5 Uzbek tech outlets and 5 Central Asia / "Rest of World"-type outlets. Embargo: launch day 16:00 UTC. |
| T-5 | Draft the launch posts (§5). Draft the Show HN text. Draft the Reddit posts. |
| T-4 | Comprehension test: send the preview to 10 people who know nothing. Ask one question after 60 s: "What makes him move?" 8/10 must say "watching" unprompted. If not, fix the sub-line, not the product. |
| T-3 | Real phone test: a cheap Android and an old iPhone, on mobile data. 30 fps or reduce the tier. |
| T-2 | Seed Day 1 (Tashkent), the name vote, sponsor slots 1–7, prices. Rollover cron verified for 16:00 UTC. |
| T-1 | Post a teaser from your personal account only: clip (b), "Tomorrow at 16:00 UTC I'm putting a man on the internet who only walks when someone's watching. He starts in my city." |

## 3. Launch day (choose a Tuesday or Wednesday)

| UTC | Action |
|---|---|
| 15:30 | Confirm the site is on the production domain, `PHASE2_ENABLED` for production is on, the live count works from two phones. |
| 16:00 | Day 1 starts. Post from `@keephimwalking` (clip a): *"He only walks while someone is watching. Right now: 0. Be the first. → link"*. Then from your personal account: quote it with the story (1 person, Tashkent, built with Codex, $0 assets, one rule). |
| 16:05 | Show HN: *"Show HN: A traveler who only walks while someone is watching (one country a day)"*. First comment: the architecture paragraph (server-owned seconds, one pure function, no login, no AI dialogue). HN loves the honesty rules. |
| 16:10 | Reddit: r/InternetIsBeautiful (the sub was built for this), r/SideProject, r/webdev (technical angle), r/Uzbekistan (home team — in English + Uzbek), r/CentralAsia. One post each, no cross-posting spam. |
| 16:20 | Telegram channel + 10 Uzbek tech/startup groups: "Bugun u Toshkentda…" with the clip. |
| 16:30 | Product Hunt: submit for **the next day**'s launch (PH resets 00:00 PT; you want a full day), so PH traffic hits Day 2 when the vote is live and the recap of Day 1 exists. |
| 17:00–22:00 | Reply to everyone. Post the count every time it crosses a round number with a screenshot of the flags: "🇺🇿 🇩🇪 🇺🇸 · 87 watching · ×5 pace". |
| 22:00 | Post the vote: "Tomorrow: 🇹🇯 Tajikistan or 🇰🇿 Kazakhstan? He walks, so it has to be next door. Vote closes 16:00 UTC." |
| next 02:00–04:00 | If you're awake: the first quiet hour. Screenshot him waiting alone. "Nobody has watched for 41 minutes. He's standing on a boulevard in Tashkent at 3 a.m." This post outperforms the launch post. |

## 4. The daily ritual (30 days, same shape every day, 20 minutes of your time)

The app's post kit (`/api/admin/postkit/<n>`) gives you the text and the image; you paste.

| UTC | Post | Source |
|---|---|---|
| 16:00 | **Border crossing.** Recap card of the day that ended + "Day N: he's in {City}. Sponsored by @x." | post kit |
| 16:05 | **Home team call.** Tag the country: "🇬🇪 Georgia — it's your day. Keep him walking. Tell us what we got wrong: link" (plus a post in that country's main subreddit and any Telegram/Discord you can find) | post kit + §6 list |
| ~20:00 | **The moment.** One screenshot/clip: the encounter line, the photo he took, the weather ("it's actually raining in Tbilisi and he's walking in it") | you |
| ~23:00 | **Vote.** Candidates with live %. "Armenia 52 — Türkiye 48. 17 hours left." | post kit |
| whenever | **Reactive.** Round numbers, milestones ("1,000 km"), the country leaderboard flipping, a marathon completed, a day failing ("He didn't reach the landmark in Dushanbe. 6.1 km. Grey stamp. Forever.") | you |

Never post more than 5 times a day from the product account. Your personal account is
for the build-in-public thread: revenue, prices, screenshots of DMs from countries.

## 5. Post templates (the product account's voice: short, present tense, no hashtags, no emojis except flags)

- Launch: `He only walks while someone is watching. Right now: 0. Be the first.`
- Count: `🇺🇿 🇩🇪 🇺🇸 🇬🇧 +14 · 87 watching · ×5 pace. He's never moved this fast.`
- Waiting: `Nobody has watched for 2h 41m. He's asleep on a bench in Baku. It's 04:12 there.`
- Home team: `🇬🇪 Georgia, it's your day. He's on Rustaveli Avenue. You're #3 in the world right now. Armenia is #1.`
- Vote: `Tomorrow: 🇦🇲 Armenia or 🇹🇷 Türkiye. He walks, so it has to be next door. 52–48. Closes 16:00 UTC.`
- Recap: `Day 6 · Tbilisi. Landmark reached. 31.4 km. 4,120 watchers from 61 countries. 🇬🇪 carried him longest. Sponsored by @acme. Tomorrow: Armenia.`
- Fail: `Day 2 · Dushanbe. 6.1 km. He didn't reach the landmark. Grey stamp. That one's on us.`
- Marathon: `He just walked a marathon through Istanbul. 42.2 km. 9,013 people carried him. First one ever.`
- Price: `Tomorrow's sponsor slot: $412. Day 1 was $29. Price is set by yesterday's watchers.`
- Sponsor thanks: `Day 9 was sponsored by @x. Their logo walked 38 km through Almaty.`

## 6. The home-team playbook (the distribution engine)

For each country on the route, one page of prep, done the day before:

1. **Communities:** the national subreddit, the capital city's subreddit, 2–3 Telegram/Discord/Facebook groups (expats and locals), the country's tech-Twitter cluster (search "Tbilisi startup", "Georgian developers").
2. **Ask, don't announce.** The post is a question: *"He's walking through Tbilisi tomorrow — this is the route we drew (5 places). What did we get wrong? Which balcony should he stop at?"* Locals correct; corrections make them invested; invested people come back to check.
3. **The rivalry.** When the vote is between two neighbours, post in both. "Armenia is at 52 %." That sentence recruits the other 48 %.
4. **The leaderboard.** "Your country is #4. Germany is #1 and it's not even their day." National pride is the cheapest engagement on earth and it is honest here: the numbers are real.
5. **The stamp.** After the day: "Georgia's stamp. 31.4 km. Reviewed with help from 14 locals." Post it in their communities. They will share their own country's stamp.
6. **The phrase.** Every day's local phrase, with pronunciation, is a post. Native speakers correct it publicly. That's engagement, not a problem.

Route-specific first week:

| Day | City | Where to post the ask |
|---|---|---|
| 1 | Tashkent | Your own Telegram, r/Uzbekistan, Uzbek tech media (§7), Spot/Gazeta/Kun-type outlets, IT Park community |
| 2 | Dushanbe / Bishkek (vote) | r/Tajikistan, r/Kyrgyzstan, Central Asia Telegram groups, Kyrgyz IT community |
| 3–4 | Almaty | r/Kazakhstan (large, active), Kazakh startup Twitter, Astana Hub community |
| 5 | Baku | r/Azerbaijan, Baku expat groups |
| 6 | Tbilisi | r/Sakartvelo (the Georgia sub), Tbilisi expat/digital-nomad groups (very large), Georgian dev community |
| 7 | Istanbul | r/Turkey, r/istanbul, Turkish indie-hacker cluster on X (large and generous with reposts) |

## 7. Press (one email, 10 recipients, launch-day embargo)

Angle: *"A developer in Tashkent built a website that only works if you look at it."*
Second angle for tech press: *"No accounts, no AI-generated dialogue, no ads — one
number in a database decides whether a man walks."*

Targets: Uzbek tech/business outlets (you know them), Rest of World (they cover exactly
this: non-Western builders), TechCrunch's weekend/side-project writers, The Verge's
"weird web" beat, Hacker Newsletter, TLDR, Product Hunt's newsletter, and two
Central-Asia-focused English outlets. Include the 15-second clip (b) as a link and one
screenshot with flags. Offer: "He'll be in your city on day N if readers vote."

## 8. What goes viral (rank the bets, spend effort accordingly)

1. **The waiting screenshot at 3 a.m.** (people, not you, will post these — make the share card render the local time, the bench, the "waited since").
2. **The count with flags rising live** — post clip (a) every time a new all-time high happens.
3. **National rivalry votes** — Armenia vs Türkiye, Serbia vs Croatia, Austria vs Czechia. Choose candidates for drama when the map allows.
4. **The grey stamp** — a public, permanent failure. Countries will campaign to not get one.
5. **The public price** — founders share it when it's cheap ("$49, are you kidding") and when it's expensive ("$1,200 for a walking man").
6. **"Someone bought him a ticket to Portugal"** — week 2, when the Ticket product exists.
7. Founder reposts on their sponsored day.
8. Show HN and r/InternetIsBeautiful — one-day spikes; useful for the first 5,000.

## 9. KPIs (check daily at rollover; the recap page shows most of them)

| Metric | Day 1 target | Day 7 | Day 30 |
|---|---|---|---|
| Unique watchers | 5,000 | 3,000/day floor | 5,000/day floor |
| Median watch time | 90 s | 120 s | 150 s |
| Return visitors (D1 → D2) | — | 15 % | 25 % |
| Peak concurrent | 200 | 150 | 300 |
| Vote participation | 10 % of uniques | 15 % | 20 % |
| Share-card renders / uniques | 3 % | 5 % | 6 % |
| Sponsor sell-through (7-day window) | 7/7 (pre-sold) | 5/7 | 7/7 |
| Product account followers | 500 | 2,000 | 8,000 |

If median watch time is under 60 s on Day 3, the world is boring — ship P17 (living
details) before anything else. If return rate is under 10 %, the daily appointment
isn't landing — move the vote and the recap into the first screen.

## 10. The first 30 days

| Days | Ship | Do |
|---|---|---|
| 1–3 | Nothing new; fix what breaks; watch load | Reply to everything. Post the waiting screenshots. Collect corrections. |
| 4–7 | P17 living world, P18 corrections loop | Announce "Reviewed with help from N locals". Raise the price if the window sells out. |
| 8–12 | Ticket product, premium placements | Sell 2 tickets to founders from countries not on the map. Announce each. |
| 13–20 | Notebook lines, personal postcards, passport polish | Post the passport page: "Collect all of Season 1." |
| 21–28 | Season finale prep: `/season/1` page, the route poster (SVG map with all stamps) | Tease the finale city (the vote picks it; you pick the candidates). |
| 29–30 | Finale: a longer encounter, a `cheer` at the last landmark, the season poster share card | Recap thread. Revenue numbers, honestly. Announce Season 2's start date (two weeks later, with a break). |

## 11. Contingencies

- **Traffic spike breaks presence:** the server returns `heartbeatSeconds: 40`, the HUD shows "Live count reconnecting · last confirmed N". He keeps walking on the last confirmed state for 60 s, then honestly stops. Never fake the count.
- **Bandwidth bill:** assets on the free-egress bucket before launch (P18). Do not launch without this.
- **A sponsor is offensive:** the emergency removal path exists; the base patch shows; announce nothing.
- **A local says "this is wrong":** thank them publicly, fix within 24 h, credit them on the country page. This is the product working.
- **Someone builds a clone:** they will. Post your architecture. Clones copy the mechanic, not the world, not the countries, and not the community that has been correcting your Georgian for a week.
- **It doesn't go viral in week 1:** it doesn't need to. The home-team loop is a per-country launch. 30 countries is 30 launches. Keep the ritual.
