# Snow walk flat interim map — 2026-10-17

Verification of issue #106, the second slice of #104 (Frostwatch Outpost): ADR
0027's reference town is removed and the map becomes one flat 160 × 160 m level,
north up and centred on the origin, with a Shallow Town Square at its centre,
nothing standing on it and an edge with no wall. Both figures start at the
centre, and the scripted route is rewritten around new named landmarks. Only the
Godot preview changed; Java, browser and Unity code are untouched. Retained files
are in [`godot-snow-flat-interim-map/`](godot-snow-flat-interim-map/).

Engine: Godot `4.7.2.stable.official.ed1daf0bf`, Compatibility renderer, on the
Apple M1 MacBook Air (8 GB) under macOS 26.2, 2560 × 1440 window. "Before" is
revision `d39960b`. The machine was in use throughout (Claude, Chrome, two Blender
instances and other applications open).

## Changes

- [`town_layout.gd`](../../godot/town_layout.gd): the compound, meeting hall,
  outpost, rim rocks, pines, shelf, forest level, stair, stair walls and cliff rock
  are gone, with their landmarks, ground-height picture and colours. The half
  extents become **80 × 80 m**. The ground is one level, `GROUND_LEVEL` (0 m),
  which `ground_height` returns everywhere. Starting Snow Depth is Shallow (9 cm)
  in a 40 × 40 m `TOWN_SQUARE` at the centre and 25 cm everywhere else, blended
  over 1.5 m; there is no Deep Snow until the forest. New landmarks: `start_west`
  and `start_east` (±1.5 m either side of the centre), `packed_lane`,
  `trail_start`, `overview_west`, `exposed_probe` and the loop's `loop_east`,
  `loop_north`, `loop_lane_west` and `loop_open`. The eight warm lamps become
  lanterns standing 30 cm up in a ring about 17 m from the centre until the Camp's
  buildings stand. The obstacle list stays, empty, for the Camp.
- [`snow.gdshader`](../../godot/snow.gdshader) and
  [`snow_surface.gd`](../../godot/snow_surface.gd): the ground-height picture is
  replaced by one `ground_level` uniform set from the same constant the CPU reads,
  so shader heights and foot support agree on the flat ground. The forest's cooler
  tint goes with the forest. The snow now runs on **40 m beyond the map's edge as
  an apron** of four coarse strips that no figure reaches, so the edge shows no
  end to the snowfield; the detail region may reach over the edge and blends into
  the coarse surface on every side. The Footprint picture becomes 5120 × 5120 at
  the same 31.25 mm, held in 256 × 128-texel tiles (8 × 4 m), 20 × 40 of them:
  100 MiB on the CPU, 4.6 times the reference town's, with at most four 128 KiB
  tiles sent per footstep. The Snow Depth and fill-clock pictures become
  401 × 401 nodes; the wind's sweep relaxes 27 rows per physics frame instead of
  10.
- [`follow_camera.gd`](../../godot/follow_camera.gd): the overview frames the
  map from the ground to 2 m above it instead of from the forest floor to the
  cliff tops; its distance is now **211.6 m** (108 m before).
- [`snow_walk.gd`](../../godot/snow_walk.gd): both figures start at
  `start_west` and `start_east`.
- [`inspection_route.gd`](../../godot/inspection_route.gd): the route is
  rewritten for flat ground. Stages that met the lodge, courtyard wall, cliffs and
  stair, and the shelter, scour and Snowdrift probes, are gone because nothing
  stands on the map to make them. It keeps the cursor, Facing, short-step,
  framing, zoom, overview, detail-region and upload checks, and walks, runs,
  packs a lane, lays and revisits a probed trail, runs to the northern edge, tracks
  the walking figure's trail, fills an exposed print with wind and hands over with
  Tab. New checks: the ground under both figures is one level in every
  observation, no obstacle ever holds either figure, the figure starts at the
  centre in Shallow Snow, the edge holds it exactly 0.3 m inside the map, running
  is full in the Town Square and held at least 0.3 m/s below full in open snow, and
  wind leaves every probe's Snow Depth unchanged on the empty field. The route's
  run to the edge lasts as long as fresh open snow's slowest running speed needs
  to cover the distance from `trail_start` to the edge, read from the layout. A new
  first step rests the route's cursor on the figure until any lean from a real
  cursor already over the window has died away (see §3).
- [ADR 0028](../adr/0028-frostwatch-outpost-flat-snowfield-and-camp.md) records
  the whole agreed design; [ADR 0027](../adr/0027-reference-snow-town-with-wind-shaped-depth.md)
  is marked superseded in its layout, scale, ground levels and camera.
- [`docs/art/frostwatch-reference/`](../art/frostwatch-reference/README.md)
  saves the owner's satellite sketch and fence sketch byte for byte and the two
  larger paintings as full-resolution JPEGs (their PNGs exceed the 5 MiB limit),
  with the supplied files' hashes. The three camera reference frames are frames
  of another game; they are identified by hash and not committed. The older
  snow-town references are kept.
- [`CONTEXT.md`](../../CONTEXT.md) gains **Camp**, **Perimeter** and **Road**.
- [`godot/README.md`](../../godot/README.md) and `AGENTS.md` describe the
  interim map.

## 1. Import check

`GODOT_BIN=~/Downloads/Godot.app ./godot/run.sh --check` completed without errors.
It exercises no movement or rendering.

## 2. Headless engine-event replay

```sh
"$GODOT_BIN" --headless --path godot --fixed-fps 60 -- \
  --snow-scene-check --headless-scene-check --auto-start
```

**Before the town was removed** — the rewritten route run against `d39960b` with
only the new landmark names added — it **FAILED**: the walking figure's loop
never crossed the Town Square lane, so there was no trail to track and the route
stopped there ([log](godot-snow-flat-interim-map/headless-route-before.log)).

**After: PASS, 0 failures, 18,645 observations**
([log](godot-snow-flat-interim-map/headless-route.log)). It renders nothing.
Selected lines:

> Walking figure: 18645 moving observations, 18558 at the speed its snow allows,
> 16554 running in Shallow Snow, 817 held back in open snow, 14224 in the Town
> Square, 3999 beyond it
>
> After 41.1 wind-seconds, the exposed print remains 0.67
>
> Same open-snow corridor, Shift held: fresh 3.784 m/s -> packed 4.468 m/s
>
> Largest change of Snow Depth at a probe under wind: 0.0000 m
>
> Framing: figure 0.0841 of the screen's height by default at 22.56 m, 0.1262
> closest at 15.40 m, 0.0630 widest at 29.72 m

The edge held the figure in 490 observations of the boundary stages, at z = −79.70 m. Footprint uploads averaged 137 KB per footstep against the 512 KiB bound of four tiles. Running
in fresh 25 cm open snow reached about 3.8 m/s rather than the 2.78 m/s its
untrodden depth allows, because the loose depth that sets speed includes the
runner's own fresh prints; the route's first threshold of 0.5 m/s below full
speed failed on that and was set to 0.3 m/s, which every open-snow observation
met. Across the wind stages the wind's work averaged **1.75 ms per physics
update** (95th percentile 2.15 ms, worst 2.21 ms) over 401 × 401 nodes, against
0.38–0.52 ms for the reference town's 251 × 141 in the
[shading record](2026-10-16-godot-snow-shading.md); headless timing is only
indicative.

## 3. Graphical route from source

```sh
"$GODOT_BIN" --path godot -- --snow-scene-check --auto-start
```

Launched directly from a shell, the window never came to the front while another
application was in use: macOS ignored the focus helper, and both attempts stopped
after 60 seconds without focus. Launched through Launch Services
(`open -n -a Godot.app --args --path godot -- …`), the window opened in front.

- **Run 1 FAILED, 7 failures** ([log](godot-snow-flat-interim-map/graphical-route-1-cursor-lean.log)):
  every failure depended on the cursor (the Facing sweep, the lean returning,
  holding the figure below the centre, the walking twist, Tab's Facing and the
  detail region returning). The record shows the camera already leaning about
  3 m toward the north-west in the first observation: the real mouse pointer was
  over the window when it opened in front, so the route took a leaned figure's
  screen position as its resting point. The route now first rests its cursor on
  the figure until any such lean has died away.
- **Run 2 PASSED, 0 failures** ([log](godot-snow-flat-interim-map/graphical-route-2-before-apron.log)),
  on the code before the apron was added. No lean needed settling.
- **Run 3, on the final code: PASSED, 0 failures, 18,786 observations**
  ([log](godot-snow-flat-interim-map/graphical-route-3.log)), with no pause for
  focus and no lean to settle. Framing matched headless: 0.0841 of the screen's
  height by default, 0.1262 closest and 0.0630 widest.

These are engine-event replay in a rendered window, not ordinary OS input.

### Captures

Captures from run 3, at 2560 × 1440 with the inspection overlay where the route
leaves it on:

| Capture | Inspected |
| --- | --- |
| [source-default.png](godot-snow-flat-interim-map/source-default.png) | Default framing at the start, overlay off. Both parka figures stand on even, untrodden snow in the Town Square with the warm lanterns round them; no box, wall or level change is in view. |
| [source-edge-before-apron.png](godot-snow-flat-interim-map/source-edge-before-apron.png) | Run 2, held at the northern edge **before the apron**. The snow surface ended 0.3 m beyond the figure: a straight horizon line crossed the upper third of the view, with the fog's background colour beyond it. No wall, but the end of the map was plainly visible. |
| [source-edge.png](godot-snow-flat-interim-map/source-edge.png) | Run 3, held at the same place **with the apron**. The snow continues past the edge into the whiteout with no line, step or change of tone; the figure simply stops, its trail behind it. |
| [source-overview.png](godot-snow-flat-interim-map/source-overview.png) | The whole-map overview at 211.6 m: the snowfield and its apron as a hazy plain, the lanterns and both figures at the centre. The map's own edge does not show; the overview is for inspection and stays legible but featureless until the Camp stands. |

## 4. Mac release package

`GODOT_BIN=~/Downloads/Godot.app ./godot/export.sh macos` exported the release
package from the final working tree on `d39960b`
([build record](godot-snow-flat-interim-map/macos-build-info.json)); every source
hash in it matches the committed files. Launched through Launch Services,

```sh
open -n -W -a godot/build/macos/release/PU-Town-Snow-Walk.app --args -- --snow-scene-check --auto-start
```

its route **PASSED with 0 failures, 18,792 observations**
([log](godot-snow-flat-interim-map/packaged-route.log)), with no pause for focus
and the same framing (0.0841, 0.1262, 0.0630). Its captures match the source
run's: [package-default.png](godot-snow-flat-interim-map/package-default.png) and
[package-edge.png](godot-snow-flat-interim-map/package-edge.png), the HUD reading
"boundary" with the figure stopped at z −79.70 m and the snow running on into the
whiteout beyond it.

## 5. Frame time

[`frame_timing.gd`](godot-snow-flat-interim-map/frame_timing.gd), adapted from
the [reference view record](2026-10-16-godot-snow-view.md)'s, timed 900 frames
after 300 warm-up frames, vsync off and the overlay hidden, while the figure
walked back and forth at (30, 0) (open snow here, the outpost yard before), and
again with the whole-map overview open. It also reports the wind's mean work per
physics update over the same frames. Revisions alternated in one session on the
busy Mac, so only same-session comparisons mean anything
([raw output](godot-snow-flat-interim-map/frame-timing.log)):

| View | Revision | Mean frame | Mean fps | p95 | Wind per update |
| --- | --- | --- | --- | --- | --- |
| Play | Before (`d39960b`) | 51.99, 36.95 ms | 19.2, 27.1 | 70.59, 47.41 ms | 0.77, 0.78 ms |
| Play | After | 51.33, 40.10 ms | 19.5, 24.9 | 69.16, 46.43 ms | 3.03, 3.04 ms |
| Overview | Before | 23.14, 20.68 ms | 43.2, 48.3 | 29.68, 25.25 ms | 0.69, 0.55 ms |
| Overview | After | 39.45, 35.36 ms | 25.4, 28.3 | 44.55, 39.65 ms | 2.88, 2.95 ms |

In play the mean frame time was within run-to-run variation of the reference
town's (one round slightly better, one 3 ms worse), and one "after" frame took
720 ms. The wind's work per physics update rose about fourfold with its
4.5 times larger picture: at about three physics updates per rendered frame near
20 fps that is about 9 ms of CPU work a frame, which did not lengthen the play
frame in this session but will matter on a faster frame. The overview costs about 15 ms more
per frame, from the larger area of snow it now draws, apron included; it stays
above the 15 fps ADR 0028 allows it. None of this establishes the 24 fps walking
acceptance on an idle machine; that needs a release F6 trace.

## 6. Not done

- Nobody walked the map by hand with ordinary keyboard and mouse input.
- No 60-second release F6 trace was taken; the frame timing above is from source,
  under load, and does not establish the 24 fps acceptance.
- Windows was not exported or run.
- Shelter, scour and Snowdrift behaviour is not exercised: nothing stands on the
  map to make them. They return with the Camp's buildings (#109), the Perimeter
  (#113) and the pines (#116).
- No Deep Snow exists on the interim map, so walking-only snow is not exercised.
- The 800-layer Footprint texture array exceeds the 256 layers OpenGL ES 3.0
  guarantees; it ran on this Mac's renderer and is untested elsewhere.
