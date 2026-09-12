# Keep Him Walking — final launch decisions

Product: keephimwalking.lol. Status: researched implementation brief, not a certification of the running application.

## Recommendation

Ship a focused Paris experience: the accepted traveler in the center, a stationary city painting, moving pavement, three understandable reactions, short encounters, and compact Journey and Sponsor panels. Fix startup identity, mobile layout, continuity, shared timing, and the reported freezes. Keep the approved character models and Mixamo clips.

The next work is a small set of product and runtime corrections. Do not restart character production, migrate rendering engines, or finish every deferred feature before validating with users.

Read this file first, then `01-MINIMAL-EXPERIENCE.md`, `02-RUNTIME-AND-RESEARCH.md`, and the execution prompt in `03-CODEX-PROMPTS.md`.

## Evidence and precedence

This review used all five supplied Markdown files and all nine current screenshots. No repository, browser recording, production trace, provider dashboard, or deployed application was available for execution. Implementation claims in the supplied documents remain reported claims until checked against the current code.

Resolve conflicts in this order: the owner's latest message; the screenshot of Codex's latest D1–D7 audit; the current implementation after inspection; older planning documents. New product choices below are recommendations made under the owner's request to decide and finalize; they are not claims that the choices already exist in code.

The owner's latest message supersedes the earlier request to improve the humans. It also supersedes London/Tashkent as Day 1, panning background paintings, and a permanent conversation launcher. Paris is Day 1. A historical Tashkent recap may remain historical; a current Paris bootstrap must never show it as today's city.

### What the screenshots establish

| Evidence | Finding | Consequence |
|---|---|---|
| Desktop startup images `1198…` and `81938…` | Tashkent appears before Paris; one startup shows the old illustrated traveler; the painting leaves a large blue strip at the right | Startup has inconsistent presentation/state and coverage, independently of character quality |
| Mobile startup `311bed…` | Old illustration, empty blue scene, oversized explanatory text and crowded controls | Rebuild the startup composition and loading sequence |
| Settled desktop `154e…` and mobile `ab70…` | Traveler sits right of center; status, conversation launcher, audience information, and voting compete for space | Reorganize the existing UI around the stage |
| Journey panel `407b…` and separate route `9fb…` | Navigation covers or leaves the walking scene | Keep an uninterrupted scene host and open internal content in panels |
| Latest audit `320458…` | Model is still 2.48 MB plus 1.9 MB of animation; D5/D7 remain unresolved; D2 is explicitly deferred | Do not use obsolete budgets or claim current capacity testing |

Screenshots cannot identify the cause of a freeze or prove the Wave request's lifecycle. Those require measurements and a short browser recording from the actual build.

## Close the deferred decisions

| Item | Decision | Required change |
|---|---|---|
| D1: model size | Accept the current 2.48 MB model for launch | Record model, animation, NPC, texture and total startup budgets separately. Approximately 4.38 MB for traveler model plus animation is the reported starting point, not the whole app. Do not soften the approved face to satisfy the old 1.8 MB target |
| D2: 1,000 viewers | Keep the owner's after-launch deferral | Preserve the test and mark September 6 results stale. Do not silently substitute a mandatory 500-viewer prelaunch load test |
| D3: lit windows | Deliberately omit the optional overlay | Keep the existing night image/grading. The current builder input is `lights.png` beside the zone's `master.png` if revisited later |
| D4: Sofia example | Close as superseded for this launch | Paris demonstrates independent paintings. Sofia is not a launch blocker |
| D5: scheduler | Use Vercel Pro's minute-frequency scheduling for the planned commercial deployment, plus idempotent catch-up | Prepare the configuration and safe reconciliation now. Account activation is an external dependency, not permission for Codex to purchase a plan |
| D6: movements | Accept the owner's current visual approval | No new Mixamo downloads, retargeting or animation polish. Fix misleading status copy where necessary. Do not advertise an unverified Premium bottle placement |
| D7: stuck landmark | Repeat all five paintings indefinitely during the day | One painting per 18 active walking minutes; independent of the crowd's distance multiplier. Preserve accumulated distance and achievements |

For clarity, scheduler timing is D5 in AFTER-P22; D3 is the optional dusk artwork. Both are resolved above.

## Timing: one explicit semantic change

The former 8 km route lasts about 106.7 walking minutes at ×1 and 21.3 at ×5. It cannot also hold each of five backgrounds for 15–20 minutes at every crowd size. This brief separates scenery pacing from collective distance.

Use 18 minutes of **active walking**, not wall time and not multiplied distance, per painting. Five paintings take 90 walking minutes. Conversations and other stopping actions lengthen elapsed time; no viewers means no active walking. Repeat arrival → lanes → market → café → landmark → arrival, with a short fade between stationary paintings. At three hours of uninterrupted walking, viewers have seen two complete cycles. At four hours they are partway through the third.

Keep the existing 8,000 m and 42,195 m numerical achievement thresholds, once per journey day. The first becomes **“Today's goal: 8 km together”**. It must no longer claim that reaching 8 km means physically arriving at the landmark. Keep existing postcard/reward eligibility at its distance threshold if required, but label it as a distance reward. The landmark encounter belongs to the landmark scene. More viewers boost collective distance; they do not force frantic clip playback or five times as many painting changes.

This intentionally supersedes distance-based scenery selection. Update product copy, route helpers, story triggers, tests, map interpretation and documentation together. The map represents the itinerary and current city, not literal GPS distance traversed across repeated paintings.

At 16:00 UTC, begin the next journey day through the existing authoritative rollover. Reset daily scenery/encounter counters and daily distance; retain season distance, contributions, recaps and earned history. The day must not end because the traveler reached the fifth painting or completed 8 km.

## Minimal launch scope

Keep Paris, approved traveler/NPCs, current art, day/night grading, three reactions, distance progress, one active ballot, Journey, Passport, sponsor information and existing sharing. Preserve Postgres authority and contribution accounting.

Remove oversized waiting/intro panels, duplicated location/status cards, the permanent “Read today's conversation” button, the large audience/globe/invitation cluster, and whole vote options stuffed into a footer button. Hide Tickets, Cheers and optional weather from launch navigation. Keep privacy/corrections reachable inside Journey/About.

Prepare Paris and one approved next-city fallback before promising a daily international itinerary. Use the actual reviewed content registry, not filenames alone, to establish readiness. Prefer a geographically coherent ready destination such as Brussels if its pack and transit are approved; do not declare it ready based on this brief. Other cities can enter a rolling content buffer later. If only Paris is ready, release a clearly described Paris beta and disable an unavailable destination ballot rather than sending viewers to missing art.

Preserve the existing Day-1 name vote followed by the destination vote: launch-to-noon naming, noon-to-16:00 destination, one chip at a time. Replace obsolete Central Asian or London-start candidates with reviewed options reachable from Paris using the existing transit rules. Reconcile any current “Paris market versus Eiffel Tower” ballot with the actual vote schema before changing it: the screenshots alone do not establish whether it is a preview fixture or the real destination vote.

Do not set September 23 or another date as live merely because it appears as a target in an old file. A countdown requires a real configured launch timestamp.

## Sponsorship: placement and commitments

Keep a small **“Sponsored today by Acme”** disclosure in a reserved footer row near the progress area. Link its name to the approved sponsor URL. It stays readable when the backpack faces away. The approved backpack patch stays in the world. Do not introduce a large banner, take over the center, or substitute “Partner” for a clear sponsorship label.

Opening Sponsor a day reveals a panel with the offer, seven eligible days, prices, inclusions, and purchase status. When paid booking is unavailable, say **“Sponsorship booking opens soon”** and explain the package. Do not show a working checkout or reservation countdown.

| Offer | Retained commercial promise | Launch treatment |
|---|---|---|
| Standard | Daily disclosure, backpack logo, approved link, permanent recap credit, recap mention on X, first-party impression/engagement/click report | Primary offer once payment eligibility and fulfillment are verified |
| Founding | Standard plus permanent founding credit in Sponsors and Passport | Days 1–7 presold at $29; never double-sell a founding day as normal inventory |
| Premium | Standard plus bottle branding during drinking and the café sign | Keep unavailable if either placement is not demonstrably fulfilled. This avoids reopening accepted animation work |
| Ticket / Cheer | Later experiments in the original plan | Defer; remove launch CTAs |

Retain the existing server formula in integer cents: `P = clamp(previous_completed_day_unique_watchers, 4900, 299900)`. That is one cent per unique watcher, minimum $49 and maximum $2,999. Lock a day's price when it opens. Premium is 1.5 times Standard, rounded to the nearest cent using an explicit server rounding rule; $49 becomes **$73.50**, not $74. At 40,120 watchers the uncapped price is **$401.20**. New days can be priced lower if the prior audience was smaller; remove “prices only go up” copy.

Normal inventory is D+1 through D+7, bounded by the 30-day season. The prelaunch founding offer is the explicit Days 1–7 exception. A sponsor buys a journey day, not a guaranteed city; explain when the destination is decided and the 16:00 UTC day boundary. With no fixed launch date, show journey-day numbers honestly instead of invented calendar dates.

Preserve the 30-minute inventory reservation, signed payment verification, idempotent delivery, `paid_pending_review`, creative approval, refund/rejection and audit history. Expired reservation versus late payment must reconcile transactionally; never charge two buyers for one slot or activate a sponsor merely from a browser redirect. Retain only approved name, logo and URL as public creative. Do not send outreach, receipts, or social posts from the implementation task without separate authorization.

### Payment-provider correction

The current plan's payment assumption is unsafe to carry forward: Lemon Squeezy explicitly lists website and social-media advertising as prohibited. My assessment is that the described sponsor package falls within that category. A successful integration or test payment does not establish permission to sell it. [^1].

For fast validation, launch the free experience with the sponsor information panel and paid checkout disabled. Resolve payment through a provider that accepts this advertising model and the owner's actual business/country, or obtain explicit written eligibility from the current provider before selling. Do not disguise advertising as a software download or donation. Do not automatically migrate to Stripe without verifying the merchant's eligibility. This review did not access an approved merchant account.

This is a blocker for **paid bookings**, not for completing the UI or releasing a free product experience on appropriate hosting.

## Production hosting and capacity

Vercel lists Hobby for personal, non-commercial use. An external scheduler does not remove that restriction. For this sponsored product on its existing Vercel stack, Pro is the straightforward recommendation. Its documented platform fee is $20/month with one deploying seat and usage credit; usage and taxes can add cost. Nothing has been purchased. [^2], [^3].

Smooth operation for 100–500 viewers is technically feasible with local rendering, cached assets and small shared-state messages. It is not yet demonstrated for this build. Supabase lists default connection limits of 200 on Free and 500 on Pro; actual account configuration must be inspected. A 500-connection ceiling leaves no room for extra tabs/reconnections at 500 people. [^4].

Do not buy infrastructure to fix an unprofiled one-person rendering freeze. First determine whether the pause is a rendering stall, scene reload, asset decode, or the existing 60-second stale-authority cutoff. File 02 specifies the investigation and capacity plan.

## Definition of ready

| Free experience launch | Paid bookings add these requirements |
|---|---|
| Correct Paris/current-character startup; complete image coverage | Provider eligibility for the real sponsorship offer and merchant |
| Mobile and desktop without overlaps; continuous scene through internal panels | Real checkout, signed webhook, duplicate/late-event and refund verification |
| Wave/Water/Photo show truthful lifecycle and visibly execute when eligible | Inventory correctness and approved creative display |
| All five scenes repeat; distance and daily rewards remain correct | Every sold placement demonstrated; otherwise sell Standard only |
| Scheduler catch-up and rollover verified in staging; correct production plan/configuration | Reporting and promised recap fulfillment have an operational owner |
| Reported one-person freeze investigated and corrected with before/after evidence | No unsupported promise of guaranteed impressions |
| One real phone check and desktop check; capacity limitations recorded | — |

The 1,000-viewer load test remains after launch. Record insufficient evidence honestly; do not mark “500 viewers supported” from a clean build or a dry run. Get a few people unfamiliar with the product to explain what makes him walk and successfully trigger a reaction before widening promotion. Continue the existing broader user-validation plan after the first small release.

This packet authorizes a concrete implementation candidate. It does not claim that the candidate has been built, visually accepted, deployed, or load-tested.

## Sources

Web sources accessed 11 September 2026. Publication/update dates are included where available.

1. Lemon Squeezy. [Prohibited Products](https://docs.lemonsqueezy.com/help/getting-started/prohibited-products).
2. Vercel. [Vercel Hobby Plan](https://vercel.com/docs/plans/hobby).
3. Vercel. [Vercel Pro Plan; updated 2 September 2026](https://vercel.com/docs/plans/pro-plan).
4. Supabase. [Realtime Limits](https://supabase.com/docs/guides/realtime/limits).

[^1]: Lemon Squeezy. [Prohibited Products](https://docs.lemonsqueezy.com/help/getting-started/prohibited-products). Accessed 11 September 2026.
[^2]: Vercel. [Vercel Hobby Plan](https://vercel.com/docs/plans/hobby). Accessed 11 September 2026.
[^3]: Vercel. [Vercel Pro Plan; updated 2 September 2026](https://vercel.com/docs/plans/pro-plan). Accessed 11 September 2026.
[^4]: Supabase. [Realtime Limits](https://supabase.com/docs/guides/realtime/limits). Accessed 11 September 2026.

### Supplied project evidence

These private files were supplied directly for this review; no public URL is available. Their claims were not independently verified against a repository. Where versions conflict, the latest owner instruction and status audit take precedence.

| File | Sections used |
|---|---|
| `AFTER-P22(2).md` | D1–D7: model budget, load deferral, lights, Sofia, cron, accepted motion, route behavior |
| `08-LAUNCH-READINESS(2).md` | R1–R9: presentation, authority, seed/city readiness, payment checks and weather scope |
| `DECISIONS(2).md` | Canonical product rules, Q11 pricing, 16:00 UTC rollover, 60-second extrapolation limit |
| `02-WORLD-AND-BACKGROUNDS(2).md` | City-pack and background design; superseded where the new stationary-painting decision differs |
| `05-SPONSORS-AND-PRICING(2).md` | Packages, founding inventory, price formula, calendar, payment and fulfillment assumptions |

Current screenshot inventory: `fc577213-0848-443b-b432-9c74fb03b4ec.png` (desktop waiting); `154e401f-6542-482d-848a-12db30243fa2.png` (desktop Paris walking); `1198dbf7-2043-4d86-8165-b2023f5e4014.png` (Tashkent startup); `407bac09-2dea-44e5-97e9-5a10c3398130.png` (Journey panel); `32045851-014f-4a33-8c43-c312331bb453.png` (latest D1–D7 audit); `311bedeb-0140-42c5-b11a-5eb600ef1984.png` (mobile startup); `ab70b1b9-6a97-4e5d-913d-e526287d00b3.png` (mobile Paris); `9fb71706-f5b3-4fc8-8368-6e1bc50dfe84.png` (separate Journey map); `81938be4-a12d-4743-ba1f-576498f65bbf.png` (startup strip and old illustration). All inspected as supplied attachments on 11 September 2026.
