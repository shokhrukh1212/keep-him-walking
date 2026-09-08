"""Rebake only the requested interaction clips; preserve existing geometry/gait."""
import sys
from pathlib import Path
import bpy
from mathutils import Vector, Quaternion
import math
sys.path.insert(0,str(Path(__file__).resolve().parent))
from animation import Animator
root=Path(__file__).resolve().parents[2]
role='almaty-host' if '--resident' in sys.argv else 'traveler'
output=root/'.cache/character-authoring/action-review/v2'
output.mkdir(parents=True,exist_ok=True)
rig=bpy.data.objects[role]
names=('greet','talk','react','goodbye') if role=='almaty-host' else ('greet','talk','react','goodbye','drink','phone','photo')
if '--clip' in sys.argv:
    requested=sys.argv[sys.argv.index('--clip')+1]
    if requested not in names:raise ValueError('Only interaction clips may be rebaked')
    names=(requested,)
rig.animation_data_clear()
for action in list(bpy.data.actions):
    if action.name in names:bpy.data.actions.remove(action)
a=Animator(bpy,rig,'v2')
rig['interactionUnit']=a.unit
for name in names:
    a.pose(name,1.5);first={b.name:b.matrix.copy() for b in rig.pose.bones}
    a.pose('rest',2);a.pose(name,1.5)
    error=max(abs(b.matrix[i][j]-first[b.name][i][j]) for b in rig.pose.bones for i in range(4) for j in range(4))
    if error>1e-5:raise ValueError(f'Pose accumulated transforms: {name} {error}')
    print('POSE_REPEAT_CHECK',name,error,flush=True)
a.bake(names)
if role=='traveler':
    # Export the rigid local grips from the same authored poses. Runtime props
    # then follow the carrying hand during entry/recovery, not a midpoint that
    # floats between hands before the second hand reaches the object.
    for clip in ('phone','photo','drink'):
        a.pose(clip,1.6 if clip=='drink' else 2)
        hand=a.bone('RightHand').matrix
        centre=a.bone('RightHandMiddle1').head.copy()
        if clip=='drink':centre+=Vector((.025*a.unit,0,0))
        else:centre=centre.lerp(a.bone('LeftHandMiddle1').head,.5)+Vector((0,-.015,0))
        orientation=Quaternion((1,0,0),math.pi/2)
        if clip!='drink':orientation=orientation@Quaternion((0,1,0),math.pi)@Quaternion((0,0,1),math.pi/2 if clip=='photo' else 0)
        rig[clip+'GripPosition']=list(hand.inverted()@centre)
        q=hand.to_quaternion().inverted()@orientation
        rig[clip+'GripRotation']=[q.x,q.y,q.z,q.w]
a.pose('idle',0)
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
for obj in rig.children_recursive:obj.select_set(True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(output/(role+'.blend')),compress=True)
bpy.ops.export_scene.gltf(filepath=str(output/(role+'.glb')),export_format='GLB',
    use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_frame_range=False,
    export_morph=True,export_morph_normal=False,export_image_format='JPEG',export_jpeg_quality=82,
    export_texcoords=True,export_normals=True,export_skins=True,export_yup=True,export_extras=True)
