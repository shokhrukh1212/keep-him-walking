"""Retarget compact CC0 body takes onto the project Mixamo skeleton.

The source files store armature-space rotation deltas. Applying those deltas to
the target rest axes avoids copying source bone lengths, scale, or control-rig
constraints into the browser asset.
"""
import json
from pathlib import Path
import bpy

from mathutils import Matrix, Quaternion, Vector


class MotionLibrary:
    def __init__(self, root: Path, rig, rest):
        self.rig = rig
        self.rest = rest
        self.takes = {}
        for path in (root / 'scripts' / 'characters' / 'motions').glob('*.json'):
            self.takes[path.stem] = json.loads(path.read_text())

    def has(self, name):
        return name in self.takes

    def apply(self, name, seconds, output_duration):
        take = self.takes[name]
        frames = take['frames']
        if 'restBones' not in take:
            raise ValueError('Re-extract source take with rest-pose calibration: '+name)
        # Only the complete two-step walk is retimed to the requested cadence.
        # Keep the authored timing of gestures and loop quiet idle takes.
        source_seconds=seconds % take['duration'] if name in ('idle','listen') else seconds
        fraction=seconds/output_duration if name=='walk' else source_seconds/take['duration']
        source_position = max(0, min(1, fraction)) * (len(frames) - 1)
        index = min(len(frames) - 2, int(source_position))
        amount = source_position - index
        first, second = frames[index], frames[index + 1]

        # Parent-first order is required because assigning an armature-space
        # matrix changes each child's evaluated head position.
        ordered = sorted(first['bones'], key=lambda bone: len(self.rig.data.bones['mixamorig:' + bone].parent_recursive))
        for name in ordered:
            target_name = 'mixamorig:' + name
            if target_name not in self.rig.pose.bones:
                continue
            q1, q2 = Quaternion(first['bones'][name]), Quaternion(second['bones'][name])
            delta = q1.slerp(q2, amount)
            pose = self.rig.pose.bones[target_name]
            source=take['restBones'][name]
            source_axis=(Vector(source['tail'])-Vector(source['head'])).normalized()
            target_axis=(self.rest[name][1]-self.rest[name][0]).normalized()
            # Mesh2Motion rests in a T pose; MPFB Mixamo rests in an A pose.
            # Delta-only copying rotated the already lowered target arms a
            # second time, folding them through the torso. Align rest axes
            # before applying the source's armature-space delta.
            limb=name.endswith(('Arm','ForeArm','Hand','UpLeg','Leg','Foot','ToeBase'))
            calibration=target_axis.rotation_difference(source_axis) if limb else Quaternion()
            rotation = delta @ calibration @ self.rest[name][2].to_quaternion()
            pose.matrix = Matrix.Translation(pose.head.copy()) @ rotation.to_matrix().to_4x4()
            bpy.context.view_layer.update()

        # Preserve vertical weight transfer while keeping every browser clip
        # in place. Horizontal travel remains owned by the shared scene clock.
        root = self.rig.pose.bones.get('mixamorig:Hips')
        if root:
            origin = Vector(frames[0]['hips'])
            translation = Vector(first['hips']).lerp(Vector(second['hips']), amount) - origin
            matrix=root.matrix.copy()
            matrix.translation.z+=translation.z
            root.matrix=matrix
            bpy.context.view_layer.update()
