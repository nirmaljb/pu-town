"""Render the saved generator master in an isolated worker; never alter the master.

Blender -b build/generator.blend --python review.py -- OUT_DIR TAG [VIEW ...]
front, side, top and back reproduce the owner sheets' framing on a transparent film;
hero and game place the asset in a polar-night stage beside a 1.7 m figure stand-in.
"""
import bpy
import math
import sys
from pathlib import Path

args = sys.argv[sys.argv.index('--')+1:]
out, tag = Path(args[0]), args[1]
views = args[2:] or ['front', 'side', 'top', 'back', 'hero', 'game']
s = bpy.context.scene
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    prefs.get_devices()
    for device in prefs.devices:
        device.use = True
    s.cycles.device = 'GPU'
except Exception as error:
    print('CPU render:', error)
sizes = {'front': (1536, 1024), 'side': (1536, 1024), 'top': (1672, 941), 'back': (1536, 1024),
         'hero': (1600, 1000), 'game': (1600, 1000)}
studio = bpy.data.collections['91 Studio light']
polar = bpy.data.collections['92 Polar night']
world = s.world.node_tree
background = world.nodes['Background']
output = world.nodes['World Output']
rig = bpy.data.objects['STAGE / studio rig']
rig_power = {ob.name: ob.data.energy for ob in rig.children}
fog = world.nodes.new('ShaderNodeVolumeScatter')
fog.inputs['Color'].default_value = (.72, .77, .86, 1)
fog.inputs['Density'].default_value = .02
for name in views:
    sheet = name in ('front', 'side', 'top', 'back')
    studio.hide_render = not sheet
    polar.hide_render = sheet
    s.render.film_transparent = sheet
    background.inputs['Color'].default_value = (.010, .011, .012, 1) if sheet else (.20, .22, .26, 1)
    background.inputs['Strength'].default_value = 1.0 if sheet else .9
    for link in list(output.inputs['Volume'].links):
        world.links.remove(link)
    if not sheet:
        world.links.new(fog.outputs['Volume'], output.inputs['Volume'])
    s.cycles.samples = 64 if sheet else 128
    # Each sheet is lit from its own viewpoint; the end sheet is also brighter and the roof
    # sheet is lit from its upper left. Materials are never changed per view.
    rig.rotation_euler.z = {'side': math.pi/2, 'back': math.pi, 'top': -3*math.pi/4}.get(name, 0.)
    for ob in rig.children:
        ob.data.energy = rig_power[ob.name]*(1.25 if name == 'side' else 1.)
    s.camera = bpy.data.objects['VIEW / '+name]
    s.render.resolution_x, s.render.resolution_y = sizes[name]
    s.render.filepath = str(out/f'{tag}-{name}.png')
    bpy.ops.render.render(write_still=True)
print('REVIEW COMPLETE '+tag)
