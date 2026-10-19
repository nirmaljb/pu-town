"""Save a standalone shed, or roof with -- roof, in an isolated worker."""
import bpy
import sys
from pathlib import Path
from mathutils import Quaternion

roof_only='--' in sys.argv and sys.argv[sys.argv.index('--')+1:]==['roof']
out=Path(bpy.data.filepath).parent/('roof.blend' if roof_only else 'shed.blend')
if roof_only:
    asset=bpy.data.collections['02 Roof and snow']
    asset.name='Snowy timber roof'
    asset.asset_mark()
    asset.asset_data.description='Reusable snowy timber roof, 9.66 × 4.36 m nominal deck, shallow pitch; origin at mounting-plane centre. Includes fascia, rafters and ice.'
    asset.asset_data.author='PU Town / owner reference reconstruction'
    for tag in ['Roof','Timber','Snow','Modular']:
        asset.asset_data.tags.new(tag)
    scene=bpy.data.scenes.new('Roof asset')
    scene.collection.children.link(asset)
    scene.unit_settings.system='METRIC'
    scene.unit_settings.scale_length=1
    scene.world=bpy.context.scene.world
    roof_root=bpy.data.objects['ROOF / mounting plane centre']
    # Children already use roof-local transforms. Removing the assembly parent
    # and zeroing this pivot normalises the independent asset without distortion.
    roof_root.parent=None
    roof_root.location=(0,0,0)
    scene['placement']='Origin at mounting-plane centre. Front faces -Y; +Z up. Rafters extend below the plane.'
else:
    asset=bpy.data.collections['Shed']
    scene=bpy.data.scenes['Shed asset']
bpy.context.window.scene=scene
for other in list(bpy.data.scenes):
    if other != scene:
        bpy.data.scenes.remove(other)
for ob in list(bpy.data.objects):
    if ob.name not in asset.all_objects:
        bpy.data.objects.remove(ob,do_unlink=True)
for col in list(bpy.data.collections):
    if col != asset and col.name not in asset.children:
        bpy.data.collections.remove(col)
bpy.data.orphans_purge(do_recursive=True)
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        space=area.spaces.active
        space.region_3d.view_perspective='PERSP'
        space.region_3d.view_location=(0,0,0 if roof_only else 1.3)
        space.region_3d.view_distance=14
        space.region_3d.view_rotation=Quaternion((.862,.469,.095,.175)).normalized()
        space.shading.type='MATERIAL'
        space.shading.use_scene_lights=False
        space.shading.use_scene_world=False
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
preview=out.parent/'roof.png'
if roof_only and preview.exists():
    with bpy.context.temp_override(id=asset):
        bpy.ops.ed.lib_id_load_custom_preview(filepath=str(preview))
bpy.ops.wm.save_as_mainfile(filepath=str(out),compress=True)
print('ASSET PACKAGED '+str(out))
