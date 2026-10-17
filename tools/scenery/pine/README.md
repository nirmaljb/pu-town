# Snow Pine

A storm-beaten, snow-laden spruce for the Godot snow prototype. It is built entirely
by checked-in Python running in a headless Blender, as the
[parka](../../characters/parka/README.md) is, following the same
[case study](https://www.mcp-for-blender.com/creations/case-studies/i-just-wanted-to-fish/).
Nothing is modelled by hand. To change the tree, edit a number in `shape.py` and rebuild.
The pipeline builds two versions of the same tree: the near tree, held to an 8–12k
triangle budget, and a much cheaper distance version for far trees and the whole-map
overview. Once every check passes it exports both to
[`godot/scenery/pine/`](../../../godot/scenery/pine/) as `pine.glb` and `pine_far.glb`.
Those files are never edited by hand. The snow walk does not place them yet.

## Build and review

Run this from the repository root. It needs Blender 5.2 and Python 3 with Pillow and NumPy:

```sh
tools/scenery/pine/run.sh tools/scenery/pine/build
```

`BLENDER_BIN` overrides the default path, `/Applications/Blender.app/Contents/MacOS/Blender`.
`build/` is ignored by git. A run takes about two minutes and has four stages:

1. `make.py` builds both versions and saves `pine.blend`, `pine.glb` (near),
   `pine_far.glb` (distance) and `report.json`, which gives each version's triangles,
   vertices, triangles per material, bounds, file size and SHA-256. The `.blend` also
   holds a review stage: a grey studio world, a key light and a camera at the side
   sheet's framing that shows the sheet behind the tree in the viewport.
2. `review.py` renders, for each version, orthographic side views from four
   directions at the sheet's framing (228.3 px = 1 m), the same views with only the
   snow lit, a top view and a three-quarter view on black; the distance version's
   files start `far-`. It also renders `game.png`, the near tree through the snow
   walk's camera (40° down through a 40° vertical lens, at the default distance that
   frames the figure at a twelfth of the screen), and `distance.png`, both versions
   side by side through the same lens from 60 m.
3. `compare.py` scores each version against [`reference/`](reference/) and writes
   `review/sheet.png` and `review/scores.json`:
   - side silhouette IoU, raw and with gaps under 10 cm closed (the crown's outline);
   - top silhouette IoU at the best scale, rotation and mirror (the sheet has no scale);
   - crown width per 0.5 m of height against the sheet;
   - the share of the silhouette that is snow, from the side and from above;
   - the median rendered colour of the snow and the needles against the sheet;
   - the distance version's outline against the near tree's.

   It then checks the build against [`budget.py`](budget.py), lists every check in
   `scores.json` and stops the run if any fails.
4. `run.sh` copies `pine.glb` and `pine_far.glb` to `godot/scenery/pine/`. A build
   that fails a check never reaches the game.

The loop is: build, compare, adjust `shape.py` or `palette.py`, rebuild. The export
is deterministic: the same sources give byte-identical files, so a rebuild that
changes nothing leaves `git status` clean.

## Checks

`budget.py` holds every number a build must meet:

- the near tree has 8,000–12,000 triangles and the distance version at most 600;
- the near tree's side outline IoU, raw side IoU and top IoU are no more than 0.02,
  0.03 and 0.02 below those of the unreduced 18,133-triangle tree, and neither snow
  share is more than 0.02 further from the sheet's than that tree's was;
- the near tree's rendered snow and needle medians are within 12 of 255 steps per
  channel of the sheet's (the palette check);
- the distance version's side outline and top IoU are no more than 0.06 below the
  unreduced tree's, its snow shares are within 0.05 of the near tree's, and its side
  outline matches the near tree's with an IoU of at least 0.85, so the swap between
  them does not show.

## Files

| File | Role |
| --- | --- |
| `shape.py` | Both versions as triangles: crown profile, whorls, branches, sprigs, snow, trunk, storm damage, and the detail settings that hold each to its budget. Pure Python. |
| `budget.py` | The triangle budgets and the scores a build must keep. Pure Python. |
| `palette.py` | Material colours, measured from the sheets (see Materials). |
| `make.py`, `review.py` | Run inside Blender. |
| `compare.py`, `run.sh` | Run outside Blender. |
| `reference/` | The owner's side and top sheets (see Provenance). |

## Conventions

- **Axes and scale.** In Blender +Z is up and +Y is north; one unit is one metre. The
  origin is the foot of the trunk and the tree is 6.5 m tall. glTF export turns +Y
  into −Z, which is north in Godot, so the game needs no axis conversion.
- **Structure.** A trunk carries 16 whorls of drooping branches, 5 to 7 a whorl, each
  whorl turned half a step from the one below. `REACH` sets how far a branch reaches
  for the height its tip hangs at, fitted to the sheet's crown widths. Each branch has:
  - a snow tongue: a faceted pillow, widest near the trunk where it meets its
    neighbours' snow, hanging over both sides in pointed lobes and tapering to a tip;
  - rows of needle sprigs rooted under the tongue's edge, hanging forward and down as
    a dark fringe. A sprig is a pointed leaf folded along its midrib, with serrations
    that point towards its tip;
  - a dark tent under the branch, so the crown stays solid from below.
- **Detail.** The settings at the top of `shape.py` hold the near tree inside its
  budget without changing its branches: two serrations on each side of a sprig, a row
  of sprigs every 0.25 m of branch (at least one on each side) with sprigs 12 % longer
  to keep the fringe as dense, one sprig at each branch's end, four cross-sections
  along each snow tongue and three along each tent, and no end cap where the tongue
  meets the trunk, which is hidden in the crown.
- **Distance version.** `far()` builds the same trunk, crown core and 91 branches
  from the same seeded streams as the near tree (`boughs()`), so its outline, storm
  side and stripped and snapped branches match. Each branch is two triangles of snow,
  a roof widest part way out that droops at its edges, over two triangles of needles
  that hang below the snow's edge as the near tree's fringe does. The trunk, core and
  leader have fewer sides, and it has no sprigs, tents or ice. The `FAR_` settings
  are tuned so its outline and its share of snow match the near tree's.
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
  | Needles | `#4A5352` | `#495152` / `#464D4F` | Sprigs and the leader |
  | Shadow | `#2E3536` | | Crown core and branch tents |
  | Snow | `#C2CBDE` | `#B3BDD1` / `#B2BCD0` | Snow tongues and the tip |
  | Ice | `#8E9AB2` | | Ice drips |
  | Bark | `#5C5250` | | Trunk, roots and the snapped stubs |

  Base colours are chosen so the near tree's review render lands on, or a shade under,
  the sheet's rendered medians. The distance version shares the materials; its sloped
  roofs render darker in the review light (snow `#A4ADC0`, needles `#434849`), which
  is reported but not checked. Under the game's blizzard lighting they will need
  checking again.

## Current state (2026-10-17)

| Measure | Unreduced (2026-10-16) | Near | Distance | Sheet |
| --- | --- | --- | --- | --- |
| Triangles | 18,133 | 10,700 | 435 | |
| `.glb` | 1.42 MB | 0.84 MB | 0.04 MB | |
| Side IoU, raw / outline | 0.648 / 0.792 | 0.646 / 0.788 | 0.641 / 0.767 | |
| Top IoU | 0.772 | 0.767 | 0.818 | |
| Snow share, side / top | 0.507 / 0.459 | 0.492 / 0.460 | 0.446 / 0.456 | 0.408 / 0.425 |
| Outline IoU against the near tree | | | 0.862 | |

The near tree loses at most 0.005 of any score to the reduction, and its side snow
share moves closer to the sheet's. The raw side IoU compares where each needle tooth
falls against one particular painting; the outline score is the fairer measure of
the crown's shape. The distance version's top IoU is higher than the near tree's
because its solid roofs have no gaps between sprigs, as the painted sheet has none.

## In Godot

`godot/scenery/pine/pine.glb.import` and `pine_far.glb.import` set
`meshes/generate_lods=false`, so Godot draws only this pipeline's triangles and does
not simplify the near tree on its own; the distance version is the tree's only
reduced form. Both import as one mesh with one surface per material, each drawn
from both sides, with no axis conversion: the windward side faces north-west at no
turn.

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
