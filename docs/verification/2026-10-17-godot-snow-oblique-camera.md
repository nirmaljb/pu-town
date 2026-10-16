# Snow walk oblique wide-lens camera — 2026-10-17

Verification of issue #105, the first slice of #104 (Frostwatch Outpost): the
near-top-down −45° long-lens view is replaced by the owner's camera reference:
north up and never turning, perspective at −40° pitch through a 40° vertical lens,
the figure about 1/12 of the screen tall by default and the wheel zooming between
about 1/8 and 1/16. Only the Godot preview changed; Java, browser and Unity code
are untouched. Retained files are in
[`godot-snow-oblique-camera/`](godot-snow-oblique-camera/).

Engine: Godot `4.7.2.stable.official.ed1daf0bf`, Compatibility renderer, on the
Apple M1 MacBook Air (8 GB) under macOS 26.2, 2560 × 1440 window. "Before" is
revision `39cd394`.

## The owner's camera reference frames

The owner's references are frames from another snow game: a small figure in a
scarf walking past a lit house, a truck, bare trees and a power pole. They are
not the owner's work and are not kept in the repository; they were read from the
owner's local screenshots of 2026-10-16. The ticket fixes their reading at about
−40° pitch and a 40° lens, with the figure about 1/8 of the screen tall in the
frames themselves. The earlier
[reference view record](2026-10-16-godot-snow-view.md) read the same kind of
frames as a long lens; the owner has since chosen the wide lens because the long
one read as nearly top-down and hid the figure's body.

## Changes

- [`follow_camera.gd`](../../godot/follow_camera.gd): field of view 16° → **40°**,
  pitch −45° → **−40°**. The play distances now follow from the figure's share of
  the screen's height, `distance_for_share`: an upright 1.7 m figure at the focus
  fills share *s* at *d* = *h*(sin θ + cos θ ÷ (2 tan(fov/2) *s*)). That gives
  **22.56 m** by default (1/12), **15.40 m** closest (1/8) and **29.71 m** widest
  (1/16), against 40 m in a 25–75 m range before. Five wheel steps of 1.15 span
  the range. The framing share, the focus's offset north of the figure, rises from
  1.2% to **3.4%** of the distance so the feet still stand just below the centre
  of the screen (about 0.53 of its height). The overview's distance still follows
  from the lens and the map rectangle; it is now 108 m.
- [`blizzard.gd`](../../godot/blizzard.gd), [`blizzard.tscn`](../../godot/blizzard.tscn):
  fog still scales with the camera's distance. At the new play distance the
  bottom edge of the view is 17 m from the camera, the figure 22.6 m and the top
  edge 42 m. Fog now begins at **11 m** and is full at **105 m** (was 34 and 73 m),
  so its share is 12% at the figure, 33% at the top edge and 6% at the bottom,
  about what the long lens had (15%, 33% and 4%). SkyKey's single shadow map
  reaches **54 m** at play distance (was 60 m for a 47 m far edge).
- [`inspection.gd`](../../godot/inspection.gd): a new observation column,
  `figure_screen_height`, the 1.7 m figure's share of the screen's height,
  measured from the projected feet and head.
- [`inspection_route.gd`](../../godot/inspection_route.gd): the specified camera
  is 40° at −40°; in play every observation must frame the figure between about
  1/16 and 1/8 of the screen (within 8%); the default view must frame it at about
  1/12, five wheel steps out from the closest must stop at about 1/16 and twelve
  steps back in from the overview at about 1/8. M is checked against the default
  distance and the wheel step in from the overview against the widest distance,
  both read from the record rather than repeated. A rendered run captures the
  three framings without the overlay.
- [`godot/README.md`](../../godot/README.md) and `AGENTS.md` describe the new
  camera, framing column, fog and route.

## 1. Import check

`GODOT_BIN=~/Downloads/Godot.app ./godot/run.sh --check` completed without errors.
It exercises no movement or rendering.

## 2. Headless engine-event replay

```sh
"$GODOT_BIN" --headless --path godot --fixed-fps 60 -- \
  --snow-scene-check --headless-scene-check --auto-start
```

**PASS, 0 failures, 32,838 observations**
([log](godot-snow-oblique-camera/headless-route.log)); the same command on
`39cd394` also passed ([log](godot-snow-oblique-camera/headless-route-before.log)).
It renders nothing; the screen positions come from the camera's projection.
After review, `_check_overview_key` reads the default distance from the
"initial idle" stage rather than the first observation and reports a missing
stage directly; this log is the rerun after that change. The graphical and
package runs below used the route before it, which differed only in that check.

> Framing: figure 0.0841 of the screen's height by default at 22.56 m, 0.1259
> closest at 15.40 m, 0.0630 widest at 29.72 m

against the specified 0.0833, 0.125 and 0.0625. M opened the overview from the
default distance and returned to exactly it, the overview framed the whole map,
the lean stayed within 3 m and the figure held just below the centre whenever
the camera was not leaning.

## 3. Graphical route from source

```sh
"$GODOT_BIN" --path godot -- --snow-scene-check --auto-start
```

The first run ([log](godot-snow-oblique-camera/graphical-route-1.log)) lost window
focus twice in its first seconds while the machine was in use. The route waits for
focus but the walking figure does not, so its trail was laid at 59 s instead of
about 4 s, and the one check that depends on that timing failed: following and
overlapping the trail did not raise the probe's compaction (0.318 → 0.315). Every
camera check passed. The second run, with a helper that brought the window back to
the front whenever the route reported a pause, **PASSED with 0 failures**
([log](godot-snow-oblique-camera/graphical-route-2.log)), with the same framing as
headless. This is engine-event replay in a rendered window, not ordinary OS input.

## 4. Mac release package

`GODOT_BIN=~/Downloads/Godot.app ./godot/export.sh macos` exported the release
package from the working tree on `39cd394`
([build record](godot-snow-oblique-camera/macos-build-info.json)). Its route,

```sh
godot/build/macos/release/PU-Town-Snow-Walk.app/Contents/MacOS/PU\ Town\ ·\ Snow\ Walk \
  -- --snow-scene-check --auto-start
```

**PASSED with 0 failures, 32,969 observations**
([log](godot-snow-oblique-camera/packaged-route.log)), with the same framing:
0.0841 by default, 0.1260 closest and 0.0630 widest. The same focus helper ran
alongside it; the route paused once, before recording began.

### Captures, inspected against the reference frames

All four are the package's own F9 captures from that route, 2560 × 1440, copied
unchanged from the files its log names: default `capture-1792182580-22393.png`,
widest `capture-1792183204-88482.png`, overview `capture-1792183205-99461.png` and
closest `capture-1792183206-98239.png`.

| View | Capture | Seen |
| --- | --- | --- |
| Default, 1/12 | [package-default.png](godot-snow-oblique-camera/package-default.png) | Outpost yard. Both figures' parkas, arms and legs read as bodies, not tops of heads; the outpost's boxes show their south and side walls as well as their roofs, and their verticals lean outward away from the centre, as in the reference frames. The view is about 28 m across at the figure. |
| Widest, 1/16 | [package-widest.png](godot-snow-oblique-camera/package-widest.png) | Lodge front after the wind stages. The tall lodge fills the upper half and the near shed's roof the lower right; near boxes now loom large, which the long lens never did. |
| Closest, 1/8 | [package-closest.png](godot-snow-oblique-camera/package-closest.png) | The references' framing: the figure in profile with its boots in the lodge's lee drift and a few prints behind it. |
| Overview | [package-overview.png](godot-snow-oblique-camera/package-overview.png) | With the overlay: the whole 100 × 56 m town from 108 m at −40°, north up. |

Compared with the reference frames, the angle, the visible body and the visible
box sides match. Two differences remain:

- The references' trees and poles cross in front of the figure; this town has no
  near objects there, so the depth they give is absent.
- In the references, sharp prints run to the top of the frame. Here the 24 × 16 m
  detail region reaches only 8 m north of the focus, while the view reaches 21 m
  north, so prints in the upper part of the frame are shaded without relief.
  Issue #108 reshapes that region for the oblique view.

## 5. Frame time

[`frame_timing.gd`](godot-snow-view/frame_timing.gd) from the earlier record timed
900 frames after 300 warm-up frames, vsync off and the overlay hidden, while the
figure walked back and forth across the outpost yard, alternating revisions. The
Mac was busy (two Blender instances, Chrome and other applications open), so the
absolute rates are far below the earlier record's 32.5 fps and only the
same-session comparison means anything ([raw output](godot-snow-oblique-camera/frame-timing.log)):

| Revision | Mean frame | Mean fps | p95 | Worst |
| --- | --- | --- | --- | --- |
| Before (`39cd394`) | 56.82, 54.44 ms | 17.6, 18.4 | 70.92, 67.18 ms | 247.43, 223.95 ms |
| After | 50.84, 51.64 ms | 19.7, 19.4 | 71.96, 73.33 ms | 218.48, 224.94 ms |

The wider view's mean frame time was no worse in this session, while its 95th
percentile was 1–6 ms worse; under this load neither difference is clearly
outside run-to-run variation. This does **not**
establish the 24 fps acceptance on an idle machine; that needs a release F6 trace
under the conditions of the earlier records.

## 6. Not done

- Nobody walked the new view by hand with ordinary keyboard and mouse input.
- No release F6 trace was taken; the frame timing above is from source, under load.
- Windows was not exported or run.
- The lean (still at most 3 m at every distance) and the detail region are
  unchanged; #108 covers both.
- The default distance is not a whole number of wheel steps from either end of
  the play range (as 40 m was not before), so once zoomed the wheel cannot return
  to exactly 1/12; M's round trip keeps the distance it left.
- `figure_screen_height` projects the 1.7 m `Walker.HEIGHT` above the feet, not
  the rendered mesh; the captures are the check on the parka itself.
