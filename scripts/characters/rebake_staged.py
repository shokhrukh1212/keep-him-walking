"""Rebake motion in an existing staged character without rebuilding geometry.

blender .cache/character-authoring/staged/v2/traveler.blend --background
  --python scripts/characters/rebake_staged.py -- --experimental-sources
"""
import sys
from pathlib import Path
import bpy

ROOT=Path(__file__).resolve().parents[2]
STAGED=ROOT/'.cache/character-authoring/staged/v2'
if Path(bpy.data.filepath).parent!=STAGED:
    raise ValueError('Rebaking is restricted to staged files')
sys.path.insert(0,str(Path(__file__).resolve().parent))
from animation import Animator

rig=bpy.data.objects['traveler']
rig.animation_data_clear()
for action in list(bpy.data.actions):
    bpy.data.actions.remove(action)
animator=Animator(bpy,rig,'v2',experimental_sources='--experimental-sources' in sys.argv)
# Confirm that repeating a pose after an unrelated sample cannot accumulate
# translation from the previous sample into the baked clip.
for clip in ['idle','walk','greet','listen']:
    animator.pose(clip,.3)
    first={b.name:b.matrix.copy() for b in rig.pose.bones}
    animator.pose('rest',2)
    animator.pose(clip,.3)
    error=max(abs(b.matrix[i][j]-first[b.name][i][j]) for b in rig.pose.bones for i in range(4) for j in range(4))
    if error>1e-5:raise ValueError(f'Non-deterministic {clip} pose: {error}')
    print('POSE_REPEAT_CHECK',clip,error)
animator.bake()
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
for obj in rig.children_recursive:obj.select_set(True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(STAGED/'traveler.blend'),compress=True)
bpy.ops.export_scene.gltf(filepath=str(STAGED/'traveler.glb'),export_format='GLB',
    use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_frame_range=False,
    export_morph=True,export_morph_normal=False,export_image_format='JPEG',export_jpeg_quality=82,
    export_texcoords=True,export_normals=True,export_skins=True,export_yup=True)
