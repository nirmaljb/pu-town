"""Snow-capped skid generator reconstructed from the owner's three sheets. Executed through Blender MCP.

Metres; +Z up, +X along the length, the control panel faces -Y. The root is the skid
footprint centre on the ground. No game files are read or written; build/ is local.
"""
import bpy
import bmesh
import json
import math
import random
from pathlib import Path
from mathutils import Matrix, Vector, noise

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'build'
OUT.mkdir(exist_ok=True)
PASS = globals().get('BUILD_PASS', '01')
MASTER = OUT / 'generator.blend'

# Front sheet governs length and heights, the end sheet governs depth (see README).
SKID_X, SKID_Y = 2.40, 1.20          # corner feet, outer faces
HX, HY = 1.097, .51                  # housing corner posts, outer faces
BASE_TOP = .18                       # skid rails, feet and housing floor
CAP_X, CAP_Y, CAP_Z0, CAP_Z1 = 1.122, .535, .873, .937
PANEL_Z0, PANEL_Z1 = .196, .869
PANEL_PROUD = .014                   # panel faces stand proud of the corner posts
FRAME_PROUD = .032                   # louvre and bezel frames stand proud of the posts
VENT_X, VENT_Y, VENT_W, VENT_D, VENT_H = .60, .03, .44, .33, .07
rng = random.Random(4471)

scene = bpy.context.scene
if bpy.data.filepath and Path(bpy.data.filepath).resolve() != MASTER.resolve():
    raise RuntimeError('Use a dedicated factory-startup Blender session or this asset master.')
scene.name = 'Generator — standalone review'
scene['authoring_scope'] = 'Standalone snow-capped generator asset. No game integration.'
scene['scale_note'] = 'Inferred 2.40 × 1.20 × 0.94 m from the owner sheets; not a measured survey.'
for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
for other in list(bpy.data.scenes):
    if other != scene:
        bpy.data.scenes.remove(other)
# Every rebuild replaces the whole scene: no stale collections, worlds or data blocks remain.
scene.world = None
for col in list(bpy.data.collections):
    bpy.data.collections.remove(col)
for data in (bpy.data.meshes, bpy.data.materials, bpy.data.metaballs, bpy.data.lights,
             bpy.data.cameras, bpy.data.curves, bpy.data.worlds, bpy.data.images):
    for block in list(data):
        if block.users == 0:
            data.remove(block)
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1

asset = bpy.data.collections.new('Generator')
scene.collection.children.link(asset)
asset.asset_mark()
asset.asset_data.description = 'Snow-capped skid-mounted diesel generator with louvres, control panel and roof vents; 2.40 × 1.20 × 0.94 m before snow.'
asset.asset_data.author = 'PU Town / owner reference reconstruction'
collections = {}
for name in ['01 Skid base', '02 Housing', '03 Louvres and vents', '04 Control panel',
             '05 Hardware', '06 Snow', '90 Review stage', '91 Studio light', '92 Polar night']:
    col = bpy.data.collections.new(name)
    (asset if name[0] == '0' else scene.collection).children.link(col)
    collections[name[:2]] = col


def rgba(hex):
    v = [int(hex[i:i+2], 16)/255 for i in (0, 2, 4)]
    return tuple(x/12.92 if x < .04045 else ((x+.055)/1.055)**2.4 for x in v)+(1,)


def material(name, color, rough=.6, metallic=0.):
    m = bpy.data.materials.new(name)
    m.diffuse_color = rgba(color)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = rgba(color)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metallic
    return m


def weathered(name, base, dark, rust, rough=.62, metallic=0., specks=.07, streaks=.55, wear='A8A39C'):
    """Painted or blackened steel: grime, run-down streaks, rust specks, worn edges, dirty crevices."""
    m = material(name, base, rough, metallic)
    n, l = m.node_tree.nodes, m.node_tree.links
    p = n.get('Principled BSDF')
    tc = n.new('ShaderNodeTexCoord')
    def noise(vec, scale, detail=6, rough_=.6):
        t = n.new('ShaderNodeTexNoise'); t.inputs['Scale'].default_value = scale
        t.inputs['Detail'].default_value = detail; t.inputs['Roughness'].default_value = rough_
        l.new(vec, t.inputs['Vector']); return t
    def ramp(fac, a, b, pa, pb):
        r = n.new('ShaderNodeValToRGB'); r.color_ramp.elements[0].position = pa; r.color_ramp.elements[1].position = pb
        r.color_ramp.elements[0].color = a; r.color_ramp.elements[1].color = b
        l.new(fac, r.inputs['Fac']); return r
    def mix(fac, a, b, blend='MIX'):
        x = n.new('ShaderNodeMix'); x.data_type = 'RGBA'; x.blend_type = blend
        if isinstance(fac, float): x.inputs['Factor'].default_value = fac
        else: l.new(fac, x.inputs['Factor'])
        for sock, val in ((x.inputs[6], a), (x.inputs[7], b)):
            if isinstance(val, tuple): sock.default_value = val
            else: l.new(val, sock)
        return x.outputs[2]
    obj = tc.outputs['Object']
    grime = ramp(noise(obj, 2.6).outputs['Fac'], (0, 0, 0, 1), (1, 1, 1, 1), .42, .72)
    stretch = n.new('ShaderNodeVectorMath'); stretch.operation = 'MULTIPLY'; stretch.inputs[1].default_value = (16, 16, 1.1)
    l.new(obj, stretch.inputs[0])
    streak = ramp(noise(stretch.outputs[0], 3.2, 8).outputs['Fac'], (0, 0, 0, 1), (streaks, streaks, streaks, 1), .52, .70)
    col = mix(grime.outputs['Color'], rgba(base), rgba(dark))
    col = mix(streak.outputs['Color'], col, rgba(dark))
    vor = n.new('ShaderNodeTexVoronoi'); vor.inputs['Scale'].default_value = 115; l.new(obj, vor.inputs['Vector'])
    speck = n.new('ShaderNodeMapRange'); speck.clamp = True
    speck.inputs['From Min'].default_value = specks; speck.inputs['From Max'].default_value = specks*.35
    l.new(vor.outputs['Distance'], speck.inputs['Value'])
    patch = ramp(noise(obj, 5.5, 4).outputs['Fac'], (0, 0, 0, 1), (1, 1, 1, 1), .45, .62)
    speckmask = n.new('ShaderNodeMath'); speckmask.operation = 'MULTIPLY'
    l.new(speck.outputs[0], speckmask.inputs[0]); l.new(patch.outputs['Color'], speckmask.inputs[1])
    col = mix(speckmask.outputs[0], col, rgba(rust))
    # Worn edges from the rendered bevel normal; crevices darkened by local occlusion.
    bev = n.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = .006
    geo = n.new('ShaderNodeNewGeometry')
    dot = n.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'
    l.new(bev.outputs['Normal'], dot.inputs[0]); l.new(geo.outputs['Normal'], dot.inputs[1])
    edge = n.new('ShaderNodeMapRange'); edge.clamp = True
    edge.inputs['From Min'].default_value = .985; edge.inputs['From Max'].default_value = .90
    l.new(dot.outputs['Value'], edge.inputs['Value'])
    chip = n.new('ShaderNodeMath'); chip.operation = 'MULTIPLY'
    l.new(edge.outputs[0], chip.inputs[0]); l.new(noise(obj, 24, 3).outputs['Fac'], chip.inputs[1])
    chip2 = n.new('ShaderNodeMath'); chip2.operation = 'MULTIPLY'; chip2.inputs[1].default_value = 1.6
    l.new(chip.outputs[0], chip2.inputs[0]); chip2.use_clamp = True
    col = mix(chip2.outputs[0], col, rgba(wear))
    ao = n.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = .05; ao.only_local = True
    aoramp = ramp(ao.outputs['AO'], (.45, .45, .45, 1), (1, 1, 1, 1), 0, 1)
    col = mix(1.0, col, aoramp.outputs['Color'], 'MULTIPLY')
    l.new(col, p.inputs['Base Color'])
    rr = ramp(noise(obj, 9, 4).outputs['Fac'], (rough-.12,)*3+(1,), (rough+.12,)*3+(1,), .3, .7)
    l.new(rr.outputs['Color'], p.inputs['Roughness'])
    bump = n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .18; bump.inputs['Distance'].default_value = .002
    l.new(noise(obj, 140, 3).outputs['Fac'], bump.inputs['Height'])
    bump2 = n.new('ShaderNodeBump'); bump2.inputs['Strength'].default_value = .35; bump2.inputs['Distance'].default_value = .001
    l.new(speckmask.outputs[0], bump2.inputs['Height']); l.new(bump.outputs['Normal'], bump2.inputs['Normal'])
    l.new(bump2.outputs['Normal'], p.inputs['Normal'])
    return m


paint = weathered('Paint / frost-worn housing', '8C847A', '6C655D', '553F2F', .64, 0, .085, .3)
lid = weathered('Paint / grimy lid', '6E6862', '4B4743', '4F3B2D', .7, 0, .09, .65)
post_paint = weathered('Paint / corner posts', '7A746E', '5C5752', '5B4636', .64, 0, .06, .55)
steel = weathered('Steel / blackened skid', '444144', '262426', '5E4433', .62, .25, .085, .5, '6E6D6F')
frame_steel = weathered('Steel / louvre frames', '414145', '28282B', '5A4232', .62, .25, .07, .45, '6E6E72')
slat_steel = weathered('Steel / louvre blades', '3A3B3F', '242427', '5A4232', .56, .3, .05, .3, '76767A')
shadow = material('Steel / louvre cavity', '0E0F11', .9)
enamel = material('Control / black enamel', '222226', .42, .2)
enamel_raised = material('Control / raised fascia', '2D2D32', .48, .25)
lcd = material('Control / dead LCD', '666468', .22)
lp = lcd.node_tree.nodes.get('Principled BSDF')
lp.inputs['Emission Color'].default_value = rgba('A9B4A6'); lp.inputs['Emission Strength'].default_value = 0
red = material('Control / stop button', '8A2C25', .38)
rp = red.node_tree.nodes.get('Principled BSDF')
rp.inputs['Emission Color'].default_value = rgba('FF3B2B'); rp.inputs['Emission Strength'].default_value = .35
bolt_mat = material('Steel / dome bolts', '5A5C60', .32, .85)
interior = material('Steel / dark interior', '17181A', .8)

snow = material('Snow / fresh powder', 'E2E8F4', .42)
n, l = snow.node_tree.nodes, snow.node_tree.links
p = n.get('Principled BSDF')
p.inputs['Subsurface Weight'].default_value = .22
p.inputs['Subsurface Radius'].default_value = (.9, 1.0, 1.25)
p.inputs['Subsurface Scale'].default_value = .02
p.inputs['Specular IOR Level'].default_value = .6
tc = n.new('ShaderNodeTexCoord')
tx = n.new('ShaderNodeTexNoise'); tx.inputs['Scale'].default_value = 14; tx.inputs['Detail'].default_value = 4
l.new(tc.outputs['Object'], tx.inputs['Vector'])
r = n.new('ShaderNodeValToRGB'); r.color_ramp.elements[0].color = rgba('B9C5E0'); r.color_ramp.elements[1].color = rgba('E3EAFA')
r.color_ramp.elements[0].position = .3; r.color_ramp.elements[1].position = .75
l.new(tx.outputs['Fac'], r.inputs[0])
fine = n.new('ShaderNodeTexNoise'); fine.inputs['Scale'].default_value = 85; fine.inputs['Detail'].default_value = 4
l.new(tc.outputs['Object'], fine.inputs['Vector'])
crystal = n.new('ShaderNodeTexVoronoi'); crystal.inputs['Scale'].default_value = 170
# Grain in the albedo as well as the normal survives denoising, like the sheets' crisp crust.
grain = n.new('ShaderNodeMapRange'); grain.inputs['To Min'].default_value = .9; grain.inputs['To Max'].default_value = 1.06
l.new(fine.outputs['Fac'], grain.inputs['Value'])
crust = n.new('ShaderNodeMix'); crust.data_type = 'RGBA'; crust.blend_type = 'MULTIPLY'; crust.inputs['Factor'].default_value = 1
l.new(r.outputs[0], crust.inputs[6]); l.new(grain.outputs[0], crust.inputs[7])
l.new(crust.outputs[2], p.inputs['Base Color'])
l.new(tc.outputs['Object'], crystal.inputs['Vector'])
mid = n.new('ShaderNodeTexNoise'); mid.inputs['Scale'].default_value = 30; mid.inputs['Detail'].default_value = 5
l.new(tc.outputs['Object'], mid.inputs['Vector'])
b0 = n.new('ShaderNodeBump'); b0.inputs['Strength'].default_value = .3; b0.inputs['Distance'].default_value = .006
l.new(mid.outputs['Fac'], b0.inputs['Height'])
b1 = n.new('ShaderNodeBump'); b1.inputs['Strength'].default_value = .5; b1.inputs['Distance'].default_value = .004
l.new(fine.outputs['Fac'], b1.inputs['Height']); l.new(b0.outputs['Normal'], b1.inputs['Normal'])
b2 = n.new('ShaderNodeBump'); b2.inputs['Strength'].default_value = .45; b2.inputs['Distance'].default_value = .0012
l.new(crystal.outputs['Distance'], b2.inputs['Height']); l.new(b1.outputs['Normal'], b2.inputs['Normal'])
l.new(b2.outputs['Normal'], p.inputs['Normal'])

root = bpy.data.objects.new('GENERATOR / 2.40 × 1.20 m', None)
collections['01'].objects.link(root)
root['skid_footprint_m'] = [SKID_X, SKID_Y]
root['housing_m'] = [2*HX, 2*HY, CAP_Z1]
root['height_before_snow_m'] = CAP_Z1
root['front'] = '-Y (control panel)'


def link(ob, key):
    collections[key].objects.link(ob)
    if not key.startswith('9'):
        ob.parent = root
    return ob


def finish(ob, mat, edge):
    ob.data.materials.append(mat)
    if edge:
        mod = ob.modifiers.new('Worn edges', 'BEVEL'); mod.width = edge; mod.segments = 2
        mod.limit_method = 'ANGLE'
        mod = ob.modifiers.new('Face normals', 'WEIGHTED_NORMAL'); mod.keep_sharp = True
    return ob


def box(name, center, size, mat, key, edge=.004, rot=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts:
        v.co = Vector((v.co.x*size[0], v.co.y*size[1], v.co.z*size[2]))
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.location = center; ob.rotation_euler = rot
    return finish(link(ob, key), mat, edge)


def cylinder(name, center, radius, depth, mat, key, rot=(0, 0, 0), verts=12, edge=0.):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=radius, radius2=radius, depth=depth)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.location = center; ob.rotation_euler = rot
    return finish(link(ob, key), mat, edge)


def carve(ob, cutters):
    """Bake real openings with exact booleans, then keep only the resulting mesh."""
    temps = []
    for c, s in cutters:
        me = bpy.data.meshes.new('cutter'); bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
        for v in bm.verts:
            v.co = Vector((v.co.x*s[0], v.co.y*s[1], v.co.z*s[2]))
        bm.to_mesh(me); bm.free()
        t = bpy.data.objects.new('cutter', me); t.location = c
        scene.collection.objects.link(t); temps.append(t)
        mod = ob.modifiers.new('Opening', 'BOOLEAN'); mod.operation = 'DIFFERENCE'; mod.solver = 'EXACT'; mod.object = t
    bpy.context.view_layer.update()
    old = ob.data
    ob.data = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    ob.data.name = ob.name
    ob.modifiers.clear()
    for t in temps:
        me = t.data; bpy.data.objects.remove(t); bpy.data.meshes.remove(me)
    bpy.data.meshes.remove(old)
    return ob


# Faces of the housing: local u runs left to right seen from outside, d is outward from
# the corner-post plane, z is height above ground.
FACES = {'front': (0., Vector((0, -HY, 0))), 'back': (math.pi, Vector((0, HY, 0))),
         'east': (math.pi/2, Vector((HX, 0, 0))), 'west': (-math.pi/2, Vector((-HX, 0, 0)))}


def fpos(face, u, d, z):
    rz, origin = FACES[face]
    return origin + Matrix.Rotation(rz, 3, 'Z') @ Vector((u, -d, 0)) + Vector((0, 0, z))


def fbox(face, name, u0, u1, d0, d1, z0, z1, mat, key, edge=.004, tilt=0.):
    c = fpos(face, (u0+u1)/2, (d0+d1)/2, (z0+z1)/2)
    return box(name, c, (u1-u0, d1-d0, z1-z0), mat, key, edge, (tilt, 0, FACES[face][0]))


def bolt(face, u, z, d=PANEL_PROUD):
    rz = FACES[face][0]
    cylinder('Bolt / washer', fpos(face, u, d+.001, z), .017, .003, bolt_mat, '05', (math.pi/2, 0, rz), 16)
    cylinder('Bolt / dome head', fpos(face, u, d+.006, z), .0115, .008, bolt_mat, '05', (math.pi/2, 0, rz), 12, .003)


def latch(face, u0, u1, z0, z1):
    fbox(face, 'Latch / recessed plate', u0, u1, PANEL_PROUD, PANEL_PROUD+.007, z0, z1, frame_steel, '04', .003)
    w, h = (u1-u0)*.36, (z1-z0)*.66
    uc, zc = (u0+u1)/2, (z0+z1)/2
    fbox(face, 'Latch / handle', uc-w/2, uc+w/2, PANEL_PROUD+.007, PANEL_PROUD+.019, zc-h/2, zc+h/2, slat_steel, '04', .004)


def louvre(face, name, u0, u1, z0, z1, bar, count):
    d0, d1 = PANEL_PROUD, FRAME_PROUD
    fbox(face, name+' / frame top', u0, u1, d0, d1, z1-bar, z1, frame_steel, '03', .006)
    fbox(face, name+' / frame sill', u0, u1, d0, d1, z0, z0+bar, frame_steel, '03', .006)
    fbox(face, name+' / frame left', u0, u0+bar, d0, d1, z0+bar, z1-bar, frame_steel, '03', .006)
    fbox(face, name+' / frame right', u1-bar, u1, d0, d1, z0+bar, z1-bar, frame_steel, '03', .006)
    fbox(face, name+' / cavity', u0+bar, u1-bar, d0-.001, d0+.002, z0+bar, z1-bar, shadow, '03', 0)
    pitch = (z1-z0-2*bar)/count
    blades = []
    for i in range(count):
        zc = z0+bar+(i+.55)*pitch
        blades.append(fbox(face, name+' / blade %02d' % i, u0+bar, u1-bar, (d0+d1)/2-.0025, (d0+d1)/2+.0025,
                           zc-pitch*.58, zc+pitch*.58, slat_steel, '03', .0015, -math.radians(45)))
    return pitch


# ---------------------------------------------------------------- skid base
for sx in (-1, 1):
    for sy in (-1, 1):
        foot = box('Skid / corner foot', (sx*1.115, sy*.5175, BASE_TOP/2), (.17, .165, BASE_TOP), steel, '01', .008)
        carve(foot, [((sx*1.20, sy*.5175, .06), (.12, .095, .07))])
        lug = box('Skid / lifting casting', (sx*1.107, sy*.51, .2905), (.136, .136, .131), steel, '01', .006)
        carve(lug, [((sx*1.107, sy*.51, .2905), (.30, .08, .075)), ((sx*1.107, sy*.51, .2905), (.08, .30, .075))])
for sy in (-1, 1):
    box('Skid / long rail', (0, sy*.53, .113), (2.06, .10, .134), steel, '01', .007)
for sx in (-1, 1):
    box('Skid / end rail', (sx*1.125, 0, .113), (.10, .87, .134), steel, '01', .007)
    pocket = box('Skid / fork pocket', (sx*.675, 0, BASE_TOP/2), (.19, SKID_Y, BASE_TOP), steel, '01', .007)
    carve(pocket, [((sx*.675, 0, .07), (.12, 1.4, .082))])
box('Skid / deck plate', (0, 0, .1825), (2.21, 1.04, .025), steel, '01', .004)

# ---------------------------------------------------------------- housing
box('Housing / sealed core', (0, 0, (BASE_TOP+CAP_Z0)/2), (2*HX-.04, 2*HY-.04, CAP_Z0-BASE_TOP), interior, '02', 0)
for sx in (-1, 1):
    for sy in (-1, 1):
        box('Housing / corner post', (sx*(HX-.0425), sy*(HY-.0425), (BASE_TOP+CAP_Z0)/2), (.085, .085, CAP_Z0-BASE_TOP),
            post_paint, '02', .006)
box('Housing / lid', (0, 0, (CAP_Z0+CAP_Z1)/2), (2*CAP_X, 2*CAP_Y, CAP_Z1-CAP_Z0), lid, '02', .009)

def panel(face, name, u0, u1, z0, z1):
    return fbox(face, name, u0, u1, -.004, PANEL_PROUD, z0, z1, paint, '02', .007)

def mullion(face, u0, u1):
    fbox(face, 'Housing / mullion', u0, u1, -.004, .013, PANEL_Z0, PANEL_Z1, post_paint, '02', .004)

for face in ('front', 'back'):
    panel(face, 'Housing / %s large louvre panel' % face, -1.008, -.040, PANEL_Z0, PANEL_Z1)
    panel(face, 'Housing / %s upper centre panel' % face, .019, .557, .476, PANEL_Z1)
    panel(face, 'Housing / %s lower access panel' % face, .019, .557, .199, .472)
    panel(face, 'Housing / %s small louvre panel' % face, .607, 1.008, PANEL_Z0, PANEL_Z1)
    mullion(face, -.036, .015); mullion(face, .561, .603)
    louvre(face, 'Louvre / %s large' % face, -.905, -.118, .268, .839, .042, 10)
    louvre(face, 'Louvre / %s small' % face, .670, .948, .285, .796, .039, 9)
    for u, z in [(-.968, .828), (-.080, .828), (-.968, .240), (-.080, .240),
                 (.643, .828), (.973, .828), (.643, .240), (.973, .240),
                 (.052, .432), (.527, .432), (.052, .238), (.527, .238)]:
        bolt(face, u, z)
    latch(face, .058, .112, .284, .383)
for face in ('east', 'west'):
    panel(face, 'Housing / %s end panel' % face, -.421, .421, PANEL_Z0, PANEL_Z1)
    louvre(face, 'Louvre / %s end' % face, -.325, .325, .319, .823, .040, 9)
    for u, z in [(-.385, .826), (.385, .826), (-.385, .262), (.385, .262)]:
        bolt(face, u, z)

# ---------------------------------------------------------------- control panel (front only)
F, d0 = 'front', PANEL_PROUD
for args in [(.112, .510, .784, .808), (.112, .510, .510, .534), (.112, .136, .534, .784), (.486, .510, .534, .784)]:
    fbox(F, 'Control / bezel frame', args[0], args[1], d0, d0+.026, args[2], args[3], frame_steel, '04', .005)
fbox(F, 'Control / recess floor', .136, .486, d0-.001, d0+.004, .534, .784, enamel, '04', 0)
fbox(F, 'Control / gauge fascia', .150, .321, d0+.004, d0+.011, .548, .770, enamel_raised, '04', .003)
fbox(F, 'Control / switch fascia', .335, .472, d0+.004, d0+.011, .548, .770, enamel_raised, '04', .003)
fbox(F, 'Control / meter bezel', .165, .317, d0+.011, d0+.016, .642, .752, enamel, '04', .002)
fbox(F, 'Control / dead meter glass', .176, .306, d0+.011, d0+.0175, .653, .741, lcd, '04', .0015)
fbox(F, 'Control / hour counter bezel', .350, .447, d0+.011, d0+.016, .678, .740, enamel, '04', .002)
fbox(F, 'Control / hour counter glass', .359, .438, d0+.011, d0+.0175, .687, .731, lcd, '04', .0015)
for u in (.194, .291):
    fbox(F, 'Control / push-button collar', u-.020, u+.020, d0+.011, d0+.015, .578, .618, enamel, '04', .002)
    fbox(F, 'Control / push button', u-.014, u+.014, d0+.015, d0+.021, .584, .612, enamel_raised, '04', .003)
fbox(F, 'Control / stop button collar', .362, .408, d0+.011, d0+.016, .592, .638, enamel, '04', .002)
fbox(F, 'Control / stop button', .369, .401, d0+.016, d0+.024, .599, .631, red, '04', .003)
cylinder('Control / key switch', fpos(F, .432, d0+.016, .616), .011, .010, frame_steel, '04', (math.pi/2, 0, 0), 16)
fbox(F, 'Control / key slot', .4305, .4335, d0+.020, d0+.022, .607, .625, shadow, '04', 0)
latch(F, .040, .090, .609, .708)
for u, z in [(.530, .838), (.530, .506)]:
    bolt(F, u, z)
# The back keeps a second plain service door in place of the controls.
latch('back', .040, .090, .609, .708)
for u, z in [(.052, .838), (.527, .838), (.052, .508), (.527, .508)]:
    bolt('back', u, z)

# ---------------------------------------------------------------- roof vents
for sx in (-1, 1):
    cx, cy, w, dd, z0 = sx*VENT_X, VENT_Y, VENT_W, VENT_D, CAP_Z1
    bar = .034
    box('Vent / flange', (cx, cy, z0+.004), (w+.03, dd+.03, .008), steel, '03', .002)
    for y in (cy-dd/2+bar/2, cy+dd/2-bar/2):
        box('Vent / frame long', (cx, y, z0+VENT_H/2), (w, bar, VENT_H), steel, '03', .005)
    for x in (cx-w/2+bar/2, cx+w/2-bar/2):
        box('Vent / frame end', (x, cy, z0+VENT_H/2), (bar, dd-2*bar, VENT_H), steel, '03', .005)
    box('Vent / cavity', (cx, cy, z0+.009), (w-2*bar, dd-2*bar, .002), shadow, '03', 0)
    inner = dd-2*bar; pitch = inner/6
    for i in range(6):
        y = cy-inner/2+(i+.5)*pitch
        box('Vent / blade', (cx, y, z0+VENT_H*.55), (w-2*bar, .005, pitch*1.25), slat_steel, '03', .0015, (-math.radians(48), 0, 0))
    for x in (cx-w/2+bar/2, cx+w/2-bar/2):
        for y in (cy-dd/2+bar/2, cy+dd/2-bar/2):
            cylinder('Bolt / vent dome', (x, y, z0+VENT_H+.003), .009, .007, bolt_mat, '05', (0, 0, 0), 12, .0025)

# ---------------------------------------------------------------- snow (metaballs baked to mesh)
MB = .574           # visible radius of an isolated metaball element per unit radius
_snow_count = [0]


def ell(co, a, b, c, neg=False):
    r = max(a, b, c)/MB
    return ('ELLIPSOID', Vector(co), r, (a/(r*MB), b/(r*MB), c/(r*MB)), neg)


def slab(co, hx, hy, hz, round_, neg=False):
    r = round_/MB
    return ('CUBE', Vector(co), r, (max(hx-round_, 0), max(hy-round_, 0), max(hz-round_, 0)), neg)


def snow_mesh(name, elems, res, keep):
    """Bake one metaball field to a smooth mesh, decimated to `keep` of its faces."""
    _snow_count[0] += 1
    mb = bpy.data.metaballs.new('SnowField%03d' % _snow_count[0])
    mb.resolution = res; mb.render_resolution = res; mb.threshold = .6
    ob = bpy.data.objects.new('SnowField%03d' % _snow_count[0], mb)
    scene.collection.objects.link(ob)
    for typ, co, r, size, neg in elems:
        e = mb.elements.new(type=typ); e.co = co; e.radius = r; e.use_negative = neg
        e.size_x, e.size_y, e.size_z = size
    bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(ob); bpy.data.metaballs.remove(mb)
    out = link(bpy.data.objects.new(name, me), '06')
    dec = out.modifiers.new('Even snow density', 'DECIMATE'); dec.ratio = keep
    bpy.context.view_layer.update()
    out.data = bpy.data.meshes.new_from_object(out.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    out.modifiers.clear(); bpy.data.meshes.remove(me)
    out.data.name = name
    for poly in out.data.polygons:
        poly.use_smooth = True
    out.data.materials.append(snow)
    return out


def ridge(p0, p1, along, across, up, cover=1., runs=1):
    """Continuous lumpy ridge lying along an axis-aligned edge, broken into `runs` stretches."""
    p0, p1 = Vector(p0), Vector(p1)
    axis = (p1-p0).normalized(); length = (p1-p0).length
    along_x = abs(axis.x) > .5
    if cover >= 1:
        spans = [(0, length)]
    else:
        cuts = sorted(rng.uniform(0, length) for _ in range(runs-1))
        bounds = [0]+cuts+[length]; spans = []
        for a, b in zip(bounds, bounds[1:]):
            keep = (b-a)*cover; s0 = a+rng.uniform(0, b-a-keep)
            spans.append((s0, s0+keep))
    out = []
    for s0, s1 in spans:
        t = s0+along*.5
        while t < s1-along*.3:
            taper = min(1, .45+(t-s0)/(2.5*along), .45+(s1-t)/(2.5*along))
            a, b, c = along*rng.uniform(.85, 1.2), across*rng.uniform(.85, 1.1)*taper, up*rng.uniform(.65, 1.3)*taper
            co = p0+axis*t+Vector((0, 0, c*.2))
            out.append(ell(co, a, b, c) if along_x else ell(co, b, a, c))
            t += along*rng.uniform(.8, 1.15)
    return out


def wedge(face, end, centre, d, z, length):
    """Snow banked against a frame on one blade: half buried in the frame, thinning inward."""
    sign = math.copysign(1, centre-end)
    out = []
    for u, a, c in [(end+sign*.25*length, .40*length, .0065), (end+sign*.62*length, .24*length, .0045)]:
        p = fpos(face, u, d, z+c*.35) if face else Vector((u, d, z+c*.35))
        across_u = face in ('front', 'back') or face is None
        out.append(ell(p, a, .009, c) if across_u else ell(p, .009, a, c))
    return out


# Roof blanket: an even grid of overlapping pillows. Smooth noise mounds it toward the
# middle; the outer pillows sink into a scalloped lip over the lid band; wells stay open
# round both vents. Fine cotton lumps ride on top.
z = CAP_Z1
m = .018
vy0, vy1 = VENT_Y-VENT_D/2-m, VENT_Y+VENT_D/2+m
vx = [(-VENT_X-VENT_W/2-m, -VENT_X+VENT_W/2+m), (VENT_X-VENT_W/2-m, VENT_X+VENT_W/2+m)]


def near_vent(x, y, margin):
    return any(a-margin < x < b+margin for a, b in vx) and vy0-margin < y < vy1+margin


def well(x, y):
    """How far the blanket dips toward a vent: 1 at the vent, 0 from 0.16 m away."""
    gap = min(max(abs(x-sx*VENT_X)-VENT_W/2, abs(y-VENT_Y)-VENT_D/2) for sx in (-1, 1))
    return max(0., 1-max(gap, 0)/.16)


elems = []
step = .085
ix, iy = .045, .075          # outer pillows stand this far inside the lid edge
nx, ny = round((2*CAP_X-2*ix)/step), round((2*CAP_Y-2*iy)/step)
for i in range(nx+1):
    for j in range(ny+1):
        x = -(CAP_X-ix)+i*(2*CAP_X-2*ix)/nx+rng.uniform(-.012, .012)
        y = -(CAP_Y-iy)+j*(2*CAP_Y-2*iy)/ny+rng.uniform(-.012, .012)
        edge = i in (0, nx) or j in (0, ny)
        a = rng.uniform(.055, .08) if edge else rng.uniform(.065, .08)
        if near_vent(x, y, a*.7):
            continue
        inland = min(1, (CAP_X-abs(x))/.24, (CAP_Y-abs(y))/.22)
        swell = .025*noise.noise(Vector((x*4.2, y*4.2, 1.7)))+.012*noise.noise(Vector((x*10, y*10, 4.1)))
        if edge:
            # Lip pillows: mostly resting on the lid, some sagging into scallops over its band.
            drip = rng.random() < .3
            zc, c = z+(.008 if drip else .02)+.5*swell+rng.uniform(-.006, .006), rng.uniform(.035, .042) if drip else rng.uniform(.03, .038)
        else:
            zc, c = z+.006+.03*inland+swell-.045*well(x, y), rng.uniform(.04, .05)
        elems.append(ell((x, y, zc), a, a*rng.uniform(.85, 1.15), c))
for _ in range(520):
    x = rng.uniform(-CAP_X+.08, CAP_X-.08); y = rng.uniform(-CAP_Y+.07, CAP_Y-.07)
    s_ = rng.uniform(.028, .065)
    if not near_vent(x, y, s_+.01):
        inland = min(1, (CAP_X-abs(x))/.24, (CAP_Y-abs(y))/.22)
        swell = .025*noise.noise(Vector((x*4.2, y*4.2, 1.7)))+.012*noise.noise(Vector((x*10, y*10, 4.1)))
        elems.append(ell((x, y, z+.04+.03*inland+swell-.045*well(x, y)+rng.uniform(-.006, .01)), s_, s_*rng.uniform(.8, 1.2), s_*rng.uniform(.35, .55)))
snow_mesh('Snow / roof blanket', elems, .013, .4)

# Thin beads on the panel ledges, the end louvre heads and the bezel sill.
beads = []
for face in ('front', 'back'):
    for u0, u1, top in [(-1.0, -.05, PANEL_Z1), (.03, .55, PANEL_Z1), (.62, 1.0, PANEL_Z1), (.03, .55, .472)]:
        beads += ridge(fpos(face, u0, PANEL_PROUD*.5, top), fpos(face, u1, PANEL_PROUD*.5, top), .034, .011, .013, .75, 2)
        for _ in range(2):
            u = rng.uniform(u0+.06, u1-.06)
            beads.append(ell(fpos(face, u, PANEL_PROUD*.5, top+.006), rng.uniform(.05, .09), .013, .02))
for face in ('east', 'west'):
    beads += ridge(fpos(face, -.41, PANEL_PROUD*.5, PANEL_Z1), fpos(face, .41, PANEL_PROUD*.5, PANEL_Z1), .034, .010, .012, .85, 2)
    beads += ridge(fpos(face, -.31, (PANEL_PROUD+FRAME_PROUD)/2, .823), fpos(face, .31, (PANEL_PROUD+FRAME_PROUD)/2, .823),
                   .05, .016, .028, .85, 2)
    beads.append(ell(fpos(face, rng.uniform(-.08, .08), (PANEL_PROUD+FRAME_PROUD)/2, .835), .02, .16, .03))
beads += ridge(fpos('front', .14, PANEL_PROUD+.013, .534), fpos('front', .48, PANEL_PROUD+.013, .534), .03, .010, .011, .95)
snow_mesh('Snow / panel ledges', beads, .007, .35)


def louvre_snow(face, name, u0, u1, z0, z1, bar, count):
    d = (PANEL_PROUD+FRAME_PROUD)/2
    elems = ridge(fpos(face, u0+bar, d, z0+bar), fpos(face, u1-bar, d, z0+bar), .05, .015, .028)
    pitch = (z1-z0-2*bar)/count
    for i in range(count):
        zc = z0+bar+(i+.55)*pitch+.005
        for end, chance, reach in ((u1-bar, .9, (.05, .12)), (u0+bar, .45, (.03, .07))):
            if rng.random() < chance:
                elems += wedge(face, end, (u0+u1)/2, d-.002, zc, rng.uniform(*reach))
    snow_mesh('Snow / '+name, elems, .006, .35)


for face in ('front', 'back'):
    louvre_snow(face, '%s large louvre' % face, -.905, -.118, .268, .839, .042, 10)
    louvre_snow(face, '%s small louvre' % face, .670, .948, .285, .796, .039, 9)
for face in ('east', 'west'):
    louvre_snow(face, '%s end louvre' % face, -.325, .325, .319, .823, .040, 9)

# Skid: lumpy ridges on the rails, caps on feet and castings, thin drifts in fork pockets.
base = []
for sy in (-1, 1):
    base += ridge((-1.03, sy*.553, BASE_TOP+.004), (1.03, sy*.553, BASE_TOP+.004), .075, .03, .03, .93, 3)
    for _ in range(4):
        base.append(ell((rng.uniform(-.95, .95), sy*.55, BASE_TOP+.016), rng.uniform(.08, .14), .03, .042))
for sx in (-1, 1):
    base += ridge((sx*1.150, -.43, BASE_TOP+.004), (sx*1.150, .43, BASE_TOP+.004), .075, .026, .03, .93, 2)
    for sy in (-1, 1):
        base.append(slab((sx*1.115, sy*.5175, BASE_TOP+.008), .087, .084, .02, .02))
        base.append(ell((sx*(1.115+rng.uniform(-.025, .025)), sy*(.5175+rng.uniform(-.025, .025)), BASE_TOP+.024), .055, .05, .024))
        base.append(slab((sx*1.107, sy*.51, .356+.008), .07, .07, .019, .019))
        base.append(ell((sx*1.107, sy*.51, .356+.024), .05, .046, .025))
        base.append(ell((sx*.675, sy*.57, .029), .05, .03, .006))
snow_mesh('Snow / skid ridges and caps', base, .01, .4)

vent = []
for sx in (-1, 1):
    bar = .034; inner = VENT_D-2*bar; pitch = inner/6
    for i in range(6):
        y = VENT_Y-inner/2+(i+.5)*pitch
        for end, chance in ((sx*VENT_X+VENT_W/2-bar, .6), (sx*VENT_X-VENT_W/2+bar, .4)):
            if rng.random() < chance:
                vent += wedge(None, end, sx*VENT_X, y, CAP_Z1+VENT_H*.62, rng.uniform(.04, .10))
snow_mesh('Snow / vent blades', vent, .006, .5)

# ---------------------------------------------------------------- review stage (never part of the asset)
world = bpy.data.worlds.new('Studio charcoal / review')
scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs['Color'].default_value = rgba('1A1B1E'); bg.inputs['Strength'].default_value = 1.0


def light(name, kind, loc, power, color, size, target, key):
    data = bpy.data.lights.new(name, kind); data.energy = power; data.color = color
    if kind == 'AREA':
        data.shape = 'DISK'; data.size = size
    elif kind == 'SUN':
        data.angle = math.radians(size)
    else:
        data.shadow_soft_size = size
    ob = bpy.data.objects.new(name, data); collections[key].objects.link(ob); ob.location = loc
    ob.rotation_euler = (Vector(target)-Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return ob


# The studio lights turn with each sheet camera, as each sheet was lit from its own viewpoint.
rig = bpy.data.objects.new('STAGE / studio rig', None); collections['91'].objects.link(rig)
light('Studio / soft top key', 'AREA', (0, -2.2, 4.0), 280, (.97, .98, 1), 4, (0, 0, .5), '91')
light('Studio / front fill', 'AREA', (0, -5.5, 1.3), 110, (.86, .90, 1), 4, (0, 0, .5), '91')
light('Studio / end fill', 'AREA', (6, 0, 1.6), 95, (.86, .90, 1), 4, (0, 0, .5), '91')
light('Studio / back rim', 'AREA', (0, 4, 3), 120, (.86, .90, 1), 3, (0, 0, .7), '91')
for ob in collections['91'].objects:
    if ob != rig:
        ob.parent = rig
# Overcast polar twilight after the map: cold blue-grey light, one small warm pool from
# the workshop doorway lamp beside the generator's west end.
light('Polar / overcast sun', 'SUN', (0, 0, 10), 1.1, (.78, .85, .97), 35, (.35, .8, 0), '92')
light('Polar / workshop lamp 2400 K', 'POINT', (-2.25, -.25, 1.85), 110, (1, .58, .26), .1, (0, 0, 0), '92')
light('Polar / sky lift', 'AREA', (1, -4, 5), 700, (.70, .77, .92), 10, (0, 0, .5), '92')
ground = material('Stage / trodden snowfield', 'B9C2D1', .8)
gn, gl = ground.node_tree.nodes, ground.node_tree.links
gt = gn.new('ShaderNodeTexNoise'); gt.inputs['Scale'].default_value = 3; gt.inputs['Detail'].default_value = 6
gb = gn.new('ShaderNodeBump'); gb.inputs['Strength'].default_value = .25
gl.new(gt.outputs['Fac'], gb.inputs['Height']); gl.new(gb.outputs['Normal'], gn.get('Principled BSDF').inputs['Normal'])
box('STAGE / snowfield', (0, 0, -.05), (60, 60, .1), ground, '92', 0)
figure = material('Stage / parka figure stand-in', '25282D', .8)
cylinder('STAGE / 1.7 m figure stand-in', (-1.62, -.30, .78), .2, 1.56, figure, '92', (0, 0, 0), 24, .05)
bpy.ops.mesh.primitive_uv_sphere_add(radius=.13, location=(-1.62, -.30, 1.6))
head = bpy.context.object; head.name = 'STAGE / figure head'
for c in list(head.users_collection):
    c.objects.unlink(head)
collections['92'].objects.link(head); head.data.materials.append(figure)
# Falling snow for the atmosphere views only, never part of the asset.
flakes = bpy.data.meshes.new('STAGE / falling snow'); bm = bmesh.new()
cams_at = [Vector((2.9, -4.4, 2.0)), Vector((0, -5.06, 4.84))]
for _ in range(1400):
    centre = Vector((rng.uniform(-4.5, 4.5), rng.uniform(-6, 3), rng.uniform(.1, 4.2)))
    if min((centre-c).length for c in cams_at) < 2.2:
        continue
    made = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=rng.uniform(.003, .0075))
    bmesh.ops.translate(bm, verts=made['verts'], vec=centre)
bm.to_mesh(flakes); bm.free()
fall = bpy.data.objects.new('STAGE / falling snow', flakes); collections['92'].objects.link(fall)
fall.data.materials.append(material('Stage / snowflake', 'F2F5FA', .6))


def camera(name, loc, rot, scale=None, lens=None):
    data = bpy.data.cameras.new(name)
    if scale:
        data.type = 'ORTHO'; data.ortho_scale = scale
    else:
        data.lens = lens
    ob = bpy.data.objects.new(name, data); collections['90'].objects.link(ob)
    ob.location = loc; ob.rotation_euler = rot
    return ob


def aim(name, loc, target, lens):
    ob = camera(name, loc, (0, 0, 0), lens=lens)
    ob.rotation_euler = (Vector(target)-Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return ob


# Orthographic views reproduce each sheet's framing: 10 degrees above the front elevation,
# 3 above the end elevation, straight down for the roof, at the sheets' own pixel scales.
tilt, side_tilt = math.radians(10), math.radians(3)
front_target = .526
side_target = .5139
cams = {
    'front': camera('VIEW / front', (0, -10*math.cos(tilt), front_target+10*math.sin(tilt)), (math.pi/2-tilt, 0, 0), 2.618),
    'side': camera('VIEW / side', (10*math.cos(side_tilt), 0, side_target+10*math.sin(side_tilt)), (math.pi/2-side_tilt, 0, math.pi/2), 1.975),
    'top': camera('VIEW / top', (0, 0, 10), (0, 0, 0), 2.605),
    'back': camera('VIEW / back', (0, 10*math.cos(tilt), front_target+10*math.sin(tilt)), (math.pi/2-tilt, 0, math.pi), 2.618),
    'hero': aim('VIEW / hero', (2.9, -4.4, 2.0), (-.25, 0, .5), 45),
    'game': aim('VIEW / game', (0, -6.6*math.cos(math.radians(40)), .6+6.6*math.sin(math.radians(40))), (0, 0, .6), 38),
}
scene.camera = cams['front']
scene.render.engine = 'CYCLES'
scene.cycles.samples = 64
scene.cycles.use_denoising = True
scene.render.resolution_x = 1536; scene.render.resolution_y = 1024; scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
collections['92'].hide_render = True
for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        area.spaces.active.region_3d.view_perspective = 'CAMERA'
        area.spaces.active.shading.type = 'MATERIAL'

bpy.ops.object.select_all(action='DESELECT'); root.select_set(True); bpy.context.view_layer.objects.active = root
depsgraph = bpy.context.evaluated_depsgraph_get()
tris = 0
for ob in asset.all_objects:
    if ob.type == 'MESH':
        me = ob.evaluated_get(depsgraph).to_mesh(); me.calc_loop_triangles(); tris += len(me.loop_triangles)
        ob.evaluated_get(depsgraph).to_mesh_clear()
report = {'pass': PASS, 'skid_footprint_m': [SKID_X, SKID_Y], 'housing_m': [2*HX, 2*HY],
          'lid_m': [2*CAP_X, 2*CAP_Y], 'height_before_snow_m': CAP_Z1,
          'asset_objects': len(asset.all_objects), 'evaluated_triangles': tris,
          'unmodified_game': True, 'blender_version': bpy.app.version_string}
(OUT/f'pass-{PASS}-dimensions.json').write_text(json.dumps(report, indent=2)+'\n')
asset_scene = bpy.data.scenes.new('Generator asset')
asset_scene.collection.children.link(asset)
asset_scene.unit_settings.system = 'METRIC'
scene['review_state'] = 'Owner final review pending'
bpy.ops.wm.save_as_mainfile(filepath=str(MASTER))
print(json.dumps(report))
