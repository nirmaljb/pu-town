"""Derive one immutable editable KayKit master from the pinned free GLB sources.

Run a fresh Blender process per character:
Blender --background --factory-startup --python tools/native-avatars/kaykit_author.py -- kaykit-knight
The free source character, topology, UVs, skin weights and atlas remain intact.
"""
import hashlib
import json
import shutil
import struct
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
WORKSPACE = ROOT / 'towns/assets/avatars'
SOURCES = WORKSPACE / 'sources/kaykit'
CHARACTERS = {'kaykit-' + name.lower(): name for name in ('Barbarian', 'Knight', 'Mage', 'Ranger', 'Rogue')}
CLIPS = {'Standing': ('General', 'Idle_A'), 'Walking': ('MovementBasic', 'Walking_A'), 'Seated': ('Simulation', 'Sit_Chair_Idle')}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def imported(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    return [obj for obj in bpy.data.objects if obj not in before]


def author(identifier, revision=1):
    name = CHARACTERS[identifier]
    master = WORKSPACE / 'sources' / identifier / ('v' + str(revision)) / 'avatar.blend'
    if master.exists():
        raise ValueError('This editable master revision already exists; use an explicit new revision for changes.')
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.render.fps = 30
    source = SOURCES / 'adventurers' / (name + '.glb')
    objects = imported(source)
    rigs = [obj for obj in objects if obj.type == 'ARMATURE']
    if len(rigs) != 1:
        raise ValueError('Expected exactly one original KayKit Medium rig.')
    rig = rigs[0]
    payload = source.read_bytes()
    document = json.loads(payload[20:20 + struct.unpack_from('<I', payload, 12)[0]])
    mesh_names = {node['name'] for node in document['nodes'] if 'mesh' in node}
    meshes = [obj for obj in objects if obj.type == 'MESH' and obj.name in mesh_names]
    if len(meshes) != len(mesh_names):
        raise ValueError('The imported character lost an original mesh component.')
    if not meshes or any(not any(mod.type == 'ARMATURE' and mod.object == rig for mod in obj.modifiers) for obj in meshes):
        raise ValueError('Every supplied character component must retain original rig binding.')
    carried = [obj for obj in meshes if any(term in obj.name.lower() for term in ('weapon', 'quiver', 'arrow', 'sword', 'shield', 'staff', 'wand'))]
    for obj in carried:
        obj.hide_render = True
        obj.hide_set(True)
    meshes = [obj for obj in meshes if obj not in carried]
    texture = SOURCES / 'adventurers' / (name.lower() + '_texture.png')
    # Point imported materials at the unchanged original atlas, then pack it into
    # the editable master. FBX material reconstruction uses this same exact PNG.
    original_atlas = bpy.data.images.load(str(texture), check_existing=True)
    for mesh in meshes:
        for material in mesh.data.materials:
            if material and material.use_nodes:
                for node in material.node_tree.nodes:
                    if node.type == 'TEX_IMAGE':
                        node.image = original_atlas
    selected = {}
    for state, (category, source_clip) in CLIPS.items():
        before = set(bpy.data.actions)
        extra = imported(SOURCES / 'animations' / ('Rig_Medium_' + category + '.glb'))
        actions = [action for action in bpy.data.actions if action not in before]
        matches = [action for action in actions if action.name.split('.')[0].split('|')[-1] == source_clip]
        if len(matches) != 1:
            raise ValueError('Missing unique KayKit clip ' + source_clip + ': ' + str([a.name for a in actions]))
        action = matches[0].copy()
        action.name = identifier + '_' + state
        action.use_fake_user = True
        selected[state] = action
        for obj in extra:
            obj.hide_render = True
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
    if selected['Standing'].slots:
        rig.animation_data.action_slot = selected['Standing'].slots[0]
    scene.frame_set(int(selected['Standing'].frame_range[0]))
    original_atlas.pack()
    master.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(master), compress=True)
    output = WORKSPACE / 'exports' / identifier
    output.mkdir(parents=True, exist_ok=True)
    textures = output / 'textures'
    textures.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(texture, textures / texture.name)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [rig] + meshes:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    rig.animation_data.action = None
    for track in rig.animation_data.nla_tracks:
        track.mute = False
    bpy.ops.export_scene.fbx(filepath=str(output / 'avatar.fbx'), use_selection=True, object_types={'ARMATURE', 'MESH'},
                             add_leaf_bones=False, axis_forward='-Z', axis_up='Y', bake_anim=True,
                             bake_anim_use_all_actions=False, bake_anim_use_nla_strips=True, bake_anim_simplify_factor=0,
                             path_mode='STRIP', embed_textures=False)
    records = []
    for mesh in meshes:
        mesh.data.calc_loop_triangles()
        records.append({'name': mesh.name, 'vertices': len(mesh.data.vertices), 'triangles': len(mesh.data.loop_triangles),
                        'materials': [m.name for m in mesh.data.materials],
                        'boundRig': rig.name})
    report = {'id': identifier, 'name': name, 'masterRevision': revision, 'provider': 'Kay Lousberg', 'license': 'CC0-1.0',
              'sourceArchive': 'KayKit Adventurers Free 2.0', 'animationArchive': 'KayKit Character Animations Free 1.1',
              'sourceCharacterSha256': sha(source), 'sourceAtlasSha256': sha(texture), 'sourceSha256': sha(master),
              'fbxSha256': sha(output / 'avatar.fbx'), 'rigBones': [bone.name for bone in rig.data.bones],
              'meshes': records, 'carriedAccessories': [], 'retainedHiddenAccessories': [obj.name for obj in carried],
              'actions': {state: {'source': CLIPS[state][1], 'frameStart': action.frame_range[0], 'frameEnd': action.frame_range[1]} for state, action in selected.items()}}
    (output / 'blender-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print('Derived free KayKit editable master:', identifier, len(rig.data.bones), sum(m['triangles'] for m in records))


if '--' not in sys.argv:
    raise ValueError('Pass one of the five kaykit-* character IDs after --.')
arguments = sys.argv[sys.argv.index('--') + 1:]
identifier = arguments[0]
if identifier not in CHARACTERS:
    raise ValueError('Unknown KayKit character.')
revision = int(arguments[1]) if len(arguments) > 1 else 1
if not 1 <= revision <= 2**31 - 1:
    raise ValueError('Use a positive immutable master revision.')
author(identifier, revision)
