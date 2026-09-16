import json
import base64
import io
from PIL import Image, ImageChops
import tempfile
import unittest
from pathlib import Path
from authoring import Authoring

ROOT = Path(__file__).parent

class AuthoringBoundary(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.drafts = Path(self.temp.name) / 'drafts'
        self.publication = Path(self.temp.name) / 'collection.json'
        self.editor = Authoring(self.drafts, self.publication)
        self.example = json.loads((ROOT / 'drafts/townsperson-1.json').read_text())

    def test_save_and_reopen_recipe_and_observable_appearance(self):
        saved = self.editor.save({'name': 'Orchard', 'parts': self.example['parts']})
        restarted = Authoring(self.drafts, self.publication)
        reopened = restarted.open(saved['id'])
        self.assertEqual('Orchard', reopened['name'])
        self.assertEqual(self.example['parts'], reopened['parts'])
        appearance = restarted.preview(reopened)
        self.assertTrue(appearance['sprite'].startswith('data:image/png;base64,'))
        self.assertTrue(appearance['seatedSprite'].startswith('data:image/png;base64,'))
        self.assertFalse(self.publication.exists())

    def test_draft_library_duplicate_rename_edit_and_delete_are_independent(self):
        first = self.editor.save({'name': 'Orchard', 'parts': self.example['parts']})
        copy = self.editor.duplicate(first['id'])
        self.assertNotEqual(first['id'], copy['id'])
        copy['name'] = 'Meadow'
        copy['parts']['top']['colour'] = 'sky'
        self.editor.save(copy)
        self.assertEqual('Meadow', self.editor.open(copy['id'])['name'])
        self.assertEqual('Orchard', self.editor.open(first['id'])['name'])
        self.assertEqual('forest', self.editor.open(first['id'])['parts']['top']['colour'])
        self.editor.delete(first['id'])
        self.assertEqual([copy['id']], [draft['id'] for draft in self.editor.library()])
        self.assertFalse(self.publication.exists())

    def test_publication_validates_then_atomically_preserves_saved_order_and_draft_isolation(self):
        designs = [self.editor.save({'name': 'Design ' + str(i), 'parts': self.example['parts']}) for i in range(11)]
        order = [d['id'] for d in designs[:10]][::-1]
        self.editor.publish(order)
        published = self.publication.read_bytes()
        collection = json.loads(published)['presets']
        self.assertEqual(order, [p['id'] for p in collection])
        self.assertEqual('Design 9', collection[0]['name'])
        for invalid in (order[:9], [d['id'] for d in designs], order[:9] + [order[0]]):
            with self.assertRaisesRegex(ValueError, 'ten|distinct'):
                self.editor.publish(invalid)
            self.assertEqual(published, self.publication.read_bytes())
        design = self.editor.open(order[0])
        design['name'] = 'Renamed'
        del design['parts']['hair']
        self.editor.save(design)
        with self.assertRaisesRegex(ValueError, 'Complete'):
            self.editor.publish(order)
        self.assertEqual(published, self.publication.read_bytes())
        self.editor.delete(order[1])
        with self.assertRaises((ValueError, FileNotFoundError)):
            self.editor.publish(order)
        self.assertEqual(published, self.publication.read_bytes())
        self.assertEqual('Renamed', self.editor.open(order[0])['name'])

    def test_missing_or_incompatible_artwork_cannot_replace_the_publication(self):
        designs = [self.editor.save({'name': 'Design ' + str(i), 'parts': self.example['parts']}) for i in range(10)]
        order = [d['id'] for d in designs]
        self.editor.publish(order)
        before = self.publication.read_bytes()
        unavailable = Authoring(self.drafts, self.publication, sources=Path(self.temp.name) / 'missing')
        with self.assertRaisesRegex(ValueError, 'Missing body asset'):
            unavailable.publish(order)
        self.assertEqual(before, self.publication.read_bytes())
        design = self.editor.open(order[0])
        design['parts']['top']['part'] = 'torso/clothes/shortsleeve/tshirt/female'
        with self.assertRaisesRegex(ValueError, 'match this body'):
            self.editor.save(design)
        self.assertEqual(before, self.publication.read_bytes())

    def test_player_facing_names_are_refused_when_they_read_as_a_slur(self):
        designs = [self.editor.save({'name': 'Design ' + str(i), 'parts': self.example['parts']}) for i in range(10)]
        order = [d['id'] for d in designs]
        self.editor.publish(order)
        published = self.publication.read_bytes()
        for refused in ('Nigga', ' n i g g a ', 'N1gg4', 'niiiggga', 'Retard', 'f-a-g-g-o-t'):
            with self.assertRaisesRegex(ValueError, 'slur'):
                self.editor.save({'name': refused, 'parts': self.example['parts']})
        self.assertEqual(10, len(self.editor.library()))
        # A draft written before validation existed is still stopped at the publication boundary.
        smuggled = json.loads((self.drafts / (order[0] + '.json')).read_text())
        smuggled['name'] = 'Nigga'
        (self.drafts / (order[0] + '.json')).write_text(json.dumps(smuggled))
        with self.assertRaisesRegex(ValueError, 'slur'):
            self.editor.publish(order)
        self.assertEqual(published, self.publication.read_bytes())
        for allowed in ('Rowan', 'Niger Delta', 'Scunthorpe', 'Cocoon', 'Retardant'):
            self.assertEqual(allowed, self.editor.save({'name': allowed, 'parts': self.example['parts']})['name'])

    def test_unknown_designs_report_actionable_problems_and_leave_the_library_intact(self):
        saved = self.editor.save({'name': 'Orchard', 'parts': self.example['parts']})
        for missing in (self.editor.open, self.editor.duplicate, self.editor.delete):
            with self.assertRaisesRegex(ValueError, 'No saved design'):
                missing('avatar-does-not-exist')
        self.assertEqual([saved['id']], [d['id'] for d in self.editor.library()])

    def test_initial_collection_recreates_six_and_contains_ten_complete_distinct_appearances(self):
        released = json.loads((ROOT.parents[1] / 'frontend/src/published-avatars.json').read_text())['presets']
        self.assertEqual(10, len(released))
        self.assertEqual(10, len({p['id'] for p in released}))
        self.assertEqual(10, len({p['sprite'] for p in released}))
        for preset in released:
            standing = Image.open(io.BytesIO(base64.b64decode(preset['sprite'].split(',')[1]))).convert('RGBA')
            sitting = Image.open(io.BytesIO(base64.b64decode(preset['seatedSprite'].split(',')[1]))).convert('RGBA')
            self.assertEqual((576, 256), standing.size)
            self.assertEqual((704, 256), sitting.size)
            for row in range(4):
                for column in range(9):
                    self.assertIsNotNone(standing.crop((column*64, row*64, column*64+64, row*64+64)).getbbox())
                for lowering in range(11):
                    self.assertIsNotNone(sitting.crop((lowering*64, row*64, lowering*64+64, row*64+64)).getbbox())
            reference = ROOT / 'reference' / (preset['id'] + '.png')
            if reference.exists():
                # Different PNG compositors round translucent source layers by at most one RGB unit.
                difference = ImageChops.difference(standing, Image.open(reference).convert('RGBA'))
                self.assertTrue(all(maximum <= 1 for minimum, maximum in difference.getextrema()[:3]))
                self.assertEqual((0, 0), difference.getextrema()[3])

if __name__ == '__main__':
    unittest.main()
