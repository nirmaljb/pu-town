"""Execute inside Blender MCP to create the original PU Town Avatar masters.

Sources are versioned before export. This script never overwrites a registered master.
Both Avatars share explicit bone/material conventions and retain their own meshes.
"""
import bpy
import json
import math
from mathutils import Quaternion, Vector
from pathlib import Path

PROJECT = Path(bpy.app.driver_namespace['putown_project'])
WORKSPACE = PROJECT / 'campus/assets/avatars'
UNITY = PROJECT / 'native/Assets/Art/Avatars'


def material(name, colour, roughness=.8):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*colour, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*colour, 1)
    shader.inputs['Roughness'].default_value = roughness
    return mat


def skin(obj, bone, rig, mat):
    # Unity requires human-bone transform names to be unique across the whole FBX hierarchy.
    obj.name = 'Mesh_' + obj.name
    obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.vertex_groups.new(name=bone).add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
    modifier = obj.modifiers.new('Campus shared humanoid', 'ARMATURE')
    modifier.object = rig
    obj.parent = rig
    obj.select_set(False)
    return obj


def ellipsoid(name, location, scale, bone, rig, mat, segments=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=12, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    return skin(obj, bone, rig, mat)


def rounded(name, location, scale, bone, rig, mat, bevel=.05):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    beveler = obj.modifiers.new('Soft stylised edges', 'BEVEL')
    beveler.width = bevel
    beveler.segments = 3
    bpy.ops.object.modifier_apply(modifier=beveler.name)
    return skin(obj, bone, rig, mat)


def limb(name, start, end, radius, bone, rig, mat):
    centre = (Vector(start) + Vector(end)) / 2
    obj = ellipsoid(name, centre, (radius, radius, (Vector(end) - Vector(start)).length / 2 + radius * .15), bone, rig, mat)
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = (Vector(end) - Vector(start)).to_track_quat('Z', 'Y')
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    return obj


def skeleton():
    armature = bpy.data.armatures.new('CampusHumanoid')
    rig = bpy.data.objects.new('Avatar', armature)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    layout = [
        ('Hips', (0, 0, .84), (0, 0, .98), None),
        ('Spine', (0, 0, .98), (0, 0, 1.12), 'Hips'),
        ('Chest', (0, 0, 1.12), (0, 0, 1.32), 'Spine'),
        ('Neck', (0, 0, 1.32), (0, 0, 1.43), 'Chest'),
        ('Head', (0, 0, 1.43), (0, 0, 1.7), 'Neck'),
    ]
    for side, sign in [('Left', -1), ('Right', 1)]:
        layout += [
            (side + 'UpperArm', (.22 * sign, 0, 1.3), (.48 * sign, 0, 1.3), 'Chest'),
            (side + 'LowerArm', (.48 * sign, 0, 1.3), (.70 * sign, 0, 1.3), side + 'UpperArm'),
            (side + 'Hand', (.70 * sign, 0, 1.3), (.79 * sign, 0, 1.3), side + 'LowerArm'),
            (side + 'UpperLeg', (.13 * sign, 0, .84), (.13 * sign, 0, .46), 'Hips'),
            (side + 'LowerLeg', (.13 * sign, 0, .46), (.13 * sign, 0, .12), side + 'UpperLeg'),
            (side + 'Foot', (.13 * sign, 0, .12), (.13 * sign, -.18, .08), side + 'LowerLeg'),
        ]
    for name, head, tail, parent in layout:
        bone = armature.edit_bones.new(name)
        bone.head, bone.tail = head, tail
        if parent:
            bone.parent = armature.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    rig.select_set(False)
    return rig


def rotation(rig, bone, global_rotation):
    basis = rig.data.bones[bone].matrix_local.to_quaternion()
    pose = rig.pose.bones[bone]
    pose.rotation_mode = 'QUATERNION'
    pose.rotation_quaternion = basis.inverted() @ global_rotation @ basis


def animation(rig, state, duration):
    action = bpy.data.actions.new(state)
    rig.animation_data_create()
    rig.animation_data.action = action
    frames = int(duration * 30)
    for frame in range(0, frames + 1, 5):
        phase = 2 * math.pi * frame / frames
        for bone in rig.pose.bones:
            bone.location = (0, 0, 0)
            bone.rotation_mode = 'QUATERNION'
            bone.rotation_quaternion = Quaternion()
        if state == 'Standing':
            rig.pose.bones['Hips'].location.y = math.sin(phase) * .008
            rotation(rig, 'Head', Quaternion((0, 0, 1), math.sin(phase) * .025))
        elif state == 'Walking':
            rig.pose.bones['Hips'].location.y = abs(math.sin(phase)) * .025
        else:
            rig.pose.bones['Hips'].location.y = -.29
        for side, sign in [('Left', -1), ('Right', 1)]:
            arm_down = Quaternion((0, 1, 0), sign * math.radians(82))
            swing = -sign * math.sin(phase) * .32 if state == 'Walking' else (-.20 if state == 'Seated' else 0)
            rotation(rig, side + 'UpperArm', Quaternion((1, 0, 0), swing) @ arm_down)
            if state == 'Walking':
                rotation(rig, side + 'UpperLeg', Quaternion((1, 0, 0), sign * math.sin(phase) * .55))
                rotation(rig, side + 'LowerLeg', Quaternion((1, 0, 0), -max(0, sign * math.sin(phase)) * .55))
            elif state == 'Seated':
                rotation(rig, side + 'UpperLeg', Quaternion((1, 0, 0), -math.pi / 2))
                rotation(rig, side + 'LowerLeg', Quaternion((1, 0, 0), math.pi / 2))
        for bone in rig.pose.bones:
            bone.keyframe_insert(data_path='location', frame=frame)
            bone.keyframe_insert(data_path='rotation_quaternion', frame=frame)
    rig.animation_data.action = None
    track = rig.animation_data.nla_tracks.new()
    track.name = state
    strip = track.strips.new(state, 0, action)
    strip.extrapolation = 'NOTHING'
    return action


def avatar(preset_id, taller=False):
    # A separate scene/master preserves each original mesh, rather than recolouring one file in place.
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for data in list(bpy.data.actions):
        bpy.data.actions.remove(data)
    rig = skeleton()
    skin_mat = material('Skin clay', (.34, .16, .085) if taller else (.60, .33, .19))
    shirt = material('Campus seafoam' if taller else 'Campus warm linen', (.22, .56, .49) if taller else (.88, .81, .64))
    trousers = material('Campus indigo' if taller else 'Campus terracotta', (.085, .15, .23) if taller else (.45, .22, .12))
    hair = material('Hair charcoal', (.025, .021, .017))
    shoes = material('Shoes warm leather', (.11, .065, .036))
    whites = material('Eyes cream', (.95, .91, .81))
    accent = material('Campus coral' if taller else 'Campus moss', (.72, .25, .19) if taller else (.20, .30, .16))
    rounded('Linen torso', (0, 0, 1.17), (.45, .28, .38), 'Chest', rig, shirt, .07)
    rounded('Trouser hips', (0, 0, .91), (.33, .26, .20), 'Hips', rig, trousers, .06)
    ellipsoid('Neck', (0, 0, 1.40), (.075, .075, .10), 'Neck', rig, skin_mat)
    ellipsoid('Head', (0, -.015, 1.60), (.205, .18, .215), 'Head', rig, skin_mat)
    ellipsoid('Nose', (0, -.187, 1.56), (.04, .035, .045), 'Head', rig, skin_mat)
    for sign in (-1, 1):
        ellipsoid('Ear', (.192 * sign, 0, 1.60), (.043, .034, .062), 'Head', rig, skin_mat)
        ellipsoid('Eye white', (.071 * sign, -.172, 1.625), (.035, .016, .025), 'Head', rig, whites)
        ellipsoid('Eye pupil', (.071 * sign, -.187, 1.623), (.014, .007, .017), 'Head', rig, hair)
        rounded('Brow', (.071 * sign, -.171, 1.68), (.064, .018, .013), 'Head', rig, hair, .004)
    ellipsoid('Hair cap', (0, .007, 1.72), (.207, .185, .115), 'Head', rig, hair)
    if taller:
        for angle in range(0, 360, 45):
            radians = math.radians(angle)
            ellipsoid('Curly crown', (math.cos(radians) * .13, math.sin(radians) * .13, 1.76), (.09, .085, .09), 'Head', rig, hair, 12)
        ellipsoid('Hair puff', (0, .165, 1.77), (.13, .13, .13), 'Head', rig, hair)
        rounded('Coral scarf', (-.12, -.157, 1.17), (.095, .028, .28), 'Chest', rig, accent, .025)
        rounded('Tunic hem', (0, 0, 1.0), (.42, .285, .16), 'Hips', rig, shirt, .04)
    else:
        ellipsoid('Olive cap', (0, 0, 1.77), (.218, .193, .095), 'Head', rig, accent)
        rounded('Cap brim', (0, -.215, 1.74), (.24, .16, .025), 'Head', rig, accent, .01)
        rounded('Canvas backpack', (0, .185, 1.15), (.25, .17, .28), 'Chest', rig, accent, .055)
        for sign in (-1, 1):
            rounded('Backpack strap', (.135 * sign, -.158, 1.18), (.03, .02, .31), 'Chest', rig, accent, .005)
    for side, sign in [('Left', -1), ('Right', 1)]:
        limb(side + ' sleeve', (.23 * sign, 0, 1.3), (.40 * sign, 0, 1.3), .079, side + 'UpperArm', rig, shirt)
        limb(side + ' upper arm', (.39 * sign, 0, 1.3), (.48 * sign, 0, 1.3), .06, side + 'UpperArm', rig, skin_mat)
        limb(side + ' forearm', (.48 * sign, 0, 1.3), (.70 * sign, 0, 1.3), .055, side + 'LowerArm', rig, skin_mat)
        ellipsoid(side + ' hand', (.75 * sign, -.008, 1.3), (.065, .044, .056), side + 'Hand', rig, skin_mat)
        limb(side + ' trouser leg', (.13 * sign, 0, .83), (.13 * sign, 0, .45), .092, side + 'UpperLeg', rig, trousers)
        limb(side + ' lower leg', (.13 * sign, 0, .46), (.13 * sign, 0, .13), .069, side + 'LowerLeg', rig, trousers)
        rounded(side + ' shoe', (.13 * sign, -.07, .075), (.15, .27, .12), side + 'Foot', rig, shoes, .04)
    actions = {state: animation(rig, state, duration) for state, duration in [('Standing', 2), ('Walking', 1), ('Seated', 2)]}
    bpy.context.scene.render.fps = 30
    directory = WORKSPACE / 'sources' / preset_id / 'v1'
    directory.mkdir(parents=True, exist_ok=True)
    master = directory / 'avatar.blend'
    if master.exists():
        raise RuntimeError('Master source exists; bump its version instead of overwriting it: ' + str(master))
    # Keep the editable file in the neutral, authored T-pose with named NLA actions.
    bpy.ops.wm.save_as_mainfile(filepath=str(master))
    target = UNITY / preset_id
    target.mkdir(parents=True, exist_ok=True)
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.fbx(filepath=str(target / 'avatar.fbx'), use_selection=True, object_types={'ARMATURE', 'MESH'},
                             add_leaf_bones=False, axis_forward='-Z', axis_up='Y', apply_unit_scale=True,
                             bake_anim=True, bake_anim_use_all_actions=False, bake_anim_use_nla_strips=True,
                             bake_anim_simplify_factor=0, path_mode='AUTO')
    # Render state/camera evidence after the source master is safely retained.
    for track in rig.animation_data.nla_tracks:
        track.mute = True
    bpy.ops.mesh.primitive_plane_add(size=200)
    floor = bpy.context.object
    floor.data.materials.append(material('Review neutral ground', (.30, .36, .27)))
    for position, energy, size in [((3, -4, 6), 750, 5), ((-3, -1, 3), 450, 4)]:
        bpy.ops.object.light_add(type='AREA', location=position)
        light = bpy.context.object
        light.data.energy, light.data.shape, light.data.size = energy, 'DISK', size
        light.rotation_euler = (Vector((0, 0, 1)) - light.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.data.type, camera.data.ortho_scale = 'ORTHO', 2.5
    scene = bpy.context.scene
    scene.camera = camera
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 1000, 1000, 100
    scene.world.color = (.30, .35, .40)
    scene.view_settings.view_transform = 'AgX'
    evidence = WORKSPACE / 'exports' / preset_id
    evidence.mkdir(parents=True, exist_ok=True)
    for view, state, frame, position in [('front', 'Standing', 0, (3, -5, 3)), ('back', 'Standing', 0, (-3, 5, 3)),
                                         ('side', 'Standing', 0, (5, -.1, 2.5)), ('walking', 'Walking', 8, (3, -5, 3)),
                                         ('seated', 'Seated', 0, (3, -5, 3))]:
        rig.animation_data.action = actions[state]
        scene.frame_set(frame)
        camera.location = position
        camera.rotation_euler = (Vector((0, 0, .95)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(evidence / (view + '.png'))
        bpy.ops.render.render(write_still=True)
    stats = {'preset': preset_id, 'master': str(master.relative_to(PROJECT)), 'sourceFbx': str((target / 'avatar.fbx').relative_to(PROJECT)),
             'meshObjects': len(meshes), 'vertices': sum(len(obj.data.vertices) for obj in meshes),
             'triangles': sum(sum(len(face.vertices) - 2 for face in obj.data.polygons) for obj in meshes),
             'bones': len(rig.data.bones), 'actions': list(actions), 'authoredWith': 'Blender MCP / Blender ' + bpy.app.version_string}
    (evidence / 'blender-report.json').write_text(json.dumps(stats, indent=2) + '\n')
    print(json.dumps(stats))


avatar('campus-rowan')
avatar('campus-mira', taller=True)
