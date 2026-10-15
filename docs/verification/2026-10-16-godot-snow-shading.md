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

No focused graphical route was run for this change. That route needs the window
to keep focus throughout, and its checks are behavioral. The Snow Depth changes
are covered headlessly above. The shading changes are covered by the captures
below.

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
release benchmark. The release trace in the town record predates this change and
has not been remeasured.

## Evidence limits

- Captures come from a driver that sets positions directly, not from OS input or
  the scene route. Window focus was not held.
- The release packages were not rebuilt. Windows is untested.
- Shading is judged by eye from captures on one display.
