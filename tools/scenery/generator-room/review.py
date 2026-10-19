"""Render saved Blender asset in an isolated worker; never alter the master."""
import bpy
from pathlib import Path
import sys

args=sys.argv[sys.argv.index('--')+1:]
out=Path(args[0]);tag=args[1]
views=args[2:] or ['hero','front','right','top','back','entry','cutaway','floorplan','inside']
s=bpy.context.scene
roof=bpy.data.collections['02 Roof and snow']
s.cycles.samples=32
s.render.resolution_x=1440;s.render.resolution_y=900
for name in views:
    roof.hide_render=name in ['cutaway','floorplan']
    s.camera=bpy.data.objects['VIEW / '+name]
    s.render.resolution_x=1440 if name!='right' else 1000
    s.render.resolution_y=900
    stage=bpy.data.objects['STAGE / snow ground']
    stage.hide_render=name in ['front','right','top','back','floorplan']
    s.render.film_transparent=stage.hide_render
    s.render.filepath=str(out/f'{tag}-{name}.png')
    bpy.ops.render.render(write_still=True)
print('REVIEW COMPLETE '+tag)
