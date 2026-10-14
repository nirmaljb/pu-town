# Snow-town visual reference

The owner supplied `reference.png` on 2026-10-15 for the single-map Godot rebuild.
The PNG is preserved byte for byte. Its SHA-256 is
`5d2f25875a6a2bceb7a9993eae332aee26cb11d9da3497fdd7c12fd51caf1e94`.
This is an authoring reference, not a runtime texture. Authorship and license were
not supplied with the attachment.

Adopted from the prepared local kit on `codex/godot-snow-ground`, based on
`3babbf3c9e3a65e59a4bd4bc644143be71917e09`, for
[issue #90](https://github.com/nirmaljb/pu-town/issues/90) under
[the ground prototype #89](https://github.com/nirmaljb/pu-town/issues/89).
The source, histogram, JSON, SVG and extraction tool were copied unchanged;
their SHA-256 values are retained in [manifest.json](manifest.json).
Everything required is tracked in this checkout, independent of the originating
chat's attachment storage. Each file is below the repository's 5 MiB upload limit.

## Ground truth

- [reference.png](reference.png): 1536 × 1024, RGB, tagged sRGB; the spatial source of truth.
- [all-colors.csv.gz](all-colors.csv.gz): every one of the **72,078 distinct RGB colours** in the
  image, with exact pixel counts and the first source coordinate at which each
  occurs. Coordinates start at the upper-left; X runs right, Y runs down. Counts
  sum to **1,572,864 pixels**. No colour is dropped or rounded in this file.
- [palette.json](palette.json): a practical 64-colour summary, source hashes, extraction method,
  original pixel coordinates, and sRGB and linear RGB values. Every representative
  is an actual source pixel. The reduced palette does not replace the full data.
- [palette.svg](palette.svg): labelled preview of those 64 representatives. Coverage describes
  each quantization bucket, not the exact frequency of the sampled swatch.

Open the SVG in a browser to browse all 64 labelled swatches. Find a swatch's hex
value in the JSON to read its `source_pixel`, normalized sRGB and linear RGB
values. The CSV's `pixel_count` and JSON's `exact_pixel_count` count only that
exact RGB triple; `cluster_pixel_count` and `cluster_fraction` describe its whole
median-cut bucket. Coordinates refer to the original, unscaled PNG. For example,
use a pixel inspector at `(first_x, first_y)` from the CSV to see the colour's
original context. The full histogram is independently preserved, even for colours
that do not appear in the 64-swatch summary.

These values describe the finished image, including illumination, shadows,
atmosphere, anti-aliasing and falling snow. They do **not** establish intrinsic
material albedo, roughness, physical snow depth or scene dimensions. The warm
snow near doorways reflects lighting; it should not automatically become a warm
snow material. No object or material segmentation has been inferred by this
extraction. The full reference remains necessary for interpreting each colour.

## Reproduce

From the repository root, prepare an isolated environment. Byte-for-byte
reproduction was verified with CPython **3.14.3**, Pillow **12.3.0** and zlib
**1.2.12** (also recorded in the manifest). The gzip bytes can depend on the
Python/zlib version, and the median-cut results and JSON metadata depend on Pillow.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r tools/reference-colors/requirements.txt
.venv/bin/python tools/reference-colors/verify.py
```

The verifier compares every histogram count and source coordinate with the PNG,
checks the summary representatives, colour conversions, coverage and SVG labels,
checks the preserved file hashes, then runs the existing extraction command
twice in temporary directories and compares all outputs byte for byte. It never
rewrites the retained kit. A mismatch exits nonzero; use the recorded environment
before treating compression or quantization differences as a new reference.

The original extraction command writes the three outputs beside its source;
run it on a copy to keep the preserved dataset intact:

```sh
mkdir -p /tmp/pu-town-snow-reference
cp docs/art/snow-reference/reference.png /tmp/pu-town-snow-reference/reference.png
.venv/bin/python tools/reference-colors/extract.py /tmp/pu-town-snow-reference/reference.png
```

The histogram is sorted by RGB and has a fixed gzip timestamp. The smaller
palette uses median-cut quantization without dithering, then selects the most
frequent original colour in each bucket, breaking ties by RGB order. It is sorted
by linear-light relative luminance. Use the recorded Pillow version to reproduce
the summary exactly. Preserve the source image; future region-specific palettes
must record their sampling regions instead of silently replacing these files.

See [the verification record](../../verification/2026-10-15-snow-reference-kit.md)
for the reproduced results and the limits of this evidence.
