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

VERSION = 'v2' if '--v2' in sys.argv else 'v1'
STAGED = '--staged' in sys.argv
EXPERIMENTAL_SOURCES = '--experimental-sources' in sys.argv
if EXPERIMENTAL_SOURCES and not STAGED:
    raise ValueError('Experimental retargeting requires --staged; inspect before promotion')
OUTPUT = CACHE / 'staged' / VERSION if STAGED else ROOT / 'public' / 'characters' / VERSION
SOURCE = OUTPUT if STAGED else ROOT / 'art' / 'characters' / VERSION
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


def add_swept_hair(rig):
    """Author the reference's swept, wavy silhouette as head-bound geometry."""
    head = rig.data.bones['mixamorig:Head']
    center = (head.head_local + head.tail_local) * .5
    dark = material('Swept dark brown hair', (.105, .032, .012), .72)
    # A close-fitting base hides the scalp without the stock asset's helmet edge.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20,
        location=(center.x, center.y + .018, center.z + .022))
    cap = bpy.context.object; cap.name = 'Swept hair base'
    cap.scale = (.116, .104, .127)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)
    mesh = bmesh.new(); mesh.from_mesh(cap.data)
    bmesh.ops.delete(mesh, geom=[v for v in mesh.verts
        if v.co.z < center.z-.020 or (v.co.y < center.y-.072 and v.co.z < center.z+.052)], context='VERTS')
    mesh.to_mesh(cap.data); mesh.free(); cap.data.materials.append(dark)
    weighted(cap, rig, 'Head'); smooth(cap)
    # Layered arcs build the high left quiff and the lower sweep over the right temple.
    strands = [
        [(-.090,-.076,.052),(-.083,-.100,.113),(-.030,-.112,.151),(.028,-.105,.143),(.072,-.090,.103)],
        [(-.080,-.084,.078),(-.048,-.119,.143),(.010,-.119,.174),(.074,-.096,.130),(.094,-.071,.074)],
        [(-.055,-.097,.099),(-.006,-.132,.164),(.057,-.110,.151),(.101,-.080,.100)],
        [(-.104,-.058,.030),(-.120,-.069,.087),(-.096,-.078,.132),(-.050,-.093,.151)],
        [(.024,-.105,.132),(.075,-.111,.144),(.112,-.081,.100),(.112,-.065,.045)],
        [(-.108,.000,.076),(-.119,-.034,.119),(-.087,-.075,.148),(-.028,-.097,.166)],
        [(.060,-.090,.124),(.108,-.078,.112),(.123,-.047,.070),(.112,-.020,.018)],
        [(-.111,.030,.042),(-.124,.003,.092),(-.105,-.040,.136),(-.061,-.073,.157)],
    ]
    for index, points in enumerate(strands):
        curve = tube('Swept wave %02d' % index,
            [center + Vector(p) for p in points], .014 if index < 5 else .012, dark, rig, 'Head')
        smooth(curve)


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
        tube('Shoulder strap',[(x,.17,z+.075),(x,-.065,z+.14),(x,-.145,z-.035),(x,-.14,z-.10),(x,.16,z-.24)],.010 if VERSION=='v2' else .014,canvas,rig)
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
    # resident-a is the Almaty host; resident-b is the male local every other city dresses.
    female = role == 'almaty-host'
    traveler = role == 'traveler'
    if role not in ('traveler', 'almaty-host', 'resident-b'):
        raise ValueError(f'Unknown character role: {role}')
    macro = TargetService.get_default_macro_info_dict()
    if traveler or female:
        macro.update(gender=0 if female else 1, age=.46,
                     muscle=.42 if female else (.23 if VERSION=='v2' else .40),
                     weight=.39 if female else (.28 if VERSION=='v2' else .34),
                     proportions=.58 if VERSION=='v2' and not female else .65, height=.48)
        # These are shape-space controls, not a statement about the character's identity.
        macro['race'] = {'asian': .65 if female else .12, 'caucasian': .35 if female else .88, 'african': 0}
    else:
        # One body for every city's variant. Hair, clothes and colours change per city;
        # these sliders do not, because they move the joints his Mixamo takes are made for.
        macro.update(gender=1, age=.6, muscle=.5, weight=.5, proportions=.6, height=.5)
        macro['race'] = {'asian': .45, 'caucasian': .5, 'african': .05}
    body=HumanService.create_human(macro_detail_dict=macro)
    body.name = role+'-body'
    if traveler:
        identity = [('head-age-decr',.14),('head-invertedtriangular',.05),
                    ('l-eye-scale-incr',.045),('r-eye-scale-incr',.045),
                    ('nose-scale-horiz-decr',.06),('mouth-scale-horiz-incr',.12),
                    ('mouth-angles-up',.10)] if VERSION=='v1' else [
                    ('head-age-decr',.32),('head-invertedtriangular',.24),
                    ('head-scale-horiz-decr',.10),('head-scale-vert-decr',.07),
                    ('chin-width-decr',.20),('chin-height-decr',.10),
                    ('chin-prominent-decr',.06),
                    ('l-cheek-bones-incr',.11),('r-cheek-bones-incr',.11),
                    ('l-cheek-volume-incr',.05),('r-cheek-volume-incr',.05),
                    ('l-eye-scale-incr',.24),('r-eye-scale-incr',.24),
                    ('l-eye-height2-incr',.08),('r-eye-height2-incr',.08),
                    ('l-eye-trans-in',.025),('r-eye-trans-in',.025),
                    ('eyebrows-angle-up',.07),('eyebrows-trans-up',.045),
                    ('forehead-temple-incr',.06),
                    ('nose-scale-depth-decr',.09),('nose-scale-horiz-decr',.11),
                    ('nose-scale-vert-decr',.045),
                    ('mouth-scale-horiz-incr',.12),('mouth-angles-up',.16),
                    ('torso-vshape-decr',.16),('measure-shoulder-dist-decr',.13),
                    ('torso-scale-depth-decr',.07),
                    ('l-upperarm-scale-horiz-decr',.07),('r-upperarm-scale-horiz-decr',.07)]
        for name,value in identity:
            target(body,name,value)
    TargetService.bake_targets(body)
    rig=HumanService.add_builtin_rig(body,'mixamo')
    rig.name=role
    skin='young_asian_female' if female else 'young_caucasian_male2' if traveler else 'young_caucasian_male'
    HumanService.set_character_skin(str(ASSETS/'skins'/skin/(skin+'.mhmat')),body,skin_type='GAMEENGINE',material_instances=False)
    asset('eyes/high-poly/high-poly.mhclo',body,'Eyes')
    asset('eyebrows/eyebrow001/eyebrow001.mhclo',body,'Eyebrows')
    asset('eyelashes/eyelashes01/eyelashes01.mhclo',body,'Eyelashes')
    asset('teeth/teeth_base/teeth_base.mhclo',body,'Teeth')
    hair_path='braid01/braid01' if female else 'elvs_grump_hair/elvs_grump_hair' if traveler else 'short02/short02'
    hair=asset('hair/'+hair_path+'.mhclo',body,'Hair')
    hair.name=role+'-hair'
    pants=asset('clothes/cortu_cargo_pants/cortu_cargo_pants.mhclo',body)
    if female:
        cloth_color(pants,'Charcoal cotton',(.045,.055,.072))
    elif traveler:
        cloth_color(pants,'Sand cotton',(.54,.40,.26))
    else:
        cloth_color(pants,'Stone cotton',(.30,.29,.26))
    shirt_path = 'clothes/elvs_male_shirt_untucked_bd1/elvs_male_shirt_untucked_bd1.mhclo'
    shirt=asset(shirt_path,body)
    if female:
        cloth_color(shirt,'Ochre jacket',(.38,.22,.105))
    elif traveler:
        cloth_color(shirt,'Teal overshirt',(.018,.23,.29) if VERSION=='v2' else (.012,.12,.145))
    else:
        cloth_color(shirt,'Navy jacket',(.035,.06,.12))
    inner=asset('clothes/punkduck_deathnote_t-shirt/punkduck_deathnote_t-shirt.mhclo',body)
    inner.name='Blue inner shirt' if female else 'Ivory T-shirt' if traveler else 'Rust inner shirt'
    cloth_color(inner,inner.name,(.025,.10,.20) if female else (.88,.85,.77) if traveler else (.36,.12,.05))
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
    tailor(bpy,rig,body,shirt,inner,pants,shoes,traveler,material,VERSION)
    if VERSION == 'v2' and traveler:
        # Use the garment's own collar and pockets; rigid boxes and tubes
        # previously crossed the skinned surface and floated at the chest.
        belt = material('Warm brown belt', (.18,.065,.022), .72)
        tube('Trouser belt', [(-.16,-.045,.91),(0,-.085,.90),(.16,-.045,.91)],
             .008, belt, rig, 'Hips')
    if traveler:
        style_hair(hair, VERSION)
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
    if traveler:
        add_backpack(rig)
        add_watch(rig)
    from animation import Animator
    Animator(bpy,rig,VERSION,experimental_sources=EXPERIMENTAL_SOURCES).bake()
    # Record the authoritative rig coordinates for animation authoring.
    import json
    bones={b.name:{'head':list(rig.matrix_world@b.head_local),'tail':list(rig.matrix_world@b.tail_local)} for b in rig.data.bones}
    (CACHE/(role+'-bones.json')).write_text(json.dumps(bones,indent=2))
    return rig


arguments=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
role=next((value for value in arguments if not value.startswith('--')), 'traveler')
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
