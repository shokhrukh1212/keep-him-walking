# V2 repair candidate — source and license record

This is an unfinished visual candidate. Asset spending: **$0**.

The traveler reuses and modifies the components listed in
[V1 credits](../v1/CREDITS.md): MakeHuman/MPFB human geometry, skin, face targets,
eyes, eyebrows, lashes, teeth and sneakers (CC0); Cortu Johnstone cargo pants
(CC0); Elvaerwyn `elvs_male_shirt_untucked_bd1` and `elvs_grump_hair` (CC-BY,
version unspecified upstream); o4saken `punkduck_deathnote_t-shirt` (CC BY 3.0).
All original credits and modification notices remain applicable.

The current interaction repair retains the checkpoint's geometry and gait.
Seven traveler interaction clips and four resident interaction clips were
re-authored with evaluated parent transforms, arm IK, explicit palm frames and
joint-specific finger flexion. The resident retains her V1 geometry and identity;
her repaired animation export is versioned separately here.
These interaction clips are project-authored procedural animation, not motion capture.

## Mesh2Motion authored motion — CC0-1.0

Source: https://github.com/Mesh2Motion/mesh2motion-assets
Revision: `9ba82162522213f3226c099ce6d0576179556a35`
License: https://creativecommons.org/publicdomain/zero/1.0/

Repository staging takes (not used in the served interaction repair): `Walk_Female`, `Greeting`, `Idle Listening`,
`Idle_Subtle`. Their source `.blend` filenames, native durations, sampled
rotations and rest axes are recorded in `scripts/characters/motions/*.json`.
The walking cycle is retimed to 1.2 seconds for two steps; greeting retains
native timing with a 4.8-second export. Quiet idle/listening takes repeat at
native speed. Target limb axes and proportions are calibrated in project code,
and relaxed finger poses are added procedurally.

These are **not claimed to be motion capture**. Other actions and transitions
remain project-synthesized. No Mixamo animations are included. Blender Studio
Snow was evaluated but is not redistributed or used in these GLBs.
