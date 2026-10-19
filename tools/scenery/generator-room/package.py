"""Save only the reusable Shed scene, in an isolated Blender worker."""
import bpy
from pathlib import Path
from mathutils import Quaternion

out=Path(bpy.data.filepath).parent/'shed.blend'
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
        space.region_3d.view_location=(0,0,1.3)
        space.region_3d.view_distance=14
        space.region_3d.view_rotation=Quaternion((.862,.469,.095,.175)).normalized()
        space.shading.type='MATERIAL'
        space.shading.use_scene_lights=False
        space.shading.use_scene_world=False
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
bpy.ops.wm.save_as_mainfile(filepath=str(out),compress=True)
print('ASSET PACKAGED '+str(out))
