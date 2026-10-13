"""Private native Avatar workshop. Only a validated publication reaches the Java server."""
import argparse
import base64
import copy
import datetime
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import tempfile


ROOT = Path(__file__).resolve().parent
IDENTITY = re.compile(r'[a-z0-9][a-z0-9-]{0,63}')
UNITY_VERSION = re.compile(r'[0-9]+\.[0-9]+\.[0-9]+[abfp][0-9]+')
PLATFORMS = {'windows-x86_64', 'macos-universal'}
MAX_ASSET_BYTES = 64 * 1024 * 1024


def atomic_bytes(path, contents):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, suffix='.tmp')
    try:
        with os.fdopen(descriptor, 'wb') as output:
            output.write(contents)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def atomic_json(path, value):
    atomic_bytes(path, (json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + '\n').encode())


def exact_fields(value, expected, label):
    if not isinstance(value, dict) or set(value) != set(expected):
        raise ValueError(f'Complete the supported {label} fields: {", ".join(sorted(expected))}.')


def text(value, label, limit=512):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ValueError(f'Give {label} a nonempty text value of at most {limit} characters.')
    return value


def identity(value):
    if not isinstance(value, str) or not IDENTITY.fullmatch(value):
        raise ValueError('Use a stable lowercase Avatar identifier of at most 64 characters.')
    return value


def positive(value, label):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
        raise ValueError(f'Give {label} a positive finite numeric value.')
    return value


def sha256(contents):
    return hashlib.sha256(contents).hexdigest()


class NativeAuthoring:
    # These records are tied to the exported model hash. They do not automate an art review.
    REVIEW_CHECKS = ('silhouette', 'scale-pivot', 'uv-normals', 'deformation', 'native-materials',
                     'standing', 'walking', 'seated')

    def __init__(self, workspace=ROOT / 'workshop', publication=ROOT.parents[1] / 'backend/data/published-avatars.json'):
        self.workspace = Path(workspace).resolve()
        self.publication = Path(publication)

    def draft_path(self, preset_id):
        return self.workspace / 'drafts' / (identity(preset_id) + '.json')

    def save(self, design):
        """Save an incomplete draft without touching the publication or its original master."""
        if not isinstance(design, dict):
            raise ValueError('Save a JSON Avatar design.')
        saved = copy.deepcopy(design)
        identity(saved.get('id'))
        saved['name'] = text(saved.get('name'), 'the Avatar Preset name', 24).strip()
        atomic_json(self.draft_path(saved['id']), saved)
        return saved

    def open(self, preset_id):
        path = self.draft_path(preset_id)
        if not path.is_file():
            raise ValueError(f'No saved native design called {preset_id}.')
        return json.loads(path.read_text())

    def register_master(self, master_id, revision, source, provenance):
        """Capture a Blender master once. A changed source requires a new explicit revision."""
        identity(master_id)
        if isinstance(revision, bool) or not isinstance(revision, int) or not 1 <= revision <= 2**31 - 1:
            raise ValueError('Use a positive integer master revision.')
        exact_fields(provenance, ('author', 'source', 'license', 'licenseRecordedAt', 'exportEntitlement'), 'master provenance')
        for key, value in provenance.items():
            text(value, key)
        datetime.date.fromisoformat(provenance['licenseRecordedAt'])
        source_bytes = Path(source).read_bytes()
        # Blender's own Save may use gzip (legacy) or Zstandard (5.x) compression.
        # Editable-source acceptance is separately proved by Blender opening the master.
        if not source_bytes.startswith((b'BLENDER', b'\x1f\x8b', b'\x28\xb5\x2f\xfd')):
            raise ValueError('Register the editable original Blender .blend master.')
        master = {'version': 1, 'id': master_id, 'revision': revision, 'sourceFile': 'source.blend',
                  'sourceSha256': sha256(source_bytes), 'provenance': copy.deepcopy(provenance)}
        directory = self.workspace / 'masters' / master_id / ('v' + str(revision))
        if directory.exists():
            recorded = json.loads((directory / 'master.json').read_text())
            if recorded != master or (directory / 'source.blend').read_bytes() != source_bytes:
                raise ValueError('This master revision is immutable. Register a new revision for a base repair.')
            return recorded
        directory.parent.mkdir(parents=True, exist_ok=True)
        staging = Path(tempfile.mkdtemp(dir=directory.parent, prefix='.master-'))
        try:
            atomic_bytes(staging / 'source.blend', source_bytes)
            atomic_json(staging / 'master.json', master)
            os.rename(staging, directory)
        finally:
            if staging.exists():
                shutil.rmtree(staging)
        return master

    def private_file(self, value):
        text(value, 'the private workspace file')
        relative = Path(value)
        resolved = (self.workspace / relative).resolve()
        if relative.is_absolute() or not resolved.is_relative_to(self.workspace) or not resolved.is_file():
            raise ValueError(f'Missing or outside-workspace native asset: {value}.')
        return resolved

    def validate_master(self, native):
        master_id = identity(native.get('masterId'))
        revision = native.get('masterRevision')
        if isinstance(revision, bool) or not isinstance(revision, int) or not 1 <= revision <= 2**31 - 1:
            raise ValueError('Use a positive integer master revision.')
        base = Path('masters') / master_id / ('v' + str(revision))
        record = json.loads(self.private_file(str(base / 'master.json')).read_text())
        if record.get('id') != master_id or record.get('revision') != revision:
            raise ValueError('The native Avatar must name its registered master revision.')
        if sha256(self.private_file(str(base / 'source.blend')).read_bytes()) != record.get('sourceSha256'):
            raise ValueError('The original master changed. Register a new revision and recheck its variants.')

    def compile_design(self, design):
        """Validate complete descriptors and files; embed only the public runtime representation."""
        expected = {'id', 'name', 'native', 'review'}
        if 'sprite' in design or 'seatedSprite' in design:
            expected |= {'sprite', 'seatedSprite'}
        exact_fields(design, expected, 'native design')
        preset = {'id': identity(design['id']), 'name': text(design['name'], 'the Avatar Preset name', 24).strip()}
        if 'sprite' in design:
            for key in ('sprite', 'seatedSprite'):
                if not isinstance(design[key], str) or not design[key].startswith('data:image/png;base64,'):
                    raise ValueError('A transitional sprite representation needs both inline PNG sheets.')
                preset[key] = design[key]
        native = copy.deepcopy(design['native'])
        exact_fields(native, ('version', 'masterId', 'masterRevision', 'model', 'rig', 'animations', 'platformAssets'), 'native representation')
        if type(native['version']) is not int or native['version'] != 1:
            raise ValueError('Unsupported native Avatar version.')
        self.validate_master(native)
        model = native['model']
        exact_fields(model, ('sourceFile', 'rootNode', 'heightMetres', 'pivot', 'forwardAxis'), 'exported model')
        source = self.private_file(model.pop('sourceFile'))
        model_bytes = source.read_bytes()
        # The editor/runtime must additionally inspect mesh, deformation and materials.
        if source.suffix.lower() == '.glb':
            if len(model_bytes) < 12 or model_bytes[:4] != b'glTF' or int.from_bytes(model_bytes[4:8], 'little') != 2 or int.from_bytes(model_bytes[8:12], 'little') != len(model_bytes):
                raise ValueError('Export a complete glTF 2 GLB model.')
        elif source.suffix.lower() == '.fbx':
            if not (model_bytes.startswith(b'Kaydara FBX Binary') or b'FBXHeaderExtension:' in model_bytes[:4096]):
                raise ValueError('Export a complete FBX model.')
        else:
            raise ValueError('Use an exported GLB or FBX model from the retained Blender master.')
        model['sourceSha256'] = sha256(model_bytes)
        text(model['rootNode'], 'the model root node')
        positive(model['heightMetres'], 'the Avatar height in metres')
        if model['pivot'] != 'feet' or model['forwardAxis'] != '+z':
            raise ValueError('Use a feet pivot and Unity +Z forward axis.')
        rig = native['rig']
        exact_fields(rig, ('type', 'avatarName', 'hipsBone'), 'rig')
        if rig['type'] != 'humanoid':
            raise ValueError('Use the shared humanoid rig convention.')
        text(rig['avatarName'], 'the Unity Avatar name')
        text(rig['hipsBone'], 'the hips bone')
        animations = native['animations']
        exact_fields(animations, ('standing', 'walking', 'seated'), 'animations')
        for state, clip in animations.items():
            exact_fields(clip, ('clipName', 'durationSeconds', 'loop'), state + ' animation')
            text(clip['clipName'], state + ' clip name')
            positive(clip['durationSeconds'], state + ' clip duration')
            if clip['loop'] is not True:
                raise ValueError('Standing, walking and seated representations must loop.')
        assets = native['platformAssets']
        if not isinstance(assets, list) or len(assets) != 2:
            raise ValueError('Export complete native Avatar bundles for Windows and macOS.')
        seen = set()
        versions = set()
        for asset in assets:
            exact_fields(asset, ('platform', 'format', 'unityVersion', 'assetName', 'file'), 'platform asset')
            if asset['platform'] not in PLATFORMS or asset['platform'] in seen or asset['format'] != 'unity-assetbundle':
                raise ValueError('Export one Unity AssetBundle for each supported native platform.')
            seen.add(asset['platform'])
            text(asset['assetName'], 'the bundled prefab asset name')
            if not isinstance(asset['unityVersion'], str) or not UNITY_VERSION.fullmatch(asset['unityVersion']):
                raise ValueError('Record the Unity editor version used to build each bundle.')
            versions.add(asset['unityVersion'])
            bundle = self.private_file(asset.pop('file'))
            if not 8 <= bundle.stat().st_size <= MAX_ASSET_BYTES:
                raise ValueError('Each native Avatar bundle must contain 8 bytes to 64 MiB.')
            contents = bundle.read_bytes()
            if not contents.startswith(b'UnityFS\0'):
                raise ValueError('Export a UnityFS AssetBundle; do not publish an editor source as a runtime bundle.')
            asset.update(sha256=sha256(contents), byteLength=len(contents), data=base64.b64encode(contents).decode('ascii'))
        if len(versions) != 1:
            raise ValueError('Build both native platform assets with the same Unity version.')
        review = design['review']
        exact_fields(review, ('sourceSha256', 'platformSha256', 'checks', 'evidenceFiles'), 'native review record')
        checks = review['checks']
        platform_hashes = {asset['platform']: asset['sha256'] for asset in assets}
        if review['sourceSha256'] != model['sourceSha256'] or review['platformSha256'] != platform_hashes or not isinstance(checks, list) or any(not isinstance(check, str) for check in checks) or set(checks) != set(self.REVIEW_CHECKS) or len(checks) != len(self.REVIEW_CHECKS):
            raise ValueError('Inspect the current model silhouette, scale/pivot, UVs/normals, deformation, materials and all three states before publication.')
        evidence = review['evidenceFiles']
        if not isinstance(evidence, list) or not evidence:
            raise ValueError('Keep actual Blender/Unity camera and deformation inspection evidence in the private workshop.')
        for recorded in evidence:
            if self.private_file(recorded).stat().st_size == 0:
                raise ValueError('Native inspection evidence must not be empty.')
        preset['native'] = native
        return preset

    def publish(self, identities):
        if not isinstance(identities, list) or not identities:
            raise ValueError('Select at least one saved native design to publish.')
        if any(not isinstance(value, str) for value in identities) or len(set(identities)) != len(identities):
            raise ValueError('Select distinct saved native designs.')
        presets = [self.compile_design(self.open(preset_id)) for preset_id in identities]
        collection = {'version': 2, 'presets': presets}
        atomic_json(self.publication, collection)
        return collection


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace', type=Path, default=ROOT / 'workshop')
    parser.add_argument('--publication', type=Path, default=ROOT.parents[1] / 'backend/data/published-avatars.json')
    commands = parser.add_subparsers(dest='command', required=True)
    save = commands.add_parser('save', help='save a private JSON design, possibly incomplete')
    save.add_argument('design', type=Path)
    register = commands.add_parser('register-master', help='capture an immutable editable Blender master')
    register.add_argument('id')
    register.add_argument('revision', type=int)
    register.add_argument('source', type=Path)
    register.add_argument('provenance', type=Path)
    publish = commands.add_parser('publish', help='validate complete saved designs, then atomically publish')
    publish.add_argument('ids', nargs='+')
    validate = commands.add_parser('validate', help='validate saved designs without touching publication')
    validate.add_argument('ids', nargs='+')
    args = parser.parse_args()
    editor = NativeAuthoring(args.workspace, args.publication)
    try:
        if args.command == 'save':
            saved = editor.save(json.loads(args.design.read_text()))
            print('Saved private draft ' + saved['id'])
        elif args.command == 'register-master':
            editor.register_master(args.id, args.revision, args.source, json.loads(args.provenance.read_text()))
            print(f'Registered {args.id} master revision {args.revision}')
        elif args.command == 'publish':
            collection = editor.publish(args.ids)
            print(f'Published {len(collection["presets"])} native Avatar Presets to {args.publication}')
        else:
            for preset_id in args.ids:
                editor.compile_design(editor.open(preset_id))
            print(f'Validated {len(args.ids)} native Avatar Presets; publication is unchanged')
    except (ValueError, OSError, KeyError, TypeError) as problem:
        parser.exit(1, f'Cannot {args.command}: {problem}\n')


if __name__ == '__main__':
    main()
