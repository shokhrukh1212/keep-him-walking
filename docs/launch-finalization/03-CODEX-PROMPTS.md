# Keep Him Walking — Codex execution handoff

Put all four files in the project, preferably `docs/launch-finalization/`. Paste the master prompt below into Codex in the real repository. The phases are execution checkpoints within the same task, not requests to produce another planning document. If the session is interrupted, use the continuation prompts afterward.

## Master prompt

```text
Finalize the existing Keep Him Walking product for a small public validation launch.
Implement the work, verify it, and produce a concrete reviewable candidate. Do not
stop after writing an implementation plan.

Read:
- applicable AGENTS.md and current repository instructions;
- docs/launch-finalization/00-DECISIONS-AND-LAUNCH.md;
- docs/launch-finalization/01-MINIMAL-EXPERIENCE.md;
- docs/launch-finalization/02-RUNTIME-AND-RESEARCH.md;
- the current AFTER-P22, launch readiness, DECISIONS, world/background, sponsor,
  technical, character and load-result documents in this repository.
Resolve moved filenames by searching. Inspect code before accepting an old document's
claim. The four launch-finalization files contain the new product decisions.

OWNER INTENT AND LIMITS
The owner accepts the present traveler, NPCs and Mixamo motion. Preserve them.
Paris is the starting city. Center the traveler. Minimize desktop and mobile UI.
Keep the city painting stationary and move only the road. Paintings repeat after
18 active walking minutes each, indefinitely through the day. Keep accumulated
distance and achievements. Keep Sponsor a day and Journey, using internal panels.
Fix the initial wrong-character/wrong-city/blue-strip flash, Wave feedback and
execution, mobile overlap, route continuity, and the reported single-viewer freezes.

D1 accepts the approved 2.48 MB model, with separate exact animation and total budgets.
D2's 1,000-viewer load test remains AFTER LAUNCH. Do not invent a substitute mandatory
500-viewer launch gate or claim capacity from old measurements. D3 optional windows
are skipped. D4 Sofia is superseded by Paris. D5 needs safe minute scheduling and
catch-up. D6 is accepted for launch. D7 must be fixed.

Use existing components and the Pixi/Three architecture. No character reauthoring,
new runtime AI/voice/weather service, broad dependency upgrades, or engine migration.
Do not purchase plans, alter billing, set a real launch date, reset production data,
send messages/social posts, or enable unverified paid checkout. Continue all local
and reversible implementation work if account actions are unavailable. Existing
session authorization for publishing/deployment still governs that final action.

WORK IN THESE CHECKPOINTS, CONTINUING WITHOUT ROUTINE APPROVAL REQUESTS

P23 — Trace the actual build and repair startup/continuity.
Record branch/build identity and inspect the real entry route, bootstrap snapshot,
asset manifest, scene host, action pipeline and presence lifecycle. Trace the stale
Tashkent/illustration fallback and incomplete painting coverage. Profile a production
build with one viewer and capture a freeze if reproducible. Distinguish frame stalls
from the 60-second authority cutoff. Keep diagnostic output concise and private.
Implement one consistent current-city/current-character startup. Load essentials
early, defer unrelated data, and keep an honest matching loading poster only while
needed. Keep one scene/session through internal panels. No fake live progress.

P24 — Implement the minimal desktop/mobile experience.
Use the exact behavior contract in 01-MINIMAL-EXPERIENCE.md. Compact city/day/audience;
one explanatory sentence; Wave/Water/Photo labels; centered traveler; activity at
lower left; restrained progress; Sponsor/Journey/contextual Vote. Remove the huge
intro and persistent conversation launcher. Put Passport under Journey. Give panels
URL/Back/close/focus behavior without recreating canvas, mixers or presence. Keep the
traveler visible beside desktop panels and above mobile sheets. Use one nonmodal
subtitle/card area for an actual shared encounter. Preserve readable sponsor disclosure.
Fix container sizing, image cover/crop, safe areas and short/narrow-screen layout.

P25 — Correct world time, scene repetition and reactions.
Implement or derive authoritative daily active-walking seconds: global walking time,
not summed visitor seconds, not distance divided by current pace. Select five zones
in repeating 18-minute visits. Pause walking time during stopping actions and when
no eligible viewers exist. Remove the landmark clamp and background panning. Keep
the existing collective distance multiplier and numerical reward thresholds.
Rename the 8 km target as a collective daily distance goal; don't falsely claim it
means arrival at the landmark. Migrate scene-specific stories to first visits to
their matching scenes. Keep awards once/day and reconnections deterministic. Reuse
reviewed resident dialogue for occasional repeat encounters; no unbounded backlog.
Trace and fix Wave from request through server state to actual rendered clip. Show
pending, contributing, queued, executing, cooldown and failure distinctly. A 60-second
cooldown is not an action timer. Preserve server-owned watched-time action semantics.

Prepare Vercel Pro minute scheduling with an authenticated idempotent reconciler,
reusing current prewarm/rollover service functions. Logical day boundary is 16:00 UTC;
late or duplicate cron cannot shift it. Authoritative requests also reconcile due
boundaries transactionally. Split contribution intervals and enforce vote/inventory
deadlines correctly. Document account configuration still needed without purchasing.

P26 — Fix measured performance problems and finish sponsor presentation.
Use the trace to select improvements. Bound DPR and GPU-resident backgrounds; preload
the next scene without decoding/uploading an entire season. Remove duplicate render
loops, per-frame React updates, resource leaks and avoidable critical-path downloads
where found. Preserve accepted model/animation quality. Use immutable cached assets
and keep state/private endpoints separate. R2 is optional if same-origin CDN works.
Inspect actual connection/message limits if account access exists; otherwise mark
them unverified. No unsupported promise of 500-viewer capacity.

Retain sponsor pricing/inventory/creative logic described in file 00. Fix the $73.50
Premium example and misleading monotonic-price copy. Premium must not be sold unless
the bottle and café placements are actually fulfilled; do not reopen character work
to force this. Hide Ticket/Cheer launch CTAs.
The research identified a provider conflict: Lemon Squeezy prohibits website/social
advertising. Default paid booking OFF pending a provider that accepts this exact
offer and merchant. Keep Sponsor a day informative. Do not repackage ads as SaaS or
donations, and do not replace providers blindly. Free validation can proceed on
appropriate hosting without paid checkout. Preserve already existing payment records.

P27 — Verify, reconcile docs and hand over the candidate.
Run relevant build/type/lint gates. Add focused tests for changed clocks, rollover,
reaction lifecycle and scene persistence, not tests that merely mirror CSS.
Capture cold/settled desktop and mobile states, and a short continuity video. Check
320/390/430/768/1440 widths, safe areas, long labels, panel scroll, keyboard and reduced
motion. Measure a meaningful single-viewer session with panels and a scene transition.
Use a few clients to check shared-state correctness without representing it as load
testing. If physical device/browser access is missing, state that exact verification
gap rather than checking it off.

Update the existing DECISIONS, AFTER-P22, launch readiness and technical budgets to
one consistent truth. Preserve historical entries and explain supersessions. Do not
leave old London/Tashkent Day-1 seeds, distance-tied scene claims, scheduler guarantees,
unsupported paid-provider assumptions or stale capacity results labeled current.

Deliver:
1. The reviewable preview/build location and files changed.
2. Before/after startup, mobile and continuity evidence.
3. Measured freeze cause and fix, or exact remaining unknown if not reproducible.
4. Clock/reaction/rollover verification and the exact tested build identity.
5. Separate free-launch and paid-booking status, with external dependencies only.
6. A short record of intentionally deferred work, including the load test.

Do not claim perfection or successful deployment from passing tests. Continue until
the authorized candidate is implemented and reviewable. Ask only for a genuinely
missing external action after completing everything that can be done without it.
```

## Continuation prompts

Use these only if the work has been split across sessions. They preserve the same decisions; they do not start a fresh redesign.

### Continue P23/P24: minimal interface and entry

```text
Continue the launch-finalization master task at P23/P24. Read its four files and the
current work log; inspect existing changes before editing. Finish coherent Paris
startup, centered traveler, compact desktop/mobile controls and persistent internal
panels. Remove the old illustration and oversized startup copy from the live path.
Keep accepted models/motion and shared-state authority. Verify cold entry, Wave,
Journey, Passport and Back in a short video. Then continue to P25 if no external
dependency prevents it. Do not stop with another plan.
```

### Continue P25: looping world and shared actions

```text
Continue P25 from the launch-finalization handoff. Implement the 18-active-walking-minute
five-scene cycle, truthful distance-goal semantics, scene-matched one-time stories,
repeat encounters and the complete reaction lifecycle. Preserve zero-viewer stops,
server action time, distance/contribution authority and once-daily achievements.
Prepare idempotent 16:00 UTC rollover with missed/duplicate-job reconciliation. Add
focused boundary tests. Do not implement a local per-visitor scene timer or rely on
an exact cron arrival. Continue to P26 after verification.
```

### Continue P26/P27: evidence and release candidate

```text
Continue P26/P27 from the launch-finalization handoff. Fix the measured single-viewer
freeze and startup bottleneck without rebuilding characters. Finish sponsor display
and keep paid checkout disabled until its provider/business eligibility is resolved.
The full load test remains after launch. Verify the current build on desktop and
mobile, record observed frame/startup/action timings, and reconcile all readiness
documents. Return a concrete candidate, evidence and the shortest exact list of
external actions remaining. Do not label unperformed checks as passed.
```

## What the owner should receive back

A useful completion message identifies the actual root cause of a reproduced freeze, shows the improved UI, states which deployment/build was tested, and names any remaining provider/device access dependency. “All tests passed; looks smoother” without motion evidence and state verification is insufficient for this request.

The next owner review is of the resulting candidate. The scope intentionally avoids another open-ended character approval cycle.
