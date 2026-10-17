"""Render the review views of a built pine in a headless Blender.

Usage:
  Blender -b BUILD_DIR/pine.blend --python tools/scenery/pine/review.py -- BUILD_DIR

Writes BUILD_DIR/review/:
  side-{0,90,180,270}.png  orthographic, at the side sheet's framing (1024 x 1536, 228.3 px = 1 m)
  side-*-snow.png          the same views with snow white and everything else black
  top.png, top-snow.png    straight down, 1254 x 1254 over 4 m
  beauty.png               three-quarter view on black, like the dark sheets
  game.png                 the snow walk's camera: 45 degrees down through a 16 degree lens from 40 m
"""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Vector

OUT = Path(sys.argv[sys.argv.index('--') + 1]).resolve() / 'review'
OUT.mkdir(parents=True, exist_ok=True)
scene = bpy.context.scene
camera = scene.camera
SIDE_SCALE, SIDE_CENTRE = 6.728, 3.228
TOP_SCALE = 4.0


def shoot(name, size, transparent=True):
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.film_transparent = transparent
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.filepath = str(OUT / f'{name}.png')
    bpy.ops.render.render(write_still=True)


def ortho(direction, target, scale):
    direction = Vector(direction).normalized()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = scale
    camera.data.clip_end = 100
    camera.location = Vector(target) - direction * 30
    camera.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()


def side(azimuth):
    """Look horizontally towards the trunk from `azimuth` degrees round from south."""
    a = math.radians(azimuth)
    direction = (-math.sin(a), math.cos(a), 0)
    right = Vector((math.cos(a), math.sin(a), 0))
    # The sheet's trunk stands 16 px right of the image centre.
    ortho(direction, Vector((0, 0, SIDE_CENTRE)) - right * 0.07, SIDE_SCALE)


def snow_only(enabled, saved={}):
    """Workbench flat render with snow white and everything else black."""
    if enabled:
        saved['engine'] = scene.render.engine
        scene.render.engine = 'BLENDER_WORKBENCH'
        scene.display.shading.light = 'FLAT'
        scene.display.shading.color_type = 'MATERIAL'
        scene.view_settings.view_transform = 'Standard'
        for mat in bpy.data.materials:
            saved[mat.name] = tuple(mat.diffuse_color)
            mat.diffuse_color = (1, 1, 1, 1) if mat.name == 'Snow' else (0, 0, 0, 1)
    else:
        scene.render.engine = saved['engine']
        for mat in bpy.data.materials:
            mat.diffuse_color = saved[mat.name]


for azimuth in (0, 90, 180, 270):
    side(azimuth)
    shoot(f'side-{azimuth}', (1024, 1536))
ortho((0, 0, -1), (0, 0, 3), TOP_SCALE)
shoot('top', (1254, 1254))
snow_only(True)
for azimuth in (0, 90, 180, 270):
    side(azimuth)
    shoot(f'side-{azimuth}-snow', (1024, 1536))
ortho((0, 0, -1), (0, 0, 3), TOP_SCALE)
shoot('top-snow', (1254, 1254))
snow_only(False)

# Beauty: a slightly raised three-quarter view on black.
world = scene.world.node_tree.nodes['Background']
world.inputs['Strength'].default_value = 0.55
a = math.radians(35)
ortho((-math.sin(a), math.cos(a), -0.12), (0, 0, SIDE_CENTRE), SIDE_SCALE)
shoot('beauty', (1024, 1536))

# The game camera: perspective, 45 degrees down, 16 degree field, 40 m away, north up.
camera.data.type = 'PERSP'
camera.data.lens_unit = 'FOV'
camera.data.angle = math.radians(16)
pitch = math.radians(45)
target = Vector((0, 0, 1.5))
camera.location = target + Vector((0, -math.cos(pitch), math.sin(pitch))) * 40
camera.rotation_euler = Euler((math.radians(45), 0, 0))
world.inputs['Color'].default_value = (0.32, 0.34, 0.37, 1)
shoot('game', (1280, 800), transparent=False)
