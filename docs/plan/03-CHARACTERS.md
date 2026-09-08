# 03 — The Characters

> He stays 3D. That decision is fixed. This file is about making the 3D man look like
> he belongs in the painting, move like a person, and have enough to do — for $0.

## 1. What is wrong today (from the screenshots and `TECHNICAL.md §7–8`)

| Problem | Effect on a viewer |
|---|---|
| Floats above the pavement; about one storey tall | "This is a web page with a picture on it" — the brain rejects the scene. |
| Photoreal-ish shading (ACES, PBR, cool fill) over a painted background | Two rendering languages in one frame. Uncanny. |
| Flat, solid-dye clothes; generic MakeHuman face; stock quiff | Reads as a placeholder. Nobody screenshots a placeholder. |
| Procedural curves, not motion | Walk is acceptable; gestures are stiff; no weight shift, no gaze. |
| 15 clips, 5 real actions | A 24-hour day with five things to do. |
| Shadow lands behind-left on a transparent canvas | No contact = no presence. |

## 2. The fix that costs nothing and changes everything: make him part of the painting

Do these in P3 before touching the model itself. In this order:

1. **Ground truth.** Feet on `groundLineY`, height from `personHeightFrac` (see `02 §4`).
2. **Toon shading.** Replace `MeshStandardMaterial` on skin/clothes/hair with
   `MeshToonMaterial` and a 3-step gradient map; keep normals. Add a back-face outline
   pass (inverted hull, 1.5–2 px, colour = darkest palette colour at 70 %). Turn off
   ACES; use `NoToneMapping`; exposure 1.0.
3. **Scene-matched light.** Key light direction from `stage.lightDir`; key colour and
   fill from `stage.palette` (warm palette[0] at 0.9, cool palette[2] at 0.35).
4. **Contact shadow.** Drop the `ShadowMaterial` floor. Draw a soft ellipse *in the Pixi
   world*, on the ground layer, at the character's foot position (the character stage
   publishes `{footX, footY, scale}` each frame to a shared ref). Radius 0.55 × height,
   alpha 0.28, darker with sun elevation. The shadow now moves with the pavement.
5. **Grade him with the world.** Apply the same hourly tint/exposure as the world filter
   (a uniform on the toon materials).
6. **Rim light at dusk/night.** A thin warm rim from the lamp side at night. One line.

Result: same mesh, same clips, but he reads as an illustrated character in an illustrated
city. This alone moves him from "60 %" to "80 %" in a viewer's eyes.

## 3. Then decide the model: keep MPFB, or swap the base for a day

You have two free candidates. Try B in one afternoon; keep whichever screenshot wins.

**A. Keep the MPFB build**, add: hair as textured cards (4–6 alpha cards shaped to the
reference's swept quiff instead of bezier tubes), a subtle cloth normal map on the
overshirt (free CC0 fabric normals), and the toon pass above. Fixes most of "plain
surfaces" and "stock quiff".

**B. Ready Player Me avatar as the base mesh.** Stylised, well-topologised, comes with a
Mixamo-compatible skeleton and morph targets, and exports GLB at ~1.5–3 MB. Build the
look from the identity brief (teal overshirt, white tee, tan trousers, dark swept hair),
export, and *keep your own backpack, watch and sponsor patch* by re-attaching them in
Blender to the same-named bones. Check the current license terms before shipping — RPM
has historically allowed free use in apps with attribution; the terms may have changed.
If A wins on likeness and B wins on polish, B with the toon pass is the usual winner.

Either way the character system does not change: one skeleton, 52-ish Mixamo-named
joints, clips weight-gated, deterministic seek, props via hand sockets.

## 4. Animation: stop authoring curves, start retargeting

The procedural pipeline was the right call when nothing else worked. Now the rig is
Mixamo-named, so the free path is:

1. Export the traveler as FBX (T-pose).
2. Upload to Mixamo (free with an Adobe login; if the service has been sunset by the
   time you read this, use Mesh2Motion's CC0 set with the rest-axis fix, or Rokoko's
   free video-mocap tier for a handful of clips).
3. Download the clips below **with skin**, retargeted to the uploaded character, 30 fps.
4. Import into Blender, push actions onto the existing armature, trim to loop points,
   export GLB with `ACTIONS` mode. Update `manifest.ts` durations.

Clip list (Mixamo names in brackets where they exist):

| Semantic state | Clip | Notes |
|---|---|---|
| walk | Walking (in place) | loop; also `Walking Brisk` for pace ≥ 3× |
| idle | Idle (breathing) + Looking Around | alternate every 2 loops |
| rest | Sitting Idle / Leaning Idle | at the landmark, on a bench cutout |
| wait (new) | Standing Idle, hands in pockets; Yawn; Stretching; Checking watch | cycle deterministically while `walking=false`; at night: **sits down** after 10 min waiting |
| greet / goodbye | Waving | trim 2.5 s |
| talk / listen | Talking / Listening (standing) | plus the runtime speak morph |
| react | Surprised / Laughing (small) | pick by line mood |
| drink | Drinking | prop windows re-timed |
| phone | Texting While Standing | |
| photo | Taking Selfie → mirrored to hold device outward | |
| sit (new) | Sit Down / Stand Up + Sitting | landmark + waiting at night |
| look_up (new) | Look Up / Admire | in `lanes` (balconies) and `landmark` |
| tie_shoe (new) | Crouch → Tie | every ~15 min, 4 s |
| umbrella (new) | Holding umbrella idle walk | when rain, prop = simple cone |
| photo_pose (new) | Thumbs up / peace sign | when 50+ watchers ask for a photo |
| stumble (new, rare) | Trip (small) | once a day at a deterministic metre; people love it |
| cheer (new) | Victory / Fist pump | at the marathon |
| start_walk / stop / turn | from Walk Start / Walk Stop / Turn Left 90 | replaces placeholders |

That is ~24 clips. Keep the GLB under 6 MB by exporting animations as a separate
`traveler-anim.glb` (skeleton-only, no mesh) and binding at runtime; then compress both
with meshopt (P18).

## 5. Gaze and face (small, high impact)

- Head look-at: aim the neck/head bone toward the resident during talk/listen, toward
  the camera for 0.8 s after a crowd `wave`, toward the phone during `phone`. Clamp ±35°.
  Blend weight 0.6 so the clip still owns the pose.
- Blink is fine. Add a `smile` accent when watchers > 10 and on the first watcher's arrival.
- Mood → brow/mouth: `amused` +smile, `surprised` +brows, `thoughtful` slight tilt.

## 6. The waiting behaviour (the emotional centre when nobody is there)

While `walking=false`:

| Waited | He |
|---|---|
| 0–60 s | stops properly (already), looks around |
| 1–10 min | idle cycle: hands in pockets, checks watch, looks up the street |
| 10+ min | sits (bench cutout on the near layer, or the kerb if the zone has none) |
| 10+ min at local night | sits, head down, "sleeping" (Sleeping Idle) — the status pill: `Asleep on a bench · since 02:14` |
| someone arrives | 3-second beat: looks up toward camera, stands, `start_walk`. First watcher's card fires. |

This is the scene that gets posted at 3 a.m. Build it well.

## 7. The locals

- **One resident per city, from two base rigs** (`resident-a` female, `resident-b`
  male — build `b` from the same pipeline). Per-city `variantId` changes: skin tone (3),
  hair (4 styles), outfit colour set (from the city palette), one accessory (scarf,
  cap, apron, bag). Six states as today. The Almaty host is `resident-a`.
- **Names and roles** come from the pack: "Nino, runs the bakery" — never a stereotype,
  never a costume. Modern everyday clothes unless the encounter is explicitly at a
  traditional craft (and then the craft, not the ethnicity, is the subject).
- **Background walkers** are the same rigs at 0.45–0.6 scale, random variant, on the
  mid layer, no faces needed at that size.
- **A companion animal per region (later):** a street dog that follows him through
  Istanbul, a cat that sits with him at the Tbilisi landmark. One quadruped rig with 3
  clips is a Season 2 job; note it, don't build it now.

## 8. Dialogue rules (unchanged, restated because they matter)

- Content, not animation: `{ speaker, text, mood, durationMs }`. Five to seven lines per encounter, 4–5 s each.
- Written in advance, reviewed by you against `01 §7`, never generated live.
- Each city: one encounter script, one local phrase with script/translit/gloss/pronunciation, 8–12 notebook lines (unlock per zone), 2 vote blurbs (why come here), postcard copy (3 sentences, addressed to "you").
- The traveler's voice: curious, a little tired, kind, never sarcastic about a place. He notices small things (a balcony, a smell, a cat). He never rates a country.

## 9. Identity kit (so every surface matches)

The 2D landing illustration is the identity reference and stays the marketing face:
OG images, postcards, the X avatar, the passport stamps. The 3D model must match it in
silhouette and colour: teal overshirt open over white tee, tan trousers with turn-ups,
dark swept hair, watch on the left wrist, the mustard backpack — the backpack is the
logo. Export a 512 px transparent PNG of the backpack alone; use it as the favicon and
the X profile picture.

## 10. What "premium enough" means for launch

Ship when a stranger watching for 60 seconds does not say "why is he floating" or "why
does he look like a game from 2005". That is: ground contact, scale, toon shading,
retargeted walk/idle/wait, and gaze. Face likeness can keep improving after launch —
nobody has met him yet, so there is no likeness to miss.
