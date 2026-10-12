"""Publish all playable towns and identical server/client geometry from generated sources."""
from pathlib import Path
import json
import shutil
from PIL import Image

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent.parent


def publish_catalogue():
    for map_id in ('village', 'horror', 'cyberpunk'):
        source = ROOT / map_id
        target = REPO / 'frontend/public/maps' / map_id
        target.mkdir(parents=True, exist_ok=True)
        if map_id == 'cyberpunk':
            shutil.rmtree(target / 'supplied', ignore_errors=True)
            for old_tree in target.glob('campus-tree-*.png'): old_tree.unlink()
        tilemap = json.loads((source / 'map.json').read_text())
        collision = json.loads((source / 'collision.json').read_text())
        interiors = [
            {key: room[key] for key in ('name', 'x', 'y', 'width', 'height')}
            for layer in tilemap['layers'] if layer['name'] == 'zones'
            for room in layer['objects'] if room.get('type') == 'room'
        ]
        rules = {key: collision[key] for key in ('width', 'height', 'emergencyButton', 'obstacles')}
        rules['interiors'] = interiors
        rules['tasks'] = [task for task in collision['tasks'] if task['name'] != 'Town Square']
        encoded = json.dumps(rules, separators=(',', ':')) + '\n'
        (target / 'rules.json').write_text(encoded)
        resources = REPO / 'backend/src/main/resources/maps'
        resources.mkdir(parents=True, exist_ok=True)
        (resources / f'{map_id}.json').write_text(encoded)
        shutil.copyfile(source / 'map.json', target / 'map.json')
        pack = {'village': 'tiny-town', 'horror': 'tiny-dungeon', 'cyberpunk': 'roguelike-modern-city'}[map_id]
        shutil.copyfile(ROOT / 'assets' / pack / 'License.txt', target / 'License.txt')
        shutil.copyfile(ROOT / 'assets/sources.json', target / 'sources.json')
        # Terrain only, without the authoring preview's labels or any Players.
        with Image.open(source / 'full-map.png') as image:
            scale = min(1600 / image.width, 1400 / image.height)
            image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.NEAREST).save(target / 'overview.png')
        for tileset in tilemap['tilesets']:
            image = Path(tileset['image'])
            (target / image).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source / image, target / image)


if __name__ == '__main__':
    publish_catalogue()
