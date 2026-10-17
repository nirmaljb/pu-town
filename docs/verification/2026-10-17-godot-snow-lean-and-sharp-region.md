# Snow walk zoom-scaled lean and sharp-print region — 2026-10-17

Verification of issue #108, a slice of #104 (Frostwatch Outpost). The camera's
lean toward the cursor now grows with zoom, and the 5 cm detail region that
shapes bootprints in height is reshaped for the oblique view. Only the Godot
preview changed; Java, browser and Unity code are untouched. Retained files are in
[`godot-snow-lean-and-sharp-region/`](godot-snow-lean-and-sharp-region/).

Engine: Godot `4.7.2.stable.official.ed1daf0bf`, Compatibility renderer, on the
Apple M1 MacBook Air (8 GB) under macOS 26.2, 2560 × 1440 window. "Before" is
revision `5052f6d`; "after" is `a79ee64`. The Mac was in use by other
applications throughout, and its state changed during the session (see §6).

## Changes

- [`follow_camera.gd`](../../godot/follow_camera.gd): the lean's limit grows
  with the play distance, from **3 m** at the closest (15.40 m) to **8 m** at the
  widest (29.72 m), in step with the distance; **5.5 m** by default. Zooming in
  shortens a longer lean at once.
- [`snow_surface.gd`](../../godot/snow_surface.gd): the 24 × 16 m, 5 cm detail
  region centred on the focus becomes a **44 × 36 m** region placed at the focus,
  from 14.4 m south of it to 21.6 m north, in two parts. The **near part**, from
  the south edge to a **seam** 4 m north of the focus, keeps the **5 cm** grid
  (880 × 368 cells); the **far part**, up the view, has a **10 cm** grid
  (440 × 176 cells). Each cell of the far part's last row meets two near cells
  and is split into three triangles sharing the near vertex between them, so the
  parts meet without a T-junction. CPU foot support (`_detail_height`) samples the
  same triangles. The sizes follow from the 40° pitch, 40° lens and 16:9 view:
  without lean it holds all the snow the view shows within 20 m of the figure at
  every play distance, and every footstep lands in the near part at any lean.
- To pay for it: the snow is drawn in **chunks** the camera can cull (coarse
  squares of up to 32 m; the region in eight columns cut into strips); the snow
  **casts no shadow** into SkyKey's shadow map (it still receives shadows); and
  [`snow.gdshader`](../../godot/snow.gdshader) reads the fill clock only for
  pressed Footprint texels, which leaves every height unchanged.
- [`inspection.gd`](../../godot/inspection.gd): a `region_seam_z_m` column.
- [`inspection_route.gd`](../../godot/inspection_route.gd): new lean stages at
  the widest and closest distances and toward the bottom corner of the widest
  view; a walk across the seam in the overview. Every play observation checks that
  the region keeps its place relative to the focus, that every footstep lands in
  the near part, that the bottom of the view lies in full detail and, without lean,
  that the outline of the snow in view within 20 m of the figure (48 rays from the
  figure, stopped at 20 m or the view's edge, plus the view's corners within reach)
  lies in full detail. The view's ground corners are computed from the observed
  focus, distance, pitch, yaw and lens. Framing shares are checked on rows without
  lean only: an 8 m lean moves the figure far enough across the view that
  perspective changes its height on screen beyond the 8% tolerance.
- [`town_layout.gd`](../../godot/town_layout.gd): `overview_west` moves from
  (−18, 4) to (−26, 4), outside the wider region, so the overview walk still
  crosses its border.
- [ADR 0028](../adr/0028-frostwatch-outpost-flat-snowfield-and-camp.md) is amended
  for the 10 cm far part; `godot/README.md` and `AGENTS.md` describe the change.

### Why a 10 cm far part

The issue asks for the 5 cm region to be reshaped so prints are crisp to about
20 m. Timed in source with
[`frame_timing.gd`](godot-snow-flat-interim-map/frame_timing.gd) (900 frames,
vsync off, default distance), alternating with the unchanged revision in one
session:

| Variant | Mean frame (two runs) | Unchanged revision alongside |
| --- | --- | --- |
| 5 cm over 40 × 34.4 m, one mesh | 59.02, 58.90 ms | 40.43, 40.35 ms |
| Same area at 10 cm | 39.77 ms | (40.4 ms) |
| 5 cm over 40 × 34.4 m, trivial vertex heights | 49.47 ms | — |

A uniform 5 cm grid cost about 18 ms a frame: about 10 ms in the vertex heights
and triangle count and about 6.5 ms more fragment shading where cells shrank to a
pixel or two up the view. The same area at 10 cm cost nothing measurable. The
far part therefore uses 10 cm cells; its prints keep their outline, hollow and
sunward shadow from the Footprint picture's 31.25 mm texels in the shading, and
their depression is drawn on 10 cm cells instead of 5 cm. Moving the seam from
8.8 m to 4 m north of the focus (the figure stands at most 2.6 m north of it, §2),
chunking, and dropping the snow's shadow casting brought the final build to the
unchanged revision's cost in source (§6). This is a design choice the owner may
revisit; the captures in §3 show its effect.

## 1. Import check

`GODOT_BIN=~/Downloads/Godot.app ./godot/run.sh --check` completed without
errors on `a79ee64`. It exercises no movement or rendering.

## 2. Headless engine-event replay

```sh
"$GODOT_BIN" --headless --path godot --fixed-fps 60 -- \
  --snow-scene-check --headless-scene-check --auto-start
```

**Before** (test-first steps during development):

- With the new lean stages against the unchanged camera, the route **FAILED** with
  the lean held at 3.00 m at all three distances
  ([log](godot-snow-lean-and-sharp-region/headless-route-before-lean.log)). That
  log is from the route as first written; its third failure was a stage boundary
  that a later stage split corrected.
- With the lean implemented and the old 24 × 16 m region, it **FAILED**: an 8 m
  lean carried the figure's steps out of the region's full detail
  ([log](godot-snow-lean-and-sharp-region/headless-route-before-region.log)).
- Two deliberate mutations of the final region were each caught: a region only
  32.8 m deep failed the 20 m-ahead check, and one 40 m wide failed the 20 m
  outline check at the widest distance.

**After: PASS, 0 failures, 20,124 observations**
([log](godot-snow-lean-and-sharp-region/headless-route.log)). It renders nothing.
Selected lines:

> Lean toward the corner cursor: 3.00 m closest, 5.50 m default, 8.00 m widest
>
> Leaning toward the bottom of the widest view put the figure 2.46 m north of the focus
>
> Overview walk across the region's seam: far 84, near 90; contact gap 0.0000 m
>
> Overview walk across the region border: outside 204, border 91, inside 2086; border contact gap 0.0000 m
>
> Framing: figure 0.0841 of the screen's height by default at 22.56 m, 0.1262
> closest at 15.40 m, 0.0630 widest at 29.72 m

Every other line matches the flat-map record's values (running, packing,
tracking, wind fill, Facing). The contact gap compares each boot with the CPU's
own height sample, so it shows the CPU surface stays continuous across the seam
and border; it cannot see the drawn surface. Agreement between drawn and sampled
heights rests on both evaluating the same formulas on the same triangles, and on
the captures. The route does not force a boot to land in the seam's own row.

## 3. Captures

[`print_capture.gd`](godot-snow-lean-and-sharp-region/print_capture.gd) moves the
figure directly (not through the route): in the 25 cm open snow east of the Town
Square, on wind 0, it lays a 37 m trail north from beside where the figure then
stands, a 40 m trail across the figure's row and a 24 m trail across the bottom of
the view, and saves the view without lean, HUD hidden, with falling and blowing
snow, gusts and lightning off so frames compare pixel for pixel. Two runs of the
same revision were identical (largest pixel difference 1/255).

| Capture | Inspected |
| --- | --- |
| [before-default.png](godot-snow-lean-and-sharp-region/before-default.png), [after-default.png](godot-snow-lean-and-sharp-region/after-default.png) | Default distance. 0.3% of pixels differ by more than 8/255, all on prints the old region did not reach: up the trail beyond 8 m north of the focus, the outer 3 m of the cross trail at either side of the view (11–14 m from the figure) and the bottom 0.9 m of the view. |
| [trail-ahead-default-before-after.png](godot-snow-lean-and-sharp-region/trail-ahead-default-before-after.png) | The trail about 8–20 m ahead, enlarged, before (left) and after. Before, past the old region's edge 8 m north of the focus, prints were shaded only; after, they read as hollows with dark floors. |
| [view-edge-default-before-after.png](godot-snow-lean-and-sharp-region/view-edge-default-before-after.png) | The cross trail at the left edge of the view, 8–14 m beside the figure, enlarged: its outer prints, beyond the old region's 12 m, were shaded ovals before and are hollows after; the inner ones are unchanged. |
| [before-widest.png](godot-snow-lean-and-sharp-region/before-widest.png), [after-widest.png](godot-snow-lean-and-sharp-region/after-widest.png), [trail-ahead-widest-before-after.png](godot-snow-lean-and-sharp-region/trail-ahead-widest-before-after.png) | The widest distance: the same change up the trail. No seam, border or change of grid is visible in either part. |

Prints beyond the region (the top of the trail, more than about 20 m ahead) stay
visible as shaded outlines in every capture, as before.

**Snow shadow casting.** With `-- --shadows` the snow casts into SkyKey's map as
it did before. Against the final build: at the closest and widest distances no
pixel differed by more than 4/255; at the default distance one pixel differed by
more than 8/255. Dropping it is not visible. (A first shadow run's closest capture
held a stale frame at the wrong distance; its rerun is the one reported.)

## 4. Graphical route from source

```sh
open -n -W -a ~/Downloads/Godot.app --args --path godot -- --snow-scene-check --auto-start
```

- **Run 1 FAILED, 12 failures**
  ([log](godot-snow-lean-and-sharp-region/graphical-route-1-real-cursor.log)), all
  cursor-dependent (Facing sweep, lean limits and returns, walking twist, Tab
  Facing, region return). The record shows the cursor's ground point wandering
  while the route rested its cursor on the figure: a real mouse moving over the
  window, the Mac being in use.
- **Run 2, with the real pointer moved off the window first: PASSED, 0 failures,
  20,267 observations**
  ([log](godot-snow-lean-and-sharp-region/graphical-route-2.log)), with no pause for
  focus. Lean 3.00 / 5.50 / 8.00 m, seam crossing far 84 / near 90, framing as
  headless.

These are engine-event replay in a rendered window, not ordinary OS input.

## 5. Mac release package

`GODOT_BIN=~/Downloads/Godot.app ./godot/export.sh macos` exported the package
from the clean commit `a79ee64`
([build record](godot-snow-lean-and-sharp-region/macos-build-info.json),
`godot_source_dirty: false`). Its route **PASSED, 0 failures, 20,267
observations** ([log](godot-snow-lean-and-sharp-region/packaged-route.log)), with
the same lean, seam and framing values. Its captures:
[package-widest.png](godot-snow-lean-and-sharp-region/package-widest.png) (the
widest framing) and
[package-hud.png](godot-snow-lean-and-sharp-region/package-hud.png) (the HUD
reading "Detail region 44.0 × 36.0 m").

## 6. Frame time

**Source, same session, alternating** (`frame_timing.gd`, default distance):

| Build | Mean frame | Unchanged revision alongside |
| --- | --- | --- |
| 32.8 m region, one mesh, shadows and fill read kept | 48.87, 49.36 ms | 40.43, 40.35 ms |
| 32.8 m, seam 4 m, no snow shadow, pressed-only fill read | 40.69, 40.80, 40.51 ms | 35.33, 35.07, 35.72 ms |
| 32.8 m, chunked | 37.29, 36.96 ms | 35.42, 34.57 ms |
| Final (44 m, chunked in columns), play | 38.04, 40.28 ms | 37.11, 41.91 ms |
| Final, overview | 36.20 ms | 35.95 ms |

The final build costs about the same as the unchanged revision in source; the
overview stays far above the 15 fps ADR 0028 allows.

**Release F6 traces.** Each run launched a package through Launch Services at its
2560 × 1440 window and posted the
[input script](godot-snow-lean-and-sharp-region/benchmark-input-script.txt) as
ordinary macOS events from
[`osinput_guarded.swift`](godot-snow-lean-and-sharp-region/osinput_guarded.swift)
(the town record's driver, which here stops as soon as the package is no longer
the frontmost application) via
[`run_benchmark.sh`](godot-snow-lean-and-sharp-region/run_benchmark.sh): a short
warm-up, F6, then 60 s walking west out of the Town Square into open snow, north,
east and back, wind 1 from the north-west, cursor resting on the figure, no
figure switching. Every trace below is complete at 60 s and focused throughout,
and moving for all of it except 7 ms and 56 ms in runs 4 and 13; per-run summaries, gzipped traces and launch, driver and workload notes
are `trace-N-<build>-*` in the folder.

| Run | Time | Build | Avg FPS | Mean | p95 | p99 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 17:25 | `5052f6d` | 30.1 | 33.24 ms | 37.18 ms | 39.48 ms |
| 2 | 17:27 | 32.8 m, one mesh (uncommitted) | 25.4 | 39.37 ms | 45.35 ms | 47.66 ms |
| 3 | 17:38 | 32.8 m, chunked (uncommitted) | 24.1 | 41.45 ms | 82.64 ms | 131.11 ms |
| 4 | 17:39 | `5052f6d` | *144.3* | *6.93 ms* | | |
| 5 | 17:40 | 32.8 m, chunked (uncommitted) | 28.0 | 35.75 ms | 41.20 ms | 55.40 ms |
| 6 | 18:28 | `a79ee64` | 27.2 | 36.82 ms | 42.81 ms | 45.22 ms |
| 7 | 18:30 | `5052f6d` | 23.3 | 42.93 ms | 49.76 ms | 51.78 ms |
| 8 | 18:31 | `a79ee64` | 22.6 | 44.25 ms | 51.37 ms | 54.07 ms |
| 9 | 18:32 | `5052f6d` | 23.1 | 43.38 ms | 50.09 ms | 52.93 ms |
| 10 | 18:53 | `a79ee64` | 24.2 | 41.24 ms | 47.50 ms | 49.56 ms |
| 11 | 18:55 | `5052f6d` | 21.7 | 46.11 ms | 54.83 ms | 58.61 ms |
| 12 | 18:56 | `a79ee64` | 21.3 | 46.97 ms | 53.31 ms | 56.38 ms |
| 13 | 18:58 | `5052f6d` | 21.0 | 47.65 ms | 53.81 ms | 56.77 ms |
| 14 | 18:59 | `a79ee64` | 21.3 | 46.95 ms | 53.80 ms | 57.29 ms |
| 15 | 19:00 | `5052f6d` | 21.2 | 47.26 ms | 53.92 ms | 56.55 ms |
| 16 | 19:05 | `5052f6d` | 30.4 | 32.93 ms | 36.90 ms | 38.74 ms |
| 17 | 19:06 | `a79ee64` | **27.9** | 35.84 ms | 45.71 ms | 49.26 ms |
| 18 | 19:07 | `5052f6d` | 20.5 | 48.69 ms | 55.37 ms | 59.90 ms |
| 19 | 19:09 | `a79ee64` | 20.8 | 48.18 ms | 53.85 ms | 56.64 ms |

Run 4 is not valid: 6.9 ms frames are impossible for this scene at 2560 × 1440,
so the window was evidently not drawn at its size; the cause was not identified.
Run 3 slowed through its minute (first 10 s 38 ms, last 10 s 58 ms).

From about 18:00 the Mac was under memory pressure from other applications
(55–80 MB free, `kernel_task` at 30–60% of a core, swapping), and the unchanged
revision itself swung between 20.5 and 30.4 FPS. The comparison that holds is
between neighbouring runs:

- In the one pair taken while the load eased (runs 16–17), the final build
  **averaged 27.9 FPS** (mean 35.84 ms) against the unchanged revision's 30.4 FPS
  (32.93 ms): about 2.9 ms a frame more, with p95 frames 8.8 ms slower.
- Under the heavier load (runs 6–15 and 18–19) the final build averaged 22.9 FPS
  over six runs against 21.8 FPS for the unchanged revision over six, so there
  the difference was lost in the machine's variation.

So the final build walked at **27.9 FPS** in the only trace taken in a state where
the unchanged revision reached its earlier 30 FPS, above the 24 fps target; its
p95 frame (45.7 ms) is below 24 fps. Under the memory pressure that dominated this
session, both builds fell to 21–24 FPS. One trace is thin evidence; a quiet-machine
series of interleaved traces would settle the acceptance. These are engine frame-loop timings
including the recorder, from one machine with a desktop workload, not a platform
baseline.

## 7. Code review

`/code-review` against `5052f6d` ran a standards and a spec review on the
uncommitted change. Acted on before the commit:

- The 32.8 m region left about 6% of the snow in view within 20 m of the figure
  (13% at the widest) outside full detail, further up the view where it widens,
  and the route's three sample points could not see it. The region became 44 m
  wide, its strips were cut into columns so the camera culls what it cannot see,
  and the route now follows the whole outline of that snow; a 40 m region fails it.
- The default-distance lean check copied the camera's straight-line formula. The
  route now asserts 3 m and 8 m at the ends, that the default lies between them,
  and that each lean is held at its limit, short of a quarter of the cursor's
  offset.
- The route now checks that the region keeps its place relative to the focus,
  and counts seam-crossing rows only inside the region's full detail.
- Smaller points: a `_coarse_height` helper, a single `SEAM` constant, one bounds
  helper, no unused index base, "seam" used throughout, `TOP_CORNER`.

Left as they are, with reasons: the route reads its own window's shape for the
view's corners, as it already does to place the cursor; the framing check runs on
rows without lean (see Changes); the region is sized for the 16:9 window the
scene opens; and the snow's shadow casting was dropped although not asked for,
with §3's comparison showing no visible change.

## 8. Not done

- The 24 fps release acceptance rests on one trace taken while the load eased
  (27.9 FPS); the session's other traces ran under memory pressure from other
  applications, where both builds fell below 24 fps (§6).
- Nobody walked the change by hand with ordinary keyboard and mouse input; the
  release traces used posted OS events, the routes engine events.
- The drawn surface is not read back; CPU/drawn agreement rests on shared formulas
  and triangles (§2) and the captures.
- Windows was not exported or run.
