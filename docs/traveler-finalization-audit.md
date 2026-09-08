# Traveler finalization audit and repair checkpoint

The requested visual result has **not** been achieved. V1 was rejected; V2 is a
repair candidate. The authoritative reference remains
`public/traveler/temporary/v1/idle.webp`. No production renderer or country pack
has been switched. No purchase, subscription, push or deployment occurred.

## Confirmed findings

| Defect | Evidence / cause | Responsible source | Correction / remaining work |
|---|---|---|---|
| Arms folded through the torso in the first sourced V2 | Confirmed: source upper arm rests horizontally; target arm points downward and forearm already bends. Source global deltas were applied without rest-axis alignment. | `extract_motion_source.py`, `motion_source.py` | Export source rest axes; calibrate limb direction before applying source delta. Keep torso's target rest orientation. |
| Character drifts vertically while playing a baked take | Confirmed in Blender: hips changed from Z .391 at walk frame 0 to 1.030 at frame 36 in a supposed in-place loop. Cached pose heads were read before evaluation of the reset. | `animation.py` | Update dependency graph after reset. Repeated-pose check alternates unrelated actions and compares every bone matrix. Corrected loop returns to its starting root position. |
| Jagged shirt opening and block-like chest | Confirmed: whole faces deleted by center thresholds, detached stock buttons retained, rigid extra pockets/lapel tubes added to a skinned garment. | `wardrobe.py`, `build_models.py` | Split exact placket edges, remove detached stock button geometry, retain the main garment shell, soften surface, remove rigid chest additions. Shoulder clearance remains a visual concern. |
| Phone screen points away from the traveler | Confirmed in front browser views and socket transform. | `actor.ts` | Turn device 180 degrees around Y before portrait/landscape orientation. Grip and gaze remain incomplete. |
| Mobile encounter crops shoes | Confirmed in captured 390×844 layout: zoom reduced the bottom of the orthographic view above the floor. | `CharacterStage3D.tsx` | Reposition camera center with zoom to retain the same bottom floor margin. |
| Face/hair still do not match approved illustration | Visual inference supported by Blender and browser comparison: same generic base and combed stock quiff survive export. | MPFB targets, `elvs_grump_hair`, skin texture | Morph adjustments are insufficient. Bespoke likeness and swept-wave hair work are still required. See the asset brief. |
| Clothing still reads as plain surfaces | Confirmed: assembly replaces source cloth materials with solid dyes; missing tailored folds and finish are also visible in Blender. | `cloth_color`, stock garment geometry | Requires garment fitting, restrained fold/texture authoring and deformation cleanup. Lighting cannot create missing garment construction. |
| Validation previously implied too much | Existing scripts checked load/seek/layout; they did not judge the anatomy visible in the user's screenshots. | browser scripts / old implementation notes | Explicit WIP UI and status. Added isolated staged review; technical checks remain separate from appearance. |

## Eleven original actions: actual provenance

All V1 clips came from project code `scripts/characters/animation.py`, exported
in `art/characters/v1/traveler.blend` and `almaty-host.blend`. Provider: this
project. Method: procedural two-bone IK, trigonometric targets and envelopes,
baked at 30 Hz. **No Mixamo download or motion capture was used.** Each GLB
action contains translation, rotation and scale channels for the 52-bone rig
(156 channel entries; constant tracks may be reduced by export). No clip has
facial morph tracks. Runtime writes six exported facial morph weights.

| Take / exported name | Duration (s) | Authored behavior |
|---|---:|---|
| idle | 4 | Standing feet, scripted head motion |
| walk | 1.2 | Analytic stance/swing goals and opposing arms |
| greet | 3 | Right wrist rise/wave envelope |
| talk | 4 | Scripted hand targets; runtime speaking morph |
| listen | 4 | Standing/head motion |
| react | 3 | Scripted conversational hand targets |
| goodbye | 3 | Same gesture construction as greet |
| drink | 5.5 | Wrist target near face; runtime bottle placement |
| phone | 4.5 | Two wrist targets in front of torso |
| photo | 4 | Higher two-hand targets; runtime landscape device |
| rest | 5 | Lowered pelvis, forward feet and thigh-level hands |

## V2 source performance experiment

Provider: [Mesh2Motion source art](https://github.com/Mesh2Motion/mesh2motion-assets).
Repository revision `9ba82162522213f3226c099ce6d0576179556a35`; repository license
CC0-1.0. These are authored source animations; capture provenance is not claimed.
The extracted project records are `scripts/characters/motions/*.json` and include
take name, source file, version, rest axes, duration and sampled body rotations.

| V2 take | Original source file / action | Native duration | Modification |
|---|---|---:|---|
| walk | `animation-human-walk-female.blend` / `Walk_Female` | 1.375 s | Whole two-step cycle retimed to 1.2 s for approximately 100 steps/minute; target rest-axis calibration; vertical pelvis variation; relaxed procedural fingers. Suitability and floor contacts remain provisional. |
| greet | `animation-human-greeting.blend` / `Greeting` | 4.7917 s | Retained native timing, rounded export to 4.8 s; target rig calibration. |
| listen | `animation-human-idle-listening.blend` / `Idle Listening` | 1.6667 s | Native-speed repeat within four-second review interval. |
| idle | `animation-human-idle-subtle.blend` / `Idle_Subtle` | 2.5833 s | Native-speed repeat within four-second review interval. |

Other V2 actions remain project-synthesized; new notice/stop/turn/resume clips
are also procedural placeholders, not finished authored foot-contact transitions.
The named `turn` clip does not yet constitute a fully corrected stepping turn.
The woman retains V1 geometry, identity, expressions and clips. She is not
replaced by a library character. Her greeting response starts .4 s after the
traveler and goodbye .25 s after, within the fixed scene timeline.

Source blends log missing upstream absolute library paths and newer-writer
version warnings under Blender 4.5.4. Evaluated body pose data was available and
sampled; this is not proof that every original control-rig feature survives.
No upstream control rig is shipped in the browser. Standalone extracted curves
are retargeted and baked onto the target's own skeleton.

## Source / exported GLB / preview comparison

Inspected a front greeting at 1.5 seconds in the editable Blender scene, a
minimal Three.js viewer of the unoptimized GLB, and the existing review app.
Front orthographic framing and soft directional/fill lighting were used; Blender
Cycles/AgX and Three ACES lighting are not pixel-identical references.

- Source and exported poses agree visually after calibration/reset fixes.
- Weak face likeness, stock hair silhouette, flat cloth and shoulder penetration
  are already present in the source. They are not introduced by texture resizing.
- Minimal viewer displays light brown hair; the app deliberately tints its map
  dark brown. Skin, eye and shoe textures remain imported. Cloth colors were
  already replaced during authoring, not silently replaced by the runtime.
- Source body retains six shape controls. GLB exports those morphs; runtime
  supplies blink/smile/speaking/brow weights. This is expression animation, not
  audio lip synchronization. Gaze and eyelid/eyelash agreement need more work.
- Export warns that skin influences beyond four are truncated and normalized.
  No correction has yet established identical deformation for those vertices.
- Texture optimizer preserves geometry and animation buffers. A separate V2
  source-side decimation affects only the concealed inner T-shirt (7027 to 2191
  vertices); face, hands and outer shirt are retained. Inspect its result before
  promotion. This is a measured alternative to reducing face texture resolution.

## Acceptance status

Implemented engineering is not evidence of a finished character. Outstanding:
recognizable custom head/hair, tailored garment finish, full support-aware
walk/stop/turn/resume correction, bottle-body grip and lip contact, gaze toward
props/partner, independent resident acting, full facial deformation review,
matching fallback render, and physical-device performance validation.

The existing Pixi scene / shared journey integration remains behind visual
acceptance. The review uses a local clock and an Almaty backdrop; it is not a
validated combined Pixi/Three production scene. Prop metadata defines visibility
and contact windows; it does not prove physical contact or eliminate all pops.
Do not claim that another procedural adjustment guarantees bespoke art quality.
