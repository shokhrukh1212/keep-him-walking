# Required traveler asset work

## Concrete dependency

A custom sculpted and rigged interpretation of
`public/traveler/temporary/v1/idle.webp` is still missing. The available generic
MakeHuman head, stock hair and adapted closed shirt have not demonstrated the
requested likeness. The code/rig infrastructure can be reused; the illustration
must not be edited to match the weaker model.

## Smallest useful art delivery

Deliver one editable `.blend` plus one self-contained GLB, initially with idle,
one complete two-step walk and a stop. Prove the face, silhouette and deformation
in `/preview/characters` before commissioning all other actions. Target 1.78 m
standing height and a Z-up Blender / Y-up GLB conversion. Keep the Almaty woman
as the existing separate 1.68 m adult; do not substitute Snow's companion.

Required likeness work:

- Youthful adult, slim relaxed shoulders and torso; expressive large dark eyes,
  dark eyebrows, gentle cheeks, narrow chin and a warm closed-mouth smile.
- Asymmetrical swept dark waves: raised front quiff, visible separated curls,
  uneven natural outline and hairline. The current combed cap is not accepted.
- Teal open cotton overshirt with a fitted collar, rolled sleeves, integrated
  pockets, buttons, seams and restrained folds. White crew-neck tee underneath.
- Tan fitted trousers with constructed turn-up cuffs, illustrated sneakers,
  watch and fitted mustard backpack with real straps and a sponsor patch.

Rig and deformation requirements:

- Joint-ready shoulder/elbow/hip/knee topology and weights; no stretched cuffs,
  detached cutouts, torso penetration or joint-volume collapse.
- Separate garments/hair are allowed. Four normalized skin influences per
  vertex for reliable Three.js export; preserve more only with proven support.
- Eyelid closure, gaze, smile, brows and subtle mouth controls as supported
  morphs/bones. Bake any Blender-only driver/corrective behavior needed in GLB.
- Relaxed articulated fingers plus bottle, portrait-phone and two-hand camera
  grips. Named hand sockets and a mouth contact marker in model coordinates.
- A clean neutral rest pose and a documented retarget calibration pose.

Animation proof:

- Walk with heel strike, support transfer, toe-off, swing clearance, pelvis and
  shoulder counter-rotation. Approximately 1.2 s per **two** steps is the cadence
  reference; preserve source quality if another duration is better.
- Stop completes support transfer and places the free foot. Resume starts with
  a weight shift. Turns must step, not rotate planted shoes through the floor.
- Subsequent actions need entry/recovery and interruption behavior; the bottle
  opening reaches lips, both camera hands grip the device, screen faces actor.

Browser proof / handoff:

- Front, three-quarter, side and back at full-body and close-up scales; neutral
  face, smile, blink, raised arm, bent elbow and full stride.
- Editable source, baked clips, export script/settings, packed maps, and exact
  source/author/license records. No unsupported shader magic that disappears
  from the exported model.
- Preserve the combined 8 MiB goal where practical. Prioritize face and hands;
  provide measured alternatives if the texture/geometry target conflicts.
- Keep the existing preview and v1 comparison. User visual acceptance is the
  gate for production integration, not file validity or test success.

## Acquisition constraints and evaluated alternative

Asset spending remains $0. Budget is $5–$10; no bespoke artist quote within that
budget has been verified and none is promised. This brief can be used for an
artist contribution or a clearly scoped quote. Do not buy a subscription merely
because its advertised monthly price appears close to that budget.

Blender Studio Snow v4.2 was downloaded and inspected as an alternative. Its
existing face, hair and outfit are a different identity. Its complex Blender
control rig also requires a separate browser export pipeline and customization.
Snow has not been demonstrated as a shortcut to this traveler and is not included
in the candidate. No Meshy model was purchased/generated/exported; no Mixamo
account or animation download was used.
