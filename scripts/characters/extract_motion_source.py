"""Extract a compact, browser-project-owned retargeting take from a CC0 source.

Run inside a Mesh2Motion animation .blend. The output records global pose
rotation deltas for the deform skeleton at 30 Hz; control bones, meshes and
editor data are deliberately excluded.
"""
import json
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
MAPPING = {
    'pelvis':'Hips','spine_01':'Spine','spine_02':'Spine1','spine_03':'Spine2',
    'neck_01':'Neck','head':'Head',
    'clavicle_l':'LeftShoulder','upperarm_l':'LeftArm','lowerarm_l':'LeftForeArm','hand_l':'LeftHand',
    'clavicle_r':'RightShoulder','upperarm_r':'RightArm','lowerarm_r':'RightForeArm','hand_r':'RightHand',
    'thigh_l':'LeftUpLeg','calf_l':'LeftLeg','foot_l':'LeftFoot','ball_l':'LeftToeBase',
    'thigh_r':'RightUpLeg','calf_r':'RightLeg','foot_r':'RightFoot','ball_r':'RightToeBase',
}

args = sys.argv[sys.argv.index('--')+1:]
clip, source_id = args[0], args[1]
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE' and o.animation_data and o.animation_data.action)
action = rig.animation_data.action
fps = bpy.context.scene.render.fps / bpy.context.scene.render.fps_base
start, end = action.frame_range
duration = (end-start)/fps
rest_bones={target:{'head':list(rig.data.bones[source].head_local),
                    'tail':list(rig.data.bones[source].tail_local)}
            for source,target in MAPPING.items()}
frames=[]
for sample in range(round(duration*30)+1):
    frame=start+(end-start)*sample/round(duration*30)
    bpy.context.scene.frame_set(int(frame), subframe=frame-int(frame))
    bones={}
    for source,target in MAPPING.items():
        pose=rig.pose.bones[source]
        rest=rig.data.bones[source]
        delta=pose.matrix.to_quaternion() @ rest.matrix_local.to_quaternion().inverted()
        bones[target]=[round(v,7) for v in delta]
    hips=rig.pose.bones['pelvis'].head-rig.data.bones['pelvis'].head_local
    frames.append({'hips':[round(v,7) for v in hips], 'bones':bones})
output=ROOT/'scripts'/'characters'/'motions'/(clip+'.json')
output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(json.dumps({
    'clip':clip,'sourceTake':action.name,'sourceFile':Path(bpy.data.filepath).name,
    'sourceRevision':source_id,'provider':'Mesh2Motion','license':'CC0-1.0',
    'sourceFps':fps,'requestedSampleFps':30,'sampleFps':(len(frames)-1)/duration,
    'duration':duration,'restBones':rest_bones,'frames':frames,
},separators=(',',':')))
print('MOTION_EXTRACTED',clip,action.name,round(duration,3),len(frames))
