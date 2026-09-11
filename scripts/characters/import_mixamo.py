"""Bake Mixamo takes onto the project rig and export the V3 animation GLB.

Run from the project root, then compress the result:

  .cache/character-authoring/tools/blender-4.5.4-linux-x64/blender --background \
    --factory-startup art/characters/v2/traveler.blend \
    --python scripts/characters/import_mixamo.py -- traveler \
    .cache/character-authoring/mixamo/downloads/traveler
  node scripts/characters/compress-glb.mjs public/characters/v3/traveler-animations.glb

A resident passes its runtime name after the takes folder, and `--model` to export
its clip-free mesh from the same rig:

  .cache/character-authoring/tools/blender-4.5.4-linux-x64/blender --background \
    --factory-startup .cache/character-authoring/staged/v2/almaty-host.blend \
    --python scripts/characters/import_mixamo.py -- almaty-host \
    .cache/character-authoring/mixamo/downloads/resident-a resident-a --model
  node scripts/characters/optimize-glb.mjs public/characters/v3/resident-a.glb
  node scripts/characters/compress-glb.mjs public/characters/v3/resident-a.glb \
    public/characters/v3/resident-a-animations.glb

Takes are downloaded for the character uploaded from this same rig (FBX Binary,
Without Skin, 30 fps, no keyframe reduction) and named either after the runtime
clip (`walk.fbx`) or with the Mixamo name listed in TAKES. They stay in the
ignored cache: Mixamo's terms allow shipping motion inside the product but not
redistributing the raw files, and this repository is public. The baked .blend is
kept there for the same reason.

Mixamo hands the uploaded skeleton back re-rested with level arms, while the MPFB
rig rests with its arms 49 degrees down. Copying rotations, or rotation deltas
from each rest, folds the arms through the torso (TECHNICAL.md §5.3). Each target
bone is therefore first posed, parent first, onto the source's rest directions,
and then follows the source's world rotation away from that shared reference.
Bone rolls cancel out of that delta, so FBX bone orientation cannot twist a limb.

Takes are baked frame for frame at their own length; the manifest records that
length and the actor maps scheduled time onto it. Three shapes are special:
- walk-type loops are cut from one left-foot placement to the next and resampled
  piecewise, so the left foot lands at 0 s and the right at 0.6 s (the
  planted-foot grid in motion-clock.ts);
- a take whose feet travel is held in place, because horizontal travel belongs
  to the scene clock;
- a single-frame pose is held for one second.
Every other take is placed by where its feet start, so takes that share a pose
(stand to sit, sitting, sit to stand) meet where the previous one left off.
"""
import math
import re
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'public' / 'characters' / 'v3'
SOURCE = ROOT / '.cache' / 'character-authoring' / 'v3'
FPS = 30
STEP_SECONDS = 0.6
CYCLES = ('walk', 'walk_brisk', 'umbrella_walk')
ROUTE_METRES_PER_SECOND = 1.25
TRAVEL_METRES = 0.5
HELD_POSE_SECONDS = 1.0
# Owner-approved Mixamo takes that kept their Mixamo file names (2026-09-10).
TAKES = {
    'Arm Stretching': ('wait_stretch',),
    'Breathing Idle': ('idle',),
    'Drinking': ('drink',),
    'Kneeling Down': ('tie_shoe',),
    'Laughing': ('react',),
    'Leaning': ('rest',),
    'Looking Around': ('look_up',),
    'Male Laying Pose': ('sleep',),
    'Searching Pockets': ('wait_pockets',),
    'Sit To Stand': ('stand_up',),
    'Sitting Idle': ('sitting',),
    'Stand To Sit': ('sit_down',),
    'Start Walking': ('walk_start', 'resume'),
    'Talking': ('talk',),
    'Texting While Standing': ('phone',),
    'Tripping': ('stumble',),
    'Victory': ('cheer',),
    'Waving': ('greet', 'goodbye'),
    'Yawn': ('wait_yawn',),
}

arguments = sys.argv[sys.argv.index('--') + 1:]
positional = [value for value in arguments if not value.startswith('--')]
# The rig object name, the takes folder, and the runtime name the outputs take
# when it differs from the rig (the Almaty host's rig ships as `resident-a`).
role, takes = positional[0], ROOT / positional[1]
output_name = positional[2] if len(positional) > 2 else role
# `--model` also exports the character mesh carrying no clips, so every motion it
# plays comes from these takes and its declared fallbacks, never a V2 procedural take.
EXPORT_MODEL = '--model' in arguments
manifest = (ROOT / 'src' / 'lib' / 'characters' / 'manifest.ts').read_text()
DURATIONS = {match.group(1): float(match.group(2))
             for match in re.finditer(r'^\s+(\w+): \{ duration: ([\d.]+)', manifest, re.M)}

scene = bpy.context.scene
scene.render.fps = FPS
rig = bpy.data.objects[role]
short = lambda name: name.split(':')[-1]
ordered = sorted(rig.data.bones, key=lambda bone: len(bone.parent_recursive))
root_bone = ordered[0]
# The loaded v2 takes would claim the runtime names ('walk' would export as
# 'walk.001', which the loader cannot match). This session never saves over v2.
for existing in list(bpy.data.actions):
    bpy.data.actions.remove(existing)


def rest_rotation(obj, bone):
    return (obj.matrix_world.to_3x3().normalized() @ bone.matrix_local.to_3x3().normalized()).to_quaternion()


def pose_rotation(obj, pose_bone):
    return (obj.matrix_world.to_3x3().normalized() @ pose_bone.matrix.to_3x3().normalized()).to_quaternion()


target_rest = {bone.name: rest_rotation(rig, bone) for bone in ordered}


def chain_child(bone):
    # A leaf keeps its length in the exported `_end` bone the upload carried.
    if not bone.children:
        return short(bone.name) + '_end'
    return short(min(bone.children, key=lambda child: (child.head_local - bone.tail_local).length).name)


def import_take(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=str(path), automatic_bone_orientation=True, ignore_leaf_bones=False)
    armatures = [obj for obj in bpy.data.objects if obj not in before and obj.type == 'ARMATURE']
    if len(armatures) != 1 or not armatures[0].animation_data or not armatures[0].animation_data.action:
        raise ValueError(f'{path.name}: expected one animated armature')
    return armatures[0]


def calibrate(source):
    bones = {short(bone.name): bone for bone in source.data.bones}
    missing = [short(bone.name) for bone in ordered if short(bone.name) not in bones]
    if missing:
        raise ValueError(f'source skeleton lacks {missing}')
    head = lambda name: source.matrix_world @ bones[name].head_local
    if head('LeftToeBase').y > head('LeftFoot').y:
        raise ValueError('source does not face -Y like the project rig')
    reference, rest_gap = {}, {}
    for bone in ordered:
        parent = bone.parent
        inherited = (reference[parent.name] @ target_rest[parent.name].inverted() @ target_rest[bone.name]
                     if parent else target_rest[bone.name])
        child = chain_child(bone)
        if child not in bones:
            reference[bone.name] = inherited
            continue
        wanted = head(child) - head(short(bone.name))
        reference[bone.name] = (inherited @ Vector((0, 1, 0))).rotation_difference(wanted) @ inherited
        rest_gap[short(bone.name)] = math.degrees((target_rest[bone.name] @ Vector((0, 1, 0))).angle(wanted))
    source_rest = {name: rest_rotation(source, bone) for name, bone in bones.items()}
    return reference, source_rest, rest_gap, head('Hips')


def sample(source, frame):
    whole = math.floor(frame)
    scene.frame_set(whole, subframe=frame - whole)
    pose = {short(pose_bone.name): pose_bone for pose_bone in source.pose.bones}
    rotations = {name: pose_rotation(source, pose_bone) for name, pose_bone in pose.items()}
    feet = (source.matrix_world @ pose['LeftFoot'].head, source.matrix_world @ pose['RightFoot'].head)
    return rotations, source.matrix_world @ pose['Hips'].head, feet


def placements(source, first, period):
    """Frames where each foot reaches furthest forward of the hips, with a parabolic sub-frame fit."""
    reach = ([], [])
    ankle = []
    for frame in range(first, first + period):
        _, hips, feet = sample(source, frame)
        for side in (0, 1):
            reach[side].append(hips.y - feet[side].y)
        ankle.append(feet[0].z)
    def peak(values):
        best = max(range(period), key=lambda index: values[index])
        before, here, after = values[best - 1], values[best], values[(best + 1) % period]
        curvature = before - 2 * here + after
        return first + best + (0.5 * (before - after) / curvature if curvature else 0)
    # Native backward speed of the planted left foot, for comparison with the route.
    planted = [index for index in range(period) if ankle[index] <= min(ankle) + 0.01]
    speeds = [reach[0][index] - reach[0][(index + 1) % period] for index in planted]
    return peak(reach[0]), peak(reach[1]), max(0, sum(speeds) / max(1, len(speeds))) * FPS


def cycle_timeline(name, source, first, last):
    period = last - first  # Mixamo repeats the first pose on the last frame
    left, right, native_speed = placements(source, first, period)
    if right < left:
        right += period
    frames, half = round(DURATIONS[name] * FPS), round(STEP_SECONDS * FPS)
    if frames != 2 * half:
        raise ValueError(f'{name}: manifest duration {DURATIONS[name]} s is not two {STEP_SECONDS} s steps')

    def source_frame(index):
        position = (left + index / half * (right - left) if index <= half
                    else right + (index - half) / half * (left + period - right))
        return first + (position - first) % period

    # The loop closes on exactly the first pose.
    timeline = [(index, source_frame(index)) for index in range(frames)] + [(frames, source_frame(0))]
    return timeline, (f'native {period / FPS:.3f} s -> {DURATIONS[name]} s; left foot at frame {left:.2f}, '
                      f'right at {right:.2f}; planted foot moves {native_speed * period / FPS / DURATIONS[name]:.2f} '
                      f'm/s against the route\'s {ROUTE_METRES_PER_SECOND} m/s')


def key_take(name, samples, anchor, reference, source_rest, source_hips):
    height = (rig.matrix_world @ root_bone.head_local).z / source_hips.z
    rig.animation_data_create()
    target = bpy.data.actions.new(name)
    if target.name != name:
        raise ValueError(f'{name} would export as {target.name}')
    rig.animation_data.action = target
    previous = {}
    for frame, (rotations, hips, _) in samples:
        world = {bone.name: rotations[short(bone.name)] @ source_rest[short(bone.name)].inverted() @ reference[bone.name]
                 for bone in ordered}
        for bone in ordered:
            pose_bone = rig.pose.bones[bone.name]
            parent = bone.parent
            inherited = (world[parent.name] @ target_rest[parent.name].inverted() @ target_rest[bone.name]
                         if parent else target_rest[bone.name])
            basis = inherited.inverted() @ world[bone.name]
            if bone.name in previous:
                basis.make_compatible(previous[bone.name])
            previous[bone.name] = basis
            pose_bone.rotation_mode = 'QUATERNION'
            pose_bone.rotation_quaternion = basis
            pose_bone.keyframe_insert('rotation_quaternion', frame=frame, group=bone.name)
            if not parent:
                offset = (hips - Vector((anchor.x, anchor.y, source_hips.z))) * height
                pose_bone.location = target_rest[bone.name].inverted() @ offset
                pose_bone.keyframe_insert('location', frame=frame, group=bone.name)
    # Unassigned, so sampling the next take does not re-evaluate the skinned meshes.
    rig.animation_data.action = None
    return target


def bake_take(path, names):
    source = import_take(path)
    reference, source_rest, rest_gap, source_hips = calibrate(source)
    action = source.animation_data.action
    first, last = (int(round(value)) for value in action.frame_range)
    cyclic = [name for name in names if name in CYCLES]
    if cyclic and len(cyclic) != len(names):
        raise ValueError(f'{path.name}: a walk loop cannot share a take with {names}')
    if cyclic:
        timeline, note = cycle_timeline(names[0], source, first, last)
    elif (last - first) / FPS < 0.5:
        timeline, note = [(0, first), (round(HELD_POSE_SECONDS * FPS), first)], f'single pose held {HELD_POSE_SECONDS} s'
    else:
        timeline, note = [(index, first + index) for index in range(last - first + 1)], f'{(last - first) / FPS:.2f} s'
    samples = [(frame, sample(source, position)) for frame, position in timeline]
    if cyclic:
        hips = [sampled[1] for _, sampled in samples[:-1]]
        anchor = sum(hips, Vector()) / len(hips)
    else:
        feet = lambda sampled: (sampled[2][0] + sampled[2][1]) / 2
        anchor = feet(samples[0][1])
        travel = (feet(samples[-1][1]) - anchor).to_2d().length
        if travel > TRAVEL_METRES:
            start = samples[0][1][1]
            samples = [(frame, (rotations, Vector((start.x, start.y, hips.z)), feet_now))
                       for frame, (rotations, hips, feet_now) in samples]
            note += f'; travelled {travel:.2f} m, held in place'
    baked = [key_take(name, samples, anchor, reference, source_rest, source_hips) for name in names]
    print('MIXAMO_TAKE', path.stem, '->', ', '.join(names), '|', note,
          f'| rest poses differ by {rest_gap.get("LeftArm", 0):.1f} deg at the upper arms', flush=True)
    source_data = source.data
    bpy.data.objects.remove(source, do_unlink=True)
    bpy.data.armatures.remove(source_data)
    bpy.data.actions.remove(action)
    return baked


jobs = {}
for path in sorted(takes.glob('*.fbx')):
    names = (path.stem,) if path.stem in DURATIONS else TAKES.get(path.stem)
    if not names:
        print('MIXAMO_SKIPPED', path.name, '- neither a runtime clip nor a listed Mixamo take', flush=True)
        continue
    for name in names:
        if name not in DURATIONS:
            raise ValueError(f'{name} is not a manifest clip')
        if name in jobs:
            raise ValueError(f'{name} is supplied by both {jobs[name].name} and {path.name}')
        jobs[name] = path
baked = []
for path in sorted(set(jobs.values())):
    baked += bake_take(path, tuple(name for name, source in jobs.items() if source == path))
if not baked:
    raise ValueError(f'no takes in {takes}')

for pose_bone in rig.pose.bones:
    pose_bone.matrix_basis.identity()
SOURCE.mkdir(parents=True, exist_ok=True)
OUTPUT.mkdir(parents=True, exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / (output_name + '.blend')), compress=True)
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUTPUT / (output_name + '-animations.glb')), export_format='GLB',
    use_selection=True, export_animations=True, export_animation_mode='ACTIONS', export_frame_range=False,
    export_force_sampling=True, export_skins=True, export_morph=False, export_yup=True)
print('MIXAMO_EXPORTED', output_name, sorted(action.name for action in baked), flush=True)
if EXPORT_MODEL:
    # Same mesh settings as build_models.py, in the rest pose, from the rig these takes were baked on.
    for obj in rig.children_recursive:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT / (output_name + '.glb')), export_format='GLB',
        use_selection=True, export_animations=False, export_morph=True, export_morph_normal=False,
        export_image_format='JPEG', export_jpeg_quality=82, export_texcoords=True, export_normals=True,
        export_skins=True, export_yup=True)
    print('MIXAMO_MODEL_EXPORTED', output_name, flush=True)
