#!/usr/bin/env python3
"""Import hash-pinned free Town sources without altering the downloaded archives.

Download the exact free releases listed in towns/assets/sources/README.md first.
This tool never makes network requests, purchases, or publishes Avatar drafts.
"""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[2]
SOURCES = ROOT / 'towns/assets/sources'
PINS = {
    'adventurers': ('kaykit/KayKit Adventurers Free 2.0.zip', 'abe48f4763fba0896bab486ee9e6d08ca6b5b3884b9601f235c8847ae94dc479'),
    'animations': ('kaykit/KayKit Character Animations Free 1.1.zip', '65882f31f905ad2e953819648a59287cdeab8f623908d5ef701971d3758be20f'),
    'village': ('quaternius/Medieval Village MegaKit[Standard].zip', 'e60dea67c10f30dccccfbff92a7933f5ea5cfe99be0e2a0fa5118cceabeec5c4'),
}
NATURE_ARCHIVE = SOURCES / 'quaternius/Stylized Nature MegaKit[Standard].zip'
NATURE_HASH = '298f6732b872e4cf7b30e6e7abf9641c7f6dc6b326df37ac089533ed7e3d58c9'
CHARACTERS = ('Barbarian', 'Knight', 'Mage', 'Ranger', 'Rogue')
ANIMATION_SETS = ('General', 'MovementBasic', 'Simulation')
VILLAGE_MODELS = (
    'Wall_Plaster_Straight', 'Wall_Plaster_Window_Wide_Flat', 'Wall_Plaster_Window_Thin_Round', 'Wall_Plaster_Door_Flat',
    'Wall_UnevenBrick_Straight', 'Wall_UnevenBrick_Window_Wide_Flat', 'Wall_UnevenBrick_Door_Flat', 'Wall_Plaster_WoodGrid',
    'Door_1_Flat', 'Door_4_Flat', 'DoorFrame_Flat_WoodDark', 'Window_Wide_Flat1', 'Window_Thin_Round1',
    'WindowShutters_Wide_Flat_Closed', 'WindowShutters_Thin_Round_Closed',
    'Roof_RoundTiles_4x4', 'Roof_RoundTiles_4x6', 'Roof_RoundTiles_4x8', 'Roof_Tower_RoundTiles',
    'Roof_Front_Brick4', 'Roof_Front_Brick6', 'Roof_Log', 'Floor_UnevenBrick',
    'Prop_Chimney', 'Prop_Chimney2', 'Prop_Crate', 'Prop_Wagon',
    'Prop_WoodenFence_Single', 'Prop_WoodenFence_Extension1', 'Prop_Support', 'Prop_Vine1',
)


def sha(payload):
    return hashlib.sha256(payload).hexdigest()


def write(path, payload, check):
    if check:
        if not path.is_file() or path.read_bytes() != payload:
            raise ValueError('Missing or altered retained import: ' + str(path.relative_to(ROOT)))
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.is_file() or path.read_bytes() != payload:
            path.write_bytes(payload)


def retained_zip(path, expected):
    if not path.is_file() or sha(path.read_bytes()) != expected:
        raise ValueError('Restore the exact pinned free source archive: ' + str(path.relative_to(ROOT)))
    archive = zipfile.ZipFile(path)
    if archive.testzip() is not None:
        raise ValueError('Source archive CRC check failed: ' + str(path))
    return archive


def copy_member(archive, member, path, check):
    payload = archive.read(member)
    write(path, payload, check)
    return {'sourcePath': member, 'importPath': str(path.relative_to(ROOT)), 'byteLength': len(payload), 'sha256': sha(payload)}


def material_map(document):
    def texture(reference):
        if not reference:
            return None
        return Path(document['images'][document['textures'][reference['index']]['source']]['uri']).name
    result = []
    for source in document.get('materials', []):
        pbr = source.get('pbrMetallicRoughness', {})
        result.append({'name': source['name'], 'baseColorTexture': texture(pbr.get('baseColorTexture')),
                       'normalTexture': texture(source.get('normalTexture')),
                       'metallicRoughnessTexture': texture(pbr.get('metallicRoughnessTexture')),
                       'occlusionTexture': texture(source.get('occlusionTexture')),
                       'baseColorFactor': pbr.get('baseColorFactor', [1, 1, 1, 1]),
                       'metallicFactor': pbr.get('metallicFactor', 1), 'roughnessFactor': pbr.get('roughnessFactor', 1),
                       'alphaMode': source.get('alphaMode', 'OPAQUE'), 'alphaCutoff': source.get('alphaCutoff', .5),
                       'doubleSided': source.get('doubleSided', False)})
    return result


def import_environment(archive, prefix, models, art_pack, check):
    records, textures = [], {}
    for name in models:
        document = json.loads(archive.read(prefix + 'glTF/' + name + '.gltf'))
        materials = material_map(document)
        fbx_member = prefix + 'FBX/' + name + '.fbx'
        if prefix + 'FBX (Unity)/' + name + '.fbx' in archive.namelist():
            fbx_member = prefix + 'FBX (Unity)/' + name + '.fbx'
        record = copy_member(archive, fbx_member, ROOT / 'native/Assets/Art/Quaternius' / art_pack / 'Models' / (name + '.fbx'), check)
        record.update(name=name, materialMappingSource=prefix + 'glTF/' + name + '.gltf', materials=materials)
        records.append(record)
        for material in materials:
            for field in ('baseColorTexture', 'normalTexture', 'metallicRoughnessTexture', 'occlusionTexture'):
                texture = material[field]
                if not texture or texture in textures:
                    continue
                member = prefix + 'glTF/' + texture
                unity_normal = prefix + 'Textures/Normals Godot-Unity/' + texture
                if field == 'normalTexture' and unity_normal in archive.namelist():
                    member = unity_normal
                if member not in archive.namelist():
                    member = prefix + 'Textures/' + texture
                textures[texture] = copy_member(archive, member, ROOT / 'native/Assets/Art/Quaternius' / art_pack / 'Textures' / texture, check)
    return {'pack': art_pack, 'edition': 'Standard', 'models': records, 'textures': list(textures.values())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    inventory = {'version': 1, 'retrievedDate': '2026-10-14', 'packs': []}
    for key, (relative, expected) in PINS.items():
        path = SOURCES / relative
        with retained_zip(path, expected) as archive:
            inventory['packs'].append({'key': key, 'archive': str(path.relative_to(ROOT)), 'sha256': expected,
                                       'byteLength': path.stat().st_size,
                                       'files': [{'path': info.filename, 'byteLength': info.file_size, 'crc32': f'{info.CRC:08x}'}
                                                 for info in archive.infolist() if not info.is_dir()]})
            if key == 'village':
                prefix = 'Medieval Village MegaKit[Standard]/'
                selection = import_environment(archive, prefix, VILLAGE_MODELS, 'Village', args.check)
                selection.update(archive=str(path.relative_to(ROOT)), archiveSha256=expected)
                write(SOURCES / 'quaternius/Village-selection.json', (json.dumps(selection, indent=2) + '\n').encode(), args.check)
                copy_member(archive, prefix + 'License_Standard.txt', SOURCES / 'quaternius/Medieval-License_Standard.txt', args.check)
            else:
                prefix = 'KayKit_Adventurers_2.0_FREE/' if key == 'adventurers' else 'KayKit_Character_Animations_1.1/'
                copy_member(archive, prefix + 'License.txt', SOURCES / 'kaykit' / (key + '-License.txt'), args.check)
                extracted = ROOT / 'towns/assets/avatars/sources/kaykit' / key
                if key == 'adventurers':
                    for name in CHARACTERS:
                        copy_member(archive, prefix + 'Characters/gltf/' + name + '.glb', extracted / (name + '.glb'), args.check)
                        copy_member(archive, prefix + 'Textures/' + name.lower() + '_texture.png', extracted / (name.lower() + '_texture.png'), args.check)
                else:
                    for name in ANIMATION_SETS:
                        member = prefix + 'Animations/gltf/Rig_Medium/Rig_Medium_' + name + '.glb'
                        copy_member(archive, member, extracted / ('Rig_Medium_' + name + '.glb'), args.check)
    with retained_zip(NATURE_ARCHIVE, NATURE_HASH) as archive:
        existing = json.loads((SOURCES / 'quaternius/Nature-selection.json').read_text())
        names = [entry['name'] for entry in existing['models']]
        selection = import_environment(archive, '', names, 'Nature', args.check)
        selection.update(archive=str(NATURE_ARCHIVE.relative_to(ROOT)), archiveSha256=NATURE_HASH,
                         reuse='The exact older Standard source remains unchanged.')
        write(SOURCES / 'quaternius/Nature-selection.json', (json.dumps(selection, indent=2) + '\n').encode(), args.check)
        for name in ('Bark_DeadTree_Normal.png', 'Bark_TwistedTree_Normal.png'):
            copy_member(archive, 'Textures/' + name, ROOT / 'native/Assets/Art/Quaternius/Nature/Textures' / name, args.check)
    props = json.loads((SOURCES / 'quaternius/Props-selection.json').read_text())
    props['archive'] = 'towns/assets/sources/quaternius/Fantasy Props MegaKit[Standard].zip'
    names = {'Chair_1', 'Bench', 'Table_Large'}
    props['models'] = [entry for entry in props['models'] if entry['name'] in names]
    needed = {entry[field] for model in props['models'] for entry in model['materials']
              for field in ('baseColorTexture', 'normalTexture', 'metallicRoughnessTexture', 'occlusionTexture') if entry.get(field)}
    props['textures'] = [entry for entry in props['textures'] if Path(entry['importPath']).name in needed]
    props['reuse'] = 'Three already imported free Fantasy Props Standard meshes serve Meeting Seats and street furnishing.'
    write(SOURCES / 'quaternius/Props-selection.json', (json.dumps(props, indent=2) + '\n').encode(), args.check)
    write(SOURCES / 'archive-inventory.json', (json.dumps(inventory, indent=2) + '\n').encode(), args.check)
    print('Verified free source hashes, CRCs, exact selected imports and retained licenses.' if args.check else 'Imported free sources; no Avatar publication was changed.')


if __name__ == '__main__':
    main()
