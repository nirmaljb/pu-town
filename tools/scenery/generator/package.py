"""Save only the reusable Generator scene, in an isolated Blender worker."""
import bpy
from pathlib import Path
from mathutils import Quaternion

out = Path(bpy.data.filepath).parent/'generator-asset.blend'
asset = bpy.data.collections['Generator']
scene = bpy.data.scenes['Generator asset']
bpy.context.window.scene = scene
for other in list(bpy.data.scenes):
    if other != scene:
        bpy.data.scenes.remove(other)
for ob in list(bpy.data.objects):
    if ob.name not in asset.all_objects:
        bpy.data.objects.remove(ob, do_unlink=True)
for col in list(bpy.data.collections):
    if col != asset and col.name not in asset.children:
        bpy.data.collections.remove(col)
bpy.data.orphans_purge(do_recursive=True)
for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        space = area.spaces.active
        space.region_3d.view_perspective = 'PERSP'
        space.region_3d.view_location = (0, 0, .5)
        space.region_3d.view_distance = 4.2
        space.region_3d.view_rotation = Quaternion((.86, .44, -.11, -.22)).normalized()
        space.shading.type = 'MATERIAL'
        space.shading.use_scene_lights = False
        space.shading.use_scene_world = False
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
bpy.ops.wm.save_as_mainfile(filepath=str(out), compress=True)
print('ASSET PACKAGED '+str(out))
