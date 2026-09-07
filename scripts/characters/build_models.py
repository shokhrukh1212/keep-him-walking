"""Build the editable character candidates from licensed human geometry.

The export remains an inspection candidate until the likeness gate is passed.
No generated action pictures or runtime cutout meshes are used.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from authoring import ROOT, CACHE, ASSETS, MPFB_SOURCE, initialize

bpy = initialize()
import bmesh
import math
from mathutils import Vector
from mpfb.services import HumanService, TargetService, ExportService

OUTPUT = ROOT / 'public' / 'characters' / 'v1'
SOURCE = ROOT / 'art' / 'characters' / 'v1'
OUTPUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)


def material(name, color, roughness=0.75, metal=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = (*color, 1)
    node.inputs['Roughness'].default_value = roughness
    node.inputs['Metallic'].default_value = metal
    return mat


def cloth_color(obj, name, color):
    # Keep geometry normals and cloth folds, with an exportable solid dye.
    obj.data.materials.clear()
    obj.data.materials.append(material(name, color, 0.86))


def smooth(obj):
    for p in obj.data.polygons:
        p.use_smooth = True


def weighted(obj, rig, bone):
    group = obj.vertex_groups.new(name='mixamorig:' + bone)
    group.add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
    mod = obj.modifiers.new('Skeleton', 'ARMATURE')
    mod.object = rig
    obj.parent = rig
    # Vertices were authored in world space; remove the rig's rest translation.
    obj.matrix_parent_inverse = rig.matrix_world.inverted()


def rounded_box(name, center, dimensions, radius, mat, rig=None, bone='Spine2'):
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel = obj.modifiers.new('Sewn rounded edges', 'BEVEL')
    bevel.width = radius
    bevel.segments = 4
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    obj.data.materials.append(mat)
    smooth(obj)
    if rig:
        bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
        weighted(obj, rig, bone)
    return obj


def tube(name, points, radius, mat, rig=None, bone='Spine2'):
    bpy.ops.object.select_all(action='DESELECT')
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 8
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(points)-1)
    for point, co in zip(spline.bezier_points, points):
        point.co = co
        point.handle_left_type = 'AUTO'
        point.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj = bpy.context.object
    obj.select_set(False)
    if rig:
        weighted(obj, rig, bone)
    return obj


def asset(path, body, kind='Clothes'):
    obj = HumanService.add_mhclo_asset(str(ASSETS/path), body,
        asset_type=kind, subdiv_levels=0, material_type='GAMEENGINE')
    smooth(obj)
    return obj


def target(body, name, value):
    files = list((MPFB_SOURCE/'mpfb'/'data'/'targets').rglob(name+'.target.gz'))
    if len(files) != 1:
        raise ValueError(f'Ambiguous/missing identity target: {name}')
    TargetService.load_target(body, str(files[0]), weight=value, name=name)


def add_backpack(rig):
    spine = rig.matrix_world @ rig.data.bones['mixamorig:Spine2'].head_local
    z = spine.z
    canvas = material('Mustard canvas', (0.62, 0.31, 0.035))
    trim = material('Backpack binding', (0.22, 0.10, 0.022))
    buckle = material('Brushed brass', (0.47, 0.28, 0.07), .34, .65)
    rounded_box('Backpack', (0, .16, z-.10), (.25, .13, .35), .052, canvas, rig)
    rounded_box('Backpack front pocket', (0, .235, z-.18), (.19, .045, .14), .025, canvas, rig)
    rounded_box('SponsorPatch', (0, .261, z-.18), (.098, .003, .066), .004, material('Sponsor patch', (.035,.10,.105)), rig)
    for side in [-1,1]:
        x=side*.115
        tube('Shoulder strap',[(x,.17,z+.075),(x,-.065,z+.14),(x,-.145,z-.035),(x,-.14,z-.10),(x,.16,z-.24)],.014,canvas,rig)
        rounded_box('Strap buckle',(x,-.115,z-.12),(.032,.01,.042),.004,buckle,rig)
        tube('Pack seam',[(side*.10,.225,z-.25),(side*.115,.22,z+.02)],.0025,trim,rig)
    tube('Pack handle',[(-.045,.15,z+.10),(0,.15,z+.145),(.045,.15,z+.10)],.009,trim,rig)


def add_watch(rig):
    wrist=rig.data.bones['mixamorig:LeftHand'].head_local.copy()
    axis=(rig.data.bones['mixamorig:LeftForeArm'].tail_local-rig.data.bones['mixamorig:LeftForeArm'].head_local).normalized()
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.mesh.primitive_torus_add(major_radius=.024,minor_radius=.004,major_segments=24,minor_segments=6,location=wrist)
    band=bpy.context.object;band.name='Watch band'
    band.rotation_mode='QUATERNION';band.rotation_quaternion=Vector((0,0,1)).rotation_difference(axis)
    band.data.materials.append(material('Watch leather',(.015,.018,.02)))
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);weighted(band,rig,'LeftHand');smooth(band)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=.016,depth=.006,location=wrist+Vector((0,-.023,0)))
    face=bpy.context.object;face.name='Watch dial';face.rotation_euler.x=math.pi/2
    face.data.materials.append(material('Watch face',(.025,.04,.045),.26,.45))
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);weighted(face,rig,'LeftHand');smooth(face)


def build(role):
    female = role == 'almaty-host'
    macro = TargetService.get_default_macro_info_dict()
    macro.update(gender=0 if female else 1, age=.46, muscle=.42 if female else .40,
                 weight=.39 if female else .34, proportions=.65, height=.48)
    # These are shape-space controls, not a statement about the character's identity.
    macro['race'] = {'asian': .65 if female else .12, 'caucasian': .35 if female else .88, 'african': 0}
    body=HumanService.create_human(macro_detail_dict=macro)
    body.name = role+'-body'
    if not female:
        for name,value in [('head-age-decr',.14),('head-invertedtriangular',.05),
                           ('l-eye-scale-incr',.045),('r-eye-scale-incr',.045),
                           ('nose-scale-horiz-decr',.06),('mouth-scale-horiz-incr',.12),
                           ('mouth-angles-up',.10)]:
            target(body,name,value)
    TargetService.bake_targets(body)
    rig=HumanService.add_builtin_rig(body,'mixamo')
    rig.name=role
    skin='young_asian_female' if female else 'young_caucasian_male2'
    HumanService.set_character_skin(str(ASSETS/'skins'/skin/(skin+'.mhmat')),body,skin_type='GAMEENGINE',material_instances=False)
    asset('eyes/high-poly/high-poly.mhclo',body,'Eyes')
    asset('eyebrows/eyebrow001/eyebrow001.mhclo',body,'Eyebrows')
    asset('eyelashes/eyelashes01/eyelashes01.mhclo',body,'Eyelashes')
    asset('teeth/teeth_base/teeth_base.mhclo',body,'Teeth')
    hair_path='braid01/braid01' if female else 'elvs_grump_hair/elvs_grump_hair'
    hair=asset('hair/'+hair_path+'.mhclo',body,'Hair')
    hair.name=role+'-hair'
    pants=asset('clothes/cortu_cargo_pants/cortu_cargo_pants.mhclo',body)
    cloth_color(pants,'Charcoal cotton' if female else 'Sand cotton',(.045,.055,.072) if female else (.54,.40,.26))
    shirt=asset('clothes/elvs_male_shirt_untucked_bd1/elvs_male_shirt_untucked_bd1.mhclo',body)
    cloth_color(shirt,'Ochre jacket' if female else 'Teal overshirt',(.38,.22,.105) if female else (.012,.12,.145))
    inner=asset('clothes/punkduck_deathnote_t-shirt/punkduck_deathnote_t-shirt.mhclo',body)
    inner.name='Blue inner shirt' if female else 'Ivory T-shirt'
    cloth_color(inner,inner.name,(.025,.10,.20) if female else (.88,.85,.77))
    shoes=asset('clothes/shoes05/shoes05.mhclo',body)
    shoes.name=role+'-shoes'
    # Smooth the low-resolution trouser pattern before deforming it.
    bpy.context.view_layer.objects.active=pants
    sub=pants.modifiers.new('Tailoring surface','SUBSURF');sub.levels=2
    bpy.ops.object.modifier_apply(modifier=sub.name)
    # Opaque surfaces must write depth. MPFB's game material template defaults
    # every material to alpha blend, which draws teeth and eyes through skin.
    for obj in [body,shoes]+[o for o in rig.children_recursive if o.type=='MESH' and 'teeth_base' in o.name]:
        for mat in obj.data.materials:
            node=mat.node_tree.nodes.get('Principled BSDF')
            for link in list(node.inputs['Alpha'].links): mat.node_tree.links.remove(link)
            node.inputs['Alpha'].default_value=1
            node.inputs['Roughness'].default_value=.65
    from wardrobe import tailor, style_hair
    tailor(bpy,rig,body,shirt,inner,pants,shoes,female,material)
    if not female: style_hair(hair)
    # The bundled expression targets avoid a dependency on a separate face pack.
    for name,source in [('blinkLeft','eye-left-closure'),('blinkRight','eye-right-closure'),
                        ('speak','mouth-open'),('smile','mouth-corner-puller'),('browLeft','eyebrows-left-up'),('browRight','eyebrows-right-up')]:
        path=MPFB_SOURCE/'mpfb/data/targets/expression/units'/('asian' if female else 'caucasian')/(source+'.target.gz')
        TargetService.load_target(body,str(path),weight=0,name=name)
    # Apply delete groups so hidden skin never pokes through the garments.
    ExportService.bake_modifiers_remove_helpers(body,bake_masks=True,remove_helpers=True,also_proxy=False)
    smooth(inner)
    smooth(body)
    bpy.context.view_layer.update()
    if not female:
        add_backpack(rig)
        add_watch(rig)
    from animation import Animator
    Animator(bpy,rig).bake()
    # Record the authoritative rig coordinates for animation authoring.
    import json
    bones={b.name:{'head':list(rig.matrix_world@b.head_local),'tail':list(rig.matrix_world@b.tail_local)} for b in rig.data.bones}
    (CACHE/(role+'-bones.json')).write_text(json.dumps(bones,indent=2))
    return rig


role=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'traveler'
bpy.context.preferences.filepaths.save_version=0
bpy.context.scene.render.fps=30
rig=build(role)
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
for obj in rig.children_recursive:
    obj.select_set(True)
for image in bpy.data.images:
    if image.size[0]>2048 or image.size[1]>2048:
        factor=2048/max(image.size)
        image.scale(round(image.size[0]*factor),round(image.size[1]*factor))
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/(role+'.blend')),compress=True)
bpy.ops.export_scene.gltf(filepath=str(OUTPUT/(role+'.glb')),export_format='GLB',
    use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_frame_range=False,export_morph=True,export_morph_normal=False,
    export_image_format='JPEG',export_jpeg_quality=82,export_texcoords=True,export_normals=True,
    export_skins=True,export_yup=True)
print('CHARACTER_EXPORTED',role)
