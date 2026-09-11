# V3 candidate — source and license record

The owner put this animation into use on 2026-09-10. The clips still to review are listed
in `docs/plan/AFTER-P22.md` D6. Asset spending: **$0**.

## Mesh

`traveler.glb` is the reviewed V2 model, unchanged. Every credit in
[V2 credits](../v2/CREDITS.md) and [V1 credits](../v1/CREDITS.md) still applies.

## Motion — Mixamo

`traveler-animations.glb` carries motion from Adobe Mixamo
(https://www.mixamo.com). Every take was downloaded for this traveler's own skeleton,
uploaded to Mixamo. The takes were chosen by the owner on 2026-09-10 and baked onto the
project rig by `scripts/characters/import_mixamo.py`.

| Runtime clip | Mixamo take |
|---|---|
| `idle` | Breathing Idle |
| `walk` | Walking, In Place, retimed to 1.2 s with the left foot landing at 0 s |
| `greet`, `goodbye` | Waving |
| `talk` | Talking |
| `react` | Laughing |
| `drink` | Drinking |
| `phone` | Texting While Standing |
| `rest` | Leaning |
| `walk_start`, `resume` | Start Walking, held in place |
| `wait_pockets` | Searching Pockets |
| `wait_stretch` | Arm Stretching |
| `wait_yawn` | Yawn |
| `sit_down` | Stand To Sit |
| `sitting` | Sitting Idle |
| `stand_up` | Sit To Stand |
| `sleep` | Male Laying Pose, a single pose held for one second |
| `look_up` | Looking Around |
| `tie_shoe` | Kneeling Down |
| `stumble` | Tripping, held in place |
| `cheer` | Victory |

`listen`, `notice`, `stop`, `turn` and `photo` are still the project-authored V2 procedural
animation. Every other clip falls back as declared in `src/lib/characters/manifest.ts`.

## Residents

`resident-a.glb` and `resident-b.glb` are built by `scripts/characters/build_models.py`
from the same MakeHuman and MPFB sources as the V2 models, so every credit in
[V2 credits](../v2/CREDITS.md) and [V1 credits](../v1/CREDITS.md) applies to them too.
Resident A is the V2 Almaty host with the 2026-09-11 garment repairs; resident B is the
male local. Neither model carries animation.

`resident-a-animations.glb` and `resident-b-animations.glb` carry Mixamo motion, downloaded
by the owner on 2026-09-11 for each resident's own skeleton, uploaded to Mixamo, and baked
by `scripts/characters/import_mixamo.py`. The owner saved the takes under their runtime
names, so the Mixamo take names were not recorded; their lengths identify them.

| Runtime clip | Resident A | Resident B |
|---|---|---|
| `idle` | 8.33 s | 9.93 s |
| `walk` | In Place, 0.97 s retimed to 1.2 s | In Place, 1.03 s retimed to 1.2 s |
| `greet` | 4.00 s | 4.67 s |
| `talk` | 5.10 s | 3.93 s |
| `listen` | 2.60 s | 2.60 s |
| `react` | 9.90 s | 9.77 s |

A resident's `goodbye` plays its `greet`; every other clip falls back to `idle`.

Mixamo characters and animations are royalty free for personal, commercial and
non-profit projects. The raw downloaded files may not be redistributed, so they are not
kept in this repository. See https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html.
