"""Verify the preserved snow kit and reproduce it through the extraction CLI.

Run from any directory: python3 tools/reference-colors/verify.py
Never rewrites the preserved artifacts; extraction runs in temporary directories.
"""

from collections import Counter
import csv
import gzip
import hashlib
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
KIT = ROOT / "docs/art/snow-reference"
SOURCE_SHA256 = "5d2f25875a6a2bceb7a9993eae332aee26cb11d9da3497fdd7c12fd51caf1e94"
OUTPUTS = ("all-colors.csv.gz", "palette.json", "palette.svg")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify():
    source = KIT / "reference.png"
    require(sha256(source) == SOURCE_SHA256, "Original reference hash changed")
    with Image.open(source) as image:
        require(image.size == (1536, 1024), "Reference dimensions changed")
        require(image.mode == "RGB" and image.info.get("srgb") == 0,
                "Expected the original RGB PNG with sRGB rendering intent 0")
        pixels = list(image.get_flattened_data())
    counts = Counter(pixels)
    require(len(pixels) == 1572864 and len(counts) == 72078,
            "Reference pixel or distinct colour count changed")
    first = {}
    for index, rgb in enumerate(pixels):
        first.setdefault(rgb, index)

    with gzip.open(KIT / OUTPUTS[0], "rt", newline="") as stream:
        rows = list(csv.DictReader(stream))
    require(len(rows) == 72078, "Histogram must retain every distinct colour once")
    recorded = {}
    for row in rows:
        rgb = tuple(int(row[key]) for key in ("r", "g", "b"))
        require(row["hex"] == "#%02X%02X%02X" % rgb, "Histogram hex/RGB mismatch")
        x, y = int(row["first_x"]), int(row["first_y"])
        require(0 <= x < 1536 and 0 <= y < 1024, "Histogram coordinate out of bounds")
        require(first.get(rgb) == y * 1536 + x, "Histogram first coordinate mismatch")
        require(pixels[y * 1536 + x] == rgb, "Histogram coordinate pixel mismatch")
        recorded[rgb] = int(row["pixel_count"])
    require(recorded == counts, "Complete histogram differs from source pixels")
    require(list(recorded) == sorted(recorded), "Histogram RGB ordering changed")

    palette = json.loads((KIT / "palette.json").read_text())
    require(palette["source_sha256"] == SOURCE_SHA256, "Palette source hash mismatch")
    require(palette["histogram_sha256"] == sha256(KIT / OUTPUTS[0]),
            "Palette histogram hash mismatch")
    require((palette["width"], palette["height"], palette["pixel_count"],
             palette["unique_rgb_count"]) == (1536, 1024, 1572864, 72078),
            "Palette source dimensions or counts mismatch")
    swatches = palette["swatches"]
    require(len(swatches) == 64, "Expected 64 browsing representatives")
    require(len({tuple(s["rgb8"]) for s in swatches}) == 64, "Duplicate representative")
    require(len({s["quantization_bucket"] for s in swatches}) == 64, "Duplicate bucket")
    require(sum(s["cluster_pixel_count"] for s in swatches) == 1572864,
            "Cluster coverage must total all source pixels")
    luminances = []
    for swatch in swatches:
        rgb = tuple(swatch["rgb8"])
        require(swatch["hex"] == "#%02X%02X%02X" % rgb, "Swatch hex/RGB mismatch")
        x, y = swatch["source_pixel"]["x"], swatch["source_pixel"]["y"]
        require(0 <= x < 1536 and 0 <= y < 1024, "Swatch coordinate out of bounds")
        require(pixels[y * 1536 + x] == rgb, "Swatch is not its recorded source pixel")
        require(swatch["exact_pixel_count"] == counts[rgb], "Swatch exact frequency mismatch")
        require(swatch["cluster_pixel_count"] >= counts[rgb], "Cluster smaller than representative")
        require(math.isclose(swatch["cluster_fraction"], swatch["cluster_pixel_count"] / 1572864),
                "Cluster coverage fraction mismatch")
        linear = []
        for component, srgb, value in zip(rgb, swatch["srgb_normalized"], swatch["linear_rgb"], strict=True):
            require(math.isclose(srgb, component / 255, abs_tol=1e-12), "sRGB normalization mismatch")
            expected = srgb / 12.92 if srgb <= 0.04045 else ((srgb + 0.055) / 1.055) ** 2.4
            require(math.isclose(value, expected, abs_tol=1e-12), "Linear RGB conversion mismatch")
            linear.append(value)
        luminances.append((sum(c * w for c, w in zip(linear, (0.2126, 0.7152, 0.0722))), swatch["hex"]))
    require(luminances == sorted(luminances), "Palette luminance ordering changed")

    svg = ET.parse(KIT / "palette.svg").getroot()
    namespace = {"svg": "http://www.w3.org/2000/svg"}
    fills = [rect.attrib["fill"] for rect in svg.findall(".//svg:rect", namespace)][1:]
    labels = [element.text for element in svg.findall(".//svg:text", namespace)]
    require(fills == [s["hex"] for s in swatches], "SVG swatches differ from JSON")
    expected_labels = [label for s in swatches for label in
                       (s["hex"], f'{s["cluster_fraction"]:.2%} coverage')]
    require(labels[2:] == expected_labels, "SVG colour/coverage labels differ from JSON")

    manifest = json.loads((KIT / "manifest.json").read_text())
    for relative_path, expected_hash in manifest["sha256"].items():
        require(sha256(ROOT / relative_path) == expected_hash, f"Preserved hash mismatch: {relative_path}")
    for _ in range(2):
        with tempfile.TemporaryDirectory(prefix="pu-town-reference-") as directory:
            copy = Path(directory) / "reference.png"
            shutil.copyfile(source, copy)
            subprocess.run([sys.executable, str(ROOT / "tools/reference-colors/extract.py"), str(copy)],
                           cwd=directory, check=True, capture_output=True, text=True)
            require(sha256(copy) == SOURCE_SHA256, "Extraction mutated the source")
            for name in OUTPUTS:
                require((copy.parent / name).read_bytes() == (KIT / name).read_bytes(),
                        f"Extraction differs from preserved {name}; use the recorded Python/Pillow/zlib versions")
    print("PASS: original sRGB reference; all 72,078 colours, counts and coordinates; "
          "64 representatives, conversions and SVG labels; preserved hashes; "
          "two byte-identical CLI reproductions (1,572,864 pixels).")


if __name__ == "__main__":
    verify()
