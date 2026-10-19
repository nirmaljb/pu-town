"""Snowbound storage room with an open porch. Executed through MCP for Blender.

Metres; +Z up; the porch faces -Y; the root is the enclosed room's footprint
centre on the ground. Every part is real geometry: framed timber shell, porch,
lapped interior lining, plank floor, two lamps, woodpile, and a separable roof
(rafters, deck, barge boards and its snow blanket) under its own pivot.
No game files are read or written; build/ holds local authoring output.
"""
import bpy
import bmesh
import json
import math
import random
from pathlib import Path
from mathutils import Vector, Matrix, noise

ROOT = Path(__file__).resolve().parent
OUT = ROOT/'build'
OUT.mkdir(exist_ok=True)
PASS = globals().get('BUILD_PASS', 'dev')
MASTER = OUT/'storage-room.blend'

# Dimensions read from the owner's elevations at about 192 px/m (README table).
W, L = 4.30, 6.40                 # enclosed room, outer board faces
YF, YB = -L/2, L/2                # front (porch-side) and back wall faces
POST_Y, POST_X, POST = YF-0.90, 1.40, 0.28
PLATE_BOT, PLATE_TOP = 2.38, 2.60
PITCH = math.radians(29)
TAN, COS, SIN = math.tan(PITCH), math.cos(PITCH), math.sin(PITCH)
RAFTER_D, RAFTER_W, DECK = 0.20, 0.12, 0.035
EAVE_X, TAIL_X = 2.70, 2.86       # deck edge and rafter tails, from the centre line
ROOF_F, ROOF_B = POST_Y-0.47, YB+0.45
FLOOR = 0.30
INNER = 0.16                      # outer board face to inner lining face
DOOR_X0, DOOR_X1 = 0.12, 1.12     # open doorway in the room's front wall
SNOW = 0.42
rng = random.Random(2610)


def rb(x):
    """Underside of the rafters (they bear on the outer edge of the wall plate)."""
    return PLATE_TOP+(W/2-abs(x))*TAN


RT0 = rb(0)+RAFTER_D/COS          # rafter top at the ridge
D0 = RT0+DECK/COS                 # deck top at the ridge


def deck_top(x):
    return D0-abs(x)*TAN


def smooth(a, b, x):
    t = min(1, max(0, (x-a)/(b-a)))
    return t*t*(3-2*t)


def n2(x, y, seed=0.0):
    return noise.noise(Vector((x, y, seed*7.31+0.37)))


scene = bpy.context.scene
if bpy.data.filepath and Path(bpy.data.filepath).resolve() != MASTER.resolve():
    raise RuntimeError('Use a dedicated factory-startup Blender session or this asset master.')
scene.name = 'Storage room — standalone review'
for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
for data in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras,
             bpy.data.curves, bpy.data.worlds):
    for block in list(data):
        if block.users == 0:
            data.remove(block)
for col in list(bpy.data.collections):
    bpy.data.collections.remove(col)
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
scene['authoring_scope'] = 'Standalone storage room asset with separable roof. No game integration.'
scene['reference_window_count'] = 0

asset = bpy.data.collections.new('Storage Room')
scene.collection.children.link(asset)
asset.asset_mark()
asset.asset_data.description = ('Snowbound timber storage room, 4.3 × 6.4 m with a 0.9 m open porch; '
                                'empty lapped interior, plank floor, porch and interior lamps, removable roof.')
asset.asset_data.author = 'PU Town / owner reference reconstruction'
for tag in ['Building', 'Timber', 'Snow', 'Storage', 'Interior']:
    asset.asset_data.tags.new(tag)
COLLECTION_NAMES = ['01 Timber shell', '02 Roof', '03 Porch lamp', '04 Woodpile', '05 Wooden floor',
                    '06 Interior lap lining', '07 Interior lamp', '08 Snow on timber', '90 Review stage']
collections = {}
for name in COLLECTION_NAMES:
    col = bpy.data.collections.new(name)
    (scene.collection if name.startswith('90') else asset).children.link(col)
    collections[name[:2]] = col
roof_snow = bpy.data.collections.new('02 Roof snow')
collections['02'].children.link(roof_snow)
collections['02s'] = roof_snow
roof_col = collections['02']
roof_col.asset_mark()
roof_col.asset_data.description = ('Reusable 29° gable roof for a 4.3 m span: rafters with exposed tails, ridge, '
                                   'collar ties, boarded deck, barge boards, fascia and a sculpted snow blanket. '
                                   'Origin at the wall-plate plane centre.')
roof_col.asset_data.author = 'PU Town / owner reference reconstruction'
for tag in ['Roof', 'Timber', 'Snow', 'Modular']:
    roof_col.asset_data.tags.new(tag)


# ---------------------------------------------------------------- materials
def srgb(hex_):
    v = [int(hex_[i:i+2], 16)/255 for i in (0, 2, 4)]
    return tuple(c/12.92 if c < .04045 else ((c+.055)/1.055)**2.4 for c in v)+(1,)


def principled(name, color, rough=.85, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.diffuse_color = srgb(color)
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = srgb(color)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    return m, m.node_tree.nodes, m.node_tree.links, p


BOARDS = bpy.data.images.load(str(ROOT/'textures'/'weathered-boards.png'), check_existing=True)
BOARDS.pack()
CELLS, CELL_W, CELL_H = 16, 0.28, 2.3


def timber(name, tint, saturation=1.0, value=1.0, frost=0.0, bump=.35, rough=.86):
    """Board atlas cut from the owner's side elevation, tinted, with optional frost."""
    m, n, l, p = principled(name, '5A5652', rough)
    uv = n.new('ShaderNodeUVMap')
    uv.uv_map = 'UVMap'
    tex = n.new('ShaderNodeTexImage')
    tex.image = BOARDS
    tex.interpolation = 'Cubic'
    l.new(uv.outputs[0], tex.inputs[0])
    hsv = n.new('ShaderNodeHueSaturation')
    hsv.inputs['Saturation'].default_value = saturation
    hsv.inputs['Value'].default_value = value
    l.new(tex.outputs['Color'], hsv.inputs['Color'])
    tinted = n.new('ShaderNodeMixRGB')
    tinted.blend_type = 'MULTIPLY'
    tinted.inputs[0].default_value = 1
    tinted.inputs[2].default_value = tint
    l.new(hsv.outputs[0], tinted.inputs[1])
    out = tinted.outputs[0]
    if frost:
        geo = n.new('ShaderNodeNewGeometry')
        normal = n.new('ShaderNodeSeparateXYZ')
        l.new(geo.outputs['Normal'], normal.inputs[0])
        up = n.new('ShaderNodeMapRange')
        up.inputs['From Min'].default_value, up.inputs['From Max'].default_value = .3, .95
        l.new(normal.outputs['Z'], up.inputs['Value'])
        position = n.new('ShaderNodeSeparateXYZ')
        l.new(geo.outputs['Position'], position.inputs[0])
        low = n.new('ShaderNodeMapRange')
        low.inputs['From Min'].default_value, low.inputs['From Max'].default_value = .85, .3
        l.new(position.outputs['Z'], low.inputs['Value'])
        zone = n.new('ShaderNodeMath')
        zone.operation = 'MAXIMUM'
        l.new(up.outputs[0], zone.inputs[0])
        l.new(low.outputs[0], zone.inputs[1])
        speck_noise = n.new('ShaderNodeTexNoise')
        speck_noise.inputs['Scale'].default_value = 18
        speck_noise.inputs['Detail'].default_value = 8
        speck = n.new('ShaderNodeMapRange')
        speck.inputs['From Min'].default_value, speck.inputs['From Max'].default_value = .5, .72
        l.new(speck_noise.outputs['Fac'], speck.inputs['Value'])
        amount = n.new('ShaderNodeMath')
        amount.operation = 'MULTIPLY'
        l.new(zone.outputs[0], amount.inputs[0])
        l.new(speck.outputs[0], amount.inputs[1])
        scaled = n.new('ShaderNodeMath')
        scaled.operation = 'MULTIPLY'
        scaled.inputs[1].default_value = frost
        l.new(amount.outputs[0], scaled.inputs[0])
        frosted = n.new('ShaderNodeMixRGB')
        frosted.inputs[2].default_value = srgb('CBD5E2')
        l.new(scaled.outputs[0], frosted.inputs[0])
        l.new(out, frosted.inputs[1])
        out = frosted.outputs[0]
    l.new(out, p.inputs['Base Color'])
    grey = n.new('ShaderNodeRGBToBW')
    l.new(tex.outputs['Color'], grey.inputs[0])
    relief = n.new('ShaderNodeBump')
    relief.inputs['Strength'].default_value = bump
    relief.inputs['Distance'].default_value = .004
    l.new(grey.outputs[0], relief.inputs['Height'])
    l.new(relief.outputs[0], p.inputs['Normal'])
    return m


def rings(name, light, dark, rim=None, count=7.0):
    """End grain: growth rings about each face's own centre (UVs are centred)."""
    m, n, l, p = principled(name, light, .9)
    uv = n.new('ShaderNodeUVMap')
    centre = n.new('ShaderNodeVectorMath')
    centre.operation = 'SUBTRACT'
    centre.inputs[1].default_value = (.5, .5, 0)
    l.new(uv.outputs[0], centre.inputs[0])
    wave = n.new('ShaderNodeTexWave')
    wave.wave_type = 'RINGS'
    wave.rings_direction = 'Z'      # circles in the face's UV plane, not stripes
    wave.inputs['Scale'].default_value = count
    wave.inputs['Distortion'].default_value = 3.5
    wave.inputs['Detail'].default_value = 3
    l.new(centre.outputs[0], wave.inputs['Vector'])
    ramp = n.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = srgb(dark)
    ramp.color_ramp.elements[1].color = srgb(light)
    ramp.color_ramp.elements[0].position = .25
    l.new(wave.outputs['Fac'], ramp.inputs[0])
    out = ramp.outputs[0]
    if rim:
        radius = n.new('ShaderNodeVectorMath')
        radius.operation = 'LENGTH'
        l.new(centre.outputs[0], radius.inputs[0])
        edge = n.new('ShaderNodeMapRange')
        edge.inputs['From Min'].default_value, edge.inputs['From Max'].default_value = .40, .47
        l.new(radius.outputs['Value'], edge.inputs['Value'])
        bark = n.new('ShaderNodeMixRGB')
        bark.inputs[2].default_value = srgb(rim)
        l.new(edge.outputs[0], bark.inputs[0])
        l.new(out, bark.inputs[1])
        out = bark.outputs[0]
    l.new(out, p.inputs['Base Color'])
    relief = n.new('ShaderNodeBump')
    relief.inputs['Strength'].default_value = .25
    relief.inputs['Distance'].default_value = .003
    l.new(wave.outputs['Fac'], relief.inputs['Height'])
    l.new(relief.outputs[0], p.inputs['Normal'])
    return m


def bark_material(name):
    m, n, l, p = principled(name, '4A4038', .95)
    uv = n.new('ShaderNodeUVMap')
    stretch = n.new('ShaderNodeVectorMath')
    stretch.operation = 'MULTIPLY'
    stretch.inputs[1].default_value = (28, 3, 1)
    l.new(uv.outputs[0], stretch.inputs[0])
    texture = n.new('ShaderNodeTexNoise')
    texture.inputs['Scale'].default_value = 2.2
    texture.inputs['Detail'].default_value = 9
    texture.inputs['Roughness'].default_value = .7
    l.new(stretch.outputs[0], texture.inputs['Vector'])
    ramp = n.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = srgb('3A332C')
    ramp.color_ramp.elements[1].color = srgb('8E8274')
    ramp.color_ramp.elements[0].position = .32
    ramp.color_ramp.elements[1].position = .72
    l.new(texture.outputs['Fac'], ramp.inputs[0])
    l.new(ramp.outputs[0], p.inputs['Base Color'])
    relief = n.new('ShaderNodeBump')
    relief.inputs['Strength'].default_value = .7
    relief.inputs['Distance'].default_value = .01
    l.new(texture.outputs['Fac'], relief.inputs['Height'])
    l.new(relief.outputs[0], p.inputs['Normal'])
    return m


def snow_material(name):
    m, n, l, p = principled(name, 'D3DCEA', .9)
    p.inputs['Subsurface Weight'].default_value = .12
    p.inputs['Subsurface Radius'].default_value = (.25, .32, .55)
    p.inputs['Subsurface Scale'].default_value = .04
    coords = n.new('ShaderNodeTexCoord')
    broad = n.new('ShaderNodeTexNoise')
    broad.inputs['Scale'].default_value = 1.6
    broad.inputs['Detail'].default_value = 5
    l.new(coords.outputs['Object'], broad.inputs['Vector'])
    ramp = n.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = srgb('C9D5E6')
    ramp.color_ramp.elements[1].color = srgb('F4F7FC')
    l.new(broad.outputs['Fac'], ramp.inputs[0])
    l.new(ramp.outputs[0], p.inputs['Base Color'])
    clumps = n.new('ShaderNodeTexVoronoi')
    clumps.inputs['Scale'].default_value = 18
    l.new(coords.outputs['Object'], clumps.inputs['Vector'])
    grain = n.new('ShaderNodeTexNoise')
    grain.inputs['Scale'].default_value = 140
    grain.inputs['Detail'].default_value = 4
    l.new(coords.outputs['Object'], grain.inputs['Vector'])
    height = n.new('ShaderNodeMath')
    height.operation = 'MULTIPLY_ADD'
    height.inputs[1].default_value = .35
    l.new(grain.outputs['Fac'], height.inputs[0])
    l.new(clumps.outputs['Distance'], height.inputs[2])
    relief = n.new('ShaderNodeBump')
    relief.inputs['Strength'].default_value = .3
    relief.inputs['Distance'].default_value = .015
    l.new(height.outputs[0], relief.inputs['Height'])
    l.new(relief.outputs[0], p.inputs['Normal'])
    return m


weathered = timber('Timber / weathered charcoal boards', (1.04, 1.0, .96, 1), saturation=1.1, frost=.3)
weathered_frame = timber('Timber / weathered frame', (1.0, .96, .92, 1), saturation=1.1, value=1.0, frost=.4, bump=.45)
porch_deck = timber('Timber / porch deck', (.95, .92, .88, 1), frost=.8)
lap = timber('Timber / warm interior lap', (1.25, .98, .74, 1), saturation=.5, value=.95, bump=.25, rough=.75)
floorwood = timber('Timber / oiled floor planks', (1.15, .84, .60, 1), saturation=.55, value=.85, bump=.2, rough=.6)
roof_timber = timber('Timber / roof framing and deck', (1.12, .98, .86, 1), saturation=.8, value=1.05, bump=.35)
end_weathered = rings('Timber / weathered end grain', '7B726A', '4B443E', count=5)
end_warm = rings('Timber / sawn end grain', 'B48E62', '7A5A3A', count=9)
log_end = rings('Firewood / split end grain', 'CDAE85', '9A7650', rim='4A3E33', count=11)
split_face = timber('Firewood / split face', (1.7, 1.18, .74, 1), saturation=.5, value=1.25, bump=.5)
bark = bark_material('Firewood / bark')
snow = snow_material('Snow / cold powder')
core = principled('Timber / raw cavity framing', '3B332B', .95)[0]
iron, n_, l_, p_ = principled('Iron / oxidised lamp steel', '2E3134', .5, .75)
inner_shade = principled('Iron / lamp shade enamel', 'D8C7A6', .45)[0]
bulb, n_, l_, p_ = principled('Lamp / warm bulb', 'FFD9A0', .3)
p_.inputs['Emission Color'].default_value = srgb('FFC27A')
p_.inputs['Emission Strength'].default_value = 18

root = bpy.data.objects.new('STORAGE_ROOM / 4.3 × 6.4 m + porch', None)
collections['01'].objects.link(root)
root.empty_display_size = .5
root['enclosed_room_outer_m'] = [W, L]
root['porch_depth_m'] = round(YF-(POST_Y-POST/2), 3)
root['door_clear_m'] = [DOOR_X1-DOOR_X0, round(PLATE_BOT-FLOOR, 3)]
root['door_centre_x_m'] = (DOOR_X0+DOOR_X1)/2
root['floor_top_m'] = FLOOR
root['eave_plate_top_m'] = PLATE_TOP
root['roof_pitch_deg'] = 29
root['window_count'] = 0
ROOF_PIVOT = Vector((0, (ROOF_F+ROOF_B)/2, PLATE_TOP))
roof_root = bpy.data.objects.new('ROOF / wall-plate plane centre', None)
roof_col.objects.link(roof_root)
roof_root.parent = root
roof_root.location = ROOF_PIVOT
roof_root.empty_display_type = 'ARROWS'
roof_root['span_m'] = W
roof_root['length_m'] = round(ROOF_B-ROOF_F, 3)
roof_root['pitch_deg'] = 29
roof_root['placement'] = 'Origin on the wall-plate plane at the roof centre; front gable faces -Y.'


# ---------------------------------------------------------------- geometry
class Part:
    """One merged mesh per logical part, with per-face materials and UVs."""

    def __init__(self, name, key, bevel=0.0):
        self.name, self.key, self.bevel = name, key, bevel
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new('UVMap')
        self.mats = []

    def index(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def hexa(self, corners, mat, end=None, grain=None, cell=None):
        """Closed six-sided timber: ring 0-3 then the opposite ring 4-7."""
        pts = [Vector(c) for c in corners]
        vs = [self.bm.verts.new(p) for p in pts]
        if grain is None:
            families = [pts[1]-pts[0]+pts[2]-pts[3], pts[3]-pts[0]+pts[2]-pts[1], pts[4]-pts[0]+pts[6]-pts[2]]
            grain = max(families, key=lambda v: v.length)
        g = Vector(grain).normalized()
        cell = rng.randrange(CELLS) if cell is None else cell
        extent = max(p.dot(g) for p in pts)-min(p.dot(g) for p in pts)
        shift = rng.uniform(0, max(0, 1-extent/CELL_H))-min(p.dot(g) for p in pts)/CELL_H
        for quad in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]:
            try:
                face = self.bm.faces.new([vs[i] for i in quad])
            except ValueError:
                continue
            face.normal_update()
            normal = face.normal
            corners_ = [pts[i] for i in quad]
            if abs(normal.dot(g)) > .7:
                face.material_index = self.index(end or mat)
                a = (corners_[1]-corners_[0]).normalized()
                b = normal.cross(a)
                centre = sum(corners_, Vector())/4
                size = max(max(abs((p-centre).dot(a)), abs((p-centre).dot(b))) for p in corners_)*2.05
                for loop, p in zip(face.loops, corners_):
                    loop[self.uv].uv = (.5+(p-centre).dot(a)/size, .5+(p-centre).dot(b)/size)
                continue
            face.material_index = self.index(mat)
            across = normal.cross(g).normalized()
            us = [p.dot(across) for p in corners_]
            low, width = min(us), max(max(us)-min(us), 1e-4)
            span = min(width/CELL_W, .9)
            start = rng.uniform(.05, .95-span)
            for loop, p, u in zip(face.loops, corners_, us):
                loop[self.uv].uv = ((cell+start+(u-low)/width*span)/CELLS, p.dot(g)/CELL_H+shift)

    def box(self, lo, hi, mat, end=None, cell=None, grain=None):
        (x0, y0, z0), (x1, y1, z1) = lo, hi
        self.hexa([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                   (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], mat, end, grain=grain, cell=cell)

    def beam(self, a, b, width, height, mat, end=None, up=(0, 0, 1)):
        a, b = Vector(a), Vector(b)
        g = (b-a).normalized()
        side = g.cross(Vector(up))
        if side.length < 1e-4:
            side = g.cross(Vector((0, 1, 0)))
        side.normalize()
        upv = side.cross(g)
        ring = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
        self.hexa([a+side*s*width/2+upv*u*height/2 for s, u in ring] +
                  [b+side*s*width/2+upv*u*height/2 for s, u in ring], mat, end, grain=g)

    def cylinder(self, base, axis, radius, length, side, end, segments=10, sector=1.0,
                 split=None, roll=0.0, wobble=.08, flat=1.0):
        """Log, stump or split billet. sector < 1 leaves split faces toward the pith."""
        axis = Vector(axis).normalized()
        u = axis.orthogonal().normalized()
        v = axis.cross(u)
        rot = Matrix.Rotation(roll, 3, axis)
        u, v = rot@u, rot@v
        full = sector >= .999
        count = segments if full else max(3, round(segments*sector))+1
        angles = [i/segments*math.tau for i in range(segments)] if full else \
                 [i/(count-1)*sector*math.tau for i in range(count)]
        seed = rng.random()*50

        def ring(offset):
            pts = [] if full else [base+axis*offset]
            for t in angles:
                r = radius*(1+wobble*n2(math.cos(t)*1.3, math.sin(t)*1.3, seed+offset))
                pts.append(base+axis*offset+u*math.cos(t)*r+v*math.sin(t)*r*flat)
            return pts
        rings_ = [ring(0), ring(length)]
        verts = [[self.bm.verts.new(p) for p in r] for r in rings_]
        n = len(verts[0])
        caps = [self.bm.faces.new(list(reversed(verts[0]))), self.bm.faces.new(verts[1])]
        for cap, pts in zip(caps, rings_):
            cap.material_index = self.index(end)
            centre = base if cap is caps[0] else base+axis*length
            for loop in cap.loops:
                d = loop.vert.co-centre
                loop[self.uv].uv = (.5+d.dot(u)/(2.1*radius), .5+d.dot(v)/(2.1*radius))
        for i in range(n):
            j = (i+1) % n
            face = self.bm.faces.new([verts[0][i], verts[0][j], verts[1][j], verts[1][i]])
            pith = not full and (i == 0 or i == n-1)
            face.material_index = self.index(split if pith and split else side)
            for loop in face.loops:
                d = loop.vert.co-base
                k = verts[0].index(loop.vert) if loop.vert in verts[0] else verts[1].index(loop.vert)
                loop[self.uv].uv = ((k+(1 if (k == 0 and i == n-1 and full) else 0))/n, d.dot(axis)/.6)

    def slab(self, us, vs, top, bottom, mat):
        """Closed sheet: top(u, v) and bottom(u, v) grids joined by a perimeter skirt."""
        nu, nv = len(us), len(vs)
        t = [[self.bm.verts.new(top(u, v)) for u in us] for v in vs]
        b = [[self.bm.verts.new(bottom(u, v)) for u in us] for v in vs]
        mi = self.index(mat)
        made = []
        for j in range(nv-1):
            for i in range(nu-1):
                made.append(self.bm.faces.new([t[j][i], t[j][i+1], t[j+1][i+1], t[j+1][i]]))
                made.append(self.bm.faces.new([b[j][i], b[j+1][i], b[j+1][i+1], b[j][i+1]]))
        ring = [(0, i) for i in range(nu)]+[(j, nu-1) for j in range(1, nv)] + \
               [(nv-1, i) for i in range(nu-2, -1, -1)]+[(j, 0) for j in range(nv-2, 0, -1)]
        for k, (j, i) in enumerate(ring):
            j2, i2 = ring[(k+1) % len(ring)]
            made.append(self.bm.faces.new([t[j][i], b[j][i], b[j2][i2], t[j2][i2]]))
        for face in made:
            face.material_index = mi
            face.smooth = True
            for loop in face.loops:
                co = loop.vert.co
                loop[self.uv].uv = (co.x*.25, co.y*.25)

    def finish(self, parent='root', origin=Vector()):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        if origin.length:
            bmesh.ops.translate(self.bm, verts=self.bm.verts, vec=-origin)
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        for mat in self.mats:
            me.materials.append(mat)
        ob = bpy.data.objects.new(self.name, me)
        collections[self.key].objects.link(ob)
        ob.parent = root if parent == 'root' else parent
        if self.bevel:
            mod = ob.modifiers.new('Worn arrises', 'BEVEL')
            mod.width = self.bevel
            mod.segments = 1
            mod.limit_method = 'ANGLE'
            mod.angle_limit = math.radians(35)
        return ob


def snow_cap(part, x0, x1, y0, y1, z, height, seed, rise_x=None, droop=.02):
    """Rounded snow pillow on a ledge; rise_x tilts it into a drift against a wall."""
    nu = max(5, int((x1-x0)/.05)+1)
    nv = max(5, int((y1-y0)/.05)+1)
    us = [i/(nu-1) for i in range(nu)]
    vs = [j/(nv-1) for j in range(nv)]

    def top(u, v):
        x, y = x0+(x1-x0)*u, y0+(y1-y0)*v
        edge = min(u, 1-u)*(x1-x0), min(v, 1-v)*(y1-y0)
        r = max(.015, min(height*1.4, .08))
        k = math.sqrt(max(0, 1-(1-min(edge[0]/r, 1))**2))*math.sqrt(max(0, 1-(1-min(edge[1]/r, 1))**2))
        h = height*(1+.35*n2(x*7, y*7, seed))
        if rise_x is not None:
            h *= .45+.55*(1-abs(x-rise_x)/max(abs(x1-rise_x), abs(x0-rise_x)))
        return (x, y, z+.004+max(.006, h*k)-droop*(1-k))

    def bottom(u, v):
        x, y = x0+(x1-x0)*u, y0+(y1-y0)*v
        edge = min(min(u, 1-u)*(x1-x0), min(v, 1-v)*(y1-y0))
        return (x, y, z+.002-droop*(1-min(edge/.03, 1)))
    part.slab(us, vs, top, bottom, snow)


# ---------------------------------------------------------------- timber shell
shell = Part('Shell / framed timber walls', '01', bevel=.007)
cavity = Part('Shell / wall cavity fill', '01')


def vertical_boards(part, axis, plane, outward, spans, z0, top):
    """Joint-to-joint vertical boards on a wall face; top(c) gives each board's top.

    outward is the sign of the wall's outer normal; boards lie just inside plane."""
    for lo, hi in spans:
        c = lo
        while c < hi-.05:
            w = min(rng.uniform(.22, .30), hi-c)
            if hi-(c+w) < .12:
                w = hi-c
            a, b = c+.004, c+w-.004
            c += w
            board(part, axis, plane, outward, a, b, z0, top(a), top(b))


def board(part, axis, plane, outward, a, b, z0, za, zb):
    t0, t1 = (plane-.045, plane) if outward > 0 else (plane, plane+.045)
    if axis == 'x':      # board spans along x on a wall plane y = const
        pts = [(a, t0, z0), (b, t0, z0), (b, t1, z0), (a, t1, z0), (a, t0, za), (b, t0, zb), (b, t1, zb), (a, t1, za)]
    else:
        pts = [(t0, a, z0), (t1, a, z0), (t1, b, z0), (t0, b, z0), (t0, a, za), (t1, a, za), (t1, b, zb), (t0, b, zb)]
    part.hexa(pts, weathered, end_weathered, grain=(0, 0, 1))


flat = (lambda _c: PLATE_BOT)
gable = (lambda c: rb(c)+.01)    # tucked under the rafter: no sight line along the ridge
for sx in (-1, 1):
    vertical_boards(shell, 'y', sx*W/2, sx, [(YF+.23, YB-.23)], .36, flat)
    cavity.box((min(sx*(W/2-.045), sx*(W/2-INNER+.03)), YF+.05, .30),
               (max(sx*(W/2-.045), sx*(W/2-INNER+.03)), YB-.05, PLATE_BOT), core)
for y, sy in ((YF, -1), (YB, 1)):
    spans = [(-W/2+.23, DOOR_X0-.10), (DOOR_X1+.10, W/2-.23)] if y == YF else [(-W/2+.23, W/2-.23)]
    vertical_boards(shell, 'x', y, sy, spans, FLOOR if y == YF else .36, flat)
    vertical_boards(shell, 'x', y, sy, [(-1.95, 0), (0, 1.95)], PLATE_TOP, gable)
    inner = y-sy*.045, y-sy*(INNER-.03)
    if y == YF:
        cavity.box((-W/2+.05, min(inner), .30), (DOOR_X0-.10, max(inner), PLATE_BOT), core)
        cavity.box((DOOR_X1+.10, min(inner), .30), (W/2-.05, max(inner), PLATE_BOT), core)
    else:
        cavity.box((-W/2+.05, min(inner), .30), (W/2-.05, max(inner), PLATE_BOT), core)
    # Gable cavity: two sloped halves under the rafter line.
    lo, hi = min(inner), max(inner)
    for sx in (-1, 1):
        x0, x1 = sorted((0, sx*1.95))
        cavity.hexa([(x0, lo, PLATE_TOP), (x1, lo, PLATE_TOP), (x1, hi, PLATE_TOP), (x0, hi, PLATE_TOP),
                     (x0, lo, rb(x0)-.01), (x1, lo, rb(x1)-.01), (x1, hi, rb(x1)-.01), (x0, hi, rb(x0)-.01)], core)

# Corner posts, plinths, sills and plates.
for sx in (-1, 1):
    for y, sy in ((YF, -1), (YB, 1)):
        cx, cy = sx*(W/2-.10), y-sy*.10
        shell.box((cx-.13, cy-.13, .38), (cx+.13, cy+.13, PLATE_BOT), weathered_frame, end_weathered)
        px = sorted((sx*(W/2-.19), sx*(W/2+.18)))
        py = sorted((y-sy*.19, y+sy*.18))
        shell.box((px[0], py[0], 0), (px[1], py[1], .38), weathered_frame, end_weathered, grain=(0, 0, 1))
    shell.box((sx*(W/2-.19) if sx > 0 else -W/2-.06, YF+.19, .06),
              (W/2+.06 if sx > 0 else -(W/2-.19), YB-.19, .36), weathered_frame, end_weathered)
    shell.box((sx*(W/2-.20) if sx > 0 else -W/2, YF, PLATE_BOT),
              (W/2 if sx > 0 else -(W/2-.20), YB, PLATE_TOP), weathered_frame, end_weathered)
shell.box((-W/2+.19, YF-.06, .06), (W/2-.19, YF+.19, FLOOR), weathered_frame, end_weathered)
shell.box((-W/2+.19, YB-.19, .06), (W/2-.19, YB+.06, .36), weathered_frame, end_weathered)
for y, sy in ((YF, -1), (YB, 1)):
    lo, hi = sorted((y, y-sy*.20))
    shell.box((-W/2+.20, lo, PLATE_BOT), (W/2-.20, hi, PLATE_TOP), weathered_frame, end_weathered)

# Doorway into the room: jambs, threshold; the front wall plate is its lintel.
for x0, x1 in ((DOOR_X0-.10, DOOR_X0), (DOOR_X1, DOOR_X1+.10)):
    shell.box((x0, YF-.03, FLOOR), (x1, YF+INNER+.02, PLATE_BOT), weathered_frame, end_weathered)
shell.box((DOOR_X0, YF-.03, FLOOR-.03), (DOOR_X1, YF+INNER, FLOOR), floorwood, end_warm)

# Open porch: plinths, posts, tie beam, side beams, knee braces, gable infill, king block.
for sx in (-1, 1):
    x = sx*POST_X
    shell.box((x-.25, POST_Y-.25, 0), (x+.25, POST_Y+.25, .40), weathered_frame, end_weathered, grain=(0, 0, 1))
    shell.box((x-POST/2, POST_Y-POST/2, .40), (x+POST/2, POST_Y+POST/2, PLATE_TOP), weathered_frame, end_weathered)
    shell.box((x-.09, POST_Y+POST/2, PLATE_TOP+.02), (x+.09, YF, PLATE_TOP+.24), weathered_frame, end_weathered)
    shell.beam((x-sx*.20, POST_Y, 1.70), (x-sx*.60, POST_Y, PLATE_TOP+.02), .12, .13, weathered_frame,
               end_weathered, up=(0, 1, 0))
    shell.beam((x, POST_Y+.12, 1.86), (x, POST_Y+.58, PLATE_TOP+.06), .12, .12, weathered_frame,
               end_weathered, up=(1, 0, 0))
    # Porch side sill from the post plinth back to the room's corner plinth.
    shell.box((x-.10, POST_Y+.25, .06), (x+.10, YF-.06, .27), weathered_frame, end_weathered)
shell.box((-W/2, POST_Y-.13, PLATE_TOP), (W/2, POST_Y+.13, PLATE_TOP+.26), weathered_frame, end_weathered)
shell.box((-POST_X+.25, POST_Y-.13, .06), (POST_X-.25, POST_Y+.13, FLOOR), weathered_frame, end_weathered)
for c, end in ((-1.69, 0), (0, 1.69)):     # split on the ridge line, like the walls' gables
    while c < end-.05:
        w = min(rng.uniform(.19, .25), end-c)
        if end-(c+w) < .1:
            w = end-c
        a, b = c+.004, c+w-.004
        c += w
        shell.hexa([(a, POST_Y-.02, PLATE_TOP+.26), (b, POST_Y-.02, PLATE_TOP+.26), (b, POST_Y+.025, PLATE_TOP+.26),
                    (a, POST_Y+.025, PLATE_TOP+.26), (a, POST_Y-.02, rb(a)+.01), (b, POST_Y-.02, rb(b)+.01),
                    (b, POST_Y+.025, rb(b)+.01), (a, POST_Y+.025, rb(a)+.01)], weathered, end_weathered, grain=(0, 0, 1))
shell.box((-.12, POST_Y-.13, rb(0)-.42), (.12, POST_Y+.03, rb(.12)+.02), weathered_frame, end_weathered)
shell.finish()
cavity.finish()

porch = Part('Porch / deck boards', '01', bevel=.005)
y = POST_Y+.13
porch.box((-POST_X+.22, POST_Y-.12, .12), (POST_X-.22, YF-.02, .265), core)
while y < YF-.02:
    w = min(rng.uniform(.15, .19), YF-y)
    porch.box((-POST_X-.02, y+.003, .265), (POST_X+.02, y+w-.003, FLOOR), porch_deck, end_weathered)
    y += w
porch.finish()

# ---------------------------------------------------------------- roof (separable)
roof = Part('Roof / rafters, ridge and collar ties', '02', bevel=.006)
RAFTERS = [POST_Y]+[YF+.06+i*(L-.12)/5 for i in range(6)]
for i, yc in enumerate(RAFTERS):
    y0, y1 = yc-RAFTER_W/2, yc+RAFTER_W/2
    for sx in (-1, 1):
        xa, xb = sx*.06, sx*TAIL_X
        roof.hexa([(xa, y0, rb(xa)), (xa, y1, rb(xa)), (xa, y1, rb(xa)+RAFTER_D/COS), (xa, y0, rb(xa)+RAFTER_D/COS),
                   (xb, y0, rb(xb)), (xb, y1, rb(xb)), (xb, y1, rb(xb)+RAFTER_D/COS), (xb, y0, rb(xb)+RAFTER_D/COS)],
                  roof_timber, end_weathered, grain=(sx*COS, 0, -SIN))
    if 1 < i < 6:
        tie = PLATE_TOP+.62
        half = W/2-(tie-PLATE_TOP)/TAN
        roof.box((-half, y1, tie), (half, y1+.08, tie+.16), roof_timber, end_weathered)
roof.box((-.06, ROOF_F+.05, RT0-.26), (.06, ROOF_B-.05, RT0), roof_timber, end_weathered)
# Eave blocking closes the gap between the wall plate and the deck along the room.
for sx in (-1, 1):
    xi, xo = sx*(W/2-.20), sx*W/2
    top = lambda x: rb(x)+RAFTER_D/COS-.005
    roof.hexa([(xi, YF, PLATE_TOP), (xo, YF, PLATE_TOP), (xo, YB, PLATE_TOP), (xi, YB, PLATE_TOP),
               (xi, YF, top(xi)), (xo, YF, top(xo)), (xo, YB, top(xo)), (xi, YB, top(xi))],
              roof_timber, end_weathered, grain=(0, 1, 0))
roof_frame = roof.finish(roof_root, ROOF_PIVOT)

deck = Part('Roof / boarded deck, barge boards and fascia', '02', bevel=.004)
s_end = EAVE_X/COS
for sx in (-1, 1):
    s = 0.0
    while s < s_end-.02:
        w = min(rng.uniform(.16, .21), s_end-s)
        pts = []
        for y in (ROOF_F, ROOF_B):
            for ss, nn in ((s+.003, 0), (s+w-.003, 0), (s+w-.003, DECK), (s+.003, DECK)):
                pts.append((sx*(ss*COS+nn*SIN), y, RT0-ss*SIN+nn*COS))
        deck.hexa(pts, roof_timber, end_weathered, grain=(0, 1, 0))
        s += w
    # Barge boards cross at the apex as in the front elevation; plumb cut at the eave.
    for y0, y1 in ((ROOF_F-.06, ROOF_F), (ROOF_B, ROOF_B+.06)):
        xa, xb = 0, sx*(EAVE_X+.03)
        top = lambda x: D0+.045-sx*x*TAN
        deck.hexa([(xa, y0, top(xa)-.30), (xa, y1, top(xa)-.30), (xa, y1, top(xa)), (xa, y0, top(xa)),
                   (xb, y0, top(xb)-.30), (xb, y1, top(xb)-.30), (xb, y1, top(xb)), (xb, y0, top(xb))],
                  weathered_frame, end_weathered, grain=(sx*COS, 0, -SIN))
    x0, x1 = sorted((sx*(EAVE_X-.045), sx*EAVE_X))
    deck.box((x0, ROOF_F, deck_top(EAVE_X)-.17), (x1, ROOF_B, deck_top(EAVE_X)+.01), weathered_frame, end_weathered)
deck.finish(roof_root, ROOF_PIVOT)

# Snow blanket: thick, rounded at the ridge, scalloped lip drooping between rafter tails.
S_DECK = EAVE_X/COS
S_TIP = S_DECK+.02
TAILS = [POST_Y]+RAFTERS[1:]


def droop(y):
    gap = min(abs(y-t) for t in TAILS)
    spacing = (L-.12)/5
    return .075*math.sin(min(gap/spacing, .5)*math.pi)**1.4*(.75+.35*n2(y*1.7, 3.1, 9))+.015


def lip(sa, y):
    sag = droop(y)*smooth(S_DECK-.03, S_TIP+.04, abs(sa))
    return sag


def snow_frame(sa):
    s = abs(sa)
    sg = 1 if sa >= 0 else -1
    phi = PITCH*smooth(0, .07, s)
    return s, sg, Vector((sg*math.sin(phi), 0, math.cos(phi)))


def spread(n, power=.55):
    """0..1 samples clustered toward both ends."""
    out = []
    for i in range(n):
        t = i/(n-1)
        c = .5-.5*math.cos(math.pi*t)
        out.append(power*c+(1-power)*t)
    return out


def eave_tip(y):
    return S_TIP+.035*n2(y*1.9, .4, 3)+.03*n2(y*4.5, .9, 13)


def gable_edges(s):
    return (ROOF_F-.05+.04*n2(s*2.1, 1.7, 4)+.02*n2(s*7, 1.2, 14),
            ROOF_B+.05+.04*n2(s*2.3, 2.9, 5)+.02*n2(s*7, 2.2, 15))


Y_NOM = ROOF_F-.05, ROOF_B+.05


def snow_point(u, v, upper):
    y_nom = Y_NOM[0]+v*(Y_NOM[1]-Y_NOM[0])
    tip = eave_tip(y_nom)
    sa = u*tip
    s, sg, normal = snow_frame(sa)
    g0, g1 = gable_edges(s)
    y = g0+v*(g1-g0)
    base = Vector((sg*s*COS, y, D0-s*SIN))
    if not upper:
        under = .006-max(0, s-S_DECK)*.42
        return tuple(base+normal*under-Vector((0, 0, lip(sa, y))))
    thick = SNOW*(1+.10*n2(sa*.7, y*.5, 6))+.04*(1-smooth(0, .3, s))
    r = .24
    k = math.sqrt(max(0, 1-(1-min((tip-s)/r, 1))**2))*math.sqrt(max(0, 1-(1-min(min(y-g0, g1-y)/r, 1))**2))
    lumps = .03*n2(sa*2.2, y*2.6, 7)+.014*n2(sa*7, y*7, 8)+.006*n2(sa*20, y*20, 16)
    under = .006-max(0, s-S_DECK)*.42
    height = max(under+.025, thick*k+lumps*k)
    return tuple(base+normal*height-Vector((0, 0, lip(sa, y))))


blanket = Part('Roof snow / sculpted blanket', '02s')
us = [2*t-1 for t in spread(73, .6)]
vs = spread(61, .45)
blanket.slab(us, vs, lambda u, v: snow_point(u, v, True), lambda u, v: snow_point(u, v, False), snow)
blanket.finish(roof_root, ROOF_PIVOT)

# ---------------------------------------------------------------- interior
floor = Part('Floor / staggered planks', '05', bevel=.003)
floor.box((-W/2+INNER-.01, YF+INNER-.01, .10), (W/2-INNER+.01, YB-INNER+.01, FLOOR-.03), core)
x = -W/2+INNER
row = 0
while x < W/2-INNER-.02:
    w = min(rng.uniform(.17, .21), W/2-INNER-x)
    y = YF+INNER
    first = rng.uniform(.5, 1.9)
    length = first
    while y < YB-INNER-.02:
        length = min(length, YB-INNER-y)
        floor.box((x+.0025, y+.0025, FLOOR-.03), (x+w-.0025, y+length-.0025, FLOOR), floorwood, end_warm)
        y += length
        length = rng.uniform(1.5, 2.6)
    x += w
    row += 1
floor.finish()

lining = Part('Lining / lapped interior boards', '06', bevel=.003)
EXPOSE, LAP_T = .175, .024


def lap_rows(z_top_limit):
    z = FLOOR
    while z < z_top_limit-.02:
        yield z, min(z+EXPOSE+.02, z_top_limit)
        z += EXPOSE


for sx in (-1, 1):
    face = sx*(W/2-INNER)
    for z0, z1 in lap_rows(PLATE_BOT):
        inner_lo, inner_hi = face-sx*(LAP_T+.012), face-sx*LAP_T
        y = YF+INNER
        first = True
        while y < YB-INNER-.02:
            length = min(rng.uniform(.5, 2.4) if first else rng.uniform(1.8, 3.0), YB-INNER-y)
            first = False
            ya, yb = y+.002, y+length-.002
            pts = [(face, ya, z0), (face, yb, z0), (inner_lo, yb, z0), (inner_lo, ya, z0),
                   (face, ya, z1), (face, yb, z1), (inner_hi, yb, z1), (inner_hi, ya, z1)]
            lining.hexa(pts, lap, end_warm, grain=(0, 1, 0))
            y += length
for y, sy in ((YF, -1), (YB, 1)):
    face = y-sy*INNER

    def half_width(z):
        return min(W/2-INNER, W/2-(z-PLATE_TOP)/TAN-.03) if z > PLATE_TOP else W/2-INNER
    for z0, z1 in lap_rows(rb(0)-.05):
        h0, h1 = half_width(z0), half_width(z1)
        if h1 < .06:
            break
        spans = [(None, None)]
        if y == YF and z0 < PLATE_BOT:
            spans = [(None, DOOR_X0-.10), (DOOR_X1+.10, None)]
        for a, b in spans:
            a0, a1 = (-h0 if a is None else a), (h0 if b is None else b)
            b0, b1 = (-h1 if a is None else a), (h1 if b is None else b)
            off_lo, off_hi = face-sy*(LAP_T+.012), face-sy*LAP_T
            pts = [(a0, face, z0), (a1, face, z0), (a1, off_lo, z0), (a0, off_lo, z0),
                   (b0, face, z1), (b1, face, z1), (b1, off_hi, z1), (b0, off_hi, z1)]
            if (a1-a0) > .05:
                lining.hexa(pts, lap, end_warm, grain=(1, 0, 0))
lining.finish()

# ---------------------------------------------------------------- lamps
def dish_lamp(key, name, hang, arm_from, power, shade_r=.24):
    """Iron dish shade on a gooseneck arm, warm bulb, and its light."""
    part = Part(name+' / iron and bulb', key)
    x, y, z = hang
    part.beam(arm_from, (x, y, arm_from[2]), .035, .035, iron, iron)
    part.beam((x, y, arm_from[2]+.02), (x, y, z+.13), .025, .025, iron, iron)
    segments = 24
    top, rim = [], []
    for i in range(segments):
        t = i/segments*math.tau
        top.append(Vector((x+math.cos(t)*.055, y+math.sin(t)*.055, z+.13)))
        rim.append(Vector((x+math.cos(t)*shade_r, y+math.sin(t)*shade_r, z)))
    outer = [part.bm.verts.new(p) for p in top+rim]
    inner = [part.bm.verts.new(p-Vector((0, 0, .012))) for p in top+rim]
    mi, ms = part.index(iron), part.index(inner_shade)
    for i in range(segments):
        j = (i+1) % segments
        f = part.bm.faces.new([outer[i], outer[j], outer[segments+j], outer[segments+i]])
        f.material_index = mi
        f.smooth = True
        f = part.bm.faces.new([inner[segments+i], inner[segments+j], inner[j], inner[i]])
        f.material_index = ms
        f.smooth = True
        f = part.bm.faces.new([outer[segments+i], outer[segments+j], inner[segments+j], inner[segments+i]])
        f.material_index = mi
    part.bm.faces.new([outer[i] for i in range(segments)]).material_index = mi
    part.bm.faces.new([inner[i] for i in reversed(range(segments))]).material_index = ms
    part.cylinder(Vector((x, y, z+.04)), (0, 0, 1), .03, .07, iron, iron, segments=12, wobble=0)
    ob = part.finish()
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=1, location=(x, y, z-.035))
    globe = bpy.context.object
    for c in list(globe.users_collection):
        c.objects.unlink(globe)
    collections[key].objects.link(globe)
    globe.name = name+' / bulb'
    globe.scale = (.05, .05, .06)
    globe.data.materials.append(bulb)
    globe.parent = root
    globe.visible_shadow = False
    data = bpy.data.lights.new(name+' / 2300 K', 'POINT')
    data.energy = power
    data.color = (1.0, .58, .26)
    data.shadow_soft_size = .035
    light = bpy.data.objects.new(name+' / 2300 K', data)
    collections[key].objects.link(light)
    light.location = (x, y, z-.06)
    light.parent = root
    return ob


dish_lamp('03', 'Porch lamp', (0, POST_Y-.30, rb(0)-.66), (0, POST_Y-.12, rb(0)-.25), 150)
dish_lamp('07', 'Interior lamp', (0, YB-INNER-.36, 2.02), (0, YB-INNER, 2.24), 110, shade_r=.20)

# ---------------------------------------------------------------- woodpile and stumps
pile = Part('Woodpile / split billets and stumps', '04')
pile_snow = Part('Woodpile / snow', '04')
for r, count in enumerate([4, 4, 3, 3, 2, 1]):
    rr = .13-.003*r
    left = -1.27+(rr*.95 if r % 2 else 0)+.02*r
    z = FLOOR+rr+r*rr*1.72
    for i in range(count):
        x = left+rr+i*1.94*rr
        y0 = YF-.47+rng.uniform(-.035, .035)
        if rng.random() < .3:
            pile.cylinder(Vector((x, y0, z-rr*.15)), (0, 1, 0), rr*1.08, .42+rng.uniform(-.03, .03), bark, log_end,
                          segments=12, sector=.5, split=split_face, roll=rng.uniform(-.3, .3), wobble=.08)
        else:
            pile.cylinder(Vector((x, y0, z)), (0, 1, 0), rr*rng.uniform(.98, 1.1), .42+rng.uniform(-.03, .03),
                          bark, log_end, segments=rng.choice([4, 5, 5, 6, 7]), roll=rng.uniform(0, math.tau),
                          wobble=.16, flat=rng.uniform(.8, 1.0))
    if r in (2, 4, 5):
        snow_cap(pile_snow, left+.04, left+count*1.94*rr-.02, YF-.48, YF-.36, z+rr*.85, .03, r+.5)
for x, radius, height in [(-.55, .20, .50), (-.09, .21, .60), (-.29, .11, .26)]:
    base = Vector((x, YF-.62+rng.uniform(-.04, .04), FLOOR))
    pile.cylinder(base, (0, 0, 1), radius, height, bark, log_end, segments=22, wobble=.06)
    snow_cap(pile_snow, x-radius*.62, x+radius*.5, base.y-radius*.6, base.y+radius*.45, FLOOR+height, .035, x)
pile.finish()
pile_snow.finish()

# ---------------------------------------------------------------- snow on timber
caps = Part('Snow / ledges, plinths and drifts against the walls', '08')
for sx in (-1, 1):
    x0, x1 = sorted((sx*W/2-sx*.005, sx*(W/2+.11)))
    snow_cap(caps, x0, x1, YF+.19, YB-.19, .36, .13, sx, rise_x=sx*W/2)
    for y, sy in ((YF, -1), (YB, 1)):
        px = sorted((sx*(W/2-.05), sx*(W/2+.20)))
        py = sorted((y+sy*.02, y+sy*.20))
        snow_cap(caps, px[0], px[1], py[0], py[1], .38, .08, sx+y)
    snow_cap(caps, sx*POST_X-.27, sx*POST_X+.27, POST_Y-.27, POST_Y+.27, .40, .06, sx*3)
snow_cap(caps, -W/2+.19, W/2-.19, YB-.01, YB+.11, .36, .08, 11, droop=.02, rise_x=None)
snow_cap(caps, -POST_X+.16, POST_X-.16, POST_Y-.14, POST_Y+.05, PLATE_TOP+.26, .05, 12)
snow_cap(caps, -POST_X+.26, POST_X-.26, POST_Y-.13, POST_Y+.32, FLOOR, .03, 13, droop=.0)
caps.finish()


# ---------------------------------------------------------------- review stage (not part of the asset)
def stage_object(name, data=None):
    ob = bpy.data.objects.new(name, data)
    collections['90'].objects.link(ob)
    return ob


def camera(name, location, target, lens=None, ortho=None, res=(1536, 1024), **props):
    data = bpy.data.cameras.new(name)
    if ortho:
        data.type = 'ORTHO'
        data.ortho_scale = ortho
    else:
        data.lens = lens or 35
    data.clip_end = 200
    ob = stage_object('VIEW / '+name, data)
    ob.location = location
    ob.rotation_euler = (Vector(target)-Vector(location)).to_track_quat('-Z', 'Y').to_euler()
    ob['res'] = res
    for k, v in props.items():
        ob[k] = v
    return ob


def light(name, kind, location, target, power, color=(1, 1, 1), size=1.0, group='studio'):
    data = bpy.data.lights.new(name, kind)
    data.energy = power
    data.color = color
    if kind == 'AREA':
        data.shape = 'DISK'
        data.size = size
    elif kind == 'SUN':
        data.angle = math.radians(size)
    ob = stage_object('LIGHT / '+name, data)
    ob.location = location
    ob.rotation_euler = (Vector(target)-Vector(location)).to_track_quat('-Z', 'Y').to_euler()
    ob['group'] = group
    return ob


def world(name, top, bottom, strength):
    old = bpy.data.worlds.get(name)
    if old:
        bpy.data.worlds.remove(old)
    w = bpy.data.worlds.new(name)
    w.use_fake_user = True
    w.use_nodes = True
    n, l = w.node_tree.nodes, w.node_tree.links
    bg = n['Background']
    coords = n.new('ShaderNodeTexCoord')
    direction = n.new('ShaderNodeSeparateXYZ')
    l.new(coords.outputs['Generated'], direction.inputs[0])
    height = n.new('ShaderNodeMapRange')
    height.inputs['From Min'].default_value, height.inputs['From Max'].default_value = -.2, .8
    l.new(direction.outputs['Z'], height.inputs['Value'])
    ramp = n.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = srgb(bottom)
    ramp.color_ramp.elements[1].color = srgb(top)
    l.new(height.outputs[0], ramp.inputs[0])
    l.new(ramp.outputs[0], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = strength
    return w


world('Studio / cool grey', 'B9C3D1', '5B6470', .8)
world('Blizzard / polar twilight', '8593A8', '4C586C', .65)
light('Studio key', 'SUN', (7, -9, 11), (0, 0, 0), 3.2, (.95, .97, 1.0), 25)
light('Studio fill', 'SUN', (-9, -6, 6), (0, 0, 0), 1.2, (.85, .9, 1.0), 40)
light('Overcast sun', 'SUN', (-10, -14, 20), (0, 0, 0), .9, (.74, .83, 1.0), 25, group='blizzard')

ground_part = Part('STAGE / snow ground', '90')
ground_part.slab([i/60 for i in range(61)], [j/60 for j in range(61)],
                 lambda u, v: (-150+300*u, -151+300*v, .02+.06*n2(u*60, v*60, 21)),
                 lambda u, v: (-150+300*u, -151+300*v, -.4), snow)
ground = ground_part.finish(parent=None)
drifts = Part('STAGE / drifts at the walls', '90')
for sx in (-1, 1):
    drifts.slab([i/24 for i in range(25)], [j/30 for j in range(31)],
                lambda u, v, sx=sx: (sx*(W/2+.06+.55*u), YF+.3+(L-.6)*v,
                                     .02+.22*(1-u)**1.6*(.6+.4*n2(v*7, sx, 22))*math.sin(math.pi*v)**.35),
                lambda u, v, sx=sx: (sx*(W/2+.06+.55*u), YF+.3+(L-.6)*v, 0), snow)
drifts.finish(parent=None)

# A 1.7 m figure gives scale to the inspection renders only.
bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=.24, depth=1.42, location=(2.55, -4.6, .73))
figure = bpy.context.object
for c_ in list(figure.users_collection):
    c_.objects.unlink(figure)
collections['90'].objects.link(figure)
figure.name = 'STAGE / 1.7 m scale figure'
bpy.ops.mesh.primitive_uv_sphere_add(radius=.14, location=(2.55, -4.6, 1.56))
head = bpy.context.object
for c_ in list(head.users_collection):
    c_.objects.unlink(head)
collections['90'].objects.link(head)
head.name = 'STAGE / scale figure head'
parka = principled('STAGE / dark parka', '1E2226', .8)[0]
figure.data.materials.append(parka)
head.data.materials.append(parka)
figure['group'] = head['group'] = 'ground'

mid = (ROOF_F-.1+ROOF_B+.1)/2
camera('front', (0, -30, 2.24), (0, 0, 2.24), ortho=8.0, world='Studio / cool grey', transparent=True, display='Standard')
camera('side', (30*math.cos(math.radians(6)), mid-30*math.sin(math.radians(6)), 2.25+30*math.tan(math.radians(3))),
       (0, mid, 2.25), ortho=9.4, world='Studio / cool grey', transparent=True, display='Standard')
camera('plan', (0, mid, 40), (0, mid, 0), ortho=9.4, res=(1060, 1484), world='Studio / cool grey', transparent=True, display='Standard')
camera('top3q', (0, mid-13, 24.2), (0, mid, 2.2), ortho=11.4, res=(1024, 1536), world='Studio / cool grey', transparent=True, display='Standard')
camera('hero', (7.4, -10.6, 8.9), (-.2, -.4, 1.2), lens=29, world='Blizzard / polar twilight', ground=True)
camera('entry', (-1.0, -8.2, 1.65), (.25, -1.5, 1.35), lens=30, world='Blizzard / polar twilight', ground=True)
camera('cutaway', (7.5, -9.5, 11.5), (0, -.3, .6), lens=40, world='Studio / cool grey', roof=False, ground=True)
camera('inside', (1.2, -2.25, 1.62), (-.35, 2.6, 1.3), lens=17, world='Blizzard / polar twilight', ground=True)
camera('roof', (-9.5, -12.5, 10), (0, mid, 2.8), lens=38, world='Studio / cool grey', roof_only=True, transparent=True)
scene.camera = bpy.data.objects['VIEW / hero']
scene.render.engine = 'CYCLES'
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'

# ---------------------------------------------------------------- report and save
bpy.context.view_layer.update()
asset_objects = [o for o in asset.all_objects]
triangles = 0
for o in asset_objects:
    if o.type == 'MESH':
        ev = o.evaluated_get(bpy.context.evaluated_depsgraph_get())
        m = ev.to_mesh()
        m.calc_loop_triangles()
        triangles += len(m.loop_triangles)
        ev.to_mesh_clear()
report = {'pass': PASS, 'enclosed_room_outer_m': [W, L], 'porch_post_line_y_m': POST_Y,
          'plate_top_m': PLATE_TOP, 'ridge_deck_top_m': round(D0, 3), 'pitch_deg': 29,
          'roof_extent_y_m': [round(ROOF_F, 3), round(ROOF_B, 3)],
          'door_clear_m': [round(DOOR_X1-DOOR_X0, 3), round(PLATE_BOT-FLOOR, 3)], 'floor_top_m': FLOOR,
          'asset_objects': len(asset_objects), 'evaluated_triangles': triangles,
          'blender_version': bpy.app.version_string}
(OUT/f'pass-{PASS}-dimensions.json').write_text(json.dumps(report, indent=2)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(MASTER))
print(json.dumps(report))
