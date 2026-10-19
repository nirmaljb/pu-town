"""Inspect a saved storage-room file, independently of the authoring inputs.

Blender -b FILE.blend --python-exit-code 1 --python check_asset.py
Measures the doorway and floor by ray casts, proves the roof lifts off as one
collection, checks closed meshes, lights and packed textures, and writes
inspection.json beside the file. Artifact checks, not gameplay tests.
"""
import bpy
import bmesh
import json
import random
from mathutils import Vector
from pathlib import Path

scene = bpy.context.scene
layer = bpy.context.view_layer
asset = bpy.data.collections['Storage Room']
roof = bpy.data.collections['02 Roof']
root = next(o for o in asset.all_objects if o.name.startswith('STORAGE_ROOM'))
pivot = bpy.data.objects['ROOF / wall-plate plane centre']
W, L = root['enclosed_room_outer_m']
FLOOR = root['floor_top_m']
YF, YB = -L/2, L/2
door_x = root['door_centre_x_m']
for ob in scene.objects:          # review stage never takes part in a measurement
    if ob.name.startswith(('STAGE', 'VIEW', 'LIGHT')):
        ob.hide_viewport = True


def roof_layer(collection, children):
    for lc in children:
        if lc.collection == collection:
            return lc
        found = roof_layer(collection, lc.children)
        if found:
            return found


def cast(origin, direction, distance=20):
    layer.update()
    hit, location, _normal, _index, ob, _m = scene.ray_cast(layer.depsgraph, Vector(origin),
                                                            Vector(direction).normalized(), distance=distance)
    return (location, ob) if hit else (None, None)


def blocked_at_wall(x, z):
    """A ray from the porch toward the back wall stops within the front wall thickness."""
    location, _ob = cast((x, YF-.7, z), (0, 1, 0))
    return location is not None and location.y < YF+.3


def edge(lo, hi, test, steps=30):
    for _ in range(steps):
        mid = (lo+hi)/2
        lo, hi = (mid, hi) if not test(mid) else (lo, mid)
    return (lo+hi)/2


z_mid = FLOOR+1.0
left = edge(door_x, door_x-1.0, lambda x: blocked_at_wall(x, z_mid))
right = edge(door_x, door_x+1.0, lambda x: blocked_at_wall(x, z_mid))
head = edge(FLOOR+.5, FLOOR+3.0, lambda z: blocked_at_wall(door_x, z))
through = [cast((x, YF-.7, z), (0, 1, 0)) for x in (left+.05, door_x, right-.05) for z in (FLOOR+.1, FLOOR+1.0, head-.05)]
assert all(loc is not None and loc.y > YB-.5 for loc, _ob in through), 'doorway is obstructed'

# Planks are laid with 5 mm seams over a continuous subfloor 30 mm lower.
# Jittered samples, so a regular grid cannot line up with the plank seams.
jitter = random.Random(5)
floor_hits, floor_seams, floor_misses = 0, 0, []
x = -W/2+.32                      # the lapped lining stands 0.2 m inside each wall face
while x < W/2-.31:
    y = YF+.32
    while y < YB-.31:
        location, ob = cast((x+jitter.uniform(-.09, .09), y+jitter.uniform(-.09, .09), 1.75), (0, 0, -1))
        on_floor = location is not None and ob.name.startswith('Floor')
        if on_floor and abs(location.z-FLOOR) < .003:
            floor_hits += 1
        elif on_floor and abs(location.z-(FLOOR-.03)) < .003:
            floor_seams += 1
        else:
            floor_misses.append((round(x, 2), round(y, 2), ob.name if ob else None))
        y += .2
    x += .2
assert not floor_misses, floor_misses[:5]
assert floor_seams < .05*(floor_hits+floor_seams), (floor_seams, floor_hits)

roof_objects = set(roof.all_objects)
under_pivot = set(pivot.children_recursive)
assert roof_objects-{pivot} == under_pivot, 'roof collection and roof pivot hierarchy differ'

covered, _ob = cast((0, 0, 8), (0, 0, -1))
assert _ob.name.startswith('Roof snow'), _ob.name
roof_layer(roof, layer.layer_collection.children).exclude = True
open_from_above = 0
for xs in (-1.5, -.5, .5, 1.5):
    for ys in (YF+.6, 0, YB-.9):
        location, ob = cast((xs, ys, 8), (0, 0, -1))
        open_from_above += bool(ob and ob.name.startswith('Floor') and abs(location.z-FLOOR) < .003)
roof_layer(roof, layer.layer_collection.children).exclude = False
layer.update()
assert open_from_above == 12, open_from_above

triangles, non_manifold, meshes = 0, {}, 0
depsgraph = layer.depsgraph
for ob in asset.all_objects:
    if ob.type != 'MESH':
        continue
    meshes += 1
    evaluated = ob.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    mesh.calc_loop_triangles()
    triangles += len(mesh.loop_triangles)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bad = sum(not e.is_manifold for e in bm.edges)
    if bad:
        non_manifold[ob.name] = bad
    bm.free()
    evaluated.to_mesh_clear()
assert not non_manifold, non_manifold
lights = sorted(o.name for o in asset.all_objects if o.type == 'LIGHT')
assert len(lights) == 2, lights
images = [im for im in bpy.data.images if im.users and im.source == 'FILE']
assert images and all(im.packed_file for im in images), [im.name for im in images if not im.packed_file]

report = {
    'file': Path(bpy.data.filepath).name,
    'doorway_clear_width_m': round(right-left, 3),
    'doorway_clear_height_above_floor_m': round(head-FLOOR, 3),
    'doorway_centre_x_m': round((left+right)/2, 3),
    'rays_through_doorway_to_back_wall': len(through),
    'floor_samples_on_plank_tops': floor_hits,
    'floor_samples_in_plank_seams_on_subfloor': floor_seams,
    'roof_collection_objects_incl_pivot': len(roof_objects),
    'roof_hidden_room_open_from_above_samples': open_from_above,
    'evaluated_triangles': triangles,
    'asset_meshes': meshes,
    'non_manifold_meshes': non_manifold,
    'asset_lights': lights,
    'packed_images': [im.name for im in images],
    'window_count': root.get('window_count'),
    'checks': 'Ray-cast doorway and floor, roof separability, closed source meshes, lights, packed textures.',
}
(Path(bpy.data.filepath).parent/(Path(bpy.data.filepath).stem+'-inspection.json')).write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report, indent=2))
