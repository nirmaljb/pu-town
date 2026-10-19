"""Verify the standalone roof and its registration against saved shed files."""
import bpy
import bmesh
import json
import sys
from pathlib import Path
from mathutils import Vector

out=Path(bpy.data.filepath).parent/'roof-inspection.json'
args=sys.argv[sys.argv.index('--')+1:]
asset=bpy.data.collections['Snowy timber roof']
root=bpy.data.objects['ROOF / mounting plane centre']
objects=set(asset.all_objects)
assert len(bpy.data.scenes)==1 and set(bpy.context.scene.objects)==objects
assert asset.asset_data is not None
assert root.parent is None and root.location.length<1e-6
assert tuple(root.scale)==(1,1,1)
assert all(ob.parent is None or ob.parent in objects for ob in objects)
assert all(ob.type in {'EMPTY','MESH','CURVE'} for ob in objects)
assert all(im.packed_file for im in bpy.data.images if im.source=='FILE' and im.users>0)

def geometry(objects,offset=(0,0,0)):
    depsgraph=bpy.context.evaluated_depsgraph_get()
    result={};triangles=0;non_manifold={}
    for ob in objects:
        if ob.type not in {'MESH','CURVE'}:continue
        evaluated=ob.evaluated_get(depsgraph)
        mesh=evaluated.to_mesh();mesh.calc_loop_triangles()
        triangles+=len(mesh.loop_triangles)
        result[ob.name]=[tuple(ob.matrix_world@v.co-Vector(offset)) for v in mesh.vertices]
        if ob.type=='MESH':
            bm=bmesh.new();bm.from_mesh(mesh)
            bad=sum(not e.is_manifold for e in bm.edges)
            if bad:non_manifold[ob.name]=bad
            bm.free()
        evaluated.to_mesh_clear()
    return result,triangles,non_manifold

def compare(actual,expected):
    assert actual.keys()==expected.keys(),(actual.keys()-expected.keys(),expected.keys()-actual.keys())
    error=0
    for name,points in actual.items():
        assert len(points)==len(expected[name]),name
        for a,b in zip(points,expected[name]):
            error=max(error,(Vector(a)-Vector(b)).length)
    assert error<1e-5,error
    return error

independent,triangles,non_manifold=geometry(objects)
assert not non_manifold,non_manifold
points=[p for mesh in independent.values() for p in mesh]
lo=[min(p[i] for p in points) for i in range(3)]
hi=[max(p[i] for p in points) for i in range(3)]
deck=bpy.data.objects['Roof / solid deck'].data
deck_size=[max(v.co[i] for v in deck.vertices)-min(v.co[i] for v in deck.vertices) for i in range(3)]
assert abs(deck_size[0]-9.66)<1e-5 and abs(deck_size[1]-4.36)<1e-5,deck_size
report={'standalone_objects':len(objects),'evaluated_triangles':triangles,
        'nominal_deck_m':[round(x,4) for x in deck_size[:2]],
        'complete_bounds_m':[[round(x,5) for x in lo],[round(x,5) for x in hi]],
        'origin':'Centre of mounting plane; rafters below origin',
        'non_manifold_meshes':non_manifold,
        'packed_images':[im.name for im in bpy.data.images if im.packed_file and im.users>0],
        'self_contained_collection_asset':True}

bpy.ops.wm.open_mainfile(filepath=str(Path(args[0]).resolve()))
mount=bpy.data.objects['ROOF / mounting plane centre'].matrix_world.translation.copy()
assembled,_,_=geometry(bpy.data.collections['02 Roof and snow'].all_objects,mount)
report['roof_registration_max_error_m']=compare(independent,assembled)
report['shed_mounting_origin_m']=list(mount)
whole_shed,_,_=geometry(bpy.data.collections['Shed'].all_objects)
if len(args)>1:
    bpy.ops.wm.open_mainfile(filepath=str(Path(args[1]).resolve()))
    previous,_,_=geometry(bpy.data.collections['Shed'].all_objects)
    report['shed_geometry_change_max_error_m']=compare(whole_shed,previous)
out.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
