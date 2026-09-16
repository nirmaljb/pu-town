"""Project-backed authoring boundary. No dependency on the running game server."""
import base64
import io
import json
import os
import re
import tempfile
import uuid
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
SLOTS = ('body', 'footwear', 'bottom', 'top', 'face', 'hair')

# Published names are Player-facing in every Room, so authoring refuses slurs outright.
# The list is curated and deliberately small. Matching folds away padding, punctuation and
# digit substitutions, and tolerates repeated letters ("niiiggga"), while keeping the two
# tiers apart so ordinary names survive: terms that never occur inside innocent words are
# refused anywhere in the name, the rest only as whole words (Cocoon, Niger, Scunthorpe).
SLURS_ANYWHERE = ('nigger', 'nigga', 'faggot', 'wetback', 'raghead', 'towelhead', 'tranny')
SLURS_AS_WORDS = ('coon', 'spic', 'kike', 'gook', 'paki', 'chink', 'dyke', 'retard')
LEET = str.maketrans({'0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '$': 's', '@': 'a', '!': 'i'})


def stretched(word):
    """A pattern matching the word however often its letters are repeated."""
    return re.compile(''.join(letter + '+' for letter in word))


ANYWHERE = tuple(stretched(word) for word in SLURS_ANYWHERE)
AS_WORDS = tuple(stretched(word) for word in SLURS_AS_WORDS)


def clean_name(name):
    """Return the trimmed Player-facing name, or explain why it cannot be used."""
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 24:
        raise ValueError('Give the preset a name of 1\u201324 characters.')
    name = name.strip()
    folded = name.lower().translate(LEET)
    letters = re.sub(r'[^a-z]', '', folded)
    words = [word for word in re.split(r'[^a-z]+', folded) if word]
    if any(pattern.search(letters) for pattern in ANYWHERE) or any(
            pattern.fullmatch(word) for pattern in AS_WORDS for word in words):
        raise ValueError('Choose a different name: this one reads as a slur to every Player in the Room.')
    return name


def write_json(path, value):
    """Replace a complete file atomically, after all validation/composition succeeds."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=path.parent, suffix='.tmp')
    try:
        with os.fdopen(fd, 'w') as output:
            json.dump(value, output, indent=2)
            output.write('\n')
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def data_url(image):
    output = io.BytesIO()
    image.save(output, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(output.getvalue()).decode()


class Authoring:
    def __init__(self, drafts=ROOT / 'drafts', publication=ROOT.parents[1] / 'frontend/src/published-avatars.json', catalogue=ROOT / 'catalogue.json', sources=ROOT / 'sources'):
        self.drafts = Path(drafts)
        self.publication = Path(publication)
        self.catalogue = json.loads(Path(catalogue).read_text())
        self.sources = Path(sources)

    def draft_path(self, identity):
        if not isinstance(identity, str) or not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,63}', identity):
            raise ValueError('Invalid preset identifier. Open a saved draft or create a new design.')
        return self.drafts / (identity + '.json')

    def open(self, identity):
        path = self.draft_path(identity)
        if not path.is_file():
            raise ValueError(f'No saved design called {identity}. Open a draft from the library, or save it first.')
        return json.loads(path.read_text())

    def library(self):
        return [json.loads(path.read_text()) for path in sorted(self.drafts.glob('*.json'))]

    def save(self, design):
        identity = design.get('id') or 'avatar-' + uuid.uuid4().hex
        name = clean_name(design.get('name'))
        parts = design.get('parts')
        if not isinstance(parts, dict) or set(parts) - set(SLOTS):
            raise ValueError('Use the supported body, footwear, bottom, top, face and hair slots.')
        # Incomplete recipes may be saved as drafts; publication requires completeness.
        self.layers(parts, complete=False)
        saved = {'id': identity, 'name': name, 'parts': parts}
        write_json(self.draft_path(identity), saved)
        return saved

    def duplicate(self, identity):
        design = self.open(identity)
        design.pop('id')
        design['name'] = design['name'][:19] + ' copy'
        return self.save(design)

    def delete(self, identity):
        path = self.draft_path(identity)
        if not path.is_file():
            raise ValueError(f'No saved design called {identity}. The draft library is unchanged.')
        path.unlink()

    def publish(self, identities):
        if not isinstance(identities, list) or len(identities) != 10:
            raise ValueError('Select exactly ten saved designs to publish.')
        if any(not isinstance(identity, str) for identity in identities) or len(set(identities)) != 10:
            raise ValueError('Select ten distinct saved designs; remove duplicate entries.')
        presets = []
        for identity in identities:
            design = self.open(identity)
            try:
                # Drafts predating name validation are caught here, at the Player-facing boundary.
                name = clean_name(design.get('name'))
            except ValueError as problem:
                raise ValueError(f'{identity}: {problem}') from problem
            presets.append({'id': identity, 'name': name, **self.preview(design)})
        collection = {'version': 1, 'presets': presets}
        write_json(self.publication, collection)
        return collection

    def layers(self, parts, complete=True):
        if not isinstance(parts, dict) or set(parts) - set(SLOTS) or (complete and set(parts) != set(SLOTS)):
            raise ValueError('Complete all six appearance slots before previewing or publishing.')
        layers = []
        for slot in SLOTS:
            if slot not in parts:
                continue
            choice = parts[slot]
            if not isinstance(choice, dict) or set(choice) != {'part', 'colour'}:
                raise ValueError(f'Choose a supported {slot} part and colour.')
            part = self.catalogue['slots'][slot].get(choice['part'])
            if part is None or choice['colour'] not in part['colours']:
                raise ValueError(f'Choose a supported {slot} part and colour.')
            layers.append((slot, part, part['colours'][choice['colour']]))
        # Shirts, trousers and shoes must match the selected LPC body proportions.
        body = parts.get('body', {}).get('part', '').split('/')[-1]
        if body:
            for slot in ('top', 'bottom', 'footwear'):
                if slot not in parts:
                    continue
                shape = parts[slot]['part'].split('/')[-1]
                expected = 'male' if body == 'male' else ('female' if slot == 'top' else 'thin')
                if shape != expected:
                    raise ValueError(f'Choose {expected} {slot} parts to match this body.')
        return layers

    def preview(self, design):
        sheet = Image.new('RGBA', (576, 256))
        palettes = {}
        for slot, part, colours in self.layers(design.get('parts')):
            path = self.sources / part['file']
            if not path.is_file():
                raise ValueError(f"Missing {slot} asset: {part['file']}. Restore it in sources before publishing.")
            with Image.open(path) as source:
                layer = source.convert('RGBA')
            if layer.size != sheet.size:
                raise ValueError(f"{slot} artwork must contain four rows of nine 64×64 frames.")
            if any(layer.crop((col * 64, row * 64, (col + 1) * 64, (row + 1) * 64)).getbbox() is None for row in range(4) for col in range(9)):
                raise ValueError(f'{slot} artwork is missing a standing or walking frame.')
            mapping = {tuple(bytes.fromhex(a.lstrip('#'))): tuple(bytes.fromhex(b.lstrip('#'))) for a, b in zip(part['sourceColors'], colours)}
            layer.putdata([(*mapping.get(pixel[:3], pixel[:3]), pixel[3]) for pixel in layer.get_flattened_data()])
            sheet = Image.alpha_composite(sheet, layer)
            palettes[slot] = colours
        # Generate all lowering steps once; runtime and editor use these exact seated pixels.
        legs = Image.new('RGBA', (11 * 64, 4 * 64))
        for row, facing in enumerate(('up', 'left', 'down', 'right')):
            for lowering in range(11):
                frame = seated_legs(palettes['bottom'], palettes['footwear'], facing, lowering)
                legs.paste(frame, (lowering * 64, row * 64))
        return {'sprite': data_url(sheet), 'seatedSprite': data_url(legs)}


def seated_legs(trousers, shoes, facing, lowering):
    image = Image.new('RGBA', (64, 64))
    draw = ImageDraw.Draw(image)
    hip = -14 + lowering
    def rect(colour, x, y, width, height):
        # Sprite origin is (32, 40): enough space below the Avatar's feet.
        draw.rectangle((32+x, 40+y, 32+x+width-1, 40+y+height-1), fill=colour)
    if facing in ('left', 'right'):
        rect(trousers[0], -17, hip, 25, 8)
        rect(trousers[2], -15, hip+1, 21, 5)
        rect(trousers[3], -14, hip+1, 17, 2)
        rect(trousers[0], -17, hip+4, 8, 14-hip)
        rect(trousers[2], -15, hip+5, 5, 10-hip)
        rect(shoes[1], -21, 10, 12, 5)
        rect(shoes[4], -19, 10, 9, 2)
        rect(shoes[2], -8, 8, 8, 4)
        if facing == 'right':
            image = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    else:
        rect(trousers[0], -11, hip, 22, 8)
        for x in (-11, 3):
            rect(trousers[2], x+1, hip+1, 7, 6)
            rect(trousers[4], x+2, hip+2, 5, 2)
            rect(trousers[0], x+1, hip+6, 7, 7-hip)
            rect(trousers[2], x+2, hip+6, 4, 5-hip)
            rect(shoes[1], x, 11, 9, 5)
            rect(shoes[4], x+1, 11, 6, 2)
    return image
