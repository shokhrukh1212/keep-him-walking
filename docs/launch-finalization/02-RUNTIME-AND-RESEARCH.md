# Keep Him Walking — runtime, timing and performance

All implementation details below are proposed requirements pending inspection of the current repository. The supplied files establish intended architecture, not measured production performance.

## What can and cannot be concluded

Yes, this kind of app can feel smooth while 100 or 500 people watch. Each browser should animate its own traveler; the server coordinates shared state. Five hundred viewers should not mean five hundred rendered humans in one browser or five hundred server-rendered video streams.

The owner's one-person freeze is sufficient reason to investigate, but not enough to blame file size, hosting or concurrency. The reported 2.48 MB model and 1.9 MB animation download affect startup bandwidth. Runtime stalls can instead come from texture uploads, excessive rendering, main-thread work, resource leaks, scene remounts, or a deliberate stop after shared state becomes stale. Several can coexist.

More images **stored** on the server do not inherently reduce frame rate. More images downloaded, decoded, retained in GPU memory or swapped during a busy frame can. This distinction is central to the fix.

## Profile the freeze before optimizing

Use a production build served through the actual preview/deployment path. Development mode and a desktop emulator are insufficient evidence for a mobile launch claim. Reproduce with one visible viewer first.

| Observe | What it separates | Likely next investigation |
|---|---|---|
| Entire interface and pointer feedback stall | Main thread blocked | Performance trace, scripting, layout, decode, garbage collection |
| UI stays responsive; canvas stutters | Render/GPU or animation path | Renderer timing, draw calls, pixel ratio, texture upload, clip/state updates |
| Scene looks frozen near 60 seconds while UI still responds | Possible stale-authority cutoff | Heartbeat, snapshot age, failed API requests, reconnect/subscription |
| Pause happens opening Journey/Passport | Lifecycle/remount problem | Scene instance IDs, React mount/unmount, duplicated effects |
| Pause coincides with a new painting/NPC | Loading or shader/texture work | Network waterfall, decode timing, first-use preparation |
| Performance worsens after repeated panels/zones | Resource retention | Texture/object/connection counts before and after cleanup |

Add development diagnostics, disabled or sampled in production: build identifier; device/browser; page visibility; RAF frame intervals; current action and clock; server snapshot version/time/age; fetch failures; scene mount count; active connections/listeners; asset fetch/decode/ready timings; and renderer resource counters where exposed. Do not log secrets or personal identifiers.

Capture a trace containing an actual freeze, not just a clean five-second interval. Correlate it with both renderer and authority state. Instrument long animation frames where supported, feature-detecting the observer and using RAF measurements elsewhere. MDN defines a long animation frame as over 50 ms and describes its diagnostic entries. [^1].

Preserve the established 60-second maximum browser extrapolation. If that cutoff causes the visible freeze, repair the missing refresh/rejoin path. Increasing the cutoff to disguise a disconnected authority would allow invented distance and reactions. While stale, retain the scene, stop unsupported progress, and expose a compact reconnecting message.

## Startup and loading work

Measure two separate milestones: **first coherent scene** and **first real animated frame**. Also record time to authoritative presence confirmation. A correct static loading poster can improve perceived startup, but it must not be counted as live animation.

Audit the waterfall for duplicated assets, hardcoded old-city fallbacks, all-clips blocking the walk, map code in the critical bundle, and sequential requests that can run concurrently. Start current snapshot and essential asset loading promptly; use the same authoritative city selection for HTML and canvas. Make a city/day change during loading discard obsolete results rather than briefly rendering them.

Accept the current approved model. Record exact bytes and distinguish decimal MB from MiB. Do not set `combinedBudgetBytes` to 2.48 MB if its actual meaning includes the animation bank or other actors. Keep a model-only budget and an honest combined startup budget. The supplied audit's approximate 4.38 MB is a measurement to verify, not a permanent magic constant.

If essential walk loading is blocked by a monolithic animation bank, inspect whether packaging can load walk/resume/idle first and defer uncommon clips while preserving the same source animations. Make this change only if the trace shows material benefit and binding/transition tests pass. Do not introduce retargeting or delete approved actions to meet a transfer target.

Use hashed immutable asset URLs and suitable long-lived cache headers. Separate them from current world snapshots, private contribution data, sponsor reservations and authenticated endpoints, which must not be accidentally served as public immutable responses. Keep the existing same-origin asset fallback if the external asset host is not yet configured; adding R2 is not itself a fix for a GPU stall.

If using Cloudflare R2, use its production custom-domain path and verify cache behavior. Cloudflare describes `r2.dev` as rate-limited and intended for development, not production. [^2].

## Bound runtime work

Retain the current Pixi/Three arrangement. Check whether it has duplicate tickers, full-scene recreation, React state updates every frame, or unnecessary redraws of static content. Have explicit ownership of each animation loop and a common time source. A backend snapshot should update the model of the world, not reconstruct the world.

Keep per-frame transforms and animation mixer updates outside React component state. Update distance text at a readable low frequency, such as once per second, while interpolation remains local. Stop mutating layout, rebuilding geometry, creating materials or measuring DOM bounds in every frame. Reuse temporary objects in hot paths. Do not add a worker or a new engine without a demonstrated bottleneck.

Test a bounded device pixel ratio, initially up to 2 on desktop and 1.5 on mobile, and tune against actual device results. A lower-quality tier can reduce rendering resolution, expensive filters, optional effects and background resolution before changing the hero model. Keep hit areas and CSS text sharp. Prevent rapid quality oscillation; downgrade only after sustained measured pressure and reevaluate slowly.

Do not batch-destroy many heavy textures in the same animation frame. Pixi's own guidance identifies dynamic text updates, expensive filters and texture destruction as possible performance costs; its advice supports profiling and selective changes rather than applying every optimization blindly. [^3].

### A bounded image pipeline

Keep a small manifest for today and tomorrow. Fetch the current painting first, then the next relevant painting shortly before it is needed. Prewarming tomorrow's essentials does not require uploading an entire future city or season into GPU memory.

Budget resident background textures for the current scene, its incoming transition, and only a needed day/night alternative. Dispose or evict outgoing resources after the fade when no other scene owns them. Use reference counting or the existing asset manager to avoid destroying shared textures still in use. Browser HTTP cache may keep downloaded files; GPU residency needs a separate bound.

Illustrative arithmetic: an uncompressed 4096 × 2048 RGBA texture occupies 32 MiB before mipmaps and roughly 42.7 MiB with a complete mip chain. Eight such textures approach 341 MiB before models, render targets and browser overhead. These are estimates for that format, not measurements of this app; GPU-compressed formats differ. A small WebP on disk does not imply a small decoded texture.

Decode/preload the incoming background before its boundary. If it fails, keep the last valid painting and expose a small reconnect/loading state rather than showing blue space or switching to another city. Retry with bounds. When the correct image becomes available, move to the **current** shared scene, not a backlog of missed scenes. Confirm that the road/background layers stay aligned during the swap.

Reuse approved residents and clips. Do not instantiate a new skeleton and new textures on every loop if they can safely be reused. Maintain the existing small resident cap; ambient crowd density must not grow with online viewers.

## Shared clocks: implement D7 without corrupting distance

Preserve the database as authority. Rendering predicts only from a bounded confirmed snapshot. Keep distinct meanings:

| Value | Advances when | Used for |
|---|---|---|
| Server wall time | Always | 16:00 UTC day boundary, inventory/vote deadlines, real cooldowns, freshness |
| Existing watched/action time | Per current authoritative eligibility | Action start/end and pause/resume semantics |
| New daily active-walking seconds | At least one eligible visible watcher and the traveler is walking | Painting cadence and ambient encounter opportunities |
| Daily collective distance | Walking is eligible, multiplied by the existing collective pace | Contribution totals and numerical achievements |

“Active walking seconds” is global elapsed walking time, not the sum of every visitor's watching time. Five hundred simultaneous viewers do not add 500 seconds per second. It pauses for talking, water/photo/wave stops, waiting and any other canonical non-walking state.

Prefer deriving this counter from existing authoritative interval accounting if it can do so exactly. Otherwise extend the canonical state/migration with a checkpoint and counter. Integrate elapsed intervals at presence expiry, action boundaries, day rollover and pace changes. Do not infer it by dividing accumulated distance by the **current** multiplier; past multipliers differ. Reuse the existing atomic integration path and locks rather than adding a separate writer racing distance updates.

Proposed pure selection:

```text
sceneDuration = 1080 active-walking seconds
visitIndex = floor(dailyActiveWalkingSeconds / sceneDuration)
zoneIndex = visitIndex mod 5
cycleIndex = floor(visitIndex / 5)
```

Map zones in pack order: arrival, lanes, market, café, landmark. Clamp or validate negative/corrupt inputs, and handle packs deliberately declared incomplete; do not silently modulo missing art. The first visit to a zone belongs to cycle 0; later visits reuse its background without repeating one-time rewards.

Inspect `src/lib/world/route-clock.ts`, `routePositionAt`, `PixiScene`/`boundedPanoramaLayout`, `src/lib/traveler/motion-clock.ts`, pack schemas and database integration. Paths are leads from the supplied file, not guaranteed current locations. Replace the landmark clamp and remove distance-driven **background** panning. Keep the road's supported motion independent of the stationary painting.

Do not erase zone-length metadata indiscriminately; other validators, maps or historical recaps may still need it. Make the change to scenery selection explicit. Mark existing distance-based story anchors as migrated or legacy rather than allowing both systems to fire.

### Stories and actions

Move scene-specific once-per-day story triggers onto the first eligible visit to their matching zone: arrival in arrival, local introduction in lanes, food in café, landmark story at the landmark. Use a small entry delay (for example 10–20 active walking seconds) and stable event IDs. Do not trigger the café story at the old 4,800 m threshold while the painting is still arrival at ×5.

Keep distance achievements at 8,000 and 42,195 m independent of zone. Mark them once per day transactionally. A reward may queue briefly behind the current action; it must not accidentally trigger every time a background repeats.

Use the existing exclusive foreground action arbiter. Finish an active action before ordinary queued reactions or ambient encounters; day rollover performs a controlled transition to the new day's state. User reactions take precedence over discretionary ambient encounters. One-time story events remain pending for an eligible moment in their matching scene. Drop/coalesce missed ambient opportunities; do not store an unbounded backlog. Prevent ambient events from repeatedly starving accepted user input.

Encounter IDs include day and occurrence/visit identity. A reconnection should seek to the active cue using server-derived watched time. A late join does not replay a prior greeting or reset the scene clock. Dialogue visibility is a local UI preference, not an authority mutation.

## Scheduler decision and safe rollover

Use the existing Vercel deployment on Pro, subject to the owner activating the appropriate account plan. Vercel documents Hobby daily jobs as potentially running anywhere within their scheduled hour, while Pro supports minute-frequency scheduling. A minute-frequency scheduler still does not guarantee execution at an exact second. [^4].

Prepare a small authenticated minute reconciler, reusing existing prewarm/rollover functions. At or after 15:55 UTC it marks/fills the prewarm work; at or after 16:00 UTC it atomically settles the old day and establishes the new one. Use the server's UTC time and immutable journey-day identifiers. The existing two endpoints may remain, but both and the reconciler must converge on the same idempotent service functions.

Make the **logical boundary** 16:00 UTC even if execution occurs later. Every authoritative bootstrap, heartbeat, vote or sponsor mutation checks whether a boundary is due and invokes bounded reconciliation if needed. Validate the same deadlines inside the locked database operation. Cron accelerates work and handles periods without traffic; it is not the sole source of truth for what day it is.

Split eligible movement/contribution intervals across the boundary using existing presence expiry rules. Do not credit an unattended hour when reconciling late. End/transition outgoing actions deterministically; retain historical actions rather than attaching them to the new city. Expire votes and reservations against their real deadlines, not the time a job finally ran. Protect duplicate payments, recaps and external jobs with unique keys and an outbox or the existing equivalent.

Vercel documents best-effort cron delivery, possible overlap/duplicates, and no automatic retry of failed invocations. Use locks, idempotency, catch-up and observable job outcomes. [^5].

Do not broadcast world state every minute merely because the reconciler runs every minute; emit a small invalidation only when shared state actually changes. Protect endpoints using the established secret mechanism; never put service-role keys in the browser. Record due time, effective time, completion time and failure reason without secrets.

Supabase Cron is a reasonable alternative if already available: it supports database jobs and HTTP invocations with job history. It is not necessary to add a second scheduler when the existing commercial Vercel plan resolves the cadence. Do not describe it as a workaround for Vercel Hobby's commercial-use limitation. [^6].

### Focused clock tests

Test just the new risks: five scenes loop at 90 walking minutes; no-viewer intervals do not advance; stopping actions pause walking time; ×1 versus ×5 gives the same scene at equal walking time and different distance; pace changes do not rewind scenes; late join agrees with an existing client; awards occur once; a missed/duplicate cron invocation settles each day once; and updates crossing 16:00 split correctly. Use a controllable clock in tests rather than actually waiting four hours.

For a new counter, document initialization and rollout. This product is prelaunch, so do not reconstruct historical walking time by guessing from distance. Preserve existing history, initialize an explicit current-day checkpoint, and record any preview reset. Do not reset production state or paid inventory without authorization.

## 100–500 viewers: capacity plan, not a claim

Inspect the current provider plan, realtime connections, heartbeat cadence, API rate limits, database lock timing and cached asset delivery. The official default Supabase limits are 200 connections/100 messages per second on Free and 500/500 on Pro. Its definition counts delivered or sent WebSocket messages; fan-out therefore matters. Actual project settings can differ. [^7].

Illustratively, one message delivered to 500 clients consumes roughly 500 delivery events, before other traffic. That is already near a 500-events-per-second allowance if repeated every second. A 500-person audience also needs connection headroom for reconnects and additional tabs. Do not equate a 500-connection plan cap with verified support for 500 viewers.

Keep one connection per application session, dispose it on the correct lifecycle, and reuse existing visitor/session deduplication. Do not add full peer-to-peer presence fan-out. Broadcast compact action/version invalidations; clients fetch the canonical snapshot and interpolate locally. Never publish animation frames or the entire watcher list on every heartbeat. Coalesce nonurgent audience-count updates. Preserve reliable prompt delivery for actual actions.

Stagger polling/heartbeats with jitter and maintain server-defined presence expiry. For scale intuition, 500 clients at one heartbeat per 15 seconds generate about 33 requests/second; that is arithmetic, not proof of database throughput. Avoid fetching full contributions, sponsor inventory and the entire day on every beat. Monitor contention if every request locks the same authority row. Don't redesign the database preemptively without evidence.

When realtime is temporarily unavailable, use bounded backoff and the existing authenticated state-refresh fallback with a visible reconnecting status. Do not force a full-page refresh or silently keep adding distance. Static assets belong on a CDN; a CDN cannot repair database lock contention or client GPU overload.

The owner explicitly deferred D2. Prepare the existing load script and an after-launch run order of small checks followed by 100/500/1,000 viewers, subject to the authorized deployed test procedure and costs. Do not execute paid traffic tests or change billing during this handoff. After launch, replace stale capacity evidence with the new build hash, actual profile, error rate, latency, connection count and database observations.

## Verification that matters for this release

| Check | Target/evidence | Interpretation |
|---|---|---|
| Desktop motion | Approximately 60 fps on the recorded target device; p95 frame interval near or below 20 ms during steady walking | Chosen project target, not proof for every device |
| Modest phone | Stable approximately 30 fps or better; p95 near or below 40 ms | Prefer consistent pacing over a briefly high average |
| Reported freeze | Before/after trace; no recurring unexplained >250 ms stalls in the reproduction session | A >250 ms threshold catches severe pauses; smaller jank still matters |
| Interaction | Immediate local press feedback, clear server outcome; measure solo Wave execution | Feedback alone does not prove animation happened |
| Startup | First coherent scene and first animated frame reported separately, cold and warm | Do not report poster paint as an animated load |
| Resource use | Stable bounds through several panel changes and forced zone transitions | Browser memory need not be numerically flat, but retained resources must not grow each loop |
| Web experience | Aim for LCP ≤2.5 s, INP ≤200 ms and CLS ≤0.1 at the 75th percentile when field data exists | Lab checks and a single session cannot establish field percentiles |

The Web Vitals thresholds come from web.dev; they assess loading, interaction responsiveness and layout stability, not sustained canvas animation by themselves. [^8].

Use one meaningful approximately ten-minute one-viewer session that includes the reported scenario, panels and at least one controlled transition. Include a small multi-client correctness check for shared actions; this is not the deferred capacity test. Verify a background-tab return and one network interruption. Run the existing relevant build/type/lint gates and add focused timing/lifecycle tests where correctness changed. Stop expanding tests once the concrete risks are covered.

## Research scope and limitations

Primary technical sources were preferred: framework, browser, hosting, realtime, accessibility and renderer documentation. NN/G supplies the design rationale. Prices and limits were checked at research time and must be confirmed against the actual accounts before production configuration. No provider has approved this business or guaranteed its performance through this review.

The visual findings come from supplied screenshots; the current budget, architecture and deferred status come from the five uploaded project files. Choosing 18 minutes, panel sizes, reaction feedback and performance targets is design/engineering judgment. These choices should be validated in the actual application, not attributed to a research paper as universal rules.

## Sources

Web sources accessed 11 September 2026. Publication/update dates are included where available.

1. MDN Web Docs. [Long Animation Frames API](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Long_animation_frame_timing).
2. Cloudflare. [R2 Public Buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/).
3. PixiJS. [Performance Tips, version 8.x documentation](https://pixijs.com/8.x/guides/concepts/performance-tips).
4. Vercel. [Cron Jobs: Usage and Pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing).
5. Vercel. [Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
6. Supabase. [Cron](https://supabase.com/docs/guides/cron).
7. Supabase. [Realtime Limits](https://supabase.com/docs/guides/realtime/limits).
8. web.dev. [Web Vitals](https://web.dev/articles/vitals).

[^1]: MDN Web Docs. [Long Animation Frames API](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Long_animation_frame_timing). Accessed 11 September 2026.
[^2]: Cloudflare. [R2 Public Buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/). Accessed 11 September 2026.
[^3]: PixiJS. [Performance Tips, version 8.x documentation](https://pixijs.com/8.x/guides/concepts/performance-tips). Accessed 11 September 2026.
[^4]: Vercel. [Cron Jobs: Usage and Pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing). Accessed 11 September 2026.
[^5]: Vercel. [Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs). Accessed 11 September 2026.
[^6]: Supabase. [Cron](https://supabase.com/docs/guides/cron). Accessed 11 September 2026.
[^7]: Supabase. [Realtime Limits](https://supabase.com/docs/guides/realtime/limits). Accessed 11 September 2026.
[^8]: web.dev. [Web Vitals](https://web.dev/articles/vitals). Accessed 11 September 2026.
