"""Action-specific arm planes, palm orientation and articulated grips.

Authored in the character's bind coordinate system, before GLB export. Parent
motion is evaluated before IK; finger flexion follows each palm's own axes.
"""
import math
from mathutils import Vector, Matrix, Quaternion, Euler

def smooth(t):
    t=max(0,min(1,t));return t*t*(3-2*t)

def frame(direction,palm):
    y=Vector(direction).normalized()
    x=y.cross(Vector(palm)).normalized()
    return Matrix((x,y,x.cross(y))).transposed()

def orient_hand(a,side,wrist,direction,palm):
    name=side+'Hand';sign=1 if side=='Left' else -1
    forward=a.rest[side+'HandMiddle1'][0]-a.rest[name][0]
    across=(a.rest[side+'HandPinky1'][0]-a.rest[side+'HandIndex1'][0])*sign
    rest_frame=frame(forward,across.cross(forward))
    rotation=frame(direction,palm)@rest_frame.transposed()
    a.bone(name).matrix=Matrix.Translation(wrist)@rotation.to_4x4()@a.rest[name][2].to_quaternion().to_matrix().to_4x4()
    a.bpy.context.view_layer.update()
    return rotation

def fingers(a,side,kind,weight):
    sign=1 if side=='Left' else -1
    across=(a.rest[side+'HandPinky1'][0]-a.rest[side+'HandIndex1'][0]).normalized()*sign
    # Flexion increases towards the little finger, as in a relaxed human hand.
    for f,extra in [('Index',0),('Middle',.025),('Ring',.05),('Pinky',.08)]:
        relaxed=(.10+extra,.20+extra,.10)
        target={'wave':(.015,.045,.025),'gesture':(.06+extra,.12+extra,.08),
                'device':(.12,.55,.32),'bottle':(.55,.95,.55)}.get(kind,relaxed)
        for i in (1,2,3):
            name=side+'Hand'+f+str(i)
            axis=a.rest[name][2].to_quaternion().inverted()@across
            a.bone(name).rotation_quaternion=Quaternion(axis,relaxed[i-1]*(1-weight)+target[i-1]*weight)
    # The thumb opposes a grip, instead of staying fully spread in the bind pose.
    for i,angle in [(1,.22),(2,.30),(3,.18)]:
        name=side+'HandThumb'+str(i)
        axis=a.rest[name][2].to_quaternion().inverted()@across
        a.bone(name).rotation_quaternion=Quaternion(axis,angle*weight if kind in ('device','bottle') else .06)
    a.bpy.context.view_layer.update()

def pose_interaction(a,action,t):
    # Keep the approved standing floor placement. No change to walk/idle clips.
    a.pose('idle',0)
    u=a.unit;d=a.durations[action]
    env=smooth(t/.95)*smooth((d-t)/.9)
    if action=='drink':env=smooth((t-.35)/1.25)*smooth((d-.35-t)/1.15)
    if action in ('phone','photo'):env=smooth((t-.25)/.95)*smooth((d-.25-t)/.85)
    # Both clavicles retain their rest height. A raised arm rotates beneath its
    # shoulder; neither shoulder is translated to chase a wrist target.
    for name in ('Spine','Spine1','Spine2','LeftShoulder','RightShoulder'):
        a.bone(name).rotation_quaternion=Quaternion()
    a.bpy.context.view_layer.update()
    for side,sign in [('Left',1),('Right',-1)]:
        wrist=Vector((sign*.195,-.035,.713))*u
        direction=Vector((0,-.08,-1));palm=Vector((-sign,0,0))
        pole=Vector((sign*.31,.015,.86))*u
        kind='relaxed';strength=env
        if action in ('greet','goodbye') and side=='Right':
            # Low elbow, upright forearm: the upper arm need not form the
            # rigid horizontal shelf seen in the rejected high-elbow wave.
            wrist=wrist.lerp(Vector((-.32-.018*math.sin(t*6)*env,-.12,1.255))*u,env)
            wrist.y-=.14*u*math.sin(math.pi*env)
            pole=Vector((-.38,-.14,.70))*u
            direction=Vector((-.04*math.sin(t*6)*env,-math.sin(math.pi*env),-math.cos(math.pi*env)))
            palm=palm.lerp(Vector((0,-1,0)),env);kind='wave'
        elif action in ('talk','react'):
            beat=smooth(math.sin(math.pi*min(1,max(0,(t-.65)/2.3))))
            strength=env*(.9 if side=='Right' else .24)*beat
            wrist=wrist.lerp(Vector((sign*.20,-.22,.88 if action=='talk' else .94))*u,strength)
            direction=direction.lerp(Vector((sign*.12,-1,.14)),strength)
            palm=palm.lerp(Vector((-sign*.35,-.1,1)),strength);kind='gesture'
        elif action in ('phone','photo'):
            # Palms face toward the device centre; fingers wrap around the
            # outside edges to its back. Thumbs remain on the screen side.
            span=.077 if action=='photo' else .047
            height=1.19 if action=='photo' else 1.035
            wrist=wrist.lerp(Vector((sign*span,-.255,height-.075))*u,env)
            angle=(math.pi-.08)*env
            direction=Vector((0,-math.sin(angle),-math.cos(angle)))
            palm=palm.lerp(Vector((-sign,.35,0)),env);kind='device'
            pole=Vector((sign*.25,-.09,.86))*u
        elif action=='drink' and side=='Right':
            sip=smooth((t-1.65)/.55)*smooth((3.85-t)/.6)
            axis=Vector((0,.55*sip,1-.16*sip)).normalized()
            mouth=a.rest['Head'][0]+Vector((-.012,-.075,.032))*u
            centre=mouth-axis*.109*u
            target_dir=axis
            target_palm=Vector((1,0,0))
            # Place the body of the bottle inside the curled fingers, not at
            # the fingertips. The same local contact is used by CharacterActor.
            f=a.rest['RightHandMiddle1'][0]-a.rest['RightHand'][0]
            across=(a.rest['RightHandPinky1'][0]-a.rest['RightHandIndex1'][0])*-1
            rot=frame(target_dir,target_palm)@frame(f,across.cross(f)).transposed()
            target=centre-rot@f-Vector((.025,0,0))*u
            wrist=wrist.lerp(target,env)
            angle=(math.pi+math.atan2(axis.y,axis.z))*env
            direction=Vector((0,-math.sin(angle),-math.cos(angle)));palm=palm.lerp(target_palm,env)
            # Raise the elbow only as the bottle approaches the mouth. Applying
            # the sip pole to the entire lift made the elbow lead at waist height.
            pole=pole.lerp(Vector((-.20,-.70,1.15))*u,env**3);kind='bottle'
        end=a.chain(side+'Arm',side+'ForeArm',wrist,pole)
        orient_hand(a,side,end,direction,palm)
        fingers(a,side,kind,strength)
    a.bone('Head').rotation_quaternion=Euler((.16*env if action=='phone' else 0,
        .012*math.sin(t*1.4)*env if action in ('talk','react') else 0,0)).to_quaternion()
    a.bpy.context.view_layer.update()
