import base64
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from authoring import NativeAuthoring


class NativeAuthoringBoundary(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.publication = self.root / 'published.json'
        self.editor = NativeAuthoring(self.root / 'workshop', self.publication)

    def complete_design(self, identity='campus-rowan', name='Rowan'):
        # Container fixtures prove the authoring contract, never actual Blender/Unity acceptance.
        original = self.root / 'original.blend'
        original.write_bytes(b'BLENDER-v450source-contract-fixture')
        self.editor.register_master('campus-base', 1, original, {
            'author': 'Contract test', 'source': 'Original test fixture',
            'license': 'CC0-1.0', 'licenseRecordedAt': '2026-10-13',
            'exportEntitlement': 'Original work; all test rights retained',
        })
        workspace = self.editor.workspace
        exported = workspace / 'exports' / identity
        exported.mkdir(parents=True, exist_ok=True)
        model = exported / 'model.glb'
        model.write_bytes(b'glTF' + (2).to_bytes(4, 'little') + (12).to_bytes(4, 'little'))
        assets = []
        for platform in ('windows-x86_64', 'macos-universal'):
            bundle = exported / (platform + '.bundle')
            bundle.write_bytes(b'UnityFS\0asset-manifest-contract-fixture-' + platform.encode())
            assets.append({'platform': platform, 'format': 'unity-assetbundle', 'unityVersion': '6000.6.0f1',
                           'assetName': f'assets/avatars/{identity}.prefab', 'file': str(bundle.relative_to(workspace))})
        evidence = exported / 'review.md'
        evidence.write_text('Synthetic evidence for validator contract test, not a runtime inspection.')
        clip = lambda name, duration: {'clipName': name, 'durationSeconds': duration, 'loop': True}
        return {
            'id': identity, 'name': name,
            'native': {
                'version': 1, 'masterId': 'campus-base', 'masterRevision': 1,
                'model': {'sourceFile': str(model.relative_to(workspace)), 'rootNode': 'Avatar',
                          'heightMetres': 1.7, 'pivot': 'feet', 'forwardAxis': '+z'},
                'rig': {'type': 'humanoid', 'avatarName': 'CampusHumanoid', 'hipsBone': 'Hips'},
                'animations': {'standing': clip('Standing', 2), 'walking': clip('Walking', 1), 'seated': clip('Seated', 2)},
                'platformAssets': assets,
            },
            'review': {'sourceSha256': hashlib.sha256(model.read_bytes()).hexdigest(),
                       'platformSha256': {asset['platform']: hashlib.sha256((workspace / asset['file']).read_bytes()).hexdigest() for asset in assets},
                       'checks': list(NativeAuthoring.REVIEW_CHECKS),
                       'evidenceFiles': [str(evidence.relative_to(workspace))]},
        }

    def test_publish_validated_ordered_designs_and_keep_drafts_private(self):
        first = self.editor.save(self.complete_design())
        second = self.editor.save(self.complete_design('campus-mira', 'Mira'))
        self.assertFalse(self.publication.exists())
        collection = self.editor.publish([second['id'], first['id']])
        self.assertEqual(2, collection['version'])
        self.assertEqual(['campus-mira', 'campus-rowan'], [preset['id'] for preset in collection['presets']])
        self.assertEqual(collection, json.loads(self.publication.read_text()))
        native = collection['presets'][0]['native']
        self.assertNotIn('sourceFile', native['model'])
        self.assertNotIn('review', collection['presets'][0])
        for asset in native['platformAssets']:
            self.assertNotIn('file', asset)
            self.assertTrue(base64.b64decode(asset['data']).startswith(b'UnityFS\0'))
        published = self.publication.read_bytes()
        first['name'] = 'Changed draft'
        self.editor.save(first)
        self.assertEqual(published, self.publication.read_bytes())
        self.assertEqual('Changed draft', self.editor.open(first['id'])['name'])

    def test_missing_platform_or_changed_assets_cannot_replace_last_good_publication(self):
        design = self.editor.save(self.complete_design())
        self.editor.publish([design['id']])
        previous = self.publication.read_bytes()
        bundle = self.editor.workspace / design['native']['platformAssets'][0]['file']
        bundle.write_bytes(b'UnityFS\0changed-unreviewed-native-asset')
        with self.assertRaisesRegex(ValueError, 'review|Inspect'):
            self.editor.publish([design['id']])
        self.assertEqual(previous, self.publication.read_bytes())
        design['native']['platformAssets'].pop()
        self.editor.save(design)
        with self.assertRaisesRegex(ValueError, 'Windows and macOS'):
            self.editor.publish([design['id']])
        self.assertEqual(previous, self.publication.read_bytes())

    def test_master_repairs_require_a_new_revision_and_variants_keep_the_original(self):
        design = self.editor.save(self.complete_design())
        self.editor.publish([design['id']])
        original = self.editor.workspace / 'masters/campus-base/v1/source.blend'
        original_bytes = original.read_bytes()
        provenance = json.loads((original.parent / 'master.json').read_text())['provenance']
        changed = self.root / 'repair.blend'
        changed.write_bytes(b'BLENDER-v450explicit-base-repair-fixture')
        with self.assertRaisesRegex(ValueError, 'immutable'):
            self.editor.register_master('campus-base', 1, changed, provenance)
        self.editor.register_master('campus-base', 2, changed, provenance)
        self.assertEqual(original_bytes, original.read_bytes())
        self.assertEqual(changed.read_bytes(), (self.editor.workspace / 'masters/campus-base/v2/source.blend').read_bytes())
        self.assertEqual(1, self.editor.open(design['id'])['native']['masterRevision'])

    def test_stale_model_review_missing_files_and_invalid_collection_leave_publication_intact(self):
        design = self.editor.save(self.complete_design())
        self.editor.publish([design['id']])
        previous = self.publication.read_bytes()
        for invalid in ([], [design['id'], design['id']], [None]):
            with self.assertRaises(ValueError):
                self.editor.publish(invalid)
            self.assertEqual(previous, self.publication.read_bytes())
        design['review']['sourceSha256'] = 'b' * 64
        self.editor.save(design)
        with self.assertRaisesRegex(ValueError, 'Inspect'):
            self.editor.publish([design['id']])
        self.assertEqual(previous, self.publication.read_bytes())
        design['native']['model']['sourceFile'] = '../outside.glb'
        self.editor.save(design)
        with self.assertRaisesRegex(ValueError, 'workspace'):
            self.editor.publish([design['id']])
        self.assertEqual(previous, self.publication.read_bytes())


if __name__ == '__main__':
    unittest.main()
