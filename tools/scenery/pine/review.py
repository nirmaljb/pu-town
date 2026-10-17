"""Render the review views of both built pine versions in a headless Blender.

Usage:
  Blender -b BUILD_DIR/pine.blend --python tools/scenery/pine/review.py -- BUILD_DIR

Writes BUILD_DIR/review/, once for the near tree and once, prefixed `far-`, for the
distance version:
  side-{0,90,180,270}.png  orthographic, at the side sheet's framing (1024 x 1536, 228.3 px = 1 m)
  side-*-snow.png          the same views with snow white and everything else black
  top.png, top-snow.png    straight down, 1254 x 1254 over 4 m
  beauty.png               three-quarter view on black, like the dark sheets
and, once:
  game.png                 the near tree through the snow walk's camera (godot/follow_camera.gd):
                           40 degrees down through a 40 degree vertical lens, at the
                           default distance, standing where the figure would
  distance.png             near (left) and far (right) side by side through the same lens from 60 m
"""
import math
import re
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
NEAR, FAR = bpy.data.objects['Pine'], bpy.data.objects['PineFar']
PREFIXES = {NEAR: '', FAR: 'far-'}  # object -> review file prefix
GODOT = Path(__file__).resolve().parents[3] / 'godot'


def godot_constant(script, name):
    """A numeric constant from the snow walk's source, such as `const PITCH := -40.0`."""
    found = re.search(rf'^const {name} := ([0-9.+\-*/ ()]+)$', (GODOT / script).read_text(), re.M)
    return float(eval(found.group(1), {'__builtins__': {}}))


# The snow walk's camera: its pitch, vertical field of view and the distance that
# frames the figure at its default share of the screen's height, as
# follow_camera.gd's distance_for_share() derives it.
PITCH = -godot_constant('follow_camera.gd', 'PITCH')
FIELD_OF_VIEW = godot_constant('follow_camera.gd', 'FIELD_OF_VIEW')
FRAMING_SHARE = godot_constant('follow_camera.gd', 'FRAMING_SHARE')
PLAY_SHARE = godot_constant('follow_camera.gd', 'PLAY_SHARE')
FIGURE = godot_constant('walker.gd', 'HEIGHT')
PLAY_DISTANCE = FIGURE * (math.sin(math.radians(PITCH))
                          + math.cos(math.radians(PITCH)) / (2 * math.tan(math.radians(FIELD_OF_VIEW / 2)) * PLAY_SHARE))


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


def game_lens(focus, distance):
    """North up, looking down PITCH degrees at `focus` from `distance` away."""
    camera.data.type = 'PERSP'
    camera.data.sensor_fit = 'VERTICAL'
    camera.data.angle_y = math.radians(FIELD_OF_VIEW)
    camera.data.clip_end = 1000
    pitch = math.radians(PITCH)
    camera.location = Vector(focus) + Vector((0, -math.cos(pitch), math.sin(pitch))) * distance
    camera.rotation_euler = Euler((math.radians(90 - PITCH), 0, 0))


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


def show(*shown):
    for obj in PREFIXES:
        obj.hide_render = obj not in shown


world = scene.world.node_tree.nodes['Background']
studio = tuple(world.inputs['Color'].default_value), world.inputs['Strength'].default_value
for obj, prefix in PREFIXES.items():
    show(obj)
    world.inputs['Color'].default_value, world.inputs['Strength'].default_value = studio
    for azimuth in (0, 90, 180, 270):
        side(azimuth)
        shoot(f'{prefix}side-{azimuth}', (1024, 1536))
    ortho((0, 0, -1), (0, 0, 3), TOP_SCALE)
    shoot(f'{prefix}top', (1254, 1254))
    snow_only(True)
    for azimuth in (0, 90, 180, 270):
        side(azimuth)
        shoot(f'{prefix}side-{azimuth}-snow', (1024, 1536))
    ortho((0, 0, -1), (0, 0, 3), TOP_SCALE)
    shoot(f'{prefix}top-snow', (1254, 1254))
    snow_only(False)
    # Beauty: a slightly raised three-quarter view on black.
    world.inputs['Strength'].default_value = 0.55
    a = math.radians(35)
    ortho((-math.sin(a), math.cos(a), -0.12), (0, 0, SIDE_CENTRE), SIDE_SCALE)
    shoot(f'{prefix}beauty', (1024, 1536))

# The game camera, on a dark grey surround: the near tree where the figure would stand.
world.inputs['Color'].default_value = (0.32, 0.34, 0.37, 1)
show(NEAR)
game_lens((0, FRAMING_SHARE * PLAY_DISTANCE, 0), PLAY_DISTANCE)
shoot('game', (1280, 720), transparent=False)

# Both versions side by side, 8 m apart, through the same lens from 60 m.
show(NEAR, FAR)
NEAR.location.x, FAR.location.x = -4, 4
game_lens((0, 0, 3), 60)
shoot('distance', (1280, 720), transparent=False)
