"""Render the review views of a built parka in a headless Blender.

Usage:
  Blender -b BUILD_DIR/parka.blend --python tools/characters/parka/review.py -- BUILD_DIR

Writes BUILD_DIR/review/: front, side and back at the owner's sheet framing
(1376 x 768, 680 px = 1.7 m), the Stand pose, side-view cycle frames of Walk and
Run, and the game camera (orthographic, 55 degrees down, 45 degrees round, the
prototype's 6 m view at 1280 x 800). compare.py scores and tiles them.
"""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gait  # noqa: E402

OUT = Path(sys.argv[sys.argv.index('--') + 1]).resolve() / 'review'
OUT.mkdir(parents=True, exist_ok=True)
scene = bpy.context.scene
rig = bpy.data.objects['Rig']
rig.animation_data_create()


def setup():
    scene.render.engine = 'BLENDER_EEVEE'
    scene.view_settings.view_transform = 'Standard'
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    world = bpy.data.worlds.new('Studio')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (1, 1, 1, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.55
    scene.world = world
    sun = bpy.data.objects.new('Key', bpy.data.lights.new('Key', 'SUN'))
    sun.data.energy = 2.4
    sun.rotation_euler = Euler((math.radians(50), 0, math.radians(-30)))
    scene.collection.objects.link(sun)
    camera = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera'))
    camera.data.type = 'ORTHO'
    scene.collection.objects.link(camera)
    scene.camera = camera
    return camera, sun


def aim(camera, direction, target, scale, size):
    """Orthographic camera looking along `direction` at `target`."""
    direction = Vector(direction).normalized()
    camera.location = Vector(target) - direction * 20
    camera.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    camera.data.ortho_scale = scale
    camera.data.clip_end = 60
    scene.render.resolution_x, scene.render.resolution_y = size


def shoot(name):
    scene.render.filepath = str(OUT / f'{name}.png')
    bpy.ops.render.render(write_still=True)


def pose(clip, frame):
    rig.animation_data.action = bpy.data.actions[clip] if clip else None
    if clip is None:
        for bone in rig.pose.bones:
            bone.rotation_quaternion = (1, 0, 0, 0)
            bone.location = (0, 0, 0)
    scene.frame_set(frame)


camera, sun = setup()
sheet = (1376, 768)
# Sheet framing: image centre is 0.90 m above the boots, 3.44 m across.
for name, direction in (('front', (0, 1, 0)), ('side', (1, 0, 0)), ('back', (0, -1, 0))):
    pose(None, 0)
    aim(camera, direction, (0, 0, 0.90), 3.44, sheet)
    shoot(name)

pose('Stand', 0)
aim(camera, (0, 1, 0), (0, 0, 0.90), 3.44, sheet)
shoot('stand-front')
aim(camera, (-0.7, 0.7, -0.25), (0, 0, 0.90), 3.44, sheet)
shoot('stand-three-quarter')

for clip in ('Walk', 'Run'):
    frames = bpy.data.actions[clip].frame_range[1]
    for i in range(8):
        pose(clip, round(frames * i / 8))
        aim(camera, (1, 0, 0), (0, 0, 0.90), 2.2, (420, 520))
        shoot(f'{clip.lower()}-{i}')
        aim(camera, (-0.6, 0.75, -0.2), (0, 0, 0.90), 2.2, (420, 520))
        shoot(f'{clip.lower()}-quarter-{i}')

# Game camera: Godot's rotation (-55, 45, 0) looks down 55 degrees from a 45 degree heading.
pitch, yaw = math.radians(55), math.radians(45)
# Godot's view (-sin y cos p, -sin p, -cos y cos p) in Blender's Z-up axes.
view = Vector((-math.sin(yaw) * math.cos(pitch), math.cos(yaw) * math.cos(pitch), -math.sin(pitch)))
ground = bpy.data.objects.new('Snow', bpy.data.meshes.new('Snow'))
ground.data.from_pydata([(-6, -6, 0), (6, -6, 0), (6, 6, 0), (-6, 6, 0)], [], [(0, 1, 2, 3)])
snow = bpy.data.materials.new('Snow')
snow.use_nodes = True
snow.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.55, 0.57, 0.62, 1)
ground.data.materials.append(snow)
scene.collection.objects.link(ground)
scene.render.film_transparent = False
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.78, 0.8, 0.86, 1)
for name, clip, frame, heading in (('game-stand', 'Stand', 0, 200), ('game-walk', 'Walk', 6, 160),
                                   ('game-run', 'Run', 4, 250), ('game-away', 'Walk', 20, 20)):
    # Heading turns the figure about Z; 180 degrees faces it toward the camera's side.
    rig.rotation_euler = (0, 0, math.radians(heading))
    pose(clip, frame)
    aim(camera, view, (0, 0, 0.85), 6 * 1280 / 800, (1280, 800))
    shoot(name)
