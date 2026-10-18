"""Inspect the saved Blender artifact, independently of the authoring inputs."""
import bpy
import bmesh
import json
from mathutils import Vector
from pathlib import Path

s=bpy.context.scene
root=bpy.data.objects['GENERATOR_ROOM / 8.8 × 3.8 m']
objects=list(root.children)
triangles=0
non_manifold={}
for o in objects:
    if o.type not in ('MESH','CURVE'):continue
    evaluated=o.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh=evaluated.to_mesh()
    mesh.calc_loop_triangles();triangles+=len(mesh.loop_triangles)
    if o.type=='MESH':
        bm=bmesh.new();bm.from_mesh(mesh)
        bad=sum(not e.is_manifold for e in bm.edges)
        if bad:non_manifold[o.name]=bad
        bm.free()
    evaluated.to_mesh_clear()

def bounds(o):
    vs=[o.matrix_world@Vector(v) for v in o.bound_box]
    return [[min(v[i] for v in vs) for i in range(3)],[max(v[i] for v in vs) for i in range(3)]]

jambs=sorted([o for o in objects if o.name.startswith('Entry / upright')],key=lambda o:o.location.x)
l,r=map(bounds,jambs)
width=r[0][0]-l[1][0]
height=min(l[1][2],r[1][2])
center=(l[1][0]+r[0][0])/2
assert abs(width-1.44)<1e-5,(width,'door clear width')
assert abs(height-2.1)<1e-5,(height,'door upright height')
assert abs(center-1.64)<1e-5,(center,'door centre')
assert not non_manifold,non_manifold
assert all(im.packed_file for im in bpy.data.images if im.source=='FILE' and im.users>0)
report={'measured_door_width_m':round(width,4),'measured_door_upright_height_m':round(height,4),
'measured_door_center_x_m':round(center,4),'evaluated_triangles':triangles,
'non_manifold_meshes':non_manifold,'asset_objects':len(objects),
'packed_images':[im.name for im in bpy.data.images if im.packed_file and im.users>0],
'checks':'Door jamb placement, closed mesh topology, embedded reference textures. Visual match reviewed separately.'}
p=Path(bpy.data.filepath).parent/'inspection.json'
p.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
