#!/usr/bin/env python3
"""Run the pinned TownGeneratorOS model through a separate headless Haxe entry."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
VENDOR = HERE / 'vendor'
LOCAL = ROOT / '.scratch/native/towns'
SEEDS = {'woodland': (8, 20261014), 'market': (12, 20261015)}


def verify_sources() -> dict:
    manifest = json.loads((VENDOR / 'upstream.json').read_text())
    for key, directory in [('townGenerator', 'TownGeneratorOS'), ('openfl', 'OpenFL')]:
        for name, digest in manifest[key]['files'].items():
            path = VENDOR / directory / name
            if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
                raise ValueError('Pinned upstream source changed: ' + name)
    return manifest


def compiler() -> Path:
    configured = os.environ.get('PU_TOWN_HAXE')
    candidates = ([Path(configured)] if configured else [])
    candidates += list(LOCAL.glob('haxe*/haxe'))
    found = shutil.which('haxe')
    if found:
        candidates.append(Path(found))
    for path in candidates:
        if path.is_file():
            version = subprocess.run([str(path), '--version'], capture_output=True,
                                     text=True, check=True).stdout.strip()
            if version == '4.3.7':
                return path.resolve()
    raise ValueError('Haxe 4.3.7 is required; set PU_TOWN_HAXE or unpack it under .scratch/native/towns/')


def generate(size: int, seed: int) -> dict:
    verify_sources()
    isolated = LOCAL / 'headless-source'
    shutil.copytree(VENDOR / 'TownGeneratorOS/Source', isolated, dirs_exist_ok=True)
    # Isolated Haxe 4 compatibility only: remove an unused rendering import,
    # qualify one abstract extension call, and preserve a Float array's type.
    # Vendored original bytes and all geometry/Random algorithms stay untouched.
    adaptations = [
        ('utils/Random.hx', 'import openfl.Lib;', ''),
        ('geom/Polygon.hx', 'var v1 = last();', 'var v1 = com.watabou.utils.ArrayExtender.last(this);'),
        ('towngenerator/wards/Ward.hx', 'var density = [for (v in patch.shape)',
         'var density:Array<Float> = [for (v in patch.shape)'),
    ]
    for name, before, after in adaptations:
        path = isolated / 'com/watabou' / name
        original = path.read_text()
        if original.count(before) != 1:
            raise ValueError('Unexpected compatibility adaptation boundary: ' + name)
        path.write_text(original.replace(before, after))
    result = subprocess.run([str(compiler()), '-cp', str(isolated), '-cp', str(HERE),
        '-cp', str(VENDOR / 'OpenFL/src'), '--run', 'ExportLayout', str(size), str(seed)],
        capture_output=True, text=True, timeout=120)
    if result.returncode:
        raise ValueError('TownGeneratorOS export failed:\n' + result.stderr + result.stdout)
    data = json.loads(result.stdout)
    if data['seed'] != seed or data['size'] != size:
        raise ValueError('Exporter returned different settings')
    return data


def encoded(data: dict) -> str:
    return json.dumps(data, sort_keys=True, indent=2, ensure_ascii=False, allow_nan=False) + '\n'


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Regenerate and compare pinned raw layouts')
    args = parser.parse_args()
    for map_id, (size, seed) in SEEDS.items():
        data = generate(size, seed)
        value = encoded(data)
        path = ROOT / 'towns' / map_id / 'watabou.json'
        if args.check:
            if path.read_text() != value:
                raise ValueError('Raw layout drifted: ' + map_id)
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(value)
        print(f'{map_id}: upstream seed {seed}, {size} central wards, {len(data["patches"])} retained patches')


if __name__ == '__main__':
    main()
