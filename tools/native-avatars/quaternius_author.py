"""Derive clothed campus masters from retained CC0 Standard assets in a fresh Blender scene.

Run with Blender --background --factory-startup --python this_file -- campus-ash (or campus-lea). Original archives and
import files remain immutable; only new derived meshes, armature bindings and exports are saved.
"""
import bmesh
import bpy
import hashlib
import json
import sys
from pathlib import Path

REPOSITORY = Path(__file__).resolve().parents[2]
WORKSPACE = REPOSITORY / 'campus/assets/avatars'
SOURCES = WORKSPACE / 'sources/quaternius'
BASE = SOURCES / 'base-characters/Base Characters/Godot - UE'
OUTFIT = SOURCES / 'modular-outfits/Exports/glTF (Godot-Unreal)/Outfits'
HAIR = SOURCES / 'base-characters/Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)'
ANIMATIONS = SOURCES / 'animation-library/Unreal-Godot/UAL1_Standard.glb'
DESIGNS = [('campus-ash', 'Ash', 'Male', 'Hair_SimpleParted'), ('campus-lea', 'Lea', 'Female', 'Hair_Buns')]
MASTER_REVISION = 2


def imported(path):
    before = set(bpy.data.objects)
    load_path = path
    if path.suffix == '.gltf':
        document = json.loads(path.read_text())
        for resource in document.get('images', []) + document.get('buffers', []):
            if 'uri' not in resource or resource['uri'].startswith('data:'):
                continue
            source = path.parent / resource['uri']
            if not source.is_file() and source.name.endswith('_png.png'):
                source = source.with_name(source.name.removesuffix('_png.png') + '.png')
            if not source.is_file():
                raise ValueError('Missing retained import resource: ' + str(source))
            resource['uri'] = str(source.resolve())
        cache = REPOSITORY / '.scratch/native/quaternius-import'
        cache.mkdir(parents=True, exist_ok=True)
        load_path = cache / path.name
        load_path.write_text(json.dumps(document))
    bpy.ops.import_scene.gltf(filepath=str(load_path))
    return [obj for obj in bpy.data.objects if obj not in before]


def rig_of(objects):
    rigs = [obj for obj in objects if obj.type == 'ARMATURE']
    if len(rigs) != 1:
        raise ValueError('Expected one original rig in the retained component.')
    return rigs[0]


def bind(mesh, rig):
    mesh.parent = rig
    for modifier in mesh.modifiers:
        if modifier.type == 'ARMATURE':
            modifier.object = rig


def crop_to_head(mesh, rig):
    derived = mesh.copy()
    derived.data = mesh.data.copy()
    bpy.context.scene.collection.objects.link(derived)
    derived.name = 'Campus_Head'
    groups = {group.index for group in derived.vertex_groups if group.name in ('Head', 'neck_01')}
    keep = {vertex.index for vertex in derived.data.vertices
            if sum(group.weight for group in vertex.groups if group.group in groups) >= .5}
    edit = bmesh.new()
    edit.from_mesh(derived.data)
    edit.verts.ensure_lookup_table()
    bmesh.ops.delete(edit, geom=[vertex for vertex in edit.verts if vertex.index not in keep], context='VERTS')
    edit.to_mesh(derived.data)
    edit.free()
    derived.data.update()
    bind(derived, rig)
    return derived


def retain_images(objects, output):
    output.mkdir(parents=True, exist_ok=True)
    images = set()
    for obj in objects:
        if obj.type != 'MESH':
            continue
        for material in obj.data.materials:
            if material and material.use_nodes:
                images.update(node.image for node in material.node_tree.nodes if node.type == 'TEX_IMAGE' and node.image)
    record = []
    for image in sorted(images, key=lambda image: image.name):
        original = Path(bpy.path.abspath(image.filepath))
        # Some Standard glTF image URIs have a stale _png suffix. Resolve only exact known
        # aliases from the same retained pack; never silently substitute a different texture.
        if not original.is_file() and original.name.endswith('_png.png'):
            candidate = original.with_name(original.name.removesuffix('_png.png') + '.png')
            if candidate.is_file():
                image.filepath = str(candidate)
                image.reload()
                original = candidate
        if not original.is_file():
            raise ValueError('Missing retained Standard texture: ' + str(original))
        target = output / original.name
        target.write_bytes(original.read_bytes())
        image.filepath = str(target)
        image.pack()
        record.append({'name': image.name, 'file': target.name, 'width': image.size[0], 'height': image.size[1],
                       'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
    return record


def author(identifier, label, gender, hairstyle):
    master = WORKSPACE / 'sources' / identifier / ('v' + str(MASTER_REVISION)) / 'avatar.blend'
    if master.exists() or (WORKSPACE / 'masters' / identifier / ('v' + str(MASTER_REVISION))).exists():
        raise ValueError('This master revision already exists. Pass a new explicit revision after the candidate ID; never overwrite a retained master.')
    scene = bpy.data.scenes.new('Derived ' + identifier)
    bpy.context.window.scene = scene
    scene.render.fps = 30
    body = imported(BASE / ('Superhero_' + gender + '_FullBody.gltf'))
    rig = rig_of(body)
    rig.name = 'CampusRig'
    original_body = next(obj for obj in body if obj.type == 'MESH' and 'superhero' in obj.name.lower())
    if len(original_body.data.vertices) < 1000:
        raise ValueError('The Standard full body must be a real skinned character mesh.')
    head = crop_to_head(original_body, rig)
    original_body.hide_render = True
    original_body.hide_set(True)
    if len(head.data.vertices) < 300 or not any(modifier.type == 'ARMATURE' for modifier in head.modifiers):
        raise ValueError('The derived head must retain actual topology and skinning.')
    usable = [head] + [obj for obj in body if obj.type == 'MESH' and obj.name in ('Eyebrows', 'Eyes')]
    for obj in body:
        if obj.type == 'MESH' and obj not in usable:
            obj.hide_render = True
    clothes = imported(OUTFIT / (gender + '_Peasant.gltf'))
    outfit_rig = rig_of(clothes)
    for obj in clothes:
        if obj.type == 'MESH' and any(modifier.type == 'ARMATURE' for modifier in obj.modifiers):
            bind(obj, rig)
            usable.append(obj)
            if gender == 'Female':
                for material in obj.data.materials:
                    if material and material.name.startswith('MI_Peasant'):
                        for node in material.node_tree.nodes:
                            if node.type == 'TEX_IMAGE' and node.image and 'BaseColor' in node.image.name:
                                node.image = bpy.data.images.load(str(SOURCES / 'modular-outfits/Textures/Peasant/T_Peasant_2_BaseColor.png'), check_existing=True)
    outfit_rig.hide_render = True
    outfit_rig.hide_set(True)
    hair_objects = imported(HAIR / (hairstyle + '.gltf'))
    hair_rig = rig_of(hair_objects)
    for obj in hair_objects:
        if obj.type == 'MESH' and any(modifier.type == 'ARMATURE' for modifier in obj.modifiers):
            bind(obj, rig)
            usable.append(obj)
    hair_rig.hide_render = True
    hair_rig.hide_set(True)
    before = set(bpy.data.actions)
    animation_objects = imported(ANIMATIONS)
    actions = [action for action in bpy.data.actions if action not in before]
    selected = {}
    for source_name, state in [('Idle_Loop', 'Standing'), ('Walk_Loop', 'Walking'), ('Sitting_Idle_Loop', 'Seated')]:
        matches = [action for action in actions if action.name.split('.')[0].split('|')[-1] == source_name]
        if len(matches) != 1:
            raise ValueError('Missing unique in-place Standard animation ' + source_name + ': ' + str([action.name for action in actions]))
        action = matches[0].copy()
        action.name = identifier + '_' + state
        action.use_fake_user = True
        selected[state] = action
    for obj in animation_objects:
        obj.hide_render = True
        if obj.name in bpy.context.view_layer.objects:
            obj.hide_set(True)
    rig.animation_data_clear()
    rig.animation_data_create()
    for state, action in selected.items():
        track = rig.animation_data.nla_tracks.new()
        track.name = state
        strip = track.strips.new(state, int(action.frame_range[0]), action)
        strip.name = state
        strip.use_sync_length = True
        track.mute = True
    rig.animation_data.action = selected['Standing']
    scene.frame_set(int(selected['Standing'].frame_range[0]))
    output = WORKSPACE / 'exports' / identifier
    output.mkdir(parents=True, exist_ok=True)
    texture_record = retain_images(usable, output / 'textures')
    # Store a complete editable derivative with original imported components still present
    # but hidden, making the head crop and chosen modular combination reviewable.
    master.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(master), compress=True)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [rig] + usable:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    rig.animation_data.action = None
    for track in rig.animation_data.nla_tracks:
        track.mute = False
    bpy.ops.export_scene.fbx(filepath=str(output / 'avatar.fbx'), use_selection=True, object_types={'ARMATURE', 'MESH'},
                             add_leaf_bones=False, axis_forward='-Z', axis_up='Y', bake_anim=True,
                             bake_anim_use_all_actions=False, bake_anim_use_nla_strips=True, bake_anim_simplify_factor=0,
                             path_mode='COPY', embed_textures=False)
    record = {'id': identifier, 'name': label, 'masterRevision': MASTER_REVISION, 'provider': 'Quaternius', 'license': 'CC0-1.0 (retained Standard archive licenses)',
              'base': original_body.name, 'outfit': gender + '_Peasant', 'hairstyle': hairstyle,
              'headCrop': 'Keep vertices weighted at least0.5 to Head/neck_01; original full body retained hidden in master',
              'rigBones': [bone.name for bone in rig.data.bones], 'meshes': [], 'textures': texture_record,
              'actions': {state: {'source': action.name, 'frameStart': action.frame_range[0], 'frameEnd': action.frame_range[1]} for state, action in selected.items()},
              'sourceSha256': hashlib.sha256(master.read_bytes()).hexdigest(), 'fbxSha256': hashlib.sha256((output / 'avatar.fbx').read_bytes()).hexdigest()}
    for obj in usable:
        obj.data.calc_loop_triangles()
        record['meshes'].append({'name': obj.name, 'vertices': len(obj.data.vertices), 'triangles': len(obj.data.loop_triangles),
                                'materials': [material.name for material in obj.data.materials]})
    (output / 'blender-report.json').write_text(json.dumps(record, indent=2) + '\n')
    print('Derived Quaternius campus master:', identifier, len(rig.data.bones), sum(mesh['triangles'] for mesh in record['meshes']))


requested = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else None
if '--' in sys.argv and len(sys.argv) > sys.argv.index('--') + 2:
    MASTER_REVISION = int(sys.argv[sys.argv.index('--') + 2])
if not 1 <= MASTER_REVISION <= 2**31 - 1:
    raise ValueError('Use a positive integer master revision.')
design = next((design for design in DESIGNS if design[0] == requested), None)
if design is None:
    raise ValueError('Pass one candidate ID after --: campus-ash or campus-lea. Each derivative uses a separate fresh Blender process.')
author(*design)
