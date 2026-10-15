"""The parka's flat material colours, each one a swatch of the snow reference kit.

The kit records rendered colours, not measured albedo (see its README). These
swatches are used directly as base colours until the Godot lighting is final.
Every value is looked up in palette.json so a colour outside the kit fails the build.
"""
import json
from pathlib import Path

KIT = Path(__file__).resolve().parents[3] / 'docs/art/snow-reference/palette.json'

# Material name -> reference swatch.
SWATCHES = {
    'Void': '#202123',      # face opening and the head inside the hood
    'Boots': '#36383C',
    'Accent': '#36383C',    # gloves; the slot a Player Colour may tint later
    'Parka': '#3C3E42',
    'Trousers': '#44474D',
    'Fur': '#A7ABB5',       # hood ruff and collar
}


def linear_colours():
    """Material name -> linear RGB, read from the kit rather than converted here."""
    swatches = {s['hex']: s for s in json.loads(KIT.read_text())['swatches']}
    missing = sorted(set(SWATCHES.values()) - swatches.keys())
    if missing:
        raise SystemExit(f'not in the snow reference palette: {missing}')
    return {name: tuple(swatches[hex_]['linear_rgb']) for name, hex_ in SWATCHES.items()}
