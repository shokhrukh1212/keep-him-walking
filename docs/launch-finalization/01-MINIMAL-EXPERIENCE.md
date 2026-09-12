# Keep Him Walking — minimal experience specification

> Historical P27 brief. The owner's P28 variable-place, seven-walking-minute,
> overlay-modal requirements supersede any conflicting schedule or panel detail.
> Current behavior is specified in `PRODUCT.md`, `TECHNICAL.md` and
> `docs/plan/DECISIONS.md`.

Companion to `00-DECISIONS-AND-LAUNCH.md`. Design specification for the existing product; preserve approved art and motion.

## The first impression

A visitor should understand three things without opening anything: **this is a shared traveler, watching keeps him moving, and the buttons let the crowd interact**. The traveler and city should dominate the screen. Use the existing cream/teal visual language, quieter surfaces, readable type and fewer containers.

Keep one short explanation: **“He only walks while someone is watching.”** It can sit under the compact city header. Do not cover the stage with a hero, onboarding wall, waiting story, or launch checklist. A returning user can collapse the explanation through the existing preference mechanism if one exists; do not build a new onboarding system for this.

Minimalism must keep useful feedback. Removing the result of a button press would reproduce the Wave problem. Nielsen's usability principles support both reducing irrelevant information and making system status visible. The layout below is a product-specific application of those principles, not a claim that research proves these exact coordinates. [^1].

## Layout contract

| Element | Desktop | Mobile |
|---|---|---|
| Header identity | Compact product mark/name, Paris and journey day at left | Paris · Day N at left; product identity available through Journey |
| Audience | One compact “● N watching” control at right | Same, short enough for the header row |
| Explanation | One quiet sentence below identity/header | One reserved line, allowed to wrap without colliding |
| Reactions | Wave, Water, Photo centered in the header | Three evenly spaced labeled buttons in one row below the header |
| Main stage | Traveler centered in the unobscured stage | Traveler centered in the usable stage, both feet visible |
| Activity | Small “Walking” / “Talking” label near the stage's lower left | Same, above the bottom controls; not over his body |
| Conversation | Temporary side card in a clear side lane | Temporary subtitle area above bottom controls, with room reserved for it |
| Progress | Thin bar and one concise distance line | Full-width bar and compact distance line |
| Primary navigation | Sponsor a day · Journey; one contextual Vote control | Sponsor a day · Journey · Vote when applicable |
| Sponsor disclosure | Reserved small row near progress when sponsored | One readable row; can wrap rather than overlap |

The audience control opens a compact details popover with collective pace and Bring a friend. Remove the separate large globe/live/card cluster. Use a native share sheet where supported and a copy-link fallback with “Link copied” feedback. Do not show fabricated audience counts while connecting.

The default scene center is 50% of the available stage width, not 60% of the entire screen. Preserve the currently accepted approximate scale (the readiness document gives 30% desktop/28% mobile viewport height as a baseline), then verify the actual silhouette visually. Do not enlarge the model until its feet or head compete with UI. Use one shared feet baseline for pavement, traveler and resident.

Long neighborhood descriptions belong in Journey. The normal stage needs “Walking,” not a long Paris/neighborhood/lanes stack beneath the character. Keep city identity once in the header. When a real encounter starts, activity becomes “Talking”; a pending personal reaction does not change the shared activity label.

Progress examples: **“2.7 km together · 5.3 km to today's goal”**, then **“8 km reached · next: 42.2 km”**. Put confirmed/approximate/last-sync detail in an accessible secondary disclosure; keep an approximation marker on extrapolated numbers and a visible reconnecting status when stale. Do not present unconfirmed distance as confirmed just to simplify the UI.

Keep one ballot chip, such as “Choose tomorrow,” “Name him,” or “Vote · 2h left,” matched to the real ballot. Open the choices in a panel. Do not concatenate option names and percentages into a footer button. A disabled/unavailable vote is explained in Journey, not rendered as cryptic “0% 0%.”

## Internal navigation without restarting the scene

Use the existing page as a persistent shell. Sponsor, Journey, Passport and voting open within it. Start with a URL-addressable panel state such as `?panel=journey`, adapting to the existing routing conventions; do not introduce a parallel-route framework unless the app already uses it and it materially simplifies the work.

The mounted scene host, model cache, animation mixer, shared clock and presence session stay outside panel content. Opening, closing, switching and using Back must not recreate them, reset a walk clip, issue a second viewer identity, or create another realtime connection. If the application uses Next.js App Router, shared layouts support preserved state, but the canvas must actually live in the shared portion. [^2].

On desktop, use a roughly 340–400 px side panel, leaving the traveler in the remaining stage. Reframe the camera/scene container gently if needed; do not remount it. On mobile, use a bottom sheet with an internal scroll area, initially around 40–45% of the available height. Reserve enough stage above it to see the traveler. Full details can scroll inside the sheet; long legal documents can remain normal pages.

Passport becomes a section/panel within Journey, showing existing contributions and stamps. Preserve public deep links to full Passport or Journey pages; direct entry should show the same shell where practical. Ordinary internal navigation should not force new tabs. Browsers commonly suspend animation callbacks in background tabs, so “open everything in a new tab” does not guarantee uninterrupted visible animation or watcher eligibility. [^3].

External sponsor links or a future hosted payment provider can leave the page according to normal link/checkout behavior. On return, rejoin the authoritative current state. Do not replay elapsed reactions or count a hidden tab as an active watcher to maintain the illusion of continuity.

Manual modal sheets/panels need a title, accessible close button, Escape, correct focus containment and focus restoration. The scene may continue visually behind them while background controls are inert; keyboard inaccessibility does not itself make a visible scene a hidden watcher. An automatically appearing conversation is **non-modal** and must never steal focus. [^4].

## Conversations that happen in the world

Remove the permanent “Read today's conversation” launcher. Reuse the accepted resident, traveler clips and reviewed dialogue infrastructure. Have the resident approach, stop in a sensible position, converse, and depart. Only one foreground interaction runs at a time. Existing background passers may continue only if they remain within the existing population/performance budget.

The active dialogue card shows speaker name and one short utterance at a time. Prefer one or two sentences per turn. Keep it outside both faces, the traveler's hands and the primary controls. Mobile subtitles can use two or three readable lines; do not shrink type to fit a long monologue. Author or split the cue instead.

Use “Local encounter” as a small heading. Explain in Journey/About that these are scripted fictional characters inspired by the place, not live human participants. Content must be culturally reviewed; no runtime LLM service, unmoderated chat or new voice pipeline is needed for launch.

Use the existing once-per-day narrative encounters in their matching scene. Between them, target one short ambient encounter about every six active walking minutes, with a deterministic shared variation of roughly ±60 seconds. Defer if another foreground action is active. Avoid a duplicate ambient meeting within two walking minutes of a story meeting. Use available reviewed variants without immediately repeating one; if content is limited, reduce frequency rather than inventing an endless number of distinct conversations.

Schedule these from the shared world clock, never separately for every visitor. Someone joining in the middle sees the current encounter and current cue. Missing an encounter does not start a private replay or award another contribution. A local Hide control dismisses the card for that viewer; “Recent encounters” inside Journey provides the transcript. Do not let deferred ambient encounters accumulate into a queue of back-to-back interruptions.

Do not promise a new arrival will instantly see a resident: a shared world has a shared schedule. Walking itself must be a satisfying initial state.

## Reactions: a complete, visible lifecycle

Retain labeled Wave, Water and Photo controls. Icons may supplement the labels, not replace all three with unexplained symbols. Keep the existing server cooldown/rate rules unless inspection reveals a specific correctness bug. A 60-second cooldown is time until another request, not a promise that the first action will execute at its end.

| State | Visible feedback | Required behavior |
|---|---|---|
| Ready | “Wave” | Button is usable |
| Sending | Pressed/pending feedback immediately | Make one idempotent request; do not claim the traveler has waved |
| Collecting crowd input | “Wave added · 2/3” when a threshold applies | Show the server-confirmed count. Solo behavior retains threshold 1 |
| Accepted, waiting for another action | “Wave queued” | Server owns the next eligible action; avoid a fake precise countdown |
| Executing | “He's waving” | Traveler visibly performs the authoritative action for all viewers |
| Cooldown | “Wave again in 48s” in compact feedback | Cooldown stays distinct from queued/executing status |
| Failed | “Couldn't send. Try again.” | Retry safely without creating a duplicate action |

Use a single local feedback slot near the reaction row. Shared activity remains independently correct. For an idle, connected solo viewer, target visible action start within about two seconds of server acceptance; report measured latency rather than guaranteeing it under every network condition. If another action must finish, explain that it is queued. After roughly ten seconds without request resolution, offer retry/reconnect instead of leaving an unexplained spinner.

Codex must trace the reported failure through button → request → authorization/threshold → queued action → authoritative timestamps → invalidation → renderer. A success toast alone is not a fix. Check whether an accepted action finished before the model subscribed, whether the clip name mismatches, and whether an effect cleanup discarded the event. Keep shared start/end watched-time semantics and the existing distance freeze during stopping actions.

## Startup: one identity and one world

Server bootstrap, initial DOM, loading state, canvas and failure fallback must agree on the current city and approved traveler. Do not render Tashkent defaults or the old illustrated traveler while awaiting Paris. Eliminate the huge startup hero rather than hiding it after a timeout.

Start fetching the current snapshot, presence handshake, current scene, model and essential walk clip as early and in parallel as dependencies allow. Do not block walking on opening the map, downloading every future city, or loading all optional dialogue/prop assets. The rendered model should join the latest confirmed scene as soon as its essentials are ready.

A cold network cannot deliver a multi-megabyte 3D asset literally instantly. During that unavoidable interval, show a lightweight still rendered from the **same approved current traveler**, at the same scale and position against the correct scene, with a small “Loading the walk…” label if needed. Treat this as a loading poster, never as live progress. Replace it cleanly without an identity/scale/city jump. Do not add a fake prerecorded walk or a second character implementation to hide latency.

If the authoritative state is a conversation, rest, waiting, or prelaunch, show it truthfully. The visitor's desire to see walking means eliminate avoidable loading detours; it does not authorize falsifying the shared state. Before the actual launch, use the same character with a compact real launch status. Do not temporarily label the day as live.

While reconnecting, retain the current scene and use the existing bounded extrapolation. After its limit, stop claimed progress and say “Reconnecting…” without replacing the world with marketing copy. On recovery, reconcile to the shared clock; do not fast-forward a backlog of animations.

## Mobile and painting coverage

Build layout from measured containers and stable rows. Use dynamic viewport units with a fallback, safe-area insets, `min-width: 0` where needed, and controlled overflow. Do not rely on hiding body overflow to conceal a incorrectly sized canvas. Keep an explicit render-container size and resize observer; test address-bar expansion, orientation and sheets.

Fit each stationary painting to fully cover the stage with a configured crop/focal point. The skyline must not move continuously. A different aspect ratio may crop the artwork, but no blue gap, transparent edge, tile seam or stretched architecture is acceptable. Check both the DOM/poster and rendered canvas bounds; fixing only one leaves the startup bug.

Move only the foreground road/pavement. The road layer should have a repeatable surface and a soft join to the painting; do not slide buildings, cafés or trees baked into the background. Stop road motion during stopping actions and waiting. Maintain the existing accepted gait; any road-speed calibration should support it rather than speeding up or reauthoring the clip.

Aim for 44 × 44 CSS-pixel interactive hit areas with adequate spacing, even when the visible icon is smaller. This is a chosen mobile usability target, not a claim that WCAG AA requires 44 px everywhere; WCAG 2.2's target-size minimum is 24 px with specified exceptions. Maintain visible focus, readable contrast, keyboard access, and existing reduced-motion behavior. [^5].

## Visual acceptance matrix

Capture initial load and settled state at 320, 390, 430, 768 and 1440 CSS-pixel widths. Use actual supported devices where available; one physical phone check matters more than many identical desktop emulations. Include a short landscape viewport and 200% text zoom/accessible reflow where applicable.

Verify: no overlaps or right strip; traveler remains visible and centered; status is off the body; sponsor disclosure is readable; all three reactions work; dialogue does not cover faces; each panel opens/closes and Back works without scene reinitialization; an empty ballot does not create clutter; long names and translations do not break the header.

Record a short video of cold entry → walking → Wave → Journey → Passport → close → conversation. Still screenshots alone do not demonstrate continuity, natural transition timing or the absence of freezes.

## Sources

Web sources accessed 11 September 2026. Publication/update dates are included where available.

1. Jakob Nielsen, Nielsen Norman Group. [10 Usability Heuristics for User Interface Design; reviewed 30 January 2024](https://www.nngroup.com/articles/ten-usability-heuristics/).
2. Next.js. [Layouts and Pages; updated 25 August 2026](https://nextjs.org/docs/app/getting-started/layouts-and-pages).
3. MDN Web Docs. [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API).
4. W3C WAI. [Dialog (Modal) Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).
5. W3C WAI. [Understanding SC 2.5.8: Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

[^1]: Jakob Nielsen, Nielsen Norman Group. [10 Usability Heuristics for User Interface Design; reviewed 30 January 2024](https://www.nngroup.com/articles/ten-usability-heuristics/). Accessed 11 September 2026.
[^2]: Next.js. [Layouts and Pages; updated 25 August 2026](https://nextjs.org/docs/app/getting-started/layouts-and-pages). Accessed 11 September 2026.
[^3]: MDN Web Docs. [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API). Accessed 11 September 2026.
[^4]: W3C WAI. [Dialog (Modal) Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). Accessed 11 September 2026.
[^5]: W3C WAI. [Understanding SC 2.5.8: Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). Accessed 11 September 2026.
