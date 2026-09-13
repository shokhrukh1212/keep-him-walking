# Prompt 1 — Finish Keep Him Walking and prepare a clean launch

Implement this in the existing Keep Him Walking repository. Finish the work, run meaningful checks, and provide a reviewable result. Read AGENTS.md, the current launch/readiness and decisions documents, and the actual implementation first. Latest code and the owner's latest instructions override stale plans. Do not merely produce another plan. Reuse working code and avoid broad dependency upgrades.

## Scope and facts to verify

- Canonical public URL: https://keephimwalking.com. The product is deployed but intentionally prelaunch.
- The owner accepts the current traveler, NPCs, Mixamo animation and painted scenery. Preserve them. Preserve stationary backgrounds with a moving ground layer, scene scheduling, and bounded current/next asset loading.
- Journey, Sponsor and Vote already open as modals. Preserve a mounted, centered stage; opening a modal must not shift the traveler or restart the journey.
- Existing cron-job.org scheduling reportedly works. Verify it; do not replace it or add a second scheduler.
- The reported 542 passing tests, R2 migration and production database identity need verification against the current commit. A rehearsal-looking OG image alone does not prove which database Production uses; inspect environment/project references and caching.
- This prompt covers polish, current bugs, assets, cleanup and deployment preparation. The separate Prompt 2 owns the seven-day/$499 sponsorship change. Do not invent authentication, registration, voice generation or another character pipeline.
- Work on `main`. Finish and verify one numbered section at a time, then make a small,
  clearly named commit for that completed section before starting the next one.

### Latest owner decisions for this prompt

- Remove crowd-dependent speed. The traveler walks at one natural pace whenever at
  least one confirmed viewer is present; a larger audience must not make his movement,
  stride, scenery or distance accrue faster.
- Every few walking minutes, an occasional passer-by enters from the right and walks
  naturally out through the left. Male passers-by use the traveler's normal pace.
  Female passers-by may be only slightly slower (about five percent), never conspicuously
  slow. Their animation cadence and motion across the pavement must agree, and a change
  in watcher count must not make them rush, drift or reverse.
- In Journey, present the visitor's server-confirmed watching time as their personal
  contribution. Do not show or share an unreliable personal step total. Keep collective
  distance and other server-confirmed shared totals separate.
- The owner supplied `public/logo-dark.png`, `public/og-image.png` and
  `public/favicon.ico` directly. Use those files in this pass. Do not block on the
  previously described brand ZIP or invent missing variants from it.

## 1. Apply a restrained visual system

Use the supplied Ship or Die screenshot for its ink/cream/red palette and strong typography. Preserve our identity and scenery; do not copy its pirate artwork, logo, marketing claims or Stripe graphics. The exact reference font is unverified. Use these explicit approximations:

| Token | Value / use |
|---|---|
| Ink | #080F19, solid chrome and modal background |
| Raised surface | #111D2B |
| Cream | #F3E7C7, primary text |
| Secondary text | #BFB8A5; verify contrast against actual surface |
| Brick red | #A33E35, principal CTA / selected action |
| Gold | #D7A34E, current route stop and limited emphasis |
| Borders | restrained cream at low opacity; increase where necessary for controls |
| Corners | 6–8 px controls; 12 px dialogs; keep round icon buttons where useful |
| Headings | Anton regular, uppercase for short headings only |
| Controls/metadata | IBM Plex Mono regular/medium, tabular numerals |
| Dialogue/long text | system sans-serif, normal sentence case, comfortable line height |

Self-host/subset the two font families through the existing Next font setup; retain licenses, use fallbacks and avoid layout shifts. Do not download three additional font families. No gradients, glass blur, glowing borders or oversized pill cards. Check text and focus contrast rather than assuming the palette passes everywhere. Use cream text on brick-red buttons.

Keep the city headline compact. Introduce the premise with one quiet sentence, “He only walks while someone is watching.” Keep status away from the character's face/body. Use consistent button sizing, active/pending/disabled states and visible feedback for Wave, Water and Photo; a request that expires must explain that outcome. Reuse the existing request scheduler rather than bypassing it.

## 2. Repair mobile layout and simplify Journey

Inspect 320, 375, 390, 430 px widths plus tablet and desktop, including short viewports, browser chrome and safe-area insets. Use a responsive layout with reserved header, stage and footer regions instead of stacking independently positioned overlays.

- Traveler remains central and fully framed. Do not fix crowding by shrinking text below readable sizes or cropping his feet.
- Footer has stable rows: compact current-place/status; route progress; actions. Keep all route stops reachable and the current/total label readable. Small visual dots need adequate tap targets. If a row cannot hold every stop, use an intentional scrollable stop strip with the current stop visible, not clipped dots.
- Preserve labeled Sponsor, Vote and Journey actions. A countdown must not replace the word “Vote.” Move the ambient-sound button to a quiet header corner to free footer space; accessible name and mute state required.
- Show one unambiguous distance denominator, e.g. “1.4 / 8 km today · 18%.” Explain estimated distance in a compact info popover. Keep a marathon comparison secondary in Journey and label its separate denominator if retained.
- Modal close button remains visible, with Escape, focus trapping, focus return, internal scrolling and reduced-motion behavior. Mobile dialogs must fit the visible viewport and keyboard; backdrop scroll locking must not remount the canvas or break presence.
- Journey should have a clear title, a short summary, today's route and the viewer's contribution, separated by spacing and subtle rules. Replace the large glowing first-watcher card with a compact acknowledgment. Collapse long route descriptions. Keep sponsorship and privacy reachable; remove redundant Passport navigation and hide the “Locals: tell us what we got wrong” section from the public UI while preserving reusable code.
- Investigate the screenshot's “0 steps” next to active viewing time. Verify eligibility/confirmation semantics before changing numbers; distinguish loading, pending confirmation and confirmed contribution. Do not fabricate credit.

## 3. Make conversation captions reliable

Every actual speaking cue must have its authored caption and speaker name. Drive visible text, speaking/listening animation and encounter state from the same encounter ID and timeline, not independent timers.

- Desktop: caption panel in available space to the left of the traveler, bounded to avoid both characters and route controls.
- Mobile: a dedicated caption band above the footer. Reserve its space in the layout; no overlap with feet, route dots, distance or action buttons. Split lengthy authored lines into readable timed cues; do not silently truncate dialogue. Keep the full encounter transcript reachable where the current product already supports it.
- During a speaking turn, exactly one character speaks and the other listens. Handle late join, scene change, pause, reconnect and modal close by deriving the current cue, not replaying stale messages.
- Do not hide the panel between adjacent lines while the conversation is active. End it after the last line's readable hold. A missing content record must not silently produce an entire captionless talking sequence: validate content before starting or use an explicitly authored fallback cue synchronized with the animation.
- When a modal covers the stage, normal dialog layering wins; resuming the view shows the current caption without restarting the encounter.
- Ambient audio only for this launch. Default muted; enable only after user interaction. Label it “Ambient sound.” No TTS, voice cloning, speech API or lip-sync expansion in this task.

## 4. Install the supplied brand assets and metadata

Use the owner-supplied `public/logo-dark.png`, `public/og-image.png` and
`public/favicon.ico`. These production assets supersede the initial generated logo
concept. No `KEEP-HIM-WALKING-BRAND.zip` is available in this checkout, so the missing
vector, transparent-logo and application-icon variants are not launch blockers for this
prompt.

- `logo-dark.png`: use where the opaque brand lockup is appropriate; do not force it
  over the live scenery if its background would obscure the scene.
- `favicon.ico`: use its supplied multi-size browser icon entries.
- `og-image.png`: use the exact 1200 × 630 share image and keep it as the root default.

Use Next.js metadata file conventions appropriate to this repository and its installed version. Remove conflicting old favicon and inherited OG metadata. Set canonical origin, metadataBase, OG URL, Twitter large-image card and public share links to keephimwalking.com; no localhost or obsolete .lol marketing URL. Preserve any intentionally separate working asset hostname until its replacement is verified.

Title: “Keep Him Walking”

Description: “He only walks while someone is watching. Drop in, meet the locals, and help him explore the world.”

OG alt: “Keep Him Walking — he only walks while someone is watching.”

Use the static brand card as the root site's default. Keep an existing dynamic day-share route only if useful, but give it the same branding. When launch is disabled, it must return honest prelaunch branding without querying/exposing rehearsal day, distance, sponsor or viewer data. After launch it may show verified production day data with an explicit cache strategy. Never embed fake watcher counts. Verify public image content type, dimensions, response status and actual metadata HTML. Version changed image URLs where necessary; third-party preview caches may take time to refresh.

## 5. Clean the project without breaking fallback behavior

First inventory large files and runtime references, including dynamic manifests, CSS, tests, metadata and build scripts. Report repository size, deployed public assets and browser initial transfer separately.

- Remove obsolete test recordings, unused render outputs, duplicate build folders and generated temporary files once confirmed unreferenced. Preserve any video used by a current fallback or marketing route until replaced deliberately. Add narrow ignore rules for future test output; do not blanket-ignore every media file.
- Verify every active painting through the R2/CDN manifest, correct MIME type, CORS and missing-file behavior. Then remove redundant runtime painting copies from the deployable public tree. Preserve one compact local background fallback and the accepted character's loading/error fallback.
- Keep irreplaceable art masters, Blender sources, licenses and asset credits. Archive bulky masters outside the deployable app, with a manifest and recoverable location; do not silently delete them or put unused originals back into public/.
- Do not rewrite Git history or delete storage buckets. Deleting a file from today's checkout does not shrink historical Git objects.
- Confirm current/next image residency stays bounded, old GPU resources are disposed, stale fetches cannot replace the active scene, and a failed next scene retains the last good scene or local fallback.
- Do not claim source-folder cleanup fixes freezing. Profile production builds for frame stalls, repeated React updates, reconnect loops, shader/texture upload spikes and memory growth. Preserve the accepted model unless measurement identifies a real issue.

## 6. Prepare a clean Production environment and verify deployment

Decision: use a separate Supabase Production project; retain rehearsal data in Development/Preview. Verify whether this separation already exists before creating anything.

Apply versioned schema migrations, policies/functions and required reference content to the clean project. Seed the real initial Paris day with zero rehearsal distance, viewers, votes and dummy sponsors. Do not copy test transactions or test accounts into production, and do not wipe the rehearsal project. Preserve genuine customer records if any exist: inspect before assuming all data is disposable.

Map all relevant database URLs, public keys, server keys, direct/pooler connections and integrations consistently by environment. Server credentials must stay server-only. Compare project references without printing secrets. Document exact variable names from the repo rather than guessing new ones. Public prelaunch pages must not expose test statistics.

Keep `PHASE2_ENABLED` and `LAUNCH_ENABLED` in their existing prelaunch-safe settings until intentional activation. Verify whether they are build-time or runtime settings and document any redeploy needed. Preparing or seeding Day 1 must not let cron advance it before launch. Preserve the established 16:00 UTC boundary unless current approved configuration says otherwise.

Keep the working cron-job.org job. Verify its canonical Production endpoint, authentication, idempotent day rollover, safe prelaunch no-op and useful response history. A 200 alone is not evidence that the intended database changed correctly. Do not schedule a duplicate job. If a production secret was exposed, rotate it in both the server environment and scheduler and confirm the next authenticated run without logging it.

For the public anonymous R2 artwork bucket, `AllowedOrigins: ["*"]` with read methods GET/HEAD can support deployment previews. Do not extend this to private uploads, credentialed application APIs or database access. Verify requests with actual Production, Preview and localhost Origin headers. If custom-domain responses retain old CORS headers, refresh/purge the relevant CDN cache. No browser-side R2 write credentials.

Provide a precise environment checklist and a short activation/rollback runbook. If account access is unavailable, finish code, migrations and seed scripts and list only the exact external steps remaining. Never claim an external action ran when it did not. Do not purchase a plan implicitly.

Prepare and, where already authorized and accessible, deploy the polished prelaunch candidate with launch disabled. The owner's real public launch occurs after both requested prompts are reviewed; do not start the season in this task. A local production build using rehearsal data is suitable for the launch recording. Keep public payment-review information visible without authentication.

Check existing Terms, Privacy, refund/cancellation information and a real monitored contact route. Do not invent a support email. Leave them ready for Prompt 2's exact offer; do not describe paid sponsorship as SaaS or donations. Dodo eligibility is unresolved and must not block the free viewing experience.

## 7. Completion evidence

Run lint/typecheck, a production build, existing required tests and focused regression tests for caption synchronization, modal persistence, launch gating, asset fallback and rollover only where these changed. Inspect desktop and mobile screenshots and actual motion; unit tests alone do not establish visual quality.

Run a five-minute desktop production-build viewing check and a representative physical-phone check if available, including opening/closing every modal and at least one encounter. Accelerate the scene clock only in a separate test to inspect multiple transitions and memory stability. Report devices, browsers, commit, trace evidence and limitations. Do not claim physical-device smoothness from emulation or 500/1,000-viewer capacity from a single browser. Keep the previously deferred large concurrency test deferred.

Return: implemented changes; before/after desktop/mobile captures; exact current commit/deployment; a removed/archived-file summary; asset transfer/residency findings; verified environment and cron status; checks actually run; and the remaining activation steps. Clearly distinguish “implemented,” “verified,” and “still needs owner/account access.”

## Reference documentation

- [Cloudflare R2 CORS and cached headers](https://developers.cloudflare.com/r2/buckets/cors/)
- [Supabase environment separation](https://supabase.com/docs/guides/deployment/managing-environments)
- [Next.js icons](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons)
- [Next.js OG images](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image)
- [Anton](https://fonts.google.com/specimen/Anton) and [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono)
