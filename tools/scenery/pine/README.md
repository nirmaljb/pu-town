# Snow Pine

A storm-beaten, snow-laden spruce for the Godot snow prototype. It is built entirely
by checked-in Python running in a headless Blender, as the
[parka](../../characters/parka/README.md) is, following the same
[case study](https://www.mcp-for-blender.com/creations/case-studies/i-just-wanted-to-fish/).
Nothing is modelled by hand. To change the tree, edit a number in `shape.py` and rebuild.
It is not in the game yet: nothing is written to `godot/`.

## Build and review

Run this from the repository root. It needs Blender 5.2 and Python 3 with Pillow and NumPy:

```sh
tools/scenery/pine/run.sh tools/scenery/pine/build
```

`BLENDER_BIN` overrides the default path, `/Applications/Blender.app/Contents/MacOS/Blender`.
`build/` is ignored by git. A run takes about two minutes and has three stages:

1. `make.py` builds the mesh and saves `pine.blend`, `pine.glb` and `report.json`.
   The `.blend` also holds a review stage: a grey studio world, a key light and a
   camera at the side sheet's framing that shows the sheet behind the tree in the viewport.
2. `review.py` renders orthographic side views from four directions at the sheet's
   framing (228.3 px = 1 m), the same views with only the snow lit, a top view, a
   three-quarter view on black and the snow walk's game camera.
3. `compare.py` scores them against [`reference/`](reference/) and writes
   `review/sheet.png` and `review/scores.json`:
   - side silhouette IoU, raw and with gaps under 10 cm closed (the crown's outline);
   - top silhouette IoU at the best scale, rotation and mirror (the sheet has no scale);
   - crown width per 0.5 m of height against the sheet;
   - the share of the silhouette that is snow, from the side and from above;
   - the median rendered colour of the snow and the needles against the sheet.

The loop is: build, compare, adjust `shape.py` or `palette.py`, rebuild.

## Files

| File | Role |
| --- | --- |
| `shape.py` | The whole tree as triangles: crown profile, whorls, branches, sprigs, snow, trunk, storm damage. Pure Python. |
| `palette.py` | Material colours, measured from the sheets (see Materials). |
| `make.py`, `review.py` | Run inside Blender. |
| `compare.py`, `run.sh` | Run outside Blender. |
| `reference/` | The owner's side and top sheets (see Provenance). |

## Conventions

- **Axes and scale.** In Blender +Z is up and +Y is north; one unit is one metre. The
  origin is the foot of the trunk and the tree is 6.5 m tall, the height of the
  snow walk's placeholder pines. glTF export turns +Y into −Z, which is north in Godot.
- **Structure.** A trunk carries 16 whorls of drooping branches, 5 to 7 a whorl, each
  whorl turned half a step from the one below. `REACH` sets how far a branch reaches
  for the height its tip hangs at, fitted to the sheet's crown widths. Each branch has:
  - a snow tongue: a faceted pillow, widest near the trunk where it meets its
    neighbours' snow, hanging over both sides in pointed lobes and tapering to a tip;
  - rows of needle sprigs rooted under the tongue's edge, hanging forward and down as
    a dark fringe. A sprig is a pointed leaf folded along its midrib, with serrations
    that point towards its tip;
  - a dark tent under the branch, so the crown stays solid from below.
- **Storm.** The storm comes from `WIND_FROM`, the town's north-west. Branches facing it
  are 4 % shorter and carry up to 30 % more snow, every branch tip is swept a little
  downwind, and the leader's last metre leans downwind. Two branches are snapped to a
  splintered stub, about one in twelve has its outer half stripped of snow, and ice
  drips hang under the heaviest tongues. Because of this the tree has a windward side:
  place it with +Y to the north, turned at most ±20°.
- **Determinism.** Every random choice comes from a named, seeded stream, so the same
  sources build the same tree. `SEED` will give the variants.
- **Materials.** Five flat materials, no textures. The faceted look comes from flat-shaded
  triangles and deterministic vertex jitter. Sprigs are single sheets, so materials are
  two-sided.

  | Material | Base colour | Rendered against the sheet | Used for |
  | --- | --- | --- | --- |
  | Needles | `#4A5352` | `#4B5354` / `#464D4F` | Sprigs and the leader |
  | Shadow | `#2E3536` | | Crown core and branch tents |
  | Snow | `#C2CBDE` | `#AFB8CD` / `#B2BCD0` | Snow tongues and the tip |
  | Ice | `#8E9AB2` | | Ice drips |
  | Bark | `#5C5250` | | Trunk, roots and the snapped stubs |

  Base colours are chosen so the review render lands on, or a shade under, the sheet's
  rendered medians. Under the game's blizzard lighting they will need checking again.

## Current state (2026-10-16)

| Measure | Pine | Sheet or target |
| --- | --- | --- |
| Triangles | 18,133 | 8–12k budget |
| `.glb` | 1.4 MB | |
| Side IoU, raw / outline | 0.65 / 0.79 | 0.85 |
| Top IoU | 0.77 | 0.80 |
| Snow share, side / top | 0.50 / 0.46 | 0.41 / 0.43 |

The raw side IoU compares where each needle tooth falls against one particular
painting; the outline score is the fairer measure of the crown's shape.

## Provenance

The owner supplied four sheets on 2026-10-16: one top view and the same side elevation
lit three ways. Their file names suggest an image generator; authorship and licence were
not stated. They are authoring references only and are never shipped in a build.
`side.png` is the grey-background elevation and `top.png` the top view; the two
black-background elevations are kept outside the repository.

| Sheet | SHA-256 |
| --- | --- |
| `side.png` (`ChatGPT Image 16 Oct 2026, 17_51_43.png`) | `f855aa628f952b3632a9340a9e2811bf6ce867f86bc21f47a60f0161c4e29639` |
| `top.png` (`ChatGPT Image 16 Oct 2026, 17_50_59.png`) | `2f2ac110191e3b1607bb97ce76feac4379c9128a4c782d5685543f0e94e7809c` |
| `ChatGPT Image 16 Oct 2026, 17_51_30.png` | `91ca4760e2dec9511d7e9e933ff4165799bc96190c7bc892769bbf38db1d799a` |
| `ChatGPT Image 16 Oct 2026, 17_51_37.png` | `6946e180bdf251259afc157d2f34a2bf3ba437a7d56cf5d19aa6b5713999a097` |
