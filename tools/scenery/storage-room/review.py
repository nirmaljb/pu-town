"""Render the saved storage room in an isolated worker; never alters the master.

Blender -b build/storage-room.blend --python review.py -- OUT_DIR TAG [views...]
Each VIEW / camera carries its own world, stage and roof settings.
"""
import bpy
import sys
from pathlib import Path

args = sys.argv[sys.argv.index('--')+1:]
out, tag = Path(args[0]), args[1]
fast = '--eevee' in args
args = [a for a in args if a != '--eevee']
views = args[2:] or ['front', 'side', 'plan', 'top3q', 'hero', 'entry', 'cutaway', 'inside', 'roof']
samples = 48
s = bpy.context.scene
s.render.engine = 'BLENDER_EEVEE' if fast else 'CYCLES'
s.eevee.taa_render_samples = 32
s.eevee.use_shadows = True
s.eevee.use_raytracing = True
prefs = bpy.context.preferences.addons['cycles'].preferences
try:
    prefs.compute_device_type = 'METAL'
    prefs.get_devices()
    for device in prefs.devices:
        device.use = True
    s.cycles.device = 'GPU'
except Exception as error:  # CPU rendering is slower but equivalent
    print('GPU unavailable:', error)
s.cycles.samples = samples
s.cycles.use_denoising = True
s.cycles.max_bounces = 6
asset = bpy.data.collections['Storage Room']
roof = bpy.data.collections['02 Roof']
stage = [o for o in bpy.data.collections['90 Review stage'].objects]
for name in views:
    cam = bpy.data.objects['VIEW / '+name]
    s.camera = cam
    s.render.resolution_x, s.render.resolution_y = cam['res']
    s.render.resolution_percentage = 100
    s.world = bpy.data.worlds[cam['world']]
    group = 'studio' if cam['world'].startswith('Studio') else 'blizzard'
    for ob in stage:
        if ob.type == 'LIGHT':
            ob.hide_render = ob.get('group') != group
        elif ob.type == 'MESH':
            ob.hide_render = not cam.get('ground', False)
    for child in asset.children:
        child.hide_render = cam.get('roof_only', False) and child != roof
    roof.hide_render = not cam.get('roof', True)
    s.render.film_transparent = bool(cam.get('transparent', False))
    s.view_settings.view_transform = cam.get('display', 'AgX')
    s.view_settings.look = 'None' if s.view_settings.view_transform == 'Standard' else 'AgX - Medium High Contrast'
    s.render.filepath = str(out/f'{tag}-{name}.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED', name)
roof.hide_render = False
for child in asset.children:
    child.hide_render = False
print('REVIEW COMPLETE '+tag)
