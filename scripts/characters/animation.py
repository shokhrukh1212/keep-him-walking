"""Baked, editable skeletal clips. Coordinates are metres in Blender (Z up).

Two-bone analytical IK keeps segment lengths constant. Contact positions are
sampled at 30 Hz; these are authored motions, not motion-capture recordings.
"""
import math
from mathutils import Vector, Matrix, Quaternion, Euler

DURATIONS={'idle':4,'walk':1.2,'greet':3,'talk':4,'listen':4,'react':3,'goodbye':3,
           'drink':5.5,'phone':4.5,'photo':4,'rest':5}

def ease(t):
    t=max(0,min(1,t)); return t*t*(3-2*t)

def envelope(t,d):
    return ease(t/.85)*ease((d-t)/.85)

class Animator:
    def __init__(self,bpy,rig):
        self.bpy=bpy; self.rig=rig
        self.rest={b.name.split(':')[-1]:(b.head_local.copy(),b.tail_local.copy(),b.matrix_local.copy()) for b in rig.data.bones}
        self.unit=self.rest['Head'][1].z/1.441681
    def bone(self,name): return self.rig.pose.bones['mixamorig:'+name]
    def aim(self,name,start,end):
        a,b,m=self.rest[name]
        swing=(b-a).normalized().rotation_difference((Vector(end)-Vector(start)).normalized())
        self.bone(name).matrix=Matrix.Translation(Vector(start)) @ swing.to_matrix().to_4x4() @ m.to_quaternion().to_matrix().to_4x4()
        self.bpy.context.view_layer.update()
    def chain(self,upper,lower,goal,pole):
        start=self.bone(upper).head.copy(); goal=Vector(goal)
        l1=(self.rest[upper][1]-self.rest[upper][0]).length
        l2=(self.rest[lower][1]-self.rest[lower][0]).length
        delta=goal-start; distance=min(delta.length,l1+l2-.0005)
        direction=delta.normalized()
        bend=Vector(pole)-start; bend=(bend-direction*bend.dot(direction)).normalized()
        along=(l1*l1-l2*l2+distance*distance)/(2*distance)
        joint=start+direction*along+bend*math.sqrt(max(0,l1*l1-along*along))
        end=start+direction*distance
        self.aim(upper,start,joint);self.aim(lower,joint,end)
        return end
    def pose(self,action,t):
        for bone in self.rig.pose.bones:
            bone.rotation_mode='QUATERNION'
            bone.matrix_basis=Matrix.Identity(4)
        d=DURATIONS[action]; env=envelope(t,d)
        walk=action=='walk'; phase=t/1.2*2*math.pi
        sit=env if action=='rest' else 0
        feet={}
        support_heights=[]
        for side,sign,offset in [('Left',1,0),('Right',-1,.5)]:
            p=(t/1.2+offset)%1
            fy=0; lift=0
            if walk:
                if p<.6: fy=-.18+.36*(p/.6)
                else:
                    swing=(p-.6)/.4
                    fy=.18-.36*ease(swing);lift=.072*math.sin(math.pi*swing)
            fy-=sit*.25
            ankle=self.rest[side+'Foot'][0].z
            goal=Vector((sign*.095*self.unit,fy*self.unit,ankle+lift*self.unit))
            feet[side]=goal
            hip=self.rest[side+'UpLeg'][0]
            length=sum((self.rest[n][1]-self.rest[n][0]).length for n in [side+'UpLeg',side+'Leg'])-.006*self.unit
            if not walk or p<.6:
                horizontal=(goal.x-hip.x)**2+(goal.y-hip.y)**2
                support_heights.append(ankle+math.sqrt(max(0,length*length-horizontal))-hip.z)
        height=min(support_heights) if support_heights else 0
        height=height*(1-sit)-.35*self.unit*sit
        pelvis=self.bone('Hips')
        pelvis.matrix=Matrix.Translation((0,0,height))@self.rest['Hips'][2]
        self.bpy.context.view_layer.update()
        for side,sign,offset in [('Left',1,0),('Right',-1,.5)]:
            pitch=0
            end=self.chain(side+'UpLeg',side+'Leg',feet[side],Vector((sign*.11,-1,.4))*self.unit)
            footdir=Vector((0,-.12,-.032+pitch*.12))
            self.aim(side+'Foot',end,end+footdir)
            # Resting fingers have a small curl instead of a rigid open fan.
            for finger in ['Index','Middle','Ring','Pinky']:
                for index in [1,2,3]:
                    b=self.bone(side+'Hand'+finger+str(index))
                    holding=action in ['phone','photo'] or (action=='drink' and side=='Right')
                    grip=.16+(.60*env if holding else 0)
                    across=(self.rest[side+'HandPinky1'][0]-self.rest[side+'HandIndex1'][0]).normalized()
                    local_axis=self.rest[side+'Hand'+finger+str(index)][2].to_quaternion().inverted()@across
                    b.rotation_quaternion=Quaternion(local_axis,grip*sign)
            y=-.035+(.12*math.sin(phase+offset*2*math.pi) if walk else 0)
            wrist=Vector((sign*.195,y,.713))*self.unit
            if sit: wrist=wrist.lerp(Vector((sign*.16,-.30,.53))*self.unit,sit)
            gesture=env
            if action in ['greet','goodbye'] and side=='Right':
                wrist=wrist.lerp(Vector((-.27-.035*math.sin(t*8),-.16,1.32))*self.unit,gesture)
            if action in ['talk','react']:
                wrist=wrist.lerp(Vector((sign*(.23+.03*math.sin(t*3+offset)),-.24,.94+.025*math.sin(t*4+offset)))*self.unit,gesture*(1 if side=='Right' else .6))
            if action=='drink' and side=='Right':
                wrist=wrist.lerp(Vector((-.10,-.25,1.17))*self.unit,gesture)
            if action in ['phone','photo']:
                wrist=wrist.lerp(Vector((sign*(.055 if action=='photo' else .032),-.31,1.15 if action=='photo' else 1.02))*self.unit,gesture)
            end=self.chain(side+'Arm',side+'ForeArm',wrist,Vector((sign*.5,.04,.9))*self.unit)
            direction=Vector((0,-.028,-.065))
            if action in ['greet','goodbye'] and side=='Right': direction=direction.lerp(Vector((0,0,.07)),gesture)
            if action in ['photo','phone'] or (action=='drink' and side=='Right'): direction=direction.lerp(Vector((0,-.025,.06)),gesture)
            self.aim(side+'Hand',end,end+direction)
        # Small head motion, with readable attention toward held objects.
        head=self.bone('Head')
        nod=.12*env if action=='phone' else -.05*env if action=='drink' else .015*math.sin(t*2.5)
        turn=.025*math.sin(t*1.7) if action in ['talk','listen','react'] else 0
        head.rotation_quaternion=Euler((nod,turn,0)).to_quaternion()
        self.bpy.context.view_layer.update()
    def bake(self):
        self.rig.animation_data_create()
        for name,duration in DURATIONS.items():
            action=self.bpy.data.actions.new(name);action.use_fake_user=True
            self.rig.animation_data.action=action
            for frame in range(round(duration*30)+1):
                self.pose(name,frame/30)
                for b in self.rig.pose.bones:
                    # Convert the authored matrix into local animation channels.
                    position,rotation,scale=b.matrix_basis.decompose()
                    b.rotation_mode='QUATERNION'
                    b.location=position;b.rotation_quaternion=rotation;b.scale=scale
                    b.keyframe_insert('location',frame=frame)
                    b.keyframe_insert('rotation_quaternion',frame=frame)
            self.rig.animation_data.action=None
        self.pose('idle',0)
