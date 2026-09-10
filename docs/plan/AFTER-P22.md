# Deferred work — after all 22 prompts

Things found while building P1–P22 that are **deliberately not being done yet**. None
of them is a bug and none blocks the next prompt. They are parked here so they are not
carried in someone's head, and so P22 is not the first time they are remembered.

**Read this file when P22 is finished**, before the launch checklist in
`06-LAUNCH-AND-GROWTH.md`.

Every entry follows the house rule in `AGENTS.md`: what it is in plain English, what
happens if nothing changes, and exactly what to do.

These are the residue of P18. The related pre-P18 conflicts C16, C17 and C19 in
[ROADMAP.md](ROADMAP.md) are resolved and closed; what is below is what P18 could not
finish rather than what it got wrong.

| # | Item | Blocks launch? | Whose call |
|---|---|---|---|
| D1 | His 3D model is bigger than the target | No | Owner (visual) |
| D2 | The 1,000-viewer load test has not been run on current code | **Yes, effectively** | Owner (needs a deployed Preview) |
| D3 | Lit windows at dusk have no artwork | No | Owner (art) |
| D4 | Sofia has one source painting instead of the six the pack builder needs | No | Owner (art) |
| D5 | The production scheduler may run launch jobs late | **Yes** | Owner (hosting) |

---

## D1 — His 3D model is 2.48 MB, not the 1.8 MB target

**What it is.** P18 made the traveler's 3D model 44% smaller — 4.43 MB down to 2.48 MB —
without changing how he looks. The plan asked for 1.8 MB. Getting the last 0.7 MB means
either changing how he looks or rebuilding the model, so it stopped there.

What is left is 0.90 MB of his skin and clothing textures, 0.68 MB of structural data
(the list describing every piece of his mesh), and 0.86 MB of the compressed model
itself. Measurements and the compression method are in `TECHNICAL.md`, section
"Compression, cost protection and deletions (P18)".

**What happens if nothing changes.** Every first-time visitor downloads about 0.7 MB
more than planned. Nothing breaks, and he loads fine. It costs more bandwidth per
visitor, which matters only if a day goes viral on a free-tier host.

**What to do — pick one.**

- **A — Softer textures. Saves about 0.45 MB.** Lower the texture size cap in
  `scripts/characters/optimize-glb.mjs` from 1536 to 1024 pixels, then re-run
  `pnpm characters:compress public/characters/v2/*.glb`.
  **His face and clothing become slightly less sharp, so the owner must look at the
  result and approve it.** This is the only option that changes what people see.
- **B — Rebuild the mesh. Saves most of the structural 0.68 MB.** His model is 31
  separate pieces; merging them into a few shrinks the structural list. No visual
  change at all, but it is Blender work on the source model, not a script.
- **C — Accept 2.48 MB.** Say so and the number gets recorded as the agreed budget in
  `CHARACTER_MANIFEST.combinedBudgetBytes` and in `TECHNICAL.md`.

---

## D2 — The 1,000-viewer load test has never been run against this code

**What it is.** The test that answers "does the site survive 1,000 people watching at
the same time". The numbers currently in `docs/phase-3-results.md` were measured on
6 September 2026 and describe a version of the code that no longer exists.

Three things changed since that run, and each one moves the result: reactions are now
part of the test (the old run measured a site where nobody pressed anything), each
visitor now makes one extra call on arrival, and the heartbeat slows down as the crowd
grows. The full explanation is in `docs/phase-3-results.md`, section "The load gate has
not been re-run since P18".

**What happens if nothing changes.** Launch happens without knowing whether a viral day
holds up. **This is the largest remaining unknown before launch** — larger than anything
else in this file.

**What to do.** Deploy a Preview to Vercel, then run:

```
pnpm exec tsx scripts/load/phase3-load.ts --execute \
  --base-url <preview url> --confirm-host <preview host> \
  --watchers 1000 --duration 300 --reaction-percent 5 \
  --vercel-bypass-file <path to bypass token file>
```

Paste the JSON it prints into a message; the results table in
`docs/phase-3-results.md` then gets replaced and that section deleted. A dry run
(the same command without `--execute`) prints the plan and sends no traffic — it has
already been done and proves nothing about capacity.

This cannot be run from the development environment: it needs a real deployment, a
`--confirm-host` match and a protection-bypass file.

---

## D3 — Lit windows at dusk have no artwork

**What it is.** The code that makes city windows glow as the sun goes down is finished
and working. No city has the painting it needs, so it never draws anything. See
`TECHNICAL.md`, section "The living world (P17)", under "Honest gap".

**What happens if nothing changes.** Nothing lights up at dusk. There is no error and
no broken layout — the feature is simply absent, and the scene grades to night as it
does today.

**What to do — pick one.**

- **Paint them.** One image per zone, the same pixel size as that zone's main painting,
  everything black except the windows that are lit. Save each as
  `public/scenes/<city>/<version>/zones/<zone>/lights.webp` and say which cities are
  ready; the `lightsUrl` field then gets filled in for those zones. Start with one
  evening zone to see whether it is worth doing for the rest.
- **Skip it.** Say so and it gets recorded as a deliberate choice rather than an
  unfinished feature.

**Related, and still true:** `nightUrl` is declared in the pack schema and no code reads
it, so P10's night cross-fade is colour-grading only. That belongs to P10 and is noted
in `TECHNICAL.md` rather than silently absorbed here.

---

## D4 — Sofia needs separate paintings before it can be the P19 example

**What it is.** The new pack builder needs five separate zone paintings plus a night
version of the landmark. Sofia currently has one painting at
`art/phase3/sofia/master.png`, cropped five ways by the older pipeline.

**What happens if nothing changes.** The pack tools still create and build new cities,
and Sofia keeps using its current checked-in pack. Sofia cannot demonstrate the new
one-painting-per-zone workflow.

**What to do.** Put the five day paintings at
`art/sofia/zones/sofia-<arrival|lanes|market|cafe|landmark>/master.png`, and put the
night painting at `art/sofia/zones/sofia-landmark/night.png`. First scaffold the new,
immutable version with `pnpm pack:new sofia --version 2 --from <reviewed-json-file>`;
after placing the paintings, run `pnpm pack:build sofia`. This registers `sofia-v2` and
keeps the current `sofia-v1` available for rollback.

---

## D5 — The production scheduler must be minute-accurate

**What it is.** The launch needs one job at 15:55 UTC and rollover at exactly 16:00 UTC, while Vercel's free scheduler may start a daily job anywhere inside its scheduled hour.

**What happens if nothing changes.** Prewarming or a daily border crossing can happen up to 59 minutes late, so the launch and every later day can show the wrong state.

**What to do.** Before launch, choose a production scheduler that guarantees minute-level runs and point it at the two authenticated cron URLs; Vercel Pro is the simplest paid choice, while a free external scheduler avoids that cost but adds another account and failure point.
