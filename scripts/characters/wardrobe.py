"""Identity-specific edits to licensed garment meshes. All surfaces stay skinned."""
import math
from mathutils import Vector

def tailor(bpy,rig,body,shirt,inner,pants,shoes,traveler,material,version='v1'):
    # Every v2 character gets the garment repairs: no loose buttons, one continuous
    # opening and a close fit. `traveler` adds his identity tailoring: a softened
    # overshirt and turned-up cuffs.
    import bmesh
    unit=rig.data.bones["mixamorig:Head"].tail_local.z/1.441681
    # Retain skin underneath rolled sleeves and shortened trouser hems.
    for mod in body.modifiers:
        if mod.type!='MASK': continue
        group=body.vertex_groups.get(mod.vertex_group)
        if group is None: continue
        if 'shirt' in mod.name.lower():
            group.remove([v.index for v in body.data.vertices if (abs(v.co.x)>.24*unit and v.co.z<1.02*unit) or (v.co.z>1.12*unit and abs(v.co.x)<.08*unit)])
        if 'pants' in mod.name.lower():
            group.remove([v.index for v in body.data.vertices if v.co.z<.15*unit])
    # Open the outer front panels. A complete, independently skinned T-shirt
    # remains behind them, so the opening never exposes fragmented geometry.
    mesh=bmesh.new();mesh.from_mesh(shirt.data)
    if version=='v2':
        # Remove the stock detached buttons/buttonholes before opening the
        # garment. Keeping fragments of them produced floating collar debris.
        pending=set(mesh.verts);components=[]
        while pending:
            seed=pending.pop();part={seed};stack=[seed]
            while stack:
                for edge in stack.pop().link_edges:
                    for other in edge.verts:
                        if other in pending:
                            pending.remove(other);part.add(other);stack.append(other)
            components.append(part)
        shell=max(components,key=len)
        bmesh.ops.delete(mesh,geom=[v for part in components if part is not shell for v in part],context='VERTS')
        # Cut new edges along the placket rather than removing entire polygons
        # according to their centers (which made the front edge stair-stepped).
        for x in [-.045*unit,.045*unit]:
            bmesh.ops.bisect_plane(mesh,geom=list(mesh.verts)+list(mesh.edges)+list(mesh.faces),
                dist=.000001,plane_co=(x,0,0),plane_no=(1,0,0))
    remove=[]
    for face in mesh.faces:
        c=face.calc_center_median()/unit
        if version=='v2':
            # Open one continuous, narrow placket from hem to neckline. The
            # former split thresholds left a closed chest band that read as a
            # bow and tore apart under shoulder motion.
            if c.y<-.055 and c.z<1.39 and abs(c.x)<.0449:
                remove.append(face)
        elif c.y<-.07 and c.z<1.14 and abs(c.x)<(.032 if c.z>1.02 else .052):
            remove.append(face)
    bmesh.ops.delete(mesh,geom=remove,context='FACES')
    for sign,side in [(1,'Left'),(-1,'Right')]:
        elbow=rig.data.bones['mixamorig:'+side+'ForeArm'].head_local
        wrist=rig.data.bones['mixamorig:'+side+'ForeArm'].tail_local
        axis=(wrist-elbow).normalized();cut=elbow+(wrist-elbow)*.30
        verts=[v for v in mesh.verts if v.co.x*sign>.245*unit and (v.co-cut).dot(axis)>0]
        bmesh.ops.delete(mesh,geom=verts,context='VERTS')
    mesh.to_mesh(shirt.data);mesh.free()
    bpy.context.view_layer.objects.active=shirt
    if version=='v2' and traveler:
        sub=shirt.modifiers.new('Soft cotton surface','SUBSURF');sub.levels=1
        bpy.ops.object.modifier_apply(modifier=sub.name)
    solid=shirt.modifiers.new('Cotton lining','SOLIDIFY');solid.thickness=.0025
    bpy.ops.object.modifier_apply(modifier=solid.name)
    # The stock under-shirt has long contrasting sleeves. Trim those beneath
    # the rolled outer sleeves while retaining its clean collar and torso.
    mesh=bmesh.new();mesh.from_mesh(inner.data);mesh.normal_update()
    bmesh.ops.bisect_plane(mesh,geom=list(mesh.verts)+list(mesh.edges)+list(mesh.faces),
        dist=.0001,plane_co=(0,0,.84*unit),plane_no=(0,0,1),clear_inner=True,clear_outer=False)
    # Only the torso panel is needed beneath the overshirt. Removing the
    # concealed sleeves eliminates coplanar cloth intersections at shoulders.
    # The locals keep only the strip their open jacket shows: under the closer v2
    # fit, their contrasting panel surfaced through the jacket beside the lapels.
    panel=.085 if version=='v2' and not traveler else .145
    bmesh.ops.delete(mesh,geom=[v for v in mesh.verts if abs(v.co.x)>panel*unit],context='VERTS')
    mesh.normal_update()
    for v in mesh.verts: v.co-=v.normal*.006*unit
    mesh.to_mesh(inner.data);mesh.free()
    if version=='v2':
        # The concealed undershirt retained >7k vertices after trimming. Reduce
        # only that inner layer; preserve face, hands and outer deformation mesh.
        bpy.context.view_layer.objects.active=inner
        decimate=inner.modifiers.new('Inner cotton optimization','DECIMATE')
        decimate.ratio=.30
        bpy.ops.object.modifier_apply(modifier=decimate.name)
    # Preserve a small physical gap between the three deforming surfaces.
    # The clearance is below a real garment's thickness but prevents skin or
    # the inner shirt from surfacing through the outer layers at joints.
    # The v1 gap of 11 mm made the v2 locals' jackets read as padded.
    for obj,amount in [(shirt,.007 if version=='v2' else .011),(pants,.009)]:
        mesh=bmesh.new();mesh.from_mesh(obj.data);mesh.normal_update()
        for v in mesh.verts: v.co+=v.normal*amount*unit
        mesh.to_mesh(obj.data);mesh.free()
    # Form a turned-up hem from the actual trouser surface.
    if traveler:
        pants.data.materials.append(material('Turned cotton cuffs',(.64,.51,.36),.90))
        for v in pants.data.vertices:
            if v.co.z<.24*unit:
                v.co.z+=.055*unit*max(0,(.24-v.co.z/unit)/.20)
        pants.data.update()
        for p in pants.data.polygons:
            if p.center.z<.14*unit:p.material_index=1
    # Remove the long sock tops from the stock sneaker mesh.
    mesh=bmesh.new();mesh.from_mesh(shoes.data)
    bmesh.ops.delete(mesh,geom=[v for v in mesh.verts if v.co.z>.103*unit],context='VERTS')
    mesh.to_mesh(shoes.data);mesh.free()

def style_hair(hair,version='v1'):
    # Preserve the authored flowing quiff and strand textures; introduce small,
    # nonuniform waves rather than replacing hair with geometric clumps.
    for v in hair.data.vertices:
        x,y,z=v.co
        weight=max(0,min(1,(z-1.34)/.1))
        v.co.x+=.006*math.sin(y*95+z*28)*weight
        v.co.z+=.004*math.sin(x*110+y*31)*weight
        if version=='v2':
            # Raise and loosen the approved character's left quiff while
            # keeping the authored textured surface and natural hairline.
            side=max(0,min(1,(-x+.02)/.14))
            front=max(0,min(1,(-y-.015)/.11))
            v.co.z+=.018*side*front*weight
            v.co.x-=.006*side*front*weight
