"""Identity-specific edits to licensed garment meshes. All surfaces stay skinned."""
import math
from mathutils import Vector

def tailor(bpy,rig,body,shirt,inner,pants,shoes,female,material):
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
    remove=[]
    for face in mesh.faces:
        c=face.calc_center_median()/unit
        if c.y<-.07 and c.z<1.14 and abs(c.x)<(.032 if c.z>1.02 else .052): remove.append(face)
    bmesh.ops.delete(mesh,geom=remove,context='FACES')
    for sign,side in [(1,'Left'),(-1,'Right')]:
        elbow=rig.data.bones['mixamorig:'+side+'ForeArm'].head_local
        wrist=rig.data.bones['mixamorig:'+side+'ForeArm'].tail_local
        axis=(wrist-elbow).normalized();cut=elbow+(wrist-elbow)*.30
        verts=[v for v in mesh.verts if v.co.x*sign>.245*unit and (v.co-cut).dot(axis)>0]
        bmesh.ops.delete(mesh,geom=verts,context='VERTS')
    mesh.to_mesh(shirt.data);mesh.free()
    bpy.context.view_layer.objects.active=shirt
    solid=shirt.modifiers.new('Cotton lining','SOLIDIFY');solid.thickness=.0025
    bpy.ops.object.modifier_apply(modifier=solid.name)
    # The stock under-shirt has long contrasting sleeves. Trim those beneath
    # the rolled outer sleeves while retaining its clean collar and torso.
    mesh=bmesh.new();mesh.from_mesh(inner.data);mesh.normal_update()
    bmesh.ops.bisect_plane(mesh,geom=list(mesh.verts)+list(mesh.edges)+list(mesh.faces),
        dist=.0001,plane_co=(0,0,.84*unit),plane_no=(0,0,1),clear_inner=True,clear_outer=False)
    # Only the torso panel is needed beneath the overshirt. Removing the
    # concealed sleeves eliminates coplanar cloth intersections at shoulders.
    bmesh.ops.delete(mesh,geom=[v for v in mesh.verts if abs(v.co.x)>.145*unit],context='VERTS')
    mesh.normal_update()
    for v in mesh.verts: v.co-=v.normal*.006*unit
    mesh.to_mesh(inner.data);mesh.free()
    # Preserve a small physical gap between the three deforming surfaces.
    # The clearance is below a real garment's thickness but prevents skin or
    # the inner shirt from surfacing through the outer layers at joints.
    for obj,amount in [(shirt,.011),(pants,.009)]:
        mesh=bmesh.new();mesh.from_mesh(obj.data);mesh.normal_update()
        for v in mesh.verts: v.co+=v.normal*amount*unit
        mesh.to_mesh(obj.data);mesh.free()
    # Form a turned-up hem from the actual trouser surface.
    if not female:
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

def style_hair(hair):
    # Preserve the authored flowing quiff and strand textures; introduce small,
    # nonuniform waves rather than replacing hair with geometric clumps.
    for v in hair.data.vertices:
        x,y,z=v.co
        weight=max(0,min(1,(z-1.34)/.1))
        v.co.x+=.006*math.sin(y*95+z*28)*weight
        v.co.z+=.004*math.sin(x*110+y*31)*weight
