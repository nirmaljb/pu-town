"""Inspect the saved Blender artifact, independently of the authoring inputs."""
import bpy
import bmesh
import json
from mathutils import Vector
from pathlib import Path

s=bpy.context.scene
root=bpy.data.objects['SHED / 8.8 × 3.8 m']
asset=bpy.data.collections['Shed']
objects=list(asset.all_objects)
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
floor_top=.12
height=min(l[1][2],r[1][2])-floor_top
center=(l[1][0]+r[0][0])/2
assert abs(width-1.44)<1e-5,(width,'door clear width')
assert abs(height-2.1)<1e-5,(height,'door clear height above floor')
assert abs(center-1.64)<1e-5,(center,'door centre')
assert not non_manifold,non_manifold
assert all(im.packed_file for im in bpy.data.images if im.source=='FILE' and im.users>0)
# Cast through the actual open doorway. The first hit must be the far wall.
depsgraph=bpy.context.evaluated_depsgraph_get()
for z in [.35,1.1,2.05]:
    for x in [center-.55,center,center+.55]:
        hit,pos,normal,face,ob,matrix=s.ray_cast(depsgraph,Vector((x,-3,z)),Vector((0,1,0)),distance=6)
        at_back=hit and (pos.y>1.7 or (pos.y>1.5 and ob.name.startswith('Lamp /')))
        assert at_back,(x,z,ob.name if ob else None,tuple(pos),'doorway blocked')
# A dense floor sample also detects accidental interior props or a raised divider.
floor_samples=0
for j in range(17):
    y=-1.6+j*.2
    for i in range(42):
        x=-4.1+i*.2
        hit,pos,normal,face,ob,matrix=s.ray_cast(depsgraph,Vector((x,y,1.85)),Vector((0,0,-1)),distance=2)
        assert hit and ob.name.startswith('Floor /') and .085<=pos.z<=.121,(x,y,ob.name if ob else None,tuple(pos))
        floor_samples+=1
lamps=[o for o in objects if o.type=='LIGHT']
assert len(lamps)==1,[o.name for o in lamps]
assert not any(o.type=='CAMERA' or o.name.startswith('STAGE /') for o in objects)
standalone=Path(bpy.data.filepath).name=='shed.blend'
if standalone:
    assert len(bpy.data.scenes)==1
    assert set(s.objects)==set(objects)
    assert asset.asset_data is not None
report={'measured_door_width_m':round(width,4),'measured_door_clear_height_m':round(height,4),
'measured_door_center_x_m':round(center,4),'evaluated_triangles':triangles,
'non_manifold_meshes':non_manifold,'asset_objects':len(objects),
'floor_samples_passed':floor_samples,'doorway_rays_passed':9,'physical_lamps':len(lamps),
'standalone_library_verified':standalone,
'packed_images':[im.name for im in bpy.data.images if im.packed_file and im.users>0],
'checks':'Clear doorway into full room, continuous wooden floor, empty interior, one lamp, closed mesh topology and embedded textures. Visual match reviewed separately.'}
p=Path(bpy.data.filepath).parent/'inspection.json'
p.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
