# Snow-reference kit verification — 2026-10-15

Scope: [issue #90](https://github.com/nirmaljb/pu-town/issues/90), the retained
colour kit's extraction-command and exported-artifact seam agreed in parent #89.
Baseline: `3babbf3c9e3a65e59a4bd4bc644143be71917e09`.

## Adoption and environment

The prepared `docs/art/snow-reference/` kit and
`tools/reference-colors/extract.py` came from the local
`codex/godot-snow-ground` worktree. The five source/tool/data files were compared
byte for byte with those originals after copying; all matched. The extraction
tool and art decisions are unchanged. The originating files remain intact.
The [manifest](../art/snow-reference/manifest.json) records source, tool and
output SHA-256 hashes and the successful reproduction environment:
CPython 3.14.3, Pillow 12.3.0, zlib 1.2.12 on macOS.

## Command and results

```sh
python3 tools/reference-colors/verify.py
```

The initial check failed because the source was absent in the implementation
checkout. After adopting the kit and recording its hashes, it passed:

- Original PNG hash:
  `5d2f25875a6a2bceb7a9993eae332aee26cb11d9da3497fdd7c12fd51caf1e94`.
  Dimensions 1536 × 1024, RGB, PNG sRGB rendering intent 0.
- All 72,078 distinct RGB values in the CSV match the complete source histogram,
  with exact frequencies totalling 1,572,864 pixels. Every coordinate is in
  bounds, points to the stated colour and is its first row-major occurrence.
  Records are sorted by RGB.
- All 64 summary representatives occur in the original source at their recorded
  coordinates. Exact frequencies match the full histogram; distinct bucket
  coverage totals 1,572,864 pixels. Normalized sRGB, linear RGB conversions and
  luminance ordering pass. SVG fills and hex/coverage labels agree with JSON.
- Two independent extraction-command runs in temporary directories reproduce
  `all-colors.csv.gz`, `palette.json` and `palette.svg` byte for byte. The copied
  source stays unchanged. Retained source/tool/output hashes match the manifest.
- The original PNG and the SVG's full 1040 × 880 browser rendering were visually
  inspected. All 64 swatches have readable hex and coverage labels; the heading
  explicitly describes median-cut bucket coverage. No art or palette was changed.

## Evidence limits

This verifies reference data integrity and reproducibility. The image includes
lighting, shadows and atmosphere; it does not measure material albedo or snow
depth. Authorship and license were not supplied. It remains an authoring reference
outside runtime assets. This ticket provides no Godot scene, gameplay, export or
performance evidence. Java, browser and Unity runtime code are unaffected.
