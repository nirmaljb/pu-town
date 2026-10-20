"""Compare a capture from the whole-map picture's build with the same view from the tiled build.

Usage: python3 compare_captures.py BEFORE AFTER [SHEET.png]
Prints how many pixels differ and by how much (0-255 per channel). With SHEET, also
writes before and after side by side, each scaled to 1280 x 720, before on the left.
"""
import sys

from PIL import Image, ImageChops


def main() -> None:
    before, after = (Image.open(path).convert("RGB") for path in sys.argv[1:3])
    difference = ImageChops.difference(before, after)
    channels = difference.split()
    changed = sum(1 for value in ImageChops.lighter(ImageChops.lighter(*channels[:2]), channels[2]).get_flattened_data() if value)
    largest = max(channel.getextrema()[1] for channel in channels)
    total = before.width * before.height
    print(f"{before.width} x {before.height}: {changed} of {total} pixels differ ({100.0 * changed / total:.4f}%), largest difference {largest}")
    if len(sys.argv) > 3:
        panels = [image.resize((1280, 720), Image.LANCZOS) for image in (before, after)]
        sheet = Image.new("RGB", (1280 * 2 + 12, 720), "white")
        sheet.paste(panels[0], (0, 0))
        sheet.paste(panels[1], (1280 + 12, 0))
        sheet.save(sys.argv[3], optimize=True)


if __name__ == "__main__":
    main()
