# Keep Him Walking — Implementation Plan

> Status: implementation-ready plan  
> Product model: one global 195-day journey, one country per day, one traveler who moves only while at least one visitor is actively watching  
> Visual direction: premium 2D/2.5D, not 3D  
> Payments: Lemon Squeezy  
> Product analytics: Vemetric

## Instructions for Codex

Before changing code:

1. Read this file and the separate product-context Markdown file completely.
2. Inspect the repository (`README`, package manager, framework, routes, database, environment conventions, lint/test/build scripts, and any `AGENTS.md`). Do not replace an established stack without a concrete reason.
3. Write a repository-specific task plan back to this file under **Execution checklist**, preserving the product decisions below.
4. Implement one phase at a time. After each phase, run type checking, linting, automated tests, and a production build. Fix failures before continuing.
5. Keep the experience usable with temporary art assets, but isolate placeholders behind the same asset contracts that production Rive and scene files will use.
6. Never fabricate live viewer counts, steps, sponsor results, or payment state.

If the repository is new, use the reference architecture in this document. If it already has equivalent services, adapt the names and paths while preserving the system boundaries and acceptance criteria.

---

## 1. Product outcome

Build a single-page live internet event called **Keep Him Walking**:

> One traveler visits one country each day. He only walks while someone is watching. Everyone shares the same day, scene, progress, scheduled encounters, vote, and sponsor.

The launch journey begins in Tashkent and lasts 195 country-days. The MVP launches with seven prepared country packs; it must not require 195 hand-built scenes before release.

### Primary visitor loop

1. Open the page and understand the rule within five seconds.
2. See the traveler walking in the current country and a truthful live watcher count.
3. Contribute steps while the tab is visible and the visitor remains active.
4. Observe frequent ambient behavior and a meaningful encounter within a reasonable session.
5. Vote on a daily choice or future destination.
6. Unlock a personalized, shareable postcard after a configured contribution threshold.
7. Share or return tomorrow to continue the journey.

### Sponsor loop

1. A potential sponsor opens the sponsor page/drawer.
2. They understand the exact placement, date, audience metrics, disclosure, price, and creative constraints.
3. They reserve or purchase an available country-day through Lemon Squeezy.
4. The server verifies the webhook and creates/updates the sponsorship record.
5. An admin approves assets and copy before activation.
6. The sponsor receives truthful impression, engaged-viewer, watch-time, postcard and click metrics.

### Non-goals for the first release

- No accounts for ordinary visitors.
- No 3D world, free roaming, game controls, chat, inventory, avatar customization, or open-world map.
- No live-generated AI dialogue.
- No bidding/auction engine in Phase 1 or 2.
- No hourly sponsor rotation; use one sponsor per day.
- No prebuilding all 195 countries.
- No claim that closing or backgrounding one browser pauses the entire journey if other active viewers remain.

---

## 2. Experience and visual specification

### Desktop composition

- Full-viewport scene is the product, not a hero illustration inside a conventional landing page.
- Minimal top HUD: `DAY n / 195`, city, country, local time/weather when available from curated content.
- Live status near the main subject: watcher count and whether the internet is currently keeping him moving.
- Bottom controls: contribution, daily vote, sound toggle, passport/archive, share, and subtle sponsor access.
- Sponsor treatment remains visible but restrained: backpack patch or shirt mark plus a clearly labeled sponsor card/CTA.

### Mobile composition

- Preserve the traveler and current action as the visual priority.
- Use a compact top HUD and bottom sheet for vote, dialogue transcript, share, and sponsor details.
- Keep primary controls within thumb reach and safe-area insets.
- Avoid tiny text embedded in canvas; interactive UI and dialogue should be semantic HTML.

### Premium 2D requirements

Use a hybrid 2D/2.5D pipeline:

- **Rive:** traveler/NPC rigs, expressions, props, action state machines.
- **PixiJS:** layered environment, parallax, weather, particles, lighting, moving shadows, camera.
- **React/HTML:** live metrics, dialogue, voting, share UI, sponsor CTA, accessibility.
- **Web Audio:** ambient loops and action cues, activated only after user interaction where browser policy requires it.

Premium quality comes from art direction and motion: proper character weight, foot contact, secondary clothing/backpack motion, eye direction, reaction beats, foreground/background parallax, restrained cinematic zoom, day/night color grading, soft shadows, ambient sound, and loading transitions that do not expose blank scenes.

### Activity cadence

Do not leave the character in an unchanged walk loop:

| Cadence | Examples | Scheduling rule |
|---|---|---|
| 20–60 seconds | look around, adjust backpack, check map, wave, react to weather | deterministic ambient pool; avoid immediate repetition |
| 3–5 minutes | photo, water, phone, brief rest, inspect landmark | globally scheduled or deterministic per time window |
| 15–30 minutes | NPC encounter and 30–60 second conversation | global event schedule with replay summary for late arrivals |
| 3–4 per day | major story beat, vote result, sponsored interaction | editorial schedule |

For first-time visitors, allow an early non-canonical “welcome beat” within 60–90 seconds without changing global story state. Label canonical scheduled events consistently.

### Core animation state contract

The traveler rig should expose states equivalent to:

`loading`, `idle`, `walk`, `notice`, `approach`, `talk`, `listen`, `react`, `wave`, `phone`, `drink`, `photo`, `sit`, `goodbye`, `resume_walk`

Expose data-bound properties/triggers for mood, facing direction, walking speed, sponsor patch/prop, active action, and reduced-motion mode. Keep dialogue text outside `.riv` files.

### Encounter sequence

`walk → notice → slow/turn → approach → camera focus → greeting → alternating talk/listen/reaction → goodbye → camera restore → walk`

Dialogue is structured content, not hard-coded animation:

```ts
type DialogueLine = {
  speaker: 'traveler' | 'npc';
  text: string;
  mood: 'neutral' | 'curious' | 'surprised' | 'amused' | 'thoughtful';
  durationMs?: number;
};

type Encounter = {
  id: string;
  countryDayId: string;
  npcId: string;
  locationLabel: string;
  startsAt: string;
  lines: DialogueLine[];
  nextStoryBeatId?: string;
  sponsorIntegration?: { sponsorshipId: string; disclosure: string };
};
```

---

## 3. Reference technical architecture

For a new repository, prefer:

- Next.js App Router + TypeScript.
- Tailwind CSS for UI.
- PostgreSQL for durable content, votes, sponsorships, daily aggregates, and processed webhooks.
- A real-time presence provider that supports ephemeral channels/heartbeats (for example, the existing database platform’s realtime presence feature).
- Object storage/CDN for `.riv`, scene atlases, audio, postcard backgrounds, and sponsor assets.
- Background/cron execution for day rollover, event publication, and metric aggregation.
- `@rive-app/react-webgl2` or the current official React/WebGL2 runtime.
- `pixi.js` loaded client-side only.
- Vemetric browser SDK for page views/interactions and its server SDK for trusted backend events.

### Critical separation of responsibility

| Concern | Source of truth |
|---|---|
| Current country/day and scheduled event | server UTC timestamps + database |
| Active people currently watching | realtime presence heartbeats |
| Global steps | server-derived active-viewer time, persisted in buckets/aggregates |
| Visitor’s displayed contribution | local session estimate reconciled with server |
| Votes/results | database with idempotent anonymous voter key |
| Sponsorship/payment status | Lemon Squeezy webhook state |
| Product analytics/funnels | Vemetric |
| Sponsor reporting | first-party event/aggregate tables; optionally mirror key events to Vemetric |

Vemetric must not be polled to power the live watcher counter. Analytics ingestion and presence are different workloads.

### Suggested modules

```text
app/
  page.tsx
  archive/page.tsx
  sponsor/page.tsx
  api/bootstrap/route.ts
  api/presence/heartbeat/route.ts
  api/votes/route.ts
  api/postcards/route.ts
  api/sponsor/checkout/route.ts
  api/webhooks/lemonsqueezy/route.ts
components/
  scene/
  traveler/
  dialogue/
  hud/
  vote/
  sponsor/
  postcard/
lib/
  story-clock/
  presence/
  steps/
  analytics/
  payments/
  validation/
content/countries/
public/scenes/
public/rive/
public/audio/
```

Adapt this layout to the current repository rather than duplicating existing conventions.

---

## 4. Data model

Use migrations and explicit indexes/constraints. Names may be adapted.

### Durable tables

#### `journeys`

- `id`, `slug`, `title`, `starts_at`, `total_days`, `status`, timestamps.

#### `country_days`

- `id`, `journey_id`, `day_number`, `country_code`, `country_name`, `city_name`.
- `starts_at`, `ends_at` (UTC; non-overlapping).
- `scene_pack_id`, `status`, `story_summary`, `postcard_background_url`.
- Unique: `(journey_id, day_number)` and `(journey_id, starts_at)`.

#### `story_events`

- `id`, `country_day_id`, `type`, `starts_at`, `duration_seconds`, `payload_json`, `status`.
- `type`: `ambient_window`, `action`, `encounter`, `vote_open`, `vote_result`, `sponsor_moment`, `departure`, `arrival`.
- Index: `(country_day_id, starts_at)`.

#### `votes` and `vote_options`

- Vote: question, open/close timestamps, result publication timestamp, status.
- Option: label, payload, display order.
- Ballot: `vote_id`, privacy-safe anonymous voter hash, option, created timestamp.
- Unique: `(vote_id, voter_hash)`; enforce on server.

#### `step_buckets`

- Time-bucketed aggregates: `country_day_id`, bucket start, active viewers, contributed viewer-seconds, calculated steps.
- Unique bucket key; updates must be idempotent.

#### `postcards`

- `id`, opaque public token, country day, anonymous visitor hash, step number/range, generated asset URL, created timestamp.
- Never expose sequential internal IDs.

#### `sponsor_slots`

- Country day, availability, public price/currency, reservation expiration, sponsorship ID.
- In MVP, use fixed pricing or manual quote; leave auction fields out until needed.

#### `sponsorships`

- Sponsor name/site/CTA, placement copy, creative asset references.
- Lemon Squeezy order/subscription identifiers where applicable.
- `status`: `draft`, `checkout_pending`, `paid_pending_review`, `approved`, `scheduled`, `live`, `completed`, `rejected`, `refunded`, `cancelled`.
- Creative approval metadata and disclosure text.

#### `payment_webhook_events`

- Provider event identifier or deterministic hash, event name, received timestamp, processing status, payload checksum, error.
- Unique event identity for idempotency.

#### `sponsor_metric_events` / `sponsor_daily_metrics`

- First-party impression, engaged-view, CTA click, postcard creation/share, qualified session and watch-time aggregates.
- Do not store raw high-frequency heartbeats forever; aggregate and expire raw operational data.

### Anonymous visitor identity

- Generate a random first-party visitor UUID and store it in a privacy-appropriate cookie/local storage according to consent requirements.
- Hash it with a server-side secret before durable voting/reporting storage.
- Do not use IP address as the visitor identity.
- Rate-limit votes, postcard generation, sponsor clicks, and heartbeat abuse.

---

## 5. Global clock, presence, and step semantics

### Bootstrap

`GET /api/bootstrap` returns one validated snapshot:

- authoritative server timestamp;
- current country day;
- current/next scheduled event;
- current vote and aggregate results allowed for display;
- sponsor presentation data;
- latest global step aggregate;
- asset manifest/version.

The client calculates a server-time offset once and resynchronizes periodically. Story progression is derived from timestamps, not from a browser timer that restarts on refresh.

### Active watcher definition

A viewer counts as active only when:

- page visibility is `visible`;
- the scene is mounted and successfully initialized;
- a heartbeat was received within the presence TTL;
- optional inactivity policy has not expired.

Send visibility/focus changes immediately and heartbeat approximately every 15–25 seconds with jitter. Use a TTL around 45–60 seconds. Disconnect cleanly when possible, but correctness must rely on TTL because browsers do not guarantee unload calls.

### Walking rule

- If active watcher count is greater than zero, global walking time advances.
- If it is zero, the traveler transitions to idle/rest and walking-time accumulation pauses.
- Scheduled editorial events still use wall-clock UTC. If a major event occurs during zero presence, mark it replayable/recappable rather than corrupting the schedule.
- Define a configurable `STEPS_PER_ACTIVE_SECOND`. Global steps are based on elapsed time while the project has at least one active viewer, not multiplied by total viewers. Individual contribution can be based on that visitor’s own active seconds.

This avoids claiming that 1,000 open tabs make one traveler physically walk 1,000 times faster.

### Scale path

Start with one presence channel and server-side bucket aggregation. Do not write one database row per heartbeat. If traffic grows, move presence/counter aggregation to a low-latency ephemeral store and flush idempotent minute buckets to PostgreSQL.

---

## 6. Lemon Squeezy integration

### MVP commercial model

Use one sponsor per country-day. Start with fixed-price slot purchase or an inquiry + admin-issued checkout. Do not build auctions until traffic and sponsor demand justify them.

### Checkout flow

1. Server validates that the slot is available and creates a short reservation.
2. Server creates or selects the Lemon Squeezy checkout.
3. Pass only non-sensitive custom data needed to correlate the purchase, such as internal sponsorship/slot IDs.
4. Redirect/open overlay.
5. The success page shows “payment received, creative pending review”; it does not activate the sponsor.
6. A verified webhook moves the sponsorship to `paid_pending_review`.
7. Admin approval schedules activation.

### Webhook requirements

- Read the raw request body before parsing.
- Verify the `X-Signature` using the webhook secret with a timing-safe comparison.
- Read the event name from `X-Event-Name`.
- Store and deduplicate webhook events before applying transitions.
- Handle at minimum order creation/refund and, only if subscriptions are used, subscription create/update/cancel/expire events.
- Make processing idempotent and tolerant of retries/out-of-order delivery.
- Return success promptly; perform slow work asynchronously when infrastructure supports it.
- Never trust price, sponsor ID, slot, or paid state supplied only by the browser.
- Keep API keys and webhook secrets server-only.

### Sponsor asset safety

- Restrict file types, byte sizes, dimensions, and URLs.
- Moderate/approve all sponsor creative and claims.
- Render external links with safe attributes and validate protocols.
- Always display a clear `Sponsored` label near integrated promotion.

---

## 7. Vemetric measurement plan

Install both client-side analytics (page views and browser interactions) and server-side tracking for trusted conversions. Do not send secrets or unnecessary personal data.

### Canonical events

Use one naming convention consistently (prefer `snake_case`):

| Event | Source | Important properties |
|---|---|---|
| `journey_viewed` | client | day, country, referrer/UTM |
| `scene_ready` | client | load_ms, asset_version, device tier |
| `watch_session_started` | client | day, country |
| `contribution_milestone` | client/server | seconds, steps, day |
| `story_event_viewed` | client | event_type, event_id, completion |
| `dialogue_completed` | client | encounter_id, duration |
| `vote_submitted` | server | vote_id, option_id, day |
| `postcard_unlocked` | server | day, threshold |
| `postcard_shared` | client | channel, day |
| `sponsor_impression` | client + dedupe | sponsorship_id, placement |
| `sponsor_cta_clicked` | server redirect | sponsorship_id, placement |
| `sponsor_page_viewed` | client | source |
| `sponsor_checkout_started` | server | slot/day, price, currency |
| `sponsor_payment_confirmed` | verified webhook/server | slot/day, amount, currency |

### Funnels and KPIs

- Visitor: `journey_viewed → scene_ready → 30s active → vote/postcard → share → next-day return`.
- Sponsor: `sponsor_page_viewed → checkout_started → payment_confirmed → creative_approved`.
- Core daily dashboard: unique viewers, qualified viewers (for example ≥30 seconds), median/p75 watch time, watcher-to-voter rate, postcard unlock/share rate, next-day return rate, sponsor CTR, paid sponsor revenue.
- Operational performance: scene load time, Rive/Pixi initialization failure, FPS/device tier, API error rates.

Vemetric is the analysis layer. Keep auditable sponsor billing/reporting aggregates in the application database so historical reports do not depend on a third-party dashboard definition.

---

## 8. Phased implementation

## Phase 1 — Premium vertical slice

**Goal:** prove the core emotional and technical loop with one country before building commerce or a content pipeline.

### Build

- Responsive full-screen page and accessible HUD.
- One Tashkent scene using layered parallax and temporary/production-compatible assets.
- Traveler state adapter with walk/idle plus at least four ambient actions.
- One short NPC encounter with anchored desktop bubbles and mobile bottom dialogue panel.
- Bootstrap endpoint and server-time synchronization.
- Honest realtime presence and walk/idle rule.
- Global step aggregation and visitor contribution display.
- One daily vote with anonymous, idempotent submission.
- Sound opt-in, reduced-motion behavior, and static fallback.
- Vemetric base setup and the visitor events through `vote_submitted`.
- Error/loading/offline states.

### Acceptance criteria

- Two browsers see the same country, event timing, vote state and approximately reconciled step total.
- Closing/backgrounding the final active browser causes idle after TTL; another active browser keeps him walking.
- Refresh does not restart the day, encounter, or global steps.
- A visitor understands the premise without scrolling.
- Mobile layout works at 320px width and respects safe areas.
- Keyboard navigation, readable contrast, semantic buttons/status text, captions/transcript, reduced motion and mute are supported.
- Production build passes and scene remains usable when Rive, audio, analytics, or realtime temporarily fails.

### Exit gate

Phase 1 establishes the truthful shared-state baseline. Its database and external-test evidence must still pass, but the visual screenshot alone is no longer sufficient to authorize Phase 2. Complete the Phase 1.5 visual-motion proof below before starting Phase 2.

## Phase 1.5 — Continuous world visual-motion proof

**Goal:** prove that watching produces unmistakable forward travel through a changing country-specific world, while retaining the truthful shared clock, premium 2D direction and renderer ownership established in Phase 1.

### Non-negotiable experience contract

- A country-day resolves one distinct, immutable and versioned country pack from `country_days.scene_pack_id`. Every pack owns its architecture/landscape layers, ground, foreground/background props, vegetation, weather, lighting, NPC variants, encounters, structured dialogue, ambient audio, landmark/event stages and postcard background. Recoloring or relabeling another country's scene is invalid.
- Every country pack defines 4–6 ordered route zones. The completed Phase 1.5 Tashkent v3 pack defines five: arrival boulevard, mahalla street, Chorsu market, plov café and evening landmark/departure. At least three must be connected and demonstrated for the proof.
- Zones stream continuously with deterministic modular segments. The next zone is preloaded and spawned beyond the right edge; passed segments are culled left. No page navigation, visible loading boundary or pan/zoom of one flat image may stand in for route movement.
- The canonical route distance derives from server-reconciled `journey_runtime.global_active_seconds`, not a client-only timer. All clients map the same authoritative active-walking time to the same zone, segment index and event stage. Scheduled story events may temporarily pin an event stage, but they cannot fork the shared route.
- The traveler remains around 55–65% of viewport width while ground/foreground move left fastest, near architecture at medium speed, and distant architecture/sky/weather slowly. At least three independently moving depth bands must remain visible during walking.
- Locomotion follows `idle → start_walk → walk → slow_walk → stop → action/encounter → resume_walk`. The environment and character ease together. After the last lease expires, authoritative route distance stops and the character settles into idle/rest; a later active watcher resumes from that distance.
- Rive remains the production character/NPC state-machine owner. A technically equivalent articulated temporary rig is acceptable for the Phase 1.5 proof only if it implements the same inputs/transitions, visibly alternates limbs with planted feet, adds body motion and follow-through, and can be replaced without changing world or React contracts.
- PixiJS owns route segments, pooling/culling, parallax, camera, weather, lighting and event-stage transforms. React/HTML owns HUD, onboarding/help, dialogue, accessibility and future sponsor UI.
- The large premise headline is onboarding only. It exits after 5–8 seconds or once walking begins, while a compact persistent rule/status affordance remains.

### Route and encounter behavior

- Route motion is deterministic from `{countryDayId, assetVersion, globalActiveSeconds}`. Segment variation uses a seeded sequence and forbids an identical composed segment signature inside a rolling 12-segment window.
- Each Tashkent zone supplies one coherent, non-looping illustrated panorama, feather-blended ground variants and independently moving illustrated prop depth tracks. Together they provide at least three motion depths without slicing opaque architecture into mismatched bands. Lighting/audio crossfade and the complete next-zone asset set begins loading during the preceding zone.
- An encounter timeline is server-time-addressable and drives one coordinated command stream: `walk → notice → decelerate → approach → camera pan/zoom → greeting → talk/listen/react → goodbye → camera restore → resume_walk`. Background life continues at reduced amplitude during dialogue.
- The route may anchor the traveler for camera stability, but visible foot motion, moving shadow, ground displacement, parallax and incoming/culling scenery must together make progress unambiguous.

### Device-quality tiers and budgets

| Tier | Initial selection | Motion target | Runtime limits |
|---|---|---|---|
| Low mobile | reduced motion, ≤4 logical cores, ≤4 GB device memory when exposed, or manual override | 30 FPS median; p95 frame duration ≤50 ms | DPR 1, ≤80 live Pixi display objects, ≤96 MiB estimated decoded textures, weather/particles disabled |
| Mid mobile | capable phone/tablet not classified low | 50 FPS median; p95 frame duration ≤33 ms | DPR ≤1.25, ≤140 live objects, ≤160 MiB decoded textures, reduced particle/weather density |
| High/desktop | capable desktop GPU and viewport | 60 FPS median; p95 frame duration ≤25 ms | DPR ≤1.6, ≤220 live objects, ≤224 MiB decoded textures |

All tiers must keep the live object count bounded and avoid monotonic JavaScript heap growth greater than 25 MiB after warm-up during the 10-minute soak. Reduced-motion mode uses discrete zone tableaux and restrained crossfades without continuous camera travel; static fallback still exposes the current zone, event, rule and dialogue semantically.

### Acceptance criteria

- A distinct versioned Tashkent v3 country pack contains 4–6 route zones, and at least three connected zones are demonstrated without navigation or visible loading.
- The traveler visibly walks using a production-compatible Rive rig or technically equivalent replaceable temporary rig with alternating limbs, foot planting, body motion, secondary follow-through and a moving ground shadow.
- At least three depth layers move independently; props/buildings enter from the right and are culled after leaving the left.
- The canonical route and locomotion state stop naturally after the final watcher TTL and resume naturally when a watcher returns.
- One NPC encounter decelerates the route, performs the complete dialogue/camera sequence and restores walking.
- The onboarding headline yields the viewport after 5–8 seconds or the start of walking, while a compact walking-rule affordance remains.
- A continuous 10-minute observation shows no obvious short background loop, unbounded object growth or memory leak.
- Low- and mid-range physical phones meet the repository targets above, and reduced-motion/static fallbacks remain understandable and usable.
- Evidence includes a video recording or witnessed manual QA session with synchronized route diagnostics; a screenshot cannot close the gate.

### Exit gate

Do not begin Phase 2 until the original Phase 1 database/external evidence and every Phase 1.5 criterion have recorded evidence in the repository test-result documents, with no critical truthfulness, visual-motion, mobile-performance or accessibility defect open.

## Phase 2 — Launchable seven-day MVP + monetization

**Goal:** make the product returnable, shareable, sponsorable, and operable for a seven-country launch.

### Build

- Country-pack schema and seven validated content packs.
- Asset preloading: current critical assets first; next scene opportunistically.
- Expanded reusable rig: 12 foundational actions and at least two reusable NPC bases.
- Cadence scheduler, encounter replay/summary, three to four major daily beats.
- Postcard generation, opaque URL, download and Web Share API with copy-link fallback.
- Passport/archive pages for completed country-days.
- Day rollover job with idempotent state transition and smoke validation.
- Sponsor inventory/slot UI and sponsor information page.
- Lemon Squeezy checkout, webhook verification, payment state machine, refunds/cancellation handling as applicable.
- Minimal protected admin interface or secure operational scripts for content scheduling, sponsor approval, creative upload and emergency sponsor removal.
- Sponsor placement, disclosure, redirect click tracking and first-party report aggregates.
- Complete Vemetric funnels and server-side conversion events.
- SEO/Open Graph metadata and dynamic share image/postcard metadata.

### Acceptance criteria

- A scheduled UTC rollover selects the correct pack without deployment.
- All seven packs satisfy schema validation and asset budget checks.
- Payment success in the browser cannot activate sponsorship without a valid webhook.
- Replaying the same webhook does not duplicate payment, slot or analytics records.
- A paid sponsor cannot go live before approval.
- Sponsor impressions and clicks are deduplicated under documented rules.
- Postcard does not reveal visitor identifiers and renders correctly on major share previews.
- Performance budgets pass on mobile: define repository-specific targets, aiming initially for LCP ≤2.5s on a representative fast 4G test, responsive interaction, stable layout, and no sustained animation jank.

### Exit gate

Run a private rehearsal covering the full seven-day schedule at accelerated time: rollover, event playback, vote close/result, postcards, checkout/webhook/refund, sponsor removal, analytics and fallbacks.

## Phase 3 — Public launch hardening and growth

**Goal:** safely handle attention spikes and create an efficient repeatable content/sponsor operation.

### Build

- Load tests for bootstrap, presence, voting, postcard creation and sponsor redirect.
- Bot/rate-limit controls and aggregation scale path.
- Monitoring, structured logs, alerting, webhook replay tooling and operational runbook.
- Admin preview/staging mode for complete country-day rehearsal.
- Content validation CLI/schema and asset budget report.
- Localization infrastructure; launch English first if necessary, then add reviewed translations.
- Sponsor report export with definitions for every metric.
- Retention mechanics: tomorrow preview, calendar reminder/download, country notification opt-in if justified.
- Experiment framework for copy/cadence/share CTA without changing the core walking rule.
- Additional country packs created just ahead of schedule, maintaining a safe editorial buffer.

### Explicitly defer

- Auction/bidding until repeated sponsor demand exists.
- Live AI dialogue until editorial safeguards and a clear benefit exist.
- User accounts unless cross-device collection/notifications prove valuable.
- More animation technology unless Rive/Pixi performance evidence requires it.

---

## 9. Asset and content pipeline

Define a versioned manifest per country pack:

```ts
type CountryPack = {
  schemaVersion: 1;
  countryDayId: string;
  countryCode: string;
  scene: {
    atlasUrl: string;
    layers: Array<{ id: string; depth: number; speed: number }>;
    palette: { day: string[]; night: string[] };
  };
  travelerRiveUrl: string;
  npcAssets: string[];
  audio: Array<{ id: string; url: string; loop: boolean }>;
  encounters: Encounter[];
  preload: string[];
};
```

Add automated validation for missing files, duplicate IDs, invalid timestamps, overlapping major events, oversized assets, missing sponsor disclosure, unavailable dialogue speaker/mood/action, and inaccessible URLs.

Production workflow:

1. Research country with local/cultural review.
2. Write story beats/dialogue.
3. Illustrate modular layers and NPC variations.
4. Animate only new motions not covered by the master rig.
5. Assemble manifest and schedule.
6. Validate automatically.
7. Preview the entire day in accelerated mode.
8. Editorial and sponsor approval.
9. Publish immutable version; rollback by manifest version.

---

## 10. Performance, resilience, accessibility, and security

### Performance

- Dynamically import Pixi/Rive client-only and keep marketing/HUD HTML renderable immediately.
- Serve compressed, cache-versioned assets through a CDN.
- Load only current scene essentials; lazy-load encounters and future scenes.
- Pause heavy rendering when hidden; still send the visibility transition.
- Adapt particles, resolution and effects to device capability.
- Avoid React state updates per animation frame.
- Dispose textures, sounds, observers and Rive instances on unmount.

### Resilience

- If realtime fails: show “Live count reconnecting,” never a fake number; use last confirmed aggregate for global steps with a stale label.
- If WebGL fails: use Canvas/static scene fallback with semantic story UI.
- If audio fails/blocked: continue silently.
- If Vemetric fails: product behavior and checkout continue.
- If sponsor asset fails: show approved text sponsor card without broken imagery.
- If no sponsor: explicitly show “Today is unsponsored” and a sponsor CTA.

### Accessibility

- Honor `prefers-reduced-motion`; offer a persistent motion control.
- Provide all dialogue as text, sound controls, captions/transcripts, keyboard operability and visible focus.
- Use an ARIA live region sparingly for major status changes, not every step/count update.
- Avoid relying on color alone and avoid rapid flashes.

### Security/privacy

- Validate all request bodies with schemas.
- Apply CSRF/origin protections where relevant, security headers and strict URL allowlists.
- Rate-limit anonymous mutation endpoints.
- Keep sponsor/admin mutations authenticated and authorized.
- Verify Lemon Squeezy webhook signatures from raw bytes.
- Minimize retention and document cookies/analytics/consent behavior for launch markets.
- Escape/sanitize content even when it comes from an internal CMS.

---

## 11. Testing strategy

### Unit tests

- UTC country-day resolver and boundary times.
- Event progress from server-time offset.
- Walking/idle and step accumulation rules.
- Presence TTL transitions.
- Vote uniqueness.
- Sponsorship state transitions.
- Webhook signature verification and idempotency.
- Sponsor metric deduplication.
- Content manifest validation.

### Integration tests

- Bootstrap snapshot.
- Two-client presence join/leave/background behavior.
- Vote submit/retry/concurrent submit.
- Checkout correlation and verified webhook lifecycle.
- Day rollover and event publication retry.
- Postcard generation and opaque access.
- Vemetric calls are non-blocking and trusted purchase events originate server-side.

### End-to-end tests

- First visit → scene ready → contribution → encounter → vote → postcard → share.
- Sponsor page → checkout test mode → webhook → pending review → approval → scheduled/live.
- Mobile, reduced-motion, WebGL-disabled, offline/reconnect and analytics-blocked paths.

### Manual visual QA

- Test common desktop/mobile sizes and at least one low/mid-range physical phone.
- Watch every transition at normal and accelerated timing.
- Check character ground contact, parallax direction, dialogue anchoring, sponsor disclosure, lighting transitions and audio loop seams.

---

## 12. Deployment and environment configuration

Create `.env.example` using the repository’s naming conventions. Expected categories:

- Database URL/service credentials.
- Realtime/presence configuration.
- Public Vemetric project token and private/server configuration if required.
- Lemon Squeezy API key, store ID, variant IDs, webhook secret and test/live mode.
- Application base URL.
- Object storage/CDN configuration.
- Cron/admin secrets.
- Anonymous identity hashing secret.

Never commit live values. Maintain separate development/test/production projects and Lemon Squeezy test mode. Add a deployment health check that verifies database connectivity and content availability without exposing secrets.

---

## 13. Launch checklist

- Product rule visible and understandable in first viewport.
- Day 1–7 content and assets approved, validated and rehearsed.
- At least a one-week content-production buffer exists.
- Presence and steps are truthful under multi-tab, disconnect and traffic-spike tests.
- Sponsor disclosure and creative approval work on every breakpoint.
- Lemon Squeezy webhook test cases pass, including duplicate and refund.
- Vemetric dashboards/funnels receive client and server events without blocking UX.
- Privacy policy, terms, sponsor terms, refund/creative policy and contact route published.
- Static/reduced-motion/audio-off fallbacks checked.
- Monitoring, alerts, rollback and sponsor-removal runbook tested.
- Share metadata/postcards tested on major platforms.
- Launch copy and daily short-form social content prepared.

---

## 14. Definition of done

The MVP is done when a new visitor can open one URL, immediately understand why the traveler is moving, see unmistakable synchronized forward travel through a continuously changing premium 2D country route, truthfully contribute to his walking, encounter an evolving story, vote, create/share a postcard, and return for a visually distinct new country—while an approved sponsor can securely purchase one clearly disclosed day and receive auditable metrics.

The product is not done merely because the walk animation loops or a checkout succeeds. The synchronized shared state, content cadence, mobile performance, sponsor integrity, measurement quality and graceful fallbacks are all part of the MVP.

---

## 15. Execution checklist

Updated after repository inspection and Phase 1/1.5 implementation on 2026-09-01. Check off implementation and verification items only after their evidence exists.

### Repository baseline

- [x] Repository architecture and constraints documented: documentation-only seed with `implementation-plan.md` and `product_context.md`; no application code, README, package manifest, database, migrations, tests, `AGENTS.md`, reusable services or usable Git metadata. Local tooling provides Node.js 22.22.1, npm 9.2.0 and pnpm 11.3.0.
- [x] Stack selected without replacing existing code: pnpm, Next.js App Router, TypeScript, Tailwind CSS, Supabase PostgreSQL/Realtime, PixiJS, Rive WebGL2 adapter, React/HTML UI, Web Audio, Vemetric and Vercel.
- [x] Architectural boundaries recorded: Pixi owns environment/camera; Rive or the compatible sprite fallback owns character rendering; React owns dialogue and controls; the server clock/database own shared state; Supabase Presence is a wake-up signal while server-reconciled leases own truthful counts/steps; Vemetric never powers live state.

### Phase 1 file and dependency map

- [x] Foundation: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.json`, `next-env.d.ts`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `.env.example`, `README.md`, `AGENTS.md`, `CLAUDE.md` and `src/app/{layout,page,loading,error,globals}.tsx`.
- [x] Runtime dependencies installed and locked: `next`, `react`, `react-dom`, `pixi.js`, `@rive-app/react-webgl2`, `@supabase/supabase-js`, `@vemetric/web`, `@vemetric/node`, `sharp` and `zod`.
- [x] Test/tool dependencies installed and locked: TypeScript, Tailwind CSS, ESLint/Next rules, Vitest/jsdom/Testing Library, Playwright, axe-core, Supabase CLI, `tsx`, and `pg`/`@types/pg` for Docker-free verification against the configured hosted database.
- [x] Database migrations implemented: `supabase/migrations/202608310001_phase1_core.sql`, `202608310002_phase1_security_and_rpcs.sql`, and `202608310003_phase15_route_clock.sql`; database tests in `supabase/tests/database/{phase1,phase15}.test.sql`; explicit-clock seed command in `scripts/seed-phase1.ts`.
- [x] Reversible preview data workflow implemented: `pnpm seed:phase15:preview -- --starts-at <ISO timestamp>` uses a preview-only slug and refuses to overwrite a different journey; `scripts/reset-phase15-preview.ts` verifies that slug before cascading only the preview rows. The approved `2026-09-01T10:00:00+05:00` preview was applied; no production launch seed was applied.
- [x] Server endpoints implemented: `src/app/api/bootstrap/route.ts`, `src/app/api/presence/heartbeat/route.ts` and `src/app/api/votes/route.ts`.
- [x] Domain boundaries implemented under `src/lib/{analytics,bootstrap,config,content,identity,presence,steps,story-clock,supabase,traveler,validation}/` plus `src/hooks/`.
- [x] Premium Tashkent pack implemented in `src/content/countries/tashkent.v1.ts`, with generated source art under `art/phase1/`, processed project assets under `public/scenes/tashkent/v1/`, `public/traveler/temporary/v1/` and `public/npcs/tashkent-chef/v1/`, and the reproducible processor at `scripts/process-phase1-art.mjs`.
- [x] Experience components implemented under `src/components/{journey,scene,traveler,dialogue,hud,vote}/`, including static, muted, reduced-motion, offline, analytics-blocked, Rive-failed and realtime-reconnecting paths.
- [x] Vemetric initialized through `instrumentation-client.ts`; visitor events through trusted server-side `vote_submitted` implemented as non-blocking adapters.
- [x] Automated coverage implemented in `src/**/*.test.ts(x)`, `supabase/tests/database/phase1.test.sql` and `tests/e2e/phase1.spec.ts`.
- [x] External-test handoff created in `docs/phase-1-test-script.md` and `docs/phase-1-results.md`.

### Phase 1 acceptance and exit gate

- [x] Mocked two-browser acceptance reconciles country, event, watcher state and persistent steps; deterministic unit coverage passes for exclusive TTL, remaining-viewer walking and final-lease step capping.
- [x] The configured hosted Supabase project received all three non-destructive migrations and passes `pnpm db:lint:remote` plus all 14 pgTAP assertions through `pnpm db:test:remote`; the `pg` runner means Docker/local PostgreSQL is optional.
- [x] Automated desktop/320px layout, keyboard voting, serious/critical axe scan, semantic status and no-WebGL fallback pass; desktop and 320px renders were also visually inspected. Physical-device safe-area, reduced-motion and audio checks remain in the external script.
- [x] The production build passes and its explicit static/offline, sprite, muted, analytics-no-op, no-WebGL and reconnecting paths preserve a usable scene.
- [x] Phase 1 implementation and automated technical verification are complete; the exit gate remains open on external comprehension and physical-device evidence.
- [ ] External exit gate complete: 10–20 testers, at least 90% reaching `scene_ready`, at least 70% correctly explaining the shared walking rule, no critical mobile/accessibility/synchronization/truthfulness defects, and low-/mid-range phone evidence captured.

### Phase 1.5 repository-specific implementation plan

Implemented shape as of 2026-09-01: `tashkent-v3` is the live five-zone country pack; each zone uses one coherent panorama, feathered moving ground and independently moving illustrated props instead of opaque horizontal scene slices. Pixi streams bounded pools from the canonical route clock; the Rive adapter owns production state-machine inputs; and a replaceable eight-frame sprite rig provides the current visual proof. `tashkent-v2` remains registered for rollback and `tashkent-v1` remains the original static fallback. Phase 2 paths remain untouched.

#### 1. Contracts, pack resolution and canonical route clock

- [x] Evolve `src/lib/content/schema.ts` to a schema-version-2 country contract with `route.zones` (4–6), per-zone layer/segment/prop manifests, weather/lighting, ambient audio, event stages, NPC rigs and `postcardBackgroundUrl`. Preserve a parser for the v1 offline fallback during migration.
- [x] Add `src/content/countries/registry.ts` as the only pack resolver. Resolve the live pack from `country_days.scene_pack_id` in `src/lib/bootstrap/server.ts`; remove the hard-coded Tashkent import from the live bootstrap path and fail closed on an unknown/mismatched pack.
- [x] Create `src/content/countries/tashkent.v2.ts` as the original modular proof, then replace its visible banded composition with `src/content/countries/tashkent.v3.ts`: five coherent zones (`arrival-boulevard`, `mahalla-street`, `chorsu-market`, `plov-cafe`, `evening-landmark`) and complete next-zone preloading. Keep v2 registered for rollback and v1 as the original static fallback.
- [x] Add `src/lib/world/{types,route-clock,segment-sequencer,motion-machine,encounter-timeline,quality-tier}.ts`. Route distance derives from authoritative global active seconds; segment composition is seeded and deterministic; locomotion and encounter transitions are pure/testable state machines.
- [x] Add `supabase/migrations/202608310003_phase15_route_clock.sql` to expose `global_active_seconds` and its authoritative timestamp from the presence/runtime RPC without introducing a second client-writable route counter. Extend `src/lib/contracts.ts`, `/api/bootstrap`, `/api/presence/heartbeat` and `scripts/seed-phase1.ts` with `scenePackId`, route clock and event-stage data.

#### 2. Tashkent v3 coherent modular art and content

- [x] Preserve the v2 source/runtime assets for rollback, and add final source masters under `art/phase15/tashkent-v3/{zones,props}/` with runtime output under `public/scenes/tashkent/v3/`. Every zone has distinct full-resolution architecture/landscape art, a static fallback, three feathered seamless ground variants and zone-specific transparent illustrated props—not a recolor or relabel of another scene.
- [x] Provide ten-minute controlled variation through non-looping 2,400×900 zone panoramas, seeded ground selection, deterministic prop entry/jitter/depth speed and a rolling signature that includes both ground and prop composition. Preserve the premium editorial 2D palette and recognizably Tashkent-specific details without visible horizontal architecture seams.
- [x] Add zone-specific NPC visual variants under `public/npcs/tashkent/v2/`, ambient tracks under `public/audio/tashkent/v2/`, and `public/postcards/tashkent/v2/background.webp`. The postcard file satisfies the pack contract only; postcard UI/business logic remains Phase 2.
- [x] Add `scripts/process-phase15-art.mjs`, final `scripts/process-phase15-v3-art.mjs`, `scripts/report-phase15-assets.ts` and `scripts/validate-country-packs.ts` for reproducible WebP/audio output, transparency-edge cleanup, schema/reference checks, country-scene ownership and decoded texture budgets.

#### 3. PixiJS streamed world and follow camera

- [x] Keep the Phase 1.5 Pixi lifecycle and bounded render loop encapsulated in client-only `src/components/scene/PixiScene.tsx`, with deterministic clock, sequencing, motion, encounter and quality policies isolated under `src/lib/world/`. Split the renderer into additional `world/pixi` classes only when a second country proves reusable engine seams; the renderer ownership boundary is already enforced without speculative class layers.
- [x] Keep the traveler at 60% viewport width by default. Stream ground/foreground fastest, near architecture at medium speed and distant skyline/clouds slowly; reuse bounded sprite/prop pools and cull outside the viewport.
- [x] Reconcile heartbeat route snapshots by bounded easing: extrapolate only while authoritative `walking` is true, stop at the last reconciled distance when it is false, and correct drift without visible jumps. Pixi frame time never becomes canonical progress.
- [x] Preload the complete next-zone asset set from the start of the preceding zone, crossfade zone lighting/world layers, and retain the semantic static fallback when a world asset fails. The current implementation preloads earlier than the two-segment minimum.
- [x] Add event-stage camera commands for deceleration, approach, pan/zoom, background-life damping, restoration and resume. Camera transforms act on modular world containers, never on one flattened country image.

#### 4. Traveler/NPC locomotion and interaction rigs

- [x] Expand `travelerStateSchema` and `TravelerCommand` with `start_walk`, `slow_walk`, `stop`, `rest`, speed/easing and event phase. Use the exact state sequence required by this addendum.
- [x] Add a contract-compatible eight-frame temporary walk rig under `public/traveler/temporary/v2/` for the proof, isolated behind the same pack/command boundary as the future production Rive rig.
- [x] Update `src/components/traveler/RiveTravelerRenderer.tsx` to set Rive state-machine inputs rather than merely play/pause the artboard. Keep `Traveler.tsx` as the renderer boundary and `SpriteTravelerRenderer.tsx` as the explicit proof/static/reduced-motion/error fallback.
- [x] Synchronize walk-cycle frame rate, world speed and the moving character shadow from the same `TravelerCommand`/`WorldCommand`; the temporary rig visibly supplies alternating limbs, planted contact poses, body weight shift and backpack/hair follow-through.
- [x] Drive the chef encounter through `encounter-timeline.ts`: walk, notice, decelerate, approach, camera composition, greeting, talk/listen/react, goodbye, restore and resume. `EncounterDialogue.tsx` remains semantic React content sourced from the same canonical event line.

#### 5. React orchestration, onboarding and fallbacks

- [x] Add `src/hooks/{useRouteRuntime,useQualityTier,useIntroHeadline}.ts`. `JourneyExperience.tsx` converts the synchronized snapshot into one `WorldCommand` and one `TravelerCommand` without a second movement clock.
- [x] Split the permanent premise from onboarding into `src/components/hud/{IntroHeadline,WalkingRuleStatus}.tsx`. Expanded copy exits after seven seconds or the first authoritative walk transition; compact status remains semantic.
- [x] Extend `SceneStage.tsx`, `StaticScene.tsx`, `useMotionPreference.ts` and `useJourneyAudio.ts` so reduced motion shows the complete current-zone tableau (not an empty gradient), static mode exposes the correct current zone/event, and zone audio starts only after explicit sound opt-in.
- [x] Keep the established architectural boundary: no Pixi dialogue text, no React-driven per-frame world transforms, no Vemetric-derived motion and no sponsor/commerce implementation.

#### 6. Quality tiers, diagnostics and budgets

- [x] Implement low/medium/high selection in `quality-tier.ts` using reduced-motion preference, viewport/DPR, logical cores, `deviceMemory` when available and a test-only override. Apply the tier caps recorded in the Phase 1.5 quality table.
- [x] Add a development-only diagnostics overlay at `src/components/debug/WorldDiagnostics.tsx`, guarded by `?debug=world`, showing extrapolated authoritative/presented route seconds, distance, zone/segment/signature, locomotion, renderer/tier, FPS, p95 frame duration, object pool and texture estimate without identifiers or secrets.
- [x] Instrument `route_zone_entered`, `locomotion_transition`, `world_quality_selected`, `world_frame_budget`, `world_asset_failure` and `encounter_sequence_completed` through the existing non-blocking analytics adapters. Analytics failure has zero effect on motion.

#### 7. Automated and manual visual-motion proof

- [x] Add seven unit tests beside `src/lib/world/*.test.ts` for canonical clock reconciliation, deterministic segment order/repeat guard, route zones, stop/resume phases, encounter phases and quality selection; object/pool bounds are asserted by browser diagnostics.
- [x] Add `tests/e2e/phase15-motion.spec.ts` for visible streamed progress, renderer/object diagnostics, final-watcher stop/rest/resume, intro collapse and the full NPC focus/dialogue/resume sequence. Existing `tests/e2e/phase1.spec.ts` retains two-context synchronization, 320px/accessibility and no-WebGL fallback coverage.
- [x] Add `tests/e2e/phase15-soak.spec.ts` as a real ten-minute run with periodic diagnostics samples. The final 2026-09-01 v3 run passed after an 11.1-minute test body / 13.5-minute command: full five-zone route clock, rolling ground/prop signatures, ≤80 live objects, coarse headless liveness, <5-second route divergence and ≤25 MiB heap growth.
- [x] Add `content:validate`, `assets:report`, `test:motion`, `test:motion:soak`, `motion:record`, `verify:phase15` and `verify:phase1.5` scripts. Runtime dependencies are unchanged; only Docker-free database test tooling was added as a development dependency.
- [x] Record and inspect 68-second desktop/mobile WebM proofs plus extracted real-video checkpoints in `docs/phase-1.5-results.md` using `docs/phase-1.5-test-script.md`. The evidence fixture compresses zones to 20 seconds without changing the 120-second production pack. Low- and mid-range physical-phone measurements and product-owner review remain pending; a still screenshot is not gate evidence.
- [ ] Gate decision: Phase 1 live database/external criteria pass, every Phase 1.5 criterion passes, no critical defect remains and the product owner approves the recorded motion proof.

### Deferred phases — mapped but not started

- [x] Phase 2 gate enforced: reserved paths `src/app/{archive,sponsor}/`, `src/app/api/{postcards,sponsor,webhooks}/`, `src/components/{postcard,sponsor}/` and later content/commerce migrations remain absent. Do not add Lemon Squeezy, sponsor, postcard, archive or seven-pack implementation before both the Phase 1 and Phase 1.5 exit gates pass.
- [ ] Phase 2 implemented and seven-day rehearsal completed.
- [ ] Phase 3 hardening tasks prioritized from observed usage under future `scripts/load/`, `src/lib/observability/` and `docs/runbooks/` paths.

### Verification commands and recorded results

| Command | Status | Result |
|---|---|---|
| `pnpm lint` | Pass | ESLint completed with no findings. |
| `pnpm typecheck` | Pass | TypeScript completed with no errors. |
| `pnpm test` | Pass | 10 files and 23 tests passed. |
| `pnpm test:coverage` | Pass | 23 tests passed; scoped pure modules report 87.14% statements, 91.3% functions and 91.15% lines, including `src/lib/world/**/*.ts`. |
| `pnpm db:lint:remote` | Pass | Configured hosted Supabase schema lint completed without findings; Docker/local PostgreSQL is not required. |
| `pnpm db:test:remote` | Pass | Phase 1 (10) and Phase 1.5 (4) rollback-protected pgTAP assertions passed. |
| `pnpm test:e2e` | Pass | 8 active cases pass with 8 duplicate-project/opt-in soak/video-review cases intentionally skipped. Coverage includes desktop/320px accessibility, coherent full/reduced-motion scenes, two-context shared state, no-WebGL fallback, route/stop/resume and the NPC encounter. |
| `pnpm build` | Pass | Next.js 16.3.3 webpack production build compiled, type-checked and emitted the static page plus three dynamic API routes. |
| `pnpm verify` | Pass | Lint, typecheck, all 23 tests and the production build pass on the final code. |
| `pnpm test:motion:soak` | Pass | Final v3 real-time test passed: 11.1-minute observation / 13.5-minute command with route, loop, divergence, object and heap guards satisfied. |
| `pnpm motion:record` | Pass | Desktop and emulated-mobile 68-second WebM proofs recorded with checksums in `docs/phase-1.5-results.md`; actual frames were extracted and visually reviewed. |
| `pnpm content:validate` | Pass | Registered v2 rollback and live `tashkent-v3` packs validate with 87 owned scene assets. |
| `pnpm assets:report` | Pass | 4.38 MiB total v3 route transfer; every zone estimates 24.1 MiB decoded in the complete manifest and the low renderer reports 15.8 MiB active textures, below the 96 MiB low-tier cap. |

### Phase 1.5 verification commands

| Command | Gate evidence |
|---|---|
| `pnpm content:validate` | Every registered pack has a unique version, 4–6 zones, required country-specific panorama/ground/illustrated-prop motion tracks and valid event/audio/postcard references. |
| `pnpm assets:report` | Per-zone transfer/decoded-texture estimates and low/mid/high tier budgets pass. |
| `pnpm test:motion` | Unit and browser motion tests pass for route determinism, streaming/culling, locomotion, encounter, intro and fallbacks. |
| `pnpm test:motion:soak` | Real 10-minute diagnostic run passes loop, divergence, object-count, frame and heap-growth assertions. |
| `pnpm motion:record` | Produces the dated desktop/mobile visual-motion proof referenced by `docs/phase-1.5-results.md`. |
| `pnpm verify:phase1.5` | Runs hosted database verification, normal verification, pack/assets/browser coverage and the real-time soak gate before Phase 2. |

## Verified implementation references

- [Lemon Squeezy — Taking Payments](https://docs.lemonsqueezy.com/guides/developer-guide/taking-payments)
- [Lemon Squeezy — Create a Checkout](https://docs.lemonsqueezy.com/api/checkouts/create-checkout)
- [Lemon Squeezy — Passing Custom Data](https://docs.lemonsqueezy.com/help/checkout/passing-custom-data)
- [Lemon Squeezy — Webhook Requests](https://docs.lemonsqueezy.com/help/webhooks/webhook-requests)
- [Lemon Squeezy — Webhook Event Types](https://docs.lemonsqueezy.com/help/webhooks/event-types)
- [Vemetric — Next.js Installation](https://vemetric.com/docs/installation/nextjs)
- [Vemetric — Product Analytics](https://vemetric.com/docs/product-analytics/getting-started)
- [Vemetric — User Journeys and Funnels](https://vemetric.com/docs/product-analytics/user-journeys)
- [Rive — Web Runtime](https://rive.app/docs/runtimes/web/web-js)
- [Rive — State Machines](https://rive.app/docs/runtimes/state-machines)
- [Rive — Web Data Binding](https://rive.app/docs/runtimes/web/data-binding)
- [PixiJS](https://pixijs.com/)
