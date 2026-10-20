"""Set a baseline capture beside the same view on the Roads build, for inspection.

Usage: python3 before_after.py BEFORE AFTER OUT.png
Each capture is scaled to 1280 x 720 and the two are set side by side, before on the left.
"""
import sys

from PIL import Image


def main() -> None:
    before, after, out = sys.argv[1:4]
    panels = [Image.open(path).convert("RGB").resize((1280, 720), Image.LANCZOS) for path in (before, after)]
    gap = 12
    sheet = Image.new("RGB", (1280 * 2 + gap, 720), "white")
    sheet.paste(panels[0], (0, 0))
    sheet.paste(panels[1], (1280 + gap, 0))
    sheet.save(out, optimize=True)


if __name__ == "__main__":
    main()
