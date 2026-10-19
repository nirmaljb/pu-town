"""Inspect the saved Blender artifact, independently of the authoring inputs."""
import bpy
import bmesh
import json
from mathutils import Vector
from pathlib import Path

s = bpy.context.scene
asset = bpy.data.collections['Generator']
root = bpy.data.objects['GENERATOR / 2.40 × 1.20 m']
objects = list(asset.all_objects)
depsgraph = bpy.context.evaluated_depsgraph_get()
triangles, non_manifold = 0, {}
lo, hi = Vector((1e9,)*3), Vector((-1e9,)*3)
steel_hi = -1e9
for o in objects:
    if o.type != 'MESH':
        continue
    evaluated = o.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    mesh.calc_loop_triangles(); triangles += len(mesh.loop_triangles)
    bm = bmesh.new(); bm.from_mesh(mesh)
    bad = sum(not e.is_manifold for e in bm.edges)
    if bad:
        non_manifold[o.name] = bad
    bm.free()
    for v in mesh.vertices:
        w = o.matrix_world@v.co
        lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
        if not o.name.startswith('Snow /'):
            steel_hi = max(steel_hi, w.z)
    evaluated.to_mesh_clear()
hardware = [o for o in objects if o.type == 'MESH' and not o.name.startswith('Snow /')]
hw_lo = Vector((min((o.matrix_world@Vector(c)).x for o in hardware for c in o.bound_box),
                min((o.matrix_world@Vector(c)).y for o in hardware for c in o.bound_box), 0))
hw_hi = Vector((max((o.matrix_world@Vector(c)).x for o in hardware for c in o.bound_box),
                max((o.matrix_world@Vector(c)).y for o in hardware for c in o.bound_box), 0))


def first_hit(origin, direction, distance=4):
    hit, pos, normal, face, ob, matrix = s.ray_cast(depsgraph, Vector(origin), Vector(direction), distance=distance)
    return (ob.name if hit else None), pos


# The skid footprint and lid height match the reconstruction's dimensions.
assert abs((hw_hi.x-hw_lo.x)-2.40) < .002 and abs((hw_hi.y-hw_lo.y)-1.20) < .002, (hw_lo, hw_hi)
assert 1.005 < steel_hi < 1.016, steel_hi   # vent frames and bolts, about 70 mm above the 0.937 m lid
# Both roof vents stay open: looking straight down, the first thing seen is a vent part.
for x in (-.6, .6):
    for dx, dy in [(0, 0), (-.06, .06), (.06, -.06)]:
        name, pos = first_hit((x+dx, .03+dy, 2), (0, 0, -1))
        assert name and (name.startswith('Vent /') or name.startswith('Bolt /')), (x, dx, dy, name)
# The control panel is unobstructed from the front.
for u, z, part in [(.24, .70, 'Control / dead meter glass'), (.385, .615, 'Control / stop button')]:
    name, pos = first_hit((u, -2, z), (0, 1, 0))
    assert name == part, (u, z, name)
# Each louvre has its blades, and looking into a louvre meets a blade or its snow, not a panel.
blades = {}
for o in objects:
    if '/ blade' in o.name and o.name.startswith('Louvre'):
        key = o.name.split(' / blade')[0]; blades[key] = blades.get(key, 0)+1
assert blades == {'Louvre / front large': 10, 'Louvre / front small': 9, 'Louvre / back large': 10,
                  'Louvre / back small': 9, 'Louvre / east end': 9, 'Louvre / west end': 9}, blades
for x, z in [(-.5, .55), (.81, .5)]:
    name, pos = first_hit((x, -2, z), (0, 1, 0))
    assert name and name.startswith(('Louvre / front', 'Snow / front')), (x, z, name)
assert not non_manifold, non_manifold
assert not any(o.type in ('CAMERA', 'LIGHT') or o.name.startswith('STAGE') for o in objects)
standalone = Path(bpy.data.filepath).name == 'generator-asset.blend'
if standalone:
    assert len(bpy.data.scenes) == 1
    assert set(s.objects) == set(objects)
    assert asset.asset_data is not None
report = {'skid_footprint_m': [round(hw_hi.x-hw_lo.x, 4), round(hw_hi.y-hw_lo.y, 4)],
          'hardware_top_m': round(steel_hi, 4), 'top_of_snow_m': round(hi.z, 4),
          'overall_with_snow_m': [round(hi.x-lo.x, 4), round(hi.y-lo.y, 4), round(hi.z-lo.z, 4)],
          'evaluated_triangles': triangles, 'asset_objects': len(objects),
          'non_manifold_meshes': non_manifold, 'louvre_blades': blades,
          'open_vent_rays_passed': 6, 'control_panel_rays_passed': 2,
          'standalone_library_verified': standalone,
          'checks': 'Footprint, vent height, open vents, unobstructed controls, louvre blades, closed meshes, no review objects. Visual match reviewed separately.'}
p = Path(bpy.data.filepath).parent/'inspection.json'
p.write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report, indent=2))
