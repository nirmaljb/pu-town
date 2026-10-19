"""Save the reusable storage room, or with -- roof the roof alone, in an isolated worker.

Blender -b build/storage-room.blend --python-exit-code 1 --python package.py [-- roof]
Writes build/storage-room-asset.blend or build/storage-roof.blend: one scene,
the marked asset collection only, textures packed, no review stage.
"""
import bpy
import sys
from pathlib import Path

roof_only = '--' in sys.argv and sys.argv[sys.argv.index('--')+1:] == ['roof']
out = Path(bpy.data.filepath).parent/('storage-roof.blend' if roof_only else 'storage-room-asset.blend')
scene = bpy.context.scene
asset = bpy.data.collections['02 Roof' if roof_only else 'Storage Room']
if roof_only:
    asset.name = 'Snowy timber gable roof'
    pivot = bpy.data.objects['ROOF / wall-plate plane centre']
    # Children already sit in roof-local coordinates; detaching the pivot
    # from the building and zeroing it moves the whole roof to the origin.
    pivot.parent = None
    pivot.location = (0, 0, 0)
    scene.collection.children.link(asset)
scene.name = 'Roof asset' if roof_only else 'Storage room asset'
for child in list(scene.collection.children):
    if child != asset:
        scene.collection.children.unlink(child)
for ob in list(bpy.data.objects):
    if ob.name not in asset.all_objects:
        bpy.data.objects.remove(ob, do_unlink=True)
for col in list(bpy.data.collections):
    if col != asset and col not in asset.children_recursive:
        bpy.data.collections.remove(col)
for world in list(bpy.data.worlds):
    world.use_fake_user = False
scene.world = None
scene.camera = None
bpy.data.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
scene['placement'] = ('Origin on the wall-plate plane at the roof centre; front gable faces -Y; +Z up.' if roof_only else
                      'Origin at the enclosed room footprint centre on the ground; porch faces -Y; +Z up.')
scene.view_settings.view_transform = 'AgX'
bpy.ops.wm.save_as_mainfile(filepath=str(out), compress=True)
print('ASSET PACKAGED '+str(out))
