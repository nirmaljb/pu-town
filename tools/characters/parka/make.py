"""Build, rig, animate and export the parka Avatar inside a headless Blender.

Usage (from the repository root, see README.md):
  Blender -b --factory-startup --python tools/characters/parka/make.py -- BUILD_DIR

Writes BUILD_DIR/parka.blend and BUILD_DIR/report.json, then godot/characters/parka/
parka.glb and gait.json. The run is deterministic: the same sources give the same export.
"""
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Quaternion, Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import gait  # noqa: E402
import palette  # noqa: E402
import shape  # noqa: E402

ROOT = HERE.parents[2]
GODOT = ROOT / 'godot/characters/parka'
FPS = 60
CLIPS = ('Walk', 'Run', 'Stand')


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.unit_settings.system = 'METRIC'
    bpy.context.preferences.edit.keyframe_new_interpolation_type = 'LINEAR'


def make_materials():
    made = {}
    for name, colour in palette.linear_colours().items():
        mat = bpy.data.materials.new(name)
        mat.diffuse_color = (*colour, 1)
        mat.roughness = 0.95
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes['Principled BSDF']
        bsdf.inputs['Base Color'].default_value = (*colour, 1)
        bsdf.inputs['Roughness'].default_value = 0.95
        bsdf.inputs['Specular IOR Level'].default_value = 0.2
        made[name] = mat
    return made


def make_mesh(materials):
    built = shape.shape()
    mesh = bpy.data.meshes.new('Parka')
    mesh.from_pydata(built.verts, [], built.faces)
    order = list(materials)
    for name in order:
        mesh.materials.append(materials[name])
    for polygon, material in zip(mesh.polygons, built.materials):
        polygon.material_index = order.index(material)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=bm.faces, quad_method='BEAUTY', ngon_method='BEAUTY')
    bm.to_mesh(mesh)
    bm.free()
    for polygon in mesh.polygons:
        polygon.use_smooth = False  # the faceted look comes from flat triangles
    obj = bpy.data.objects.new('Parka', mesh)
    bpy.context.collection.objects.link(obj)
    for index, weights in enumerate(built.weights):
        for bone, weight in weights.items():
            if weight <= 1e-4:
                continue
            group = obj.vertex_groups.get(bone) or obj.vertex_groups.new(name=bone)
            group.add([index], weight, 'REPLACE')
    return obj


def make_rig(mesh_obj):
    data = bpy.data.armatures.new('Rig')
    rig = bpy.data.objects.new('Rig', data)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for name, (head, tail) in shape.JOINTS.items():
        bone = data.edit_bones.new(name)
        bone.head, bone.tail, bone.roll = head, tail, 0.0
    for name, parent in shape.PARENTS.items():
        data.edit_bones[name].parent = data.edit_bones[parent]
    data.edit_bones['Root'].use_deform = False
    bpy.ops.object.mode_set(mode='OBJECT')
    mesh_obj.parent = rig
    modifier = mesh_obj.modifiers.new('Armature', 'ARMATURE')
    modifier.object = rig
    return rig


def rest_rotation(rig, bone):
    return rig.data.bones[bone].matrix_local.to_quaternion()


def apply_pose(rig, world, offset):
    """Turn world-space joint rotations into each bone's local rotation."""
    resolved = {}

    def world_of(bone):
        if bone not in resolved:
            parent = shape.PARENTS.get(bone)
            resolved[bone] = world.get(bone, world_of(parent) if parent else Quaternion())
        return resolved[bone]

    for pose_bone in rig.pose.bones:
        name = pose_bone.name
        parent = shape.PARENTS.get(name)
        relative = (world_of(parent).inverted() if parent else Quaternion()) @ world_of(name)
        rest = rest_rotation(rig, name)
        pose_bone.rotation_mode = 'QUATERNION'
        pose_bone.rotation_quaternion = rest.inverted() @ relative @ rest
        pose_bone.location = (0, 0, 0)
    rig.pose.bones['Hips'].location = rest_rotation(rig, 'Hips').inverted() @ offset


def make_actions(rig):
    rig.animation_data_create()
    lengths = {}
    for name in CLIPS:
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        rig.animation_data.action = action
        frames = round(gait.GAITS[name]['cycle_seconds'] * FPS) if name in gait.GAITS else 1
        for frame in range(frames + 1):
            world, offset, _ = gait.pose(name, (frame / frames) % 1.0)
            apply_pose(rig, world, offset)
            for pose_bone in rig.pose.bones:
                pose_bone.keyframe_insert('rotation_quaternion', frame=frame, group=pose_bone.name)
            rig.pose.bones['Hips'].keyframe_insert('location', frame=frame, group='Hips')
        action.use_frame_range = True
        action.frame_start, action.frame_end = 0, frames
        lengths[name] = frames
    return lengths


def measure(rig, mesh_obj, lengths):
    """Check the evaluated rig: planted boots must not slide or leave the ground."""
    scene = bpy.context.scene
    report = {}
    for name in ('Walk', 'Run'):
        g = gait.GAITS[name]
        rig.animation_data.action = bpy.data.actions[name]
        frames = lengths[name]
        travel = 2 * g['step']
        anchors = {'Left': [], 'Right': []}
        lowest, highest_low = [], []
        for frame in range(frames):
            scene.frame_set(frame)
            phase = frame / frames
            _, _, planted = gait.pose(name, phase)
            for side, start in (('Left', 0.0), ('Right', 0.5)):
                foot = rig.pose.bones[f'{side}Foot']
                # The heel carries the boot until the heel rises, then the ball does.
                stance = ((phase - start) % 1.0) / g['duty']
                kind = 'heel' if stance < 0.6 else 'ball'
                if kind == 'heel':
                    delta = foot.matrix.to_quaternion() @ rest_rotation(rig, f'{side}Foot').inverted()
                    contact = foot.head + delta @ gait.HEEL
                else:
                    contact = foot.tail
                if planted[side]:
                    anchors[side].append((phase, contact.y - phase * travel, kind))
            evaluated = mesh_obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
            zs = [v.co.z for v in evaluated.data.vertices]
            lowest.append(min(zs))
            highest_low.append(min(zs))
        slips = []
        for side, samples in anchors.items():
            # Compare consecutive planted samples within one stance.
            for (p0, y0, k0), (p1, y1, k1) in zip(samples, samples[1:]):
                if p1 - p0 < 1.5 / frames and k0 == k1:
                    slips.append(abs(y1 - y0))
        report[name] = {
            'frames': frames, 'cycle_seconds': round(g['cycle_seconds'], 4), 'step_m': round(g['step'], 4),
            'max_planted_slip_per_frame_mm': round(1000 * max(slips), 2),
            'lowest_vertex_mm': round(1000 * min(lowest), 1),
            'highest_frame_low_point_mm': round(1000 * max(highest_low), 1),
        }
    rig.animation_data.action = None
    return report


def export(rig, mesh_obj, build):
    GODOT.mkdir(parents=True, exist_ok=True)
    for pose_bone in rig.pose.bones:
        pose_bone.rotation_quaternion = (1, 0, 0, 0)
        pose_bone.location = (0, 0, 0)
    bpy.ops.wm.save_as_mainfile(filepath=str(build / 'parka.blend'))
    bpy.ops.export_scene.gltf(
        filepath=str(GODOT / 'parka.glb'), export_format='GLB', export_yup=True,
        export_texcoords=False, export_normals=True, export_materials='EXPORT',
        export_skins=True, export_animations=True, export_animation_mode='ACTIONS',
        export_force_sampling=True, export_def_bones=False, export_rest_position_armature=True,
        export_optimize_animation_size=False, export_reset_pose_bones=True,
        export_cameras=False, export_lights=False, export_extras=False,
    )
    walk, run = gait.GAITS['Walk'], gait.GAITS['Run']
    (GODOT / 'gait.json').write_text(json.dumps({
        'source': 'tools/characters/parka/gait.py',
        'clips': {'walk': 'Walk', 'run': 'Run', 'stand': 'Stand'},
        'phase': 'one cycle is two steps; the left boot lands at 0 and the right at 0.5',
        'boot_lateral_m': 0.105,
        'walk': {'speed_mps': walk['speed'], 'step_m': round(walk['step'], 4), 'duty': walk['duty'],
                 'landing_ahead_m': round(gait.landing_offset('Walk'), 4)},
        'run': {'speed_mps': run['speed'], 'step_m': round(run['step'], 4), 'duty': run['duty'],
                'landing_ahead_m': round(gait.landing_offset('Run'), 4)},
    }, indent=2) + '\n')


def main():
    build = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
    build.mkdir(parents=True, exist_ok=True)
    reset()
    mesh_obj = make_mesh(make_materials())
    rig = make_rig(mesh_obj)
    lengths = make_actions(rig)
    motion = measure(rig, mesh_obj, lengths)
    export(rig, mesh_obj, build)
    mesh = mesh_obj.data
    report = {
        'triangles': len(mesh.polygons), 'vertices': len(mesh.vertices),
        'materials': {m.name: palette.SWATCHES[m.name] for m in mesh.materials},
        'bones': [b.name for b in rig.data.bones],
        'height_m': round(max(v.co.z for v in mesh.vertices), 3),
        'motion': motion,
        'glb_bytes': (GODOT / 'parka.glb').stat().st_size,
    }
    (build / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    print('PARKA_REPORT', json.dumps(report))


main()
