# Snow town shading corrections — 2026-10-16

Investigation and correction of the visual defects reported in section 4 of the
[town verification record](2026-10-16-godot-snow-town.md): banded drift shading,
fresh prints that read as raised pads, and a weakly legible lee drift and 5 m
level change. Only the Godot preview changed; Java, browser and Unity code are
untouched. Retained files are in [`godot-snow-shading/`](godot-snow-shading/).

Engine: Godot `4.7.2.stable.official.ed1daf0bf`, Compatibility renderer, OpenGL
4.1 Metal, on the same Apple M1 MacBook Air under macOS 26.2. "Before" is revision
`a218405`.

## Causes found

**Banded drift shading had three causes, none of them the detail region's border.**

1. **Authored Deep zones.** The rectangle around the figure in
   [`native-lee-drift.png`](godot-snow-town/native-lee-drift.png) is the yard's
   starting Deep drift, x 27–34 m, z 0–9 m in `OUTPOST_DRIFTS`, and the strip along
   the lodge's south face. A 0.51 m step faded over 1.5 m by smoothstep rises at up
   to 27°. The wind's target is the start plus a drift and scour field, so the
   terrace survives any amount of wind. A hillshade of the dumped Snow Depth
   picture shows the same rectangles in the starting picture, the target and the
   relaxed picture.
2. **Bilinear slope at node lines.** Triangle normals followed bilinear Snow Depth,
   whose slope jumps at every 0.4 m node line. Once the terrace was gone,
   contrast-stretched captures still showed straight lines at that pitch across
   the drift.
3. **A trough at drifted walls.** Picture nodes inside an obstacle kept their
   authored depth. Within 0.4 m of a face the surface interpolated toward that
   old value, so a drift dipped into a dark groove at the foot of the wall.

The wind's march itself is not banded. It lays soft diagonal tails along the wind
from obstacle corners, which remain.

**Fresh prints read as pads because of the light.** The sun shines from the
south-west, behind and to the left of the north-up camera. Inside a print the
far, sunward-facing wall is lit and the near wall dark. With light assumed from
the top of the screen, bright above and dark below is how a raised pad looks. The
print floor was as bright as the snow around it, so nothing contradicted that
reading. Deep prints were long enough to show their dark near wall, and read
correctly.

## Changes

- [`town_layout.gd`](../../godot/town_layout.gd): the outpost yard and its Deep
  drifts lie in open ground and now taper over `OPEN_ZONE_TAPER` (3.5 m) instead of
  1.5 m. Zones bounded by walls and cliffs keep 1.5 m, which the route's
  forest-cliff-foot and courtyard checks need.
- [`snow_wind.gd`](../../godot/snow_wind.gd): each obstacle node takes the mean
  target of its open neighbours, so a drift meets the wall without a trough. CPU
  support and the shader read the same published picture, so they still agree.
- [`snow.gdshader`](../../godot/snow.gdshader), shading only. No height, vertex or
  foot-support value changed:
  - The shading normal is the height field's slope evaluated smoothly: the ground
    picture's exact bilinear slope, Snow Depth's slope from a quadratic B-spline
    through the same nodes, and the Footprint picture's tilt. It no longer comes
    from triangle derivatives.
  - A pressed print's floor is dimmed and cooled by its pressed depth, full at
    12 cm. A five-step march of 3 cm steps toward the sun across the Footprint
    picture shades the part its sunward rim hides.
  - Snow heaped deeper than 0.5 m is up to 7% whiter. The forest floor is up to
    14% dimmer and cooler, so the level change reads in overview.
- [`snow_surface.gd`](../../godot/snow_surface.gd) and
  [`snow_walk.gd`](../../godot/snow_walk.gd) pass the scene light's direction to
  the snow material.

## 1. Import check

`GODOT_BIN=~/Downloads/Godot.app ./godot/run.sh --check` completed without errors.
This exercises no movement or rendering.

## 2. Headless engine-event replay

```sh
"$GODOT_BIN" --headless --path godot --fixed-fps 60 -- \
  --snow-scene-check --headless-scene-check --auto-start
```

**PASS, 0 failures, 17,109 observations** ([log](godot-snow-shading/headless-route.log)).
It renders nothing. The values the changes moved, against the earlier record:

| Observed | Before | After |
| --- | --- | --- |
| Lodge lee drift | 0.602 → 1.132 m | 0.602 → 1.108 m |
| Windward probe at the east shed | 0.148 → 0.031 m | 0.523 → 0.034 m |
| Reversed wind: old windward face | +0.186 m | +0.496 m |
| Prints remaining after 41.1 wind-seconds (exposed, sheltered, lee) | 0.68, 0.92, 0.00 | 0.68, 0.92, 0.00 |

The windward probe stands 1 m east of the yard's Deep drift, so the wider taper
starts it deeper. Scour still takes it to the 3 cm floor.

The focused graphical route was run later in the rebuilt release package
(section 6). The shading changes are covered by the captures below.

## 3. Before and after captures

[`capture_views.gd`](godot-snow-shading/capture_views.gd) renders fixed views in a
1280 × 800 source-scene window at a fixed 60 Hz step. It places the figure and
camera directly and ignores focus and the real pointer, so it is visual evidence,
not an input or route test. The `drift` set runs wind 16 for 15 s. The `prints`
set builds the lodge drift, reverses the wind for 10 s, returns to wind 1 and walks
the figure west through the lee for 2 s. This reproduces the ~0.4 m loose snow of
the earlier [route close view](godot-snow-town/route-close.png). Both revisions ran
the same driver. The HUD is hidden.

| View | Before | After | Inspection |
| --- | --- | --- | --- |
| Lodge lee, 16 m | [before](godot-snow-shading/before-drift-16m.png) | [after](godot-snow-shading/after-drift-16m.png) | The rectangular terrace with its dark band and vertical edges is gone. The drift tapers smoothly from the wall. |
| Same, contrast stretched (grey 150–185) | [left half](godot-snow-shading/drift-16m-contrast-stretched.png) | [right half](godot-snow-shading/drift-16m-contrast-stretched.png) | Before: the terrace plus straight lines at the 0.4 m node pitch. After: no straight edges, only broad smooth swells. |
| Lodge lee, 10 m | [before](godot-snow-shading/before-drift-10m.png) | [after](godot-snow-shading/after-drift-10m.png) | Before: a flat pale band with a groove at the wall. After: the drift's lit crest curves up to meet the wall. |
| Yard, 22.7 m | [before](godot-snow-shading/before-drift-23m.png) | [after](godot-snow-shading/after-drift-23m.png) | No terraces anywhere in the yard. |
| Fresh prints, ~0.4 m loose snow, 10 m | [before](godot-snow-shading/before-prints-lee-10m.png) | [after](godot-snow-shading/after-prints-lee-10m.png) | [Enlarged](godot-snow-shading/prints-lee-10m-enlarged.png), before above: pale pads become blue-grey hollows with a shaded floor below a lit far rim. |
| Deep prints, meeting-hall gap | [before](godot-snow-shading/before-prints-deep-10m.png) | [after](godot-snow-shading/after-prints-deep-10m.png) | Still pits, now darker inside. |
| Overview | [before](godot-snow-shading/before-overview.png) | [after](godot-snow-shading/after-overview.png) | The forest floor is cooler and dimmer than the shelf, so the 5 m step reads where cliff boxes cover it. |
| South gate, 30 m | [before](godot-snow-shading/before-level-30m.png) | [after](godot-snow-shading/after-level-30m.png) | Smoother courtyard drifts; no new seams at the detail region's border or the obstacles. |

Prints in the 9 cm Shallow Snow are pressed about 2.5 cm and stay faint, as before.

## 4. Frame cost

[`frame_timing.gd`](godot-snow-shading/frame_timing.gd) timed 600 frames with
vsync off: an unfocused source-scene window at 1280 × 800, camera 16 m, prints in
view, Mac in use. Two runs per revision:

| Revision | Mean frame | p95 |
| --- | --- | --- |
| Before (`a218405`) | 21.32–21.95 ms | 24.56–24.97 ms |
| After | 23.53–23.82 ms | 26.45–26.50 ms |

The changes add about **2 ms per frame** in this setup. Disabling either part
alone left about 1 ms, so the smooth slope and the print shadow cost about the
same. These are source-scene, unfocused, uncontrolled-workload timings, not a
release benchmark. Section 5 measures the release package.

## 5. Release frame trace

`GODOT_BIN=~/Downloads/Godot.app ./godot/export.sh macos` rebuilt the macOS
release package from the clean revision `c81b7b0`
([manifest](godot-snow-shading/macos-build-info.json),
[log](godot-snow-shading/macos-export.log); `godot_source_dirty: false`). The same
command in a detached checkout of `a218405` built the earlier package as a control
([manifest](godot-snow-shading/macos-build-info-a218405.json)).

Each run repeated the 60 s F6 benchmark of section 5 of the
[town record](2026-10-16-godot-snow-town.md#5-frame-measurement): the package
launched normally at 1280 × 800, the same
[input script](godot-snow-town/benchmark-input-script.txt) posted through the same
[OS-event driver](godot-snow-town/osinput.swift), wind 1 from the north-west,
camera 16 m, no figure switching.
[`run_benchmark.sh`](godot-snow-shading/run_benchmark.sh) launched the package,
waited for its window, ran the script at the window's content origin, ran a focus
watcher and sampled `top`. Each trace was summarized with
`python3 godot/summarize_frames.py`. Five runs alternated between the two packages
within ten minutes. Keyboard and mouse had been idle for at least 20 s before
each run:

| Run | Package | Average FPS | Mean | p95 | p99 | Max | Over 33.4 ms | Wind per update | Wind per frame |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [1](godot-snow-shading/benchmark-1-c81b7b0-summary.json) | `c81b7b0` | 46.6 | 21.44 ms | 25.81 ms | 27.38 ms | 37.09 ms | 3 | 0.538 ms | 0.692 ms |
| [2](godot-snow-shading/benchmark-2-c81b7b0-summary.json) | `c81b7b0` | 46.5 | 21.48 ms | 26.13 ms | 27.87 ms | 34.65 ms | 1 | 0.547 ms | 0.705 ms |
| [3](godot-snow-shading/benchmark-3-a218405-summary.json) | `a218405` | 50.6 | 19.75 ms | 23.89 ms | 25.70 ms | 30.27 ms | 0 | 0.525 ms | 0.624 ms |
| [4](godot-snow-shading/benchmark-4-c81b7b0-summary.json) | `c81b7b0` | 46.6 | 21.46 ms | 25.97 ms | 27.63 ms | 41.36 ms | 1 | 0.547 ms | 0.705 ms |
| [5](godot-snow-shading/benchmark-5-a218405-summary.json) | `a218405` | 50.7 | 19.73 ms | 23.99 ms | 25.84 ms | 44.02 ms | 1 | 0.523 ms | 0.619 ms |

Every trace is complete at 60.0 s (2,793–3,042 frames), focused and moving for
100% of it, at viewport and window 1280 × 800, with no warnings. Raw traces and
per-run launch, driver, focus-watcher and workload notes sit beside each summary
(`benchmark-N-<revision>-frames.csv.gz`, `-session.txt`). The focus watcher logged
only Finder taking the front after each package was closed; no frame was
unfocused.

**The shading costs about 1.7 ms per frame in the release package:** mean 21.46 ms
against 19.74 ms, p95 and p99 about 2 ms higher, 46.6 FPS against 50.7. That
agrees with the source-scene estimate in section 4.

**The Mac was slower than in the town record's run.** The control package, the
same revision as that run, averaged 50.7 FPS here against 55.2 FPS there, and its
wind cost 0.52 ms per update against 0.38 ms. `c81b7b0` changed the wind only
where it reshapes its target, once per change of bearing, so the wind's higher
cost reflects the machine state, not the code: memory was nearly full (64–274 MB
unused, 2.4–3.4 GB compressed) and `kernel_task` used 20–40% of a core during
each walk. Chrome, ChatGPT and the Claude app were open. Run 1's `top` samples
are first samples and lack per-process CPU.
The 46.6 FPS absolute figure therefore reflects this workload; the difference
between packages is the change's cost. The wind remains about 3.3% of frame time.

These are engine frame-loop timings including the recorder, not GPU timestamps or
display latency, from one machine with a desktop workload.

## 6. Packaged graphical route

```sh
"godot/build/macos/release/PU-Town-Snow-Walk.app/Contents/MacOS/PU Town · Snow Walk" -- --snow-scene-check --auto-start
```

In the `c81b7b0` release package: **PASS, 0 failures**, 17,162 observations, none
unfocused ([log](godot-snow-shading/packaged-route.log),
[CSV](godot-snow-shading/packaged-route.csv.gz)). As before, the log shows one
"Route paused" line before recording began. A focus watcher ran throughout and
logged nothing. Its measured values match the headless replay in section 2: lodge
lee drift 0.605 → 1.108 m, windward scour 0.513 → 0.033 m, reversed wind +0.511 m
on the old windward face, and prints remaining after 41.1 wind-seconds 0.70, 0.93
and 0.03 (exposed, sheltered, lee).

This is engine-event replay in a rendered window, not ordinary OS input.

## Evidence limits

- Captures come from a driver that sets positions directly, not from OS input or
  the scene route. Window focus was not held.
- Only the macOS release package was rebuilt. The Windows package was neither
  rebuilt nor run.
- Shading is judged by eye from captures on one display.
