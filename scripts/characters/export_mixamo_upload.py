"""Export the copy of a character that the owner uploads to Mixamo, then check it.

Run on the character's editable source, from the project root:

  .cache/character-authoring/tools/blender-4.5.4-linux-x64/blender --background \
    --factory-startup art/characters/v2/almaty-host.blend \
    --python scripts/characters/export_mixamo_upload.py -- almaty-host \
    .cache/character-authoring/mixamo/upload/resident-a-for-mixamo.fbx

The file keeps the full outfit and the same 52-bone A-pose rig, with no actions and
no shape keys, so Mixamo shows the real character and returns takes for exactly this
skeleton. Leaf bones are written by default: that is the upload the traveler's takes
came back from, and `import_mixamo.py` reads their `_end` bones for limb lengths.
Pass `--no-leaf-bones` only for the fallback copy Mixamo accepts when it cannot map
the default. The loaded .blend is never saved back. The upload stays in the ignored
cache; it is a working file, not a product asset.
"""
import math
import sys
from pathlib import Path

import bpy

arguments = sys.argv[sys.argv.index('--') + 1:]
role, output = arguments[0], Path(arguments[1])
leaf_bones = '--no-leaf-bones' not in arguments
rig = bpy.data.objects[role]

# Teeth confuse Mixamo's mesh preview and carry nothing it needs.
for obj in list(rig.children_recursive):
    if obj.type == 'MESH' and 'teeth' in obj.name:
        bpy.data.objects.remove(obj, do_unlink=True)
if rig.animation_data:
    rig.animation_data.action = None
for obj in rig.children_recursive:
    if obj.type == 'MESH' and obj.data.shape_keys:
        obj.shape_key_clear()
# The rest pose, not whatever frame the file was saved on.
for pose_bone in rig.pose.bones:
    pose_bone.matrix_basis.identity()

bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
for obj in rig.children_recursive:
    obj.select_set(True)
bpy.context.view_layer.objects.active = rig
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.fbx(filepath=str(output), use_selection=True, object_types={'ARMATURE', 'MESH'},
    add_leaf_bones=leaf_bones, bake_anim=False, use_armature_deform_only=False,
    path_mode='COPY', embed_textures=True, mesh_smooth_type='FACE', apply_unit_scale=True)
print('MIXAMO_UPLOAD_EXPORTED', output, output.stat().st_size, flush=True)

# Read the file back into an empty scene, the way Mixamo will see it.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(output), automatic_bone_orientation=True, ignore_leaf_bones=False)
armatures = [obj for obj in bpy.data.objects if obj.type == 'ARMATURE']
meshes = [obj for obj in bpy.data.objects if obj.type == 'MESH']
if len(armatures) != 1:
    raise ValueError(f'{output.name}: expected one armature, found {len(armatures)}')
armature = armatures[0]
bones = armature.data.bones
deform = [bone for bone in bones if not bone.name.endswith('_end')]
if len(deform) != 52 or not all(bone.name.startswith('mixamorig:') for bone in bones):
    raise ValueError(f'{output.name}: expected 52 mixamorig bones, found {len(deform)}')
if bpy.data.actions:
    raise ValueError(f'{output.name}: carries {len(bpy.data.actions)} actions')
world = lambda bone: (armature.matrix_world @ bone.head_local, armature.matrix_world @ bone.tail_local)
head, tail = world(bones['mixamorig:LeftArm'])
arm_angle = math.degrees(math.asin(-(tail - head).normalized().z))
hips = world(bones['mixamorig:Hips'])[0].z
head_top = world(bones['mixamorig:Head'])[1].z
print('MIXAMO_UPLOAD_CHECKED', output.name, f'bones {len(bones)} ({len(bones) - len(deform)} leaf)',
      f'meshes {len(meshes)}', f'upper arm {arm_angle:.1f} deg below level',
      f'hips {hips:.3f} m', f'head bone top {head_top:.3f} m', flush=True)
