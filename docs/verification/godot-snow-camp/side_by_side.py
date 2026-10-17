"""Place the owner's painted Camp beside a capture of the scene's Camp, for inspection.

Usage: python3 side_by_side.py CAPTURE OUT.png
Crops the Camp from docs/art/frostwatch-reference/centre-shaded-painting.jpg (the
painted centre reference: four buildings round the yard) and
crossroads-camp-map.jpg (the larger painting: lodge, sheds, towers, crates and
cabin), and sets them beside the capture at a common height.
"""
import sys
from pathlib import Path

from PIL import Image

REFERENCE = Path(__file__).resolve().parents[2] / "art" / "frostwatch-reference"
HEIGHT = 540
# Crop boxes (left, top, right, bottom) in each painting's own pixels.
CROPS = [
    ("centre-shaded-painting.jpg", (1050, 520, 1750, 1020)),
    ("crossroads-camp-map.jpg", (740, 560, 1500, 1080)),
]


def scaled(image: Image.Image) -> Image.Image:
    return image.resize((round(image.width * HEIGHT / image.height), HEIGHT), Image.LANCZOS)


def main() -> None:
    capture, out = sys.argv[1], sys.argv[2]
    panels = [scaled(Image.open(REFERENCE / name).convert("RGB").crop(box)) for name, box in CROPS]
    panels.append(scaled(Image.open(capture).convert("RGB")))
    gap = 12
    sheet = Image.new("RGB", (sum(p.width for p in panels) + gap * (len(panels) - 1), HEIGHT), "white")
    x = 0
    for panel in panels:
        sheet.paste(panel, (x, 0))
        x += panel.width + gap
    sheet.save(out, optimize=True)


if __name__ == "__main__":
    main()
