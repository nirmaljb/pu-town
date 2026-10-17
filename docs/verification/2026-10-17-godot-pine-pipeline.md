# Snow pine pipeline, reduced to budget — 2026-10-17

Verification of issue #107, the first slice of #104's third stage (Frostwatch
Outpost): the snow pine's headless-Blender pipeline is brought onto `native-live`
from the session worktree where it was authored, the tree is reduced from 18,133
triangles into its 8–12k budget, a much cheaper distance version is added, and both
are exported into the Godot project as the parka is. The snow walk does not place
pines yet (#116 does). Java, browser and Unity code are untouched. Retained files
are in [`godot-pine-pipeline/`](godot-pine-pipeline/).

Tools: Blender 5.2.2 LTS (headless), Python 3 with Pillow 12.3 and NumPy 2.5, Godot
`4.7.2.stable.official.ed1daf0bf` with the Compatibility renderer, on the Apple M1
MacBook Air (8 GB) under macOS 26.2. "Unreduced" is the pipeline as brought over in
`6237d44`; "reduced" is `2bfe3d1` with the review fixes committed beside this
record, which change no exported byte (§1). The machine was in use throughout.

## Changes

- [`tools/scenery/pine/`](../../tools/scenery/pine/README.md) is brought over intact
  in `6237d44`: its sources, the owner's side and top sheets (SHA-256 matching the
  provenance table) and its `build/` ignore. The generated `.blend`, renders and
  build-directory `.glb` stay local.
- [`shape.py`](../../tools/scenery/pine/shape.py): the branch layout becomes
  `boughs()`, shared by the near tree (`shape()`) and the new distance version
  (`far()`). Detail settings at the top hold the near tree to its budget: two
  serrations a sprig side (three before on sprigs over 16 cm), a row of sprigs every
  0.25 m with at least one a side (0.19 m, at least two) and sprigs 12 % longer,
  one sprig at each branch's end (two), four cross-sections per snow tongue (five)
  with no end cap against the trunk, and three per tent (four). The distance
  version keeps the same 91 branches from the same seeded streams, each a
  two-triangle snow roof over a two-triangle needle roof hanging below it, with a
  five-sided trunk, six-sided core and three-sided leader. Its `FAR_` settings were
  tuned against its checks over five rounds of four candidate builds.
- [`budget.py`](../../tools/scenery/pine/budget.py) (new) holds what a build must
  meet, and [`compare.py`](../../tools/scenery/pine/compare.py) now scores both
  versions, checks them against it, lists each check in `scores.json` and exits 1
  on any failure. Its top-view search turns each mask once per angle instead of once
  per angle and scale: the same scores, about three times faster.
- [`make.py`](../../tools/scenery/pine/make.py) builds and exports both versions
  and reports each one's triangles, vertices, bounds, size and SHA-256.
  [`review.py`](../../tools/scenery/pine/review.py) renders both, replaces the
  retired 45°/16° game view with the current camera (40° down, 40° vertical lens,
  the 22.56 m play distance), whose numbers it reads from `follow_camera.gd` and
  `walker.gd` rather than repeating them, and adds a side-by-side distance view.
  [`run.sh`](../../tools/scenery/pine/run.sh) copies `pine.glb` and `pine_far.glb`
  to [`godot/scenery/pine/`](../../godot/scenery/pine/) only after every check
  passes against the owner's sheets; scored against another `REFERENCE_DIR` it
  exports nothing.
- `godot/scenery/pine/*.glb.import` set `meshes/generate_lods=false` (see §3).
- The pine README, [`godot/README.md`](../../godot/README.md) and `AGENTS.md`
  describe the export and link this record.
- [`import_check.gd`](godot-pine-pipeline/import_check.gd) and
  [`pine_capture.gd`](godot-pine-pipeline/pine_capture.gd) are verification-only
  scripts for §2–3 and §7.

## 1. Pipeline checks (TDD at the build-and-score seam)

```sh
tools/scenery/pine/run.sh tools/scenery/pine/build
```

The checks were written first and run against the unreduced tree's renders:
**FAILED, 2 of 9** — `near triangles: 18133 (8000-12000)` and `far version built:
False` ([log](godot-pine-pipeline/unreduced-checks.log)). The scores themselves
matched the unreduced pipeline's to the last digit, so the faster search changed
nothing. The distance version's limits were written in that same first `budget.py`,
before it existed, and were not changed while its settings were tuned; that is the
author's account, which no retained file shows.

Reduced: **PASSED, 16 of 16** (15 at `2bfe3d1`; the review added `near version
built`) ([run](godot-pine-pipeline/pipeline-run.log),
[report](godot-pine-pipeline/report.json),
[scores](godot-pine-pipeline/scores.json); unreduced:
[report](godot-pine-pipeline/unreduced-report.json),
[scores](godot-pine-pipeline/unreduced-scores.json)).

| Measure | Unreduced | Near | Distance | Limit |
| --- | --- | --- | --- | --- |
| Triangles | 18,133 | **10,700** | **435** | 8,000–12,000; at most 600 |
| Vertices | 16,818 | 10,105 | 785 | |
| `.glb` | 1,418,916 B | 839,184 B | 37,636 B | |
| Side IoU, raw | 0.6482 | 0.6457 | 0.6411 | near ≥ 0.6182 |
| Side outline IoU | 0.7918 | 0.7881 | 0.7673 | near ≥ 0.7718; far ≥ 0.7318 |
| Top IoU | 0.772 | 0.767 | 0.8179 | near ≥ 0.752; far ≥ 0.712 |
| Side snow share (sheet 0.408) | 0.507 | 0.492 | 0.446 | near ≤ 0.119 off the sheet; far within 0.05 of near |
| Top snow share (sheet 0.425) | 0.459 | 0.460 | 0.456 | near ≤ 0.054 off the sheet; far within 0.05 of near |
| Rendered snow / needles (sheet `#B2BCD0` / `#464D4F`) | `#AFB8CD` / `#4B5354` | `#B3BDD1` / `#495152` | `#A4ADC0` / `#434849` | near within 12 steps a channel |
| Outline IoU against the near tree | | | 0.8619 | ≥ 0.85 |

The near tree lost at most 0.005 of any score to the 41 % cut, and its side snow
share moved 0.015 closer to the sheet's. The near triangles per material are
needles 5,860 (11,382), snow 3,827 (5,374), shadow 836 (1,200), bark 147 and ice
30. The distance version is 4 % of the near tree. Its rendered colour is reported,
not checked: with the same materials its sloped roofs render up to 16 steps darker
than the sheet's snow in the review light, past the 12 steps the near tree must
meet. Its side snow share (0.046 of 0.05) and its outline against the near tree
(0.862 against 0.85) pass with the least margin. As before, the pine's palette is
measured from the owner's tree sheets, not looked up in
`docs/art/snow-reference/palette.json` as the parka's is.

Inspected images: [before-after.png](godot-pine-pipeline/before-after.png) (side
and top: unreduced, near, distance) shows the near tree's crown, whorls, snow
tongues and dark fringe unchanged to the eye; the distance version reads as the
same tree with solid faceted roofs instead of sprigs. [sheet.png](godot-pine-pipeline/sheet.png)
is the scored contact sheet (sheet | near | overlay | far | overlay).
[game.png](godot-pine-pipeline/game.png) is the near tree through the snow walk's
camera at its default distance, 298 px of a 720 px frame;
[distance.png](godot-pine-pipeline/distance.png) is near (left) and far (right)
through the same lens from 60 m, both 90 px tall. There they are plainly told
apart: the near tree's fringe reads as fine dark texture, the distance version as
a stack of whiter, blockier roofs with hard dark bands. The swap must happen
further out than this, or where trees are smaller on screen (the overview).

**Determinism** ([log](godot-pine-pipeline/determinism.log), from `shasum` and
`cmp`). Three builds of the reduced pipeline (two from `2bfe3d1`'s sources in
separate directories, one from the final sources) and the committed files have
identical `pine.glb` (`0ec27ed0…`) and `pine_far.glb` (`bed890a1…`), identical
`report.json` and identical scores; after the last build `git status` shows
`godot/scenery/pine/` clean. The unreduced pipeline, rebuilt here before any change,
reproduced its original `.glb` byte for byte.

These are Blender renders under the pipeline's studio light, scored against the
owner's two sheets. They say nothing about the trees in the game's lighting or
frame rate. The checks comparing the distance version with the near tree are
proxies for how alike they look, not evidence that a swap between them goes
unnoticed.

## 2. Import into Godot

`GODOT_BIN=~/Downloads/Godot.app ./godot/run.sh --check` imported both files without
errors ([log](godot-pine-pipeline/import.log)).
[`import_check.gd`](godot-pine-pipeline/import_check.gd) loads each as the game will
and reads back what Godot holds ([log](godot-pine-pipeline/import-check.log)).

## 3. Godot's generated LODs

With Godot's default `meshes/generate_lods=true` the import check **FAILED, 6
failures**: Godot had simplified the near tree's needles, shadow, snow and ice
surfaces into 1–3 LODs of its own and the distance version's needles and snow
into 2–3, geometry the pipeline never made, which Godot would switch to by screen
size. With `generate_lods=false` in both `.import` files: **PASS, 0 failures**.
Godot holds exactly the report's triangles, per material (near 5,860 + 836 + 3,827
+ 30 + 147 = 10,700; far 188 + 36 + 185 + 26 = 435), every surface drawn from both
sides, with no LODs, and bounds matching the report's crown turned so that north is
−Z. This is a headless load; it renders nothing.

## 4. Headless engine-event replay

The scene's code is unchanged; this checks that the new files leave it working.

```sh
"$GODOT_BIN" --headless --path godot --fixed-fps 60 -- \
  --snow-scene-check --headless-scene-check --auto-start
```

**PASS, 0 failures, 18,645 observations**
([log](godot-pine-pipeline/headless-route.log)), the same count as #106's. Its one
`material is null` error at shutdown also appears in #106's log.

## 5. Graphical route from source

```sh
open -n -W -a ~/Downloads/Godot.app --args --path godot -- --snow-scene-check --auto-start
```

**PASS, 0 failures, 18,784 observations**
([log](godot-pine-pipeline/graphical-route.log)), with no pause for focus. Framing
matched #106's: the figure 0.0841 of the screen's height by default at 22.56 m,
0.1262 closest and 0.0630 widest. Its first capture,
[source-default.png](godot-pine-pipeline/source-default.png), shows the unchanged
default view: both figures in the Town Square among the lanterns, no pine (the
scene places none). This is engine-event replay in a rendered window, not ordinary
OS input, and it shows only that the scene is unaffected by the new files.

## 6. Mac release package

`GODOT_BIN=~/Downloads/Godot.app ./godot/export.sh macos` exported the release
package from `2bfe3d1` with clean Godot sources
([build record](godot-pine-pipeline/macos-build-info.json); every source hash
matches the committed files). Its `.pck` lists both imported pines (imported
scenes of 369 KB and 22 KB). Launched through Launch Services,

```sh
open -n -W -a godot/build/macos/release/PU-Town-Snow-Walk.app --args -- --snow-scene-check --auto-start
```

its route **PASSED with 0 failures, 18,783 observations**
([log](godot-pine-pipeline/packaged-route.log)) and the same framing;
[package-default.png](godot-pine-pipeline/package-default.png) matches the source
capture. The package carries the pines but never shows them, so this establishes
only that the package still builds and runs with them inside it.

## 7. The pines in the running scene

[`pine_capture.gd`](godot-pine-pipeline/pine_capture.gd) opens the snow walk from
source in a window and stands the near tree 4 m east and 3 m north of the
controlled figure, with a near/far pair 4 m apart 14 m north, all unturned, then
saves the view with the HUD hidden ([log](godot-pine-pipeline/pine-capture.log)).
The trees are added outside the scene's code: they are not obstacles and the route
never sees them. Inspected at 2560 × 1440:

| Capture | Inspected |
| --- | --- |
| [pine-capture-play.png](godot-pine-pipeline/pine-capture-play.png) | Default play distance, 22.6 m. The near tree beside the figure reads as the snow-laden spruce of the sheets under the blizzard: white tongues, a dark serrated fringe, its spire, a soft shadow on the snow, its snow close to the ground's tone with a cooler tint. It stands about four figures tall. At the top of the view the pair is in the fog: the distance version is clearly blockier and whiter than the near tree beside it, with hard dark bands. |
| [pine-capture-widest.png](godot-pine-pipeline/pine-capture-widest.png) | The wheel's widest, 29.7 m. The same, smaller: the near trees keep their texture; the distance version still stands out at 14 m from the figure. |

This is the first look at the pines in the game's light. It confirms what
`distance.png` showed: the distance version belongs well beyond where these
captures stand it, which #118 has to choose. It renders, but its frame cost is not
measured.

## 8. Not done

- The scene does not place pines: no obstacle circle, shelter, Snowdrift, turning,
  instancing or near/far switching exists yet (#116–#118). Nothing here measures
  what a pine, let alone a forest, costs a frame.
- The far version's switch distance is not chosen; `distance.png` and the captures
  show it differs plainly from the near tree at 14 m and at 60 m.
- The pine's colours under the blizzard are inspected in captures only, not scored;
  the distance version's rendered colour is not checked.
- Nobody looked at the pines with ordinary keyboard and mouse input.
- Windows was not exported or run.
