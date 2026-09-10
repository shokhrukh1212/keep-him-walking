# Keep Him Walking — the plan from here to viral

Owner answers recorded on 8 September 2026 are authoritative in [DECISIONS.md](DECISIONS.md). Consult that register and [ROADMAP.md](ROADMAP.md) before executing these original prompts; some recommendations below have been superseded. Work found during implementation and deliberately deferred until every prompt is finished is in [AFTER-P22.md](AFTER-P22.md) — read it when P22 is done, before the launch checklist.

Written 8 September 2026 from the current repo state (`traveler-finalization-v2`),
`PRODUCT.md`, `TECHNICAL.md`, and six screenshots. Everything below is scoped to one
person, Codex, and a budget of roughly a domain plus $5–10.

## The files

| # | File | What it is |
|---|---|---|
| 01 | `01-PRODUCT.md` | The product, redefined: names, the daily loop, what to add / cut / delay, the landing page copy, HUD and UX spec, honesty rules. |
| 02 | `02-WORLD-AND-BACKGROUNDS.md` | How the world stops being a slideshow: panorama spec, image-generation prompt template, time of day, real weather, living details, per-zone ground-truth metadata. |
| 03 | `03-CHARACTERS.md` | The traveler and the locals: what to fix, the free path to a "premium enough" look, the expanded action list, dialogue rules, companions. |
| 04 | `04-IMPLEMENTATION-CHANGES.md` | Engineering changes in priority order, with the data-model and API deltas, cost/bandwidth protection, and what to delete. |
| 05 | `05-SPONSORS-AND-PRICING.md` | The sponsor products, the public price formula, the 7-day rolling window, tiers, the outreach script, the payment-provider check. |
| 06 | `06-LAUNCH-AND-GROWTH.md` | Pre-launch, launch day, the daily ritual, the "home team" country mechanic, post templates, KPIs, and the first 30 days. |
| 07 | `07-CODEX-PROMPTS.md` | 22 sequential prompts for Codex, each followed by "What you should see when it is done" so you can test and move on. |

## How to use this bundle

1. Read 01 → 06 once, in order (about 40 minutes). Decide the four things only you can
   decide — they are listed at the top of `01-PRODUCT.md`.
2. Copy `01`–`06` into the repo under `docs/plan/` (Prompt 0 in file 07 tells Codex to
   read them from there).
3. Run the prompts in `07-CODEX-PROMPTS.md` one at a time. After each one, check the
   "What you should see" block. Do not skip P1–P3; they are the credibility fixes.
4. Start the pre-launch checklist in `06-LAUNCH-AND-GROWTH.md` in parallel with
   P4–P12 — sponsor DMs and the X account do not depend on code.

## The five decisions this plan makes (so you don't have to re-decide them)

1. **He is not going to 195 countries in 195 days. He is walking Season 1: 30 days.**
   The 195 stays as the dream, not the promise. Seasons give you a finale, a rest, and
   a reason to come back.
2. **More watchers make him walk faster.** One watcher is walking pace; sixteen is
   5× pace. This is the single biggest change — it turns "someone is watching" into
   "we are carrying him", and it makes sharing do something.
3. **Every day has a goal you can fail.** Reach the day's landmark (8 km). Stretch: a
   marathon (42.2 km). Days that fail are stamped grey forever. Stakes are what people
   come back for.
4. **The vote is between neighbouring countries.** He walks, so tomorrow is next door.
   It keeps the map honest and turns every vote into a rivalry.
5. **The countries watching are visible, ranked, and thanked.** National pride is the
   distribution engine. It is how a solo developer in Tashkent reaches Georgia, Türkiye,
   and Germany without an audience.

Everything else is detail in service of those five.
