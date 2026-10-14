"""Extract exact source colours and a labelled, reduced visual reference palette.

Usage: python3 tools/reference-colors/extract.py docs/art/snow-reference/reference.png
Requires Pillow (already used by the Avatar authoring tools).
"""

import csv
import gzip
import hashlib
import io
import json
from collections import Counter
from pathlib import Path
import sys

from PIL import Image, __version__ as pillow_version


def pixel_data(image):
    return image.get_flattened_data() if hasattr(image, "get_flattened_data") else image.getdata()


def extract(source: Path) -> None:
    image = Image.open(source)
    if image.mode != "RGB":
        raise ValueError("Expected an RGB reference; do not silently discard alpha or convert colours")
    pixels = list(pixel_data(image))
    counts = Counter(pixels)
    first = {}
    for index, rgb in enumerate(pixels):
        first.setdefault(rgb, index)

    # Keep every RGB value, not only the quantized summary. Fixed order and gzip
    # timestamp make reruns byte-identical with the recorded Pillow version.
    csv_buffer = io.StringIO(newline="")
    writer = csv.writer(csv_buffer, lineterminator="\n")
    writer.writerow(["hex", "r", "g", "b", "pixel_count", "first_x", "first_y"])
    for rgb, count in sorted(counts.items()):
        index = first[rgb]
        writer.writerow(["#%02X%02X%02X" % rgb, *rgb, count,
                         index % image.width, index // image.width])
    histogram = source.parent / "all-colors.csv.gz"
    histogram.write_bytes(gzip.compress(csv_buffer.getvalue().encode(), mtime=0))

    quantized = image.quantize(colors=64, method=Image.Quantize.MEDIANCUT,
                               dither=Image.Dither.NONE)
    groups = {}
    for rgb, group in zip(pixels, pixel_data(quantized)):
        groups.setdefault(group, Counter())[rgb] += 1
    swatches = []
    for group, members in groups.items():
        # The most frequent ORIGINAL pixel in each bucket is the representative,
        # so every displayed swatch really occurs in the reference image.
        rgb = min(members, key=lambda value: (-members[value], value))
        population = sum(members.values())
        index = first[rgb]
        srgb = [component / 255 for component in rgb]
        linear = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
                  for v in srgb]
        swatches.append({
            "hex": "#%02X%02X%02X" % rgb, "rgb8": rgb,
            "srgb_normalized": srgb, "linear_rgb": linear,
            "source_pixel": {"x": index % image.width, "y": index // image.width},
            "exact_pixel_count": counts[rgb], "cluster_pixel_count": population,
            "cluster_fraction": population / len(pixels), "quantization_bucket": group,
        })
    swatches.sort(key=lambda s: (sum(c * w for c, w in zip(s["linear_rgb"],
                                                        [0.2126, 0.7152, 0.0722])), s["hex"]))
    result = {
        "source": source.name, "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "width": image.width, "height": image.height, "pixel_count": len(pixels),
        "unique_rgb_count": len(counts), "color_space": "sRGB (source PNG sRGB chunk)",
        "source_srgb_rendering_intent": image.info.get("srgb"),
        "pillow_version": pillow_version, "histogram": histogram.name,
        "histogram_sha256": hashlib.sha256(histogram.read_bytes()).hexdigest(),
        "method": "64 median-cut buckets; most frequent original RGB per bucket; RGB-order tie break",
        "interpretation": "Rendered appearance including lighting, shadows and atmosphere; not measured material albedo. Bucket coverage is not the exact frequency of its representative.",
        "swatches": swatches,
    }
    (source.parent / "palette.json").write_text(json.dumps(result, indent=2) + "\n")
    svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="1040" height="880" viewBox="0 0 1040 880">',
           '<rect width="1040" height="880" fill="#f5f5f3"/>',
           '<g font-family="sans-serif" fill="#242424">',
           '<text x="24" y="30" font-size="20">Snow reference — 64 sampled colours</text>',
           '<text x="24" y="53" font-size="12">Exact source RGB representatives • percentages describe median-cut bucket coverage • darkest to lightest</text>']
    for index, swatch in enumerate(swatches):
        x, y = 24 + (index % 8) * 127, 74 + (index // 8) * 98
        svg.extend([
            f'<rect x="{x}" y="{y}" width="112" height="56" fill="{swatch["hex"]}"/>',
            f'<text x="{x}" y="{y + 73}" font-size="13">{swatch["hex"]}</text>',
            f'<text x="{x}" y="{y + 89}" font-size="11">{swatch["cluster_fraction"]:.2%} coverage</text>',
        ])
    svg.append('</g></svg>')
    (source.parent / "palette.svg").write_text("\n".join(svg) + "\n")
    print(json.dumps({key: result[key] for key in
                      ["source_sha256", "width", "height", "pixel_count", "unique_rgb_count"]}))


if __name__ == "__main__":
    extract(Path(sys.argv[1]))
